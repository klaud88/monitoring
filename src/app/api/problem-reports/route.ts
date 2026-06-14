import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, hasPermission, verifySessionToken } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { filterRegisteredTaskTags } from "@/lib/catalog";
import {
  createProblemReport,
  getTaskTagNames,
  getProblemReports,
  getUsers,
  normalizeDeviceGroupCode,
} from "@/lib/repositories";
import { filterAssignableTaskUserIds } from "@/lib/task-assignees";
import type { TaskPriority, TaskStatus } from "@/lib/types";

const taskStatuses: TaskStatus[] = ["planned", "in_progress", "blocked", "done"];
const priorities: TaskPriority[] = ["low", "normal", "high", "urgent"];

export async function GET(request: NextRequest) {
  const user = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (!hasPermission(user, "problem_reports.view")) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({
    reports: await getProblemReports({
      deviceGroupCode: getScopedDeviceGroupCode(user),
    }),
  });
}

export async function POST(request: NextRequest) {
  const user = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (!hasPermission(user, "problem_reports.create")) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const title = String(body?.title || "").trim();
  const issue = String(body?.issue || "").trim();
  const phone = String(body?.phone || "").trim();
  const deviceId = String(body?.deviceId || "").trim();
  const dueDate = String(body?.dueDate || "").trim();
  const canSetPriority =
    hasPermission(user, "problem_reports.edit") ||
    hasPermission(user, "problem_reports.status");
  const priority =
    canSetPriority && priorities.includes(body?.priority)
      ? body.priority
      : "normal";
  const status =
    hasPermission(user, "problem_reports.status") && taskStatuses.includes(body?.status)
      ? body.status
      : "planned";
  const tags = hasPermission(user, "problem_reports.tag")
    ? filterRegisteredTaskTags(body?.tags, await getTaskTagNames())
    : [];
  const requestedAssigneeIds =
    hasPermission(user, "problem_reports.assign") && Array.isArray(body?.assigneeIds)
      ? body.assigneeIds.map(String).filter(Boolean)
      : [];
  const assigneeIds = filterAssignableTaskUserIds(
    requestedAssigneeIds,
    await getUsers(),
  );

  if (!title || !issue || !deviceId || !dueDate) {
    return NextResponse.json(
      { message: "Missing required problem report fields" },
      { status: 400 },
    );
  }

  const report = await createProblemReport(
    {
      title,
      issue,
      phone,
      deviceId,
      assigneeIds,
      status,
      priority,
      tags,
      dueDate,
      createdBy: user?.id,
    },
    {
      createdBy: user?.id,
      allowedDeviceGroupCode: getScopedDeviceGroupCode(user),
    },
  );

  await logAudit({
    userId: user!.id,
    action: "problem_report.create",
    entityType: "problem_report",
    entityId: report.id,
    metadata: { deviceId, priority, status, tags, assigneeIds },
    ipAddress: request.headers.get("x-forwarded-for") ?? undefined,
    userAgent: request.headers.get("user-agent") ?? undefined,
  });

  return NextResponse.json({ report }, { status: 201 });
}

function getScopedDeviceGroupCode(user: Awaited<ReturnType<typeof verifySessionToken>>) {
  return user?.role === "garden"
    ? normalizeDeviceGroupCode(user.deviceGroupCode)
    : undefined;
}
