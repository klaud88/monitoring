import { NextResponse, type NextRequest } from "next/server";
import { logAudit } from "@/lib/audit";
import { canAccessGarden, getGardenScope } from "@/lib/garden-scope";
import { SESSION_COOKIE, hasPermission, verifySessionToken } from "@/lib/auth";
import {
  cancelFormOneEditReview,
  getFormOneRecordById,
} from "@/lib/repositories";

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const user = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (!hasPermission(user, "form_one.edit")) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const { id } = await context.params;
  const existing = await getFormOneRecordById(id);
  if (!existing || !canAccessGarden(getGardenScope(user, "form_one"), existing.deviceGroupCode)) {
    return NextResponse.json({ message: "Form one record not found" }, { status: 404 });
  }

  const record = await cancelFormOneEditReview(id, {
    allowedGardenCodes: getGardenScope(user, "form_one"),
  });

  if (!record) {
    return NextResponse.json({ message: "Form one record not found" }, { status: 404 });
  }

  await logAudit({
    userId: user!.id,
    action: "form_one.edit_review_cancel",
    entityType: "form_one_record",
    entityId: id,
    ipAddress: request.headers.get("x-forwarded-for") ?? undefined,
    userAgent: request.headers.get("user-agent") ?? undefined,
  });

  return NextResponse.json({ record });
}
