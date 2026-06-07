import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, hasPermission, verifySessionToken } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { normalizeTaskTags } from "@/lib/catalog";
import {
  deleteProblemReport,
  getProblemReportById,
  normalizeDeviceGroupCode,
  updateProblemReport,
} from "@/lib/repositories";
import type { TaskPriority, TaskStatus } from "@/lib/types";

const taskStatuses: TaskStatus[] = ["planned", "in_progress", "blocked", "done"];
const priorities: TaskPriority[] = ["low", "normal", "high", "urgent"];

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const user = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  const canEdit = hasPermission(user, "problem_reports.edit");
  const canAssign = hasPermission(user, "problem_reports.assign");
  const canTag = hasPermission(user, "problem_reports.tag");
  const canStatus = hasPermission(user, "problem_reports.status");
  const canPriority = canEdit || canStatus;
  if (!canEdit && !canAssign && !canTag && !canStatus) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const { id } = await context.params;
  const existing = await getProblemReportById(id);
  if (!existing || !canAccessReport(user, existing.deviceGroupCode)) {
    return NextResponse.json({ message: "Problem report not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const status = body?.status ?? existing.status;
  const priority = body?.priority ?? existing.priority;

  if (canStatus && !taskStatuses.includes(status)) {
    return NextResponse.json({ message: "Invalid status" }, { status: 400 });
  }

  if (canPriority && !priorities.includes(priority)) {
    return NextResponse.json({ message: "Invalid priority" }, { status: 400 });
  }

  const title = canEdit
    ? String(body?.title ?? existing.title).trim()
    : existing.title;
  const issue = canEdit
    ? String(body?.issue ?? existing.issue).trim()
    : existing.issue;
  const phone = canEdit
    ? String(body?.phone ?? existing.phone ?? "").trim()
    : (existing.phone ?? "");
  const deviceId = canEdit
    ? String(body?.deviceId ?? existing.deviceId).trim()
    : existing.deviceId;
  const dueDate = canEdit
    ? String(body?.dueDate ?? existing.dueDate).trim()
    : existing.dueDate;
  const assigneeIds =
    canAssign && Array.isArray(body?.assigneeIds)
      ? body.assigneeIds.map(String).filter(Boolean)
      : existing.assigneeIds;
  const tags = canTag ? normalizeTaskTags(body?.tags) : existing.tags;

  if (!title || !issue || !deviceId || !dueDate) {
    return NextResponse.json(
      { message: "Missing required problem report fields" },
      { status: 400 },
    );
  }

  const report = await updateProblemReport(
    id,
    {
      title,
      issue,
      phone,
      deviceId,
      assigneeIds,
      status: canStatus ? status : existing.status,
      priority: canPriority ? priority : existing.priority,
      tags,
      dueDate,
      createdBy: existing.createdBy,
    },
    { allowedDeviceGroupCode: getScopedDeviceGroupCode(user) },
  );

  if (!report) {
    return NextResponse.json({ message: "Problem report not found" }, { status: 404 });
  }

  await logAudit({
    userId: user!.id,
    action: "problem_report.update",
    entityType: "problem_report",
    entityId: id,
    metadata: {
      deviceId: report.deviceId,
      status: report.status,
      priority: report.priority,
      assigneeIds: report.assigneeIds,
      tags: report.tags,
    },
    ipAddress: request.headers.get("x-forwarded-for") ?? undefined,
    userAgent: request.headers.get("user-agent") ?? undefined,
  });

  return NextResponse.json({ report });
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const user = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (!hasPermission(user, "problem_reports.delete")) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const { id } = await context.params;
  const existing = await getProblemReportById(id);
  if (!existing || !canAccessReport(user, existing.deviceGroupCode)) {
    return NextResponse.json({ message: "Problem report not found" }, { status: 404 });
  }

  const deleted = await deleteProblemReport(id);
  if (!deleted) {
    return NextResponse.json({ message: "Problem report not found" }, { status: 404 });
  }

  await logAudit({
    userId: user!.id,
    action: "problem_report.delete",
    entityType: "problem_report",
    entityId: id,
    ipAddress: request.headers.get("x-forwarded-for") ?? undefined,
    userAgent: request.headers.get("user-agent") ?? undefined,
  });

  return NextResponse.json({ ok: true });
}

function getScopedDeviceGroupCode(user: Awaited<ReturnType<typeof verifySessionToken>>) {
  return user?.role === "garden"
    ? normalizeDeviceGroupCode(user.deviceGroupCode)
    : undefined;
}

function canAccessReport(
  user: Awaited<ReturnType<typeof verifySessionToken>>,
  reportDeviceGroupCode: string,
) {
  const scopedDeviceGroupCode = getScopedDeviceGroupCode(user);
  return (
    !scopedDeviceGroupCode ||
    normalizeDeviceGroupCode(reportDeviceGroupCode) === scopedDeviceGroupCode
  );
}
