import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, hasPermission, verifySessionToken } from "@/lib/auth";
import { restoreDeviceOfflineHistory } from "@/lib/repositories";

/** Brings back a device's cleared offline history (periods and counters). */
export async function POST(request: NextRequest) {
  const user = await verifySessionToken(
    request.cookies.get(SESSION_COOKIE)?.value,
  );
  if (!hasPermission(user, "offline_records.delete")) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const deviceId = String(body?.deviceId || "").trim();

  if (!deviceId) {
    return NextResponse.json({ message: "No device given" }, { status: 400 });
  }

  const monitoredDevices = await restoreDeviceOfflineHistory(deviceId);
  return NextResponse.json({ monitoredDevices });
}
