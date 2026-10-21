import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, hasPermission, verifySessionToken } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { getDeviceById, restoreDevice } from "@/lib/repositories";

/* Brings a soft-deleted device back. */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const user = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (!hasPermission(user, "devices.delete")) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const { id } = await context.params;
  const restored = await restoreDevice(id);
  if (!restored) {
    return NextResponse.json({ message: "Device not found" }, { status: 404 });
  }

  await logAudit({
    userId: user!.id,
    action: "device.restore",
    entityType: "device",
    entityId: id,
    ipAddress: request.headers.get("x-forwarded-for") ?? undefined,
    userAgent: request.headers.get("user-agent") ?? undefined,
  });

  return NextResponse.json({ device: await getDeviceById(id) });
}
