import { AppShell } from "@/components/layout/app-shell";
import { OfflineRecordsDashboard } from "@/components/offline-records/offline-records-dashboard";
import {
  ensureTodayOfflineSnapshot,
  getDevices,
  getMonitoredDevices,
  getOfflineSnapshots,
} from "@/lib/repositories";

export default async function OfflineRecordsPage() {
  await ensureTodayOfflineSnapshot();
  const [devices, snapshots, monitoredDevices] = await Promise.all([
    getDevices(),
    getOfflineSnapshots(),
    getMonitoredDevices(),
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
