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
  getRemovedOfflineFrequencyDevices,
} from "@/lib/repositories";

export default async function OfflineRecordsPage() {
  const cookieStore = await cookies();
  const user = await verifySessionToken(cookieStore.get(SESSION_COOKIE)?.value);
  if (!hasPermission(user, "offline_records.view")) {
    redirect(getFirstAllowedPath(user));
  }

  const canDelete = hasPermission(user, "offline_records.delete");
  const [, devices, snapshots, monitoredDevices, dailyLevels, removedFrequency] =
    await Promise.all([
      ensureTodayOfflineSnapshot(),
      getDevices(),
      getOfflineSnapshots(),
      getMonitoredDevices({ includeInactive: true }),
      getDailyOfflineLevels(),
      // Devices taken off the frequency, for those who may restore them.
      canDelete ? getRemovedOfflineFrequencyDevices() : Promise.resolve([]),
    ]);
  const activeDevices = devices.filter((device) => !device.isExcluded);

  return (
    <OfflineRecordsDashboard
      initialDevices={activeDevices}
      initialSnapshots={snapshots}
      initialMonitoredDevices={monitoredDevices}
      dailyLevels={dailyLevels}
      initialRemovedFrequencyDevices={removedFrequency}
      userId={user?.id ?? "anonymous"}
      permissions={{
        create: hasPermission(user, "offline_records.create"),
        edit: hasPermission(user, "offline_records.edit"),
        delete: canDelete,
        alerts: hasPermission(user, "offline_records.alerts"),
      }}
    />
  );
}
