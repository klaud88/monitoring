import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, hasPermission, verifySessionToken } from "@/lib/auth";
import {
  clearOfflineFrequencyForDevice,
  getOfflineSnapshots,
} from "@/lib/repositories";

export async function PATCH(request: NextRequest) {
  const user = await verifySessionToken(
    request.cookies.get(SESSION_COOKIE)?.value,
  );
  if (!hasPermission(user, "offline_records.edit")) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const deviceId = typeof body?.deviceId === "string" ? body.deviceId : "";
  const action = body?.action;

  if (!deviceId.trim()) {
    return NextResponse.json({ message: "Device is required" }, { status: 400 });
  }

  if (action !== "remove") {
    return NextResponse.json({ message: "Invalid action" }, { status: 400 });
  }

  await clearOfflineFrequencyForDevice(deviceId);
  const snapshots = await getOfflineSnapshots();

  return NextResponse.json({ snapshots });
}
