import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, hasPermission, verifySessionToken } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { normalizeTaskTags } from "@/lib/catalog";
import { createTask, getTasks } from "@/lib/repositories";
import type { TaskPriority, TaskStatus } from "@/lib/types";

const taskStatuses: TaskStatus[] = ["planned", "in_progress", "blocked", "done"];
const priorities: TaskPriority[] = ["low", "normal", "high", "urgent"];

export async function GET(request: NextRequest) {
  const user = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (!hasPermission(user, "tasks.view")) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({ tasks: await getTasks() });
}

export async function POST(request: NextRequest) {
  const user = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (!hasPermission(user, "tasks.create")) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const title = String(body?.title || "").trim();
  const issue = String(body?.issue || "").trim();
  const deviceId = String(body?.deviceId || "");
  const dueDate = String(body?.dueDate || "");
  const status = taskStatuses.includes(body?.status) ? body.status : "planned";
  const priority = priorities.includes(body?.priority) ? body.priority : "normal";
  const assigneeIds = Array.isArray(body?.assigneeIds)
    ? body.assigneeIds.map(String).filter(Boolean)
    : [];
  const tags = normalizeTaskTags(body?.tags);

  if (!title || !issue || !deviceId || !dueDate) {
    return NextResponse.json({ message: "Missing required task fields" }, { status: 400 });
  }

  const task = await createTask({
    title,
    issue,
    deviceId,
    assigneeIds,
    status,
    priority,
    tags,
    startsAt: body?.startsAt ? String(body.startsAt) : undefined,
    dueDate
  });

  await logAudit({
    userId: user!.id,
    action: "task.create",
    entityType: "task",
    entityId: task.id,
    metadata: { deviceId, assigneeIds, priority, tags },
    ipAddress: request.headers.get("x-forwarded-for") ?? undefined,
    userAgent: request.headers.get("user-agent") ?? undefined
  });

  return NextResponse.json({ task }, { status: 201 });
}
