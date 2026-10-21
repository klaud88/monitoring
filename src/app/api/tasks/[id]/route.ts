import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, hasPermission, verifySessionToken } from "@/lib/auth";
import { logAudit, logTaskPairAudit } from "@/lib/audit";
import { filterRegisteredTaskTags } from "@/lib/catalog";
import {
  deleteTask,
  getTaskTagNames,
  getTasks,
  getUsers,
  normalizeInfoAutoDoneDays,
  updateTask,
} from "@/lib/repositories";
import { filterAssignableTaskUserIds } from "@/lib/task-assignees";
import { diffTrackedTaskFields } from "@/lib/task-history";
import { canAccessTask } from "@/lib/task-visibility";
import type { TaskPriority, TaskStatus } from "@/lib/types";

const taskStatuses: TaskStatus[] = ["planned", "in_progress", "blocked", "done"];
const priorities: TaskPriority[] = ["low", "normal", "high", "urgent"];

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const user = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (!hasPermission(user, "tasks.edit")) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  const existingTask = (await getTasks()).find((task) => task.id === id);
  if (!existingTask || !canAccessTask(user, existingTask)) {
    return NextResponse.json({ message: "Task not found" }, { status: 404 });
  }

  const status = body?.status ?? existingTask.status;
  const priority = body?.priority ?? existingTask.priority;

  if (!taskStatuses.includes(status)) {
    return NextResponse.json({ message: "Invalid status" }, { status: 400 });
  }

  if (!priorities.includes(priority)) {
    return NextResponse.json({ message: "Invalid priority" }, { status: 400 });
  }

  const title =
    body?.title === undefined ? existingTask.title : String(body.title).trim();
  const issue =
    body?.issue === undefined ? existingTask.issue : String(body.issue).trim();
  const comment =
    body?.comment === undefined
      ? (existingTask.comment ?? "")
      : String(body.comment).trim();
  const phone =
    body?.phone === undefined
      ? (existingTask.phone ?? "")
      : String(body.phone).trim();
  const deviceId =
    body?.deviceId === undefined
      ? existingTask.deviceId
      : String(body.deviceId).trim();
  const dueDate =
    body?.dueDate === undefined
      ? existingTask.dueDate
      : String(body.dueDate).trim();
  const assigneeIds = Array.isArray(body?.assigneeIds)
    ? filterAssignableTaskUserIds(
        body.assigneeIds.map(String).filter(Boolean),
        await getUsers(),
      )
    : existingTask.assigneeIds;
  const tags =
    body?.tags === undefined
      ? existingTask.tags
      : filterRegisteredTaskTags(body.tags, await getTaskTagNames());
  const info = body?.info === undefined ? Boolean(existingTask.info) : Boolean(body.info);
  const infoAutoDoneDays = normalizeInfoAutoDoneDays(
    body?.infoAutoDoneDays === undefined
      ? existingTask.infoAutoDoneDays
      : body.infoAutoDoneDays,
    info,
  );

  if (!title || !issue || !deviceId || !dueDate) {
    return NextResponse.json({ message: "Missing required task fields" }, { status: 400 });
  }

  const task = await updateTask(id, {
    title,
    issue,
    comment,
    phone,
    deviceId,
    assigneeIds,
    status,
    priority,
    tags,
    info,
    infoAutoDoneDays,
    startsAt: body?.startsAt ? String(body.startsAt) : existingTask.startsAt,
    dueDate,
  });
  if (!task) {
    return NextResponse.json({ message: "Task not found" }, { status: 404 });
  }

  await logAudit({
    userId: user!.id,
    action: "task.update",
    entityType: "task",
    entityId: id,
    metadata: {
      status,
      priority,
      deviceId,
      assigneeIds,
      tags,
      /* Each changed field with its previous value feeds the task history. */
      changes: diffTrackedTaskFields(
        { ...existingTask, comment: existingTask.comment ?? "" },
        { ...task, comment: task.comment ?? "" },
      ),
    },
    ipAddress: request.headers.get("x-forwarded-for") ?? undefined,
    userAgent: request.headers.get("user-agent") ?? undefined
  });

  return NextResponse.json({ task });
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const user = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (!hasPermission(user, "tasks.delete")) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const { id } = await context.params;
  const existingTask = (await getTasks()).find((task) => task.id === id);
  if (!existingTask || !canAccessTask(user, existingTask)) {
    return NextResponse.json({ message: "Task not found" }, { status: 404 });
  }

  const deleted = await deleteTask(id);
  if (!deleted.ok) {
    return NextResponse.json({ message: "Task not found" }, { status: 404 });
  }

  await logTaskPairAudit(request, user!.id, "delete", deleted);

  return NextResponse.json({ ok: true, problemReportId: deleted.problemReportId });
}
