import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, hasPermission, verifySessionToken } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { parseDevicePosition } from "@/lib/device-position";
import { updateDevicePosition } from "@/lib/repositories";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const user = await verifySessionToken(
    request.cookies.get(SESSION_COOKIE)?.value,
  );
  if (!hasPermission(user, "devices.edit")) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  const position = parseDevicePosition(body?.position);

  if (!position) {
    return NextResponse.json(
      { message: "Valid position is required" },
      { status: 400 },
    );
  }

  const device = await updateDevicePosition(id, position);
  if (!device) {
    return NextResponse.json({ message: "Device not found" }, { status: 404 });
  }

  await logAudit({
    userId: user!.id,
    action: "device.position_update",
    entityType: "device",
    entityId: id,
    metadata: { position },
    ipAddress: request.headers.get("x-forwarded-for") ?? undefined,
    userAgent: request.headers.get("user-agent") ?? undefined,
  });

  return NextResponse.json({ device });
}
