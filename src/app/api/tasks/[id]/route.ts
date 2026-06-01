import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, hasPermission, verifySessionToken } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { deleteTask, getTasks, updateTask } from "@/lib/repositories";
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
  if (!existingTask) {
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
  const deviceId =
    body?.deviceId === undefined
      ? existingTask.deviceId
      : String(body.deviceId).trim();
  const dueDate =
    body?.dueDate === undefined
      ? existingTask.dueDate
      : String(body.dueDate).trim();
  const assigneeIds = Array.isArray(body?.assigneeIds)
    ? body.assigneeIds.map(String).filter(Boolean)
    : existingTask.assigneeIds;

  if (!title || !issue || !deviceId || !dueDate) {
    return NextResponse.json({ message: "Missing required task fields" }, { status: 400 });
  }

  const task = await updateTask(id, {
    title,
    issue,
    deviceId,
    assigneeIds,
    status,
    priority,
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
    metadata: { status, priority, deviceId, assigneeIds },
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
  const deleted = await deleteTask(id);
  if (!deleted) {
    return NextResponse.json({ message: "Task not found" }, { status: 404 });
  }

  await logAudit({
    userId: user!.id,
    action: "task.delete",
    entityType: "task",
    entityId: id,
    ipAddress: request.headers.get("x-forwarded-for") ?? undefined,
    userAgent: request.headers.get("user-agent") ?? undefined
  });

  return NextResponse.json({ ok: true });
}
