import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, hasPermission, verifySessionToken } from "@/lib/auth";
import {
  clearDeviceOfflineHistory,
  refreshMonitoredDeviceStatuses,
  setDeviceMonitoring,
} from "@/lib/repositories";
import type { MonitoredDevice } from "@/lib/types";

export async function GET(request: NextRequest) {
  const user = await verifySessionToken(
    request.cookies.get(SESSION_COOKIE)?.value,
  );
  if (!hasPermission(user, "offline_records.alerts")) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const monitoredDevices = await refreshMonitoredDeviceStatuses({
    includeInactive: true,
  });
  return NextResponse.json({
    monitoredDevices,
    notifications: getMonitoringNotifications(monitoredDevices),
  });
}

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
  return NextResponse.json({
    monitoredDevices,
    notifications: getMonitoringNotifications(monitoredDevices),
  });
}

/** Clears one device's offline history — the only thing that erases it. */
export async function DELETE(request: NextRequest) {
  const user = await verifySessionToken(
    request.cookies.get(SESSION_COOKIE)?.value,
  );
  if (!hasPermission(user, "offline_records.edit")) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const deviceId = String(body?.deviceId || "").trim();

  if (!deviceId) {
    return NextResponse.json({ message: "No device given" }, { status: 400 });
  }

  const monitoredDevices = await clearDeviceOfflineHistory(deviceId);
  return NextResponse.json({
    monitoredDevices,
    notifications: getMonitoringNotifications(monitoredDevices),
  });
}

function getMonitoringNotifications(monitoredDevices: MonitoredDevice[]) {
  return monitoredDevices
    .filter(
      (device) =>
        device.isActive &&
        device.lastStatus === "offline" &&
        device.offlineCount > 0 &&
        device.lastNotificationAt,
    )
    .map((device) => ({
      deviceId: device.deviceId,
      deviceName: device.deviceName,
      offlineCount: device.offlineCount,
      lastOfflineAt: device.lastOfflineAt,
      lastNotificationAt: device.lastNotificationAt,
    }));
}
