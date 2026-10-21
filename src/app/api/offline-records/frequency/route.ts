import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, hasPermission, verifySessionToken } from "@/lib/auth";
import {
  clearOfflineFrequencyForDevice,
  getOfflineSnapshots,
  getRemovedOfflineFrequencyDevices,
  restoreOfflineFrequencyForDevice,
} from "@/lib/repositories";

/* "remove" hides a device from the X-Station frequency; "restore" brings it
   back. Nothing is deleted from the database. */
export async function PATCH(request: NextRequest) {
  const user = await verifySessionToken(
    request.cookies.get(SESSION_COOKIE)?.value,
  );
  if (!hasPermission(user, "offline_records.delete")) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const deviceId = typeof body?.deviceId === "string" ? body.deviceId : "";
  const action = body?.action;

  if (!deviceId.trim()) {
    return NextResponse.json({ message: "Device is required" }, { status: 400 });
  }

  if (action !== "remove" && action !== "restore") {
    return NextResponse.json({ message: "Invalid action" }, { status: 400 });
  }

  if (action === "remove") {
    await clearOfflineFrequencyForDevice(deviceId);
  } else {
    await restoreOfflineFrequencyForDevice(deviceId);
  }
  const [snapshots, removedDevices] = await Promise.all([
    getOfflineSnapshots(),
    getRemovedOfflineFrequencyDevices(),
  ]);

  return NextResponse.json({ snapshots, removedDevices });
}
