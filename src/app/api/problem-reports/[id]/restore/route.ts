import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, hasPermission, verifySessionToken } from "@/lib/auth";
import { logTaskPairAudit } from "@/lib/audit";
import { canAccessGarden, getGardenScope } from "@/lib/garden-scope";
import { getProblemReportById, restoreProblemReport } from "@/lib/repositories";

/* Brings a soft-deleted problem report back, together with its linked task. */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const user = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (!hasPermission(user, "problem_reports.delete")) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const { id } = await context.params;
  const existing = await getProblemReportById(id, { includeDeleted: true });
  if (!existing || !canAccessGarden(getGardenScope(user, "problem_reports"), existing.deviceGroupCode)) {
    return NextResponse.json({ message: "Problem report not found" }, { status: 404 });
  }

  const restored = await restoreProblemReport(id);
  if (!restored.ok) {
    return NextResponse.json({ message: "Problem report not found" }, { status: 404 });
  }

  await logTaskPairAudit(request, user!.id, "restore", restored);

  return NextResponse.json({ ok: true, taskId: restored.taskId });
}
