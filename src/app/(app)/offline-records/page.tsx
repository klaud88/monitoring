import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { OfflineRecordsDashboard } from "@/components/offline-records/offline-records-dashboard";
import { SESSION_COOKIE, hasPermission, verifySessionToken } from "@/lib/auth";
import { getFirstAllowedPath } from "@/lib/navigation";
import {
  ensureTodayOfflineSnapshot,
  getDailyOfflineLevels,
  getDevices,
  getMonitoredDevices,
  getOfflineSnapshots,
} from "@/lib/repositories";

export default async function OfflineRecordsPage() {
  const cookieStore = await cookies();
  const user = await verifySessionToken(cookieStore.get(SESSION_COOKIE)?.value);
  if (!hasPermission(user, "offline_records.view")) {
    redirect(getFirstAllowedPath(user));
  }

  const [, devices, snapshots, monitoredDevices, dailyLevels] =
    await Promise.all([
      ensureTodayOfflineSnapshot(),
      getDevices(),
      getOfflineSnapshots(),
      getMonitoredDevices({ includeInactive: true }),
      getDailyOfflineLevels(),
    ]);
  const activeDevices = devices.filter((device) => !device.isExcluded);

  return (
    <OfflineRecordsDashboard
      initialDevices={activeDevices}
      initialSnapshots={snapshots}
      initialMonitoredDevices={monitoredDevices}
      dailyLevels={dailyLevels}
      userId={user?.id ?? "anonymous"}
    />
  );
}
