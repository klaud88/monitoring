import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, hasPermission, verifySessionToken } from "@/lib/auth";
import { setDeviceMonitoring } from "@/lib/repositories";

export async function POST(request: NextRequest) {
  const user = await verifySessionToken(
    request.cookies.get(SESSION_COOKIE)?.value,
  );
  if (!hasPermission(user, "offline_records.edit")) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const deviceIds = Array.isArray(body?.deviceIds)
    ? body.deviceIds.map(String)
    : [];
  const enabled = body?.enabled !== false;

  if (!deviceIds.length) {
    return NextResponse.json({ message: "No devices selected" }, { status: 400 });
  }

  const monitoredDevices = await setDeviceMonitoring(deviceIds, enabled);
  return NextResponse.json({ monitoredDevices });
}
