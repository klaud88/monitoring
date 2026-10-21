import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, hasPermission, verifySessionToken } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { canAccessGarden, getGardenScope } from "@/lib/garden-scope";
import { getFormOneRecordById, restoreFormOneRecord } from "@/lib/repositories";

/* Brings a soft-deleted Form 1 record back. */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const user = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (!hasPermission(user, "form_one.delete")) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const { id } = await context.params;
  const gardenScope = getGardenScope(user, "form_one");
  const existing = await getFormOneRecordById(id, { includeDeleted: true });
  if (!existing || !canAccessGarden(gardenScope, existing.deviceGroupCode)) {
    return NextResponse.json({ message: "Form one record not found" }, { status: 404 });
  }

  const restored = await restoreFormOneRecord(id, { allowedGardenCodes: gardenScope });
  if (!restored) {
    return NextResponse.json({ message: "Form one record not found" }, { status: 404 });
  }

  await logAudit({
    userId: user!.id,
    action: "form_one.restore",
    entityType: "form_one_record",
    entityId: id,
    ipAddress: request.headers.get("x-forwarded-for") ?? undefined,
    userAgent: request.headers.get("user-agent") ?? undefined,
  });

  return NextResponse.json({
    record: await getFormOneRecordById(id),
  });
}
