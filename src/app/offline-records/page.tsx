import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { OfflineRecordsDashboard } from "@/components/offline-records/offline-records-dashboard";
import { SESSION_COOKIE, hasPermission, verifySessionToken } from "@/lib/auth";
import { getFirstAllowedPath } from "@/lib/navigation";
import {
  ensureTodayOfflineSnapshot,
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

  await ensureTodayOfflineSnapshot();
  const [devices, snapshots, monitoredDevices] = await Promise.all([
    getDevices(),
    getOfflineSnapshots(),
    getMonitoredDevices({ includeInactive: true }),
  ]);
  const activeDevices = devices.filter((device) => !device.isExcluded);

  return (
    <AppShell>
      <OfflineRecordsDashboard
        initialDevices={activeDevices}
        initialSnapshots={snapshots}
        initialMonitoredDevices={monitoredDevices}
      />
    </AppShell>
  );
}
