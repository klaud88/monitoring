import { NextResponse, type NextRequest } from "next/server";
import { canAccessGarden, getGardenScope } from "@/lib/garden-scope";
import { SESSION_COOKIE, hasPermission, verifySessionToken } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { filterRegisteredTaskTags } from "@/lib/catalog";
import {
  createProblemReport,
  getActiveProblemCategory,
  getDeviceGroupCode,
  getDevices,
  getTaskTagNames,
  getProblemReports,
  getUsers,
} from "@/lib/repositories";
import { filterAssignableTaskUserIds } from "@/lib/task-assignees";
import { canChooseDueDate, workingDayDueDate } from "@/lib/working-days";
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
      gardenCodes: getGardenScope(user, "problem_reports"),
    }),
  });
}

export async function POST(request: NextRequest) {
  const user = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (!hasPermission(user, "problem_reports.create")) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  /* A chosen category sets the title server-side and, below, who the
     report goes to; without one ("სხვა") the typed title is used. */
  const category = await getActiveProblemCategory(String(body?.categoryId || "").trim());
  const title = category ? category.title : String(body?.title || "").trim();
  const issue = String(body?.issue || "").trim();
  const phone = String(body?.phone || "").trim();
  const deviceId = String(body?.deviceId || "").trim();
  /* Only admin/technician/dispatcher may pick a deadline; everyone else gets
     the standard five working days, enforced here and not just in the UI. */
  const requestedDueDate = String(body?.dueDate || "").trim();
  const dueDate =
    canChooseDueDate(user?.role) && requestedDueDate
      ? requestedDueDate
      : workingDayDueDate();
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
  const chosenAssigneeIds = filterAssignableTaskUserIds(
    requestedAssigneeIds,
    await getUsers(),
  );
  // Someone who may assign keeps their own pick (the form pre-fills it from
  // the category); everyone else — a garden — gets the category's people.
  const assigneeIds =
    category && chosenAssigneeIds.length === 0
      ? category.resolvedUserIds
      : chosenAssigneeIds;

  if (!title || !issue || !deviceId || !dueDate) {
    return NextResponse.json(
      { message: "Missing required problem report fields" },
      { status: 400 },
    );
  }

  // Only a device of one of the user's gardens. Checked here because the
  // repository answers a refused insert like a database outage (a fallback
  // report), which would look like success.
  const gardenScope = getGardenScope(user, "problem_reports");
  const device = (await getDevices()).find((item) => item.id === deviceId);
  if (!device || !canAccessGarden(gardenScope, getDeviceGroupCode(device))) {
    return NextResponse.json(
      { message: "ამ ბაღზე წვდომა არ გაქვთ." },
      { status: 403 },
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
      categoryId: category?.id,
      createdBy: user?.id,
    },
    {
      createdBy: user?.id,
      allowedGardenCodes: gardenScope,
    },
  );

  await logAudit({
    userId: user!.id,
    action: "problem_report.create",
    entityType: "problem_report",
    entityId: report.id,
    metadata: { deviceId, priority, status, tags, assigneeIds, categoryId: category?.id },
    ipAddress: request.headers.get("x-forwarded-for") ?? undefined,
    userAgent: request.headers.get("user-agent") ?? undefined,
  });

  return NextResponse.json({ report }, { status: 201 });
}
