import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, hasPermission, verifySessionToken } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { parseDevicePosition } from "@/lib/device-position";
import { deleteDevice, getDeviceById, updateDevice } from "@/lib/repositories";
import type { DeviceStatus } from "@/lib/types";

const deviceStatuses: DeviceStatus[] = ["online", "offline", "error"];

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
  const existingDevice = await getDeviceById(id);
  if (!existingDevice) {
    return NextResponse.json({ message: "Device not found" }, { status: 404 });
  }

  const code =
    body?.code === undefined
      ? existingDevice.code
      : String(body.code).trim().toUpperCase() || existingDevice.code;
  const name = String(body?.name || "").trim();
  const status = deviceStatuses.includes(body?.status) ? body.status : "online";
  const isExcluded = Boolean(body?.isExcluded);
  const region = body?.region ? String(body.region) : null;
  const tags = Array.isArray(body?.tags) ? body.tags.map(String) : [];
  const position =
    body?.position === undefined
      ? existingDevice.position
      : parseDevicePosition(body.position) ?? existingDevice.position;

  if (!name) {
    return NextResponse.json({ message: "Device name is required" }, { status: 400 });
  }

  const device = await updateDevice(id, {
    code,
    name,
    status,
    isExcluded,
    region,
    tags,
    position,
  });
  if (!device) {
    return NextResponse.json({ message: "Device not found" }, { status: 404 });
  }

  await logAudit({
    userId: user!.id,
    action: "device.update",
    entityType: "device",
    entityId: id,
    metadata: { code, region, tags, isExcluded },
    ipAddress: request.headers.get("x-forwarded-for") ?? undefined,
    userAgent: request.headers.get("user-agent") ?? undefined,
  });

  return NextResponse.json({ device });
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const user = await verifySessionToken(
    request.cookies.get(SESSION_COOKIE)?.value,
  );
  if (!hasPermission(user, "devices.delete")) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const { id } = await context.params;
  const deleted = await deleteDevice(id);
  if (!deleted) {
    return NextResponse.json({ message: "Device not found" }, { status: 404 });
  }

  await logAudit({
    userId: user!.id,
    action: "device.delete",
    entityType: "device",
    entityId: id,
    ipAddress: request.headers.get("x-forwarded-for") ?? undefined,
    userAgent: request.headers.get("user-agent") ?? undefined,
  });

  return NextResponse.json({ ok: true });
}
