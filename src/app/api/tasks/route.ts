import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, hasPermission, verifySessionToken } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { filterRegisteredTaskTags } from "@/lib/catalog";
import { createTask, getTaskTagNames, getTasks, getUsers } from "@/lib/repositories";
import { filterAssignableTaskUserIds } from "@/lib/task-assignees";
import { resolveTaskVisibilityScope } from "@/lib/task-visibility";
import { taskDueDateForPriority } from "@/lib/working-days";
import type { TaskPriority, TaskStatus } from "@/lib/types";

const taskStatuses: TaskStatus[] = ["planned", "in_progress", "blocked", "done"];
const priorities: TaskPriority[] = ["low", "normal", "high", "urgent"];

export async function GET(request: NextRequest) {
  const user = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (!hasPermission(user, "tasks.view")) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const scope = resolveTaskVisibilityScope(user);
  return NextResponse.json({ tasks: await getTasks(scope) });
}

export async function POST(request: NextRequest) {
  const user = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (!hasPermission(user, "tasks.create")) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const title = String(body?.title || "").trim();
  const issue = String(body?.issue || "").trim();
  const comment = String(body?.comment || "").trim();
  const phone = String(body?.phone || "").trim();
  const deviceId = String(body?.deviceId || "");
  const status = taskStatuses.includes(body?.status) ? body.status : "planned";
  const priority: TaskPriority = priorities.includes(body?.priority)
    ? body.priority
    : "normal";
  /* Without an explicit deadline a task gets its priority's default:
     10 / 5 / 2 working days, or the same day when it is urgent. */
  const dueDate =
    String(body?.dueDate || "").trim() || taskDueDateForPriority(priority);
  const requestedAssigneeIds = Array.isArray(body?.assigneeIds)
    ? body.assigneeIds.map(String).filter(Boolean)
    : [];
  const assigneeIds = filterAssignableTaskUserIds(
    requestedAssigneeIds,
    await getUsers(),
  );
  const tags = filterRegisteredTaskTags(body?.tags, await getTaskTagNames());
  const info = Boolean(body?.info);

  if (!title || !issue || !deviceId || !dueDate) {
    return NextResponse.json({ message: "Missing required task fields" }, { status: 400 });
  }

  const task = await createTask({
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
