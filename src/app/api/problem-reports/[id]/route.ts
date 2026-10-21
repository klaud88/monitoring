import { NextResponse, type NextRequest } from "next/server";
import { canAccessGarden, getGardenScope } from "@/lib/garden-scope";
import { redactTaskFields } from "@/lib/problem-report-view";
import { SESSION_COOKIE, hasPermission, verifySessionToken } from "@/lib/auth";
import { logAudit, logTaskPairAudit } from "@/lib/audit";
import { filterRegisteredTaskTags } from "@/lib/catalog";
import {
  deleteProblemReport,
  getProblemReportById,
  getTaskTagNames,
  getTasks,
  getUsers,
  updateProblemReport,
} from "@/lib/repositories";
import { filterAssignableTaskUserIds } from "@/lib/task-assignees";
import { diffTrackedTaskFields } from "@/lib/task-history";
import { canChooseDueDate } from "@/lib/working-days";
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
  if (!existing || !canAccessGarden(getGardenScope(user, "problem_reports"), existing.deviceGroupCode)) {
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
  /* The deadline stays where it is unless the editor is allowed to move it. */
  const dueDate =
    canEdit && canChooseDueDate(user?.role)
      ? String(body?.dueDate ?? existing.dueDate).trim()
      : existing.dueDate;
  const assigneeIds =
    canAssign && Array.isArray(body?.assigneeIds)
      ? filterAssignableTaskUserIds(
          body.assigneeIds.map(String).filter(Boolean),
          await getUsers(),
        )
      : existing.assigneeIds;
  // Tags not sent = left as they are, not cleared.
  const tags =
    canTag && body?.tags !== undefined
      ? filterRegisteredTaskTags(body.tags, await getTaskTagNames())
      : existing.tags;

  if (!title || !issue || !deviceId || !dueDate) {
    return NextResponse.json(
      { message: "Missing required problem report fields" },
      { status: 400 },
    );
  }

  const linkedTaskBefore = existing.taskId
    ? (await getTasks()).find((task) => task.id === existing.taskId)
    : undefined;

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
    { allowedGardenCodes: getGardenScope(user, "problem_reports") },
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
      /* Each changed field with its previous value, for the history. */
      changes: diffTrackedTaskFields(existing, report),
    },
    ipAddress: request.headers.get("x-forwarded-for") ?? undefined,
    userAgent: request.headers.get("user-agent") ?? undefined,
  });

  /* The linked task mirrors this report, so its status, priority, assignee
     and deadline changes are written into the task's own history too. */
  if (linkedTaskBefore) {
    const linkedTaskAfter = (await getTasks()).find(
      (task) => task.id === linkedTaskBefore.id,
    );
    const changes = linkedTaskAfter
      ? diffTrackedTaskFields(withComment(linkedTaskBefore), withComment(linkedTaskAfter))
      : [];
    if (changes.length) {
      await logAudit({
        userId: user!.id,
        action: "task.update",
        entityType: "task",
        entityId: linkedTaskBefore.id,
        metadata: { source: "problem_report", problemReportId: id, changes },
        ipAddress: request.headers.get("x-forwarded-for") ?? undefined,
        userAgent: request.headers.get("user-agent") ?? undefined,
      });
    }
  }

  return NextResponse.json({ report: redactTaskFields(report, user) });
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
  if (!existing || !canAccessGarden(getGardenScope(user, "problem_reports"), existing.deviceGroupCode)) {
    return NextResponse.json({ message: "Problem report not found" }, { status: 404 });
  }

  const deleted = await deleteProblemReport(id);
  if (!deleted.ok) {
    return NextResponse.json({ message: "Problem report not found" }, { status: 404 });
  }

  await logTaskPairAudit(request, user!.id, "delete", deleted);

  return NextResponse.json({ ok: true, taskId: deleted.taskId });
}

/* An empty comment is "", so writing the first one counts as a change. */
function withComment<T extends { comment?: string }>(task: T) {
  return { ...task, comment: task.comment ?? "" };
}
