import { NextResponse, type NextRequest } from "next/server";
import { logAudit } from "@/lib/audit";
import { SESSION_COOKIE, hasPermission, verifySessionToken } from "@/lib/auth";
import {
  getFormOneRecordById,
  normalizeDeviceGroupCode,
  respondToFormOneCompletion,
} from "@/lib/repositories";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const user = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (!user || !hasPermission(user, "form_one.completion_response")) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const { id } = await context.params;
  const existing = await getFormOneRecordById(id);
  if (!existing || !canAccessRecord(user, existing.deviceGroupCode)) {
    return NextResponse.json({ message: "Form one record not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const action = body?.action === "approve" ? "approve" : "reject";
  const comment = String(body?.comment || "").trim();
  if (action === "reject" && !comment) {
    return NextResponse.json({ message: "Comment is required" }, { status: 400 });
  }

  const record = await respondToFormOneCompletion(
    id,
    { action, comment },
    {
      userId: user.id,
      allowedDeviceGroupCode: getScopedDeviceGroupCode(user),
    },
  );

  if (!record) {
    return NextResponse.json({ message: "Form one record not found" }, { status: 404 });
  }

  await logAudit({
    userId: user.id,
    action:
      action === "approve"
        ? "form_one.completion_approve"
        : "form_one.completion_reject",
    entityType: "form_one_record",
    entityId: id,
    metadata: { comment: action === "reject" ? comment : undefined },
    ipAddress: request.headers.get("x-forwarded-for") ?? undefined,
    userAgent: request.headers.get("user-agent") ?? undefined,
  });

  return NextResponse.json({ record });
}

function getScopedDeviceGroupCode(user: Awaited<ReturnType<typeof verifySessionToken>>) {
  return user?.role === "garden"
    ? normalizeDeviceGroupCode(user.deviceGroupCode)
    : undefined;
}

function canAccessRecord(
  user: Awaited<ReturnType<typeof verifySessionToken>>,
  recordDeviceGroupCode: string,
) {
  const scopedDeviceGroupCode = getScopedDeviceGroupCode(user);
  return (
    !scopedDeviceGroupCode ||
    normalizeDeviceGroupCode(recordDeviceGroupCode) === scopedDeviceGroupCode
  );
}
