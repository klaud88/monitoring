import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, hasPermission, verifySessionToken } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { readDevicePosition } from "@/lib/device-position";
import { createDevice, getDevices } from "@/lib/repositories";
import type { DeviceStatus } from "@/lib/types";

const deviceStatuses: DeviceStatus[] = ["online", "offline", "error"];

export async function GET(request: NextRequest) {
  const user = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (!hasPermission(user, "dashboard.view") && !hasPermission(user, "devices.view")) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({ devices: await getDevices() });
}

export async function POST(request: NextRequest) {
  const user = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (!hasPermission(user, "devices.create")) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const name = String(body?.name || "").trim();
  const code = normalizeDeviceCode(body?.code, name);
  const status = deviceStatuses.includes(body?.status) ? body.status : "online";
  const isExcluded = Boolean(body?.isExcluded);
  const region = body?.region ? String(body.region) : null;
  const tags = Array.isArray(body?.tags) ? body.tags.map(String) : [];
  const position = readDevicePosition(body?.position);

  if (!name) {
    return NextResponse.json({ message: "Device name is required" }, { status: 400 });
  }

  const device = await createDevice({
    code,
    name,
    status,
    isExcluded,
    region,
    tags,
    position,
  });

  await logAudit({
    userId: user!.id,
    action: "device.create",
    entityType: "device",
    entityId: device.id,
    metadata: { code, region, tags, isExcluded },
    ipAddress: request.headers.get("x-forwarded-for") ?? undefined,
    userAgent: request.headers.get("user-agent") ?? undefined,
  });

  return NextResponse.json({ device }, { status: 201 });
}

function normalizeDeviceCode(value: unknown, name: string) {
  const code = String(value || "").trim().toUpperCase();
  if (code) {
    return code;
  }

  const slug = name
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^\p{L}\p{N}-]/gu, "")
    .toUpperCase();

  return `${slug || "DEVICE"}-${Date.now().toString(36).toUpperCase()}`;
}
