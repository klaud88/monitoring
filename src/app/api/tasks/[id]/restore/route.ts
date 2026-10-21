import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, hasPermission, verifySessionToken } from "@/lib/auth";
import { logTaskPairAudit } from "@/lib/audit";
import { getTasks, restoreTask } from "@/lib/repositories";
import { canAccessTask } from "@/lib/task-visibility";

/* Brings a soft-deleted task back, together with its linked problem report. */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const user = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (!hasPermission(user, "tasks.delete")) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const { id } = await context.params;
  const existingTask = (await getTasks({ includeDeleted: true })).find(
    (task) => task.id === id,
  );
  if (!existingTask || !canAccessTask(user, existingTask)) {
    return NextResponse.json({ message: "Task not found" }, { status: 404 });
  }

  const restored = await restoreTask(id);
  if (!restored.ok) {
    return NextResponse.json({ message: "Task not found" }, { status: 404 });
  }

  await logTaskPairAudit(request, user!.id, "restore", restored);

  return NextResponse.json({ ok: true, problemReportId: restored.problemReportId });
}
