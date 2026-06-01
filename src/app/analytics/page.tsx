import { AppShell } from "@/components/layout/app-shell";
import { AnalyticsDashboard } from "@/components/analytics/analytics-dashboard";
import { getDevices, getOfflineSnapshots } from "@/lib/repositories";

export default async function AnalyticsPage() {
  const [devices, snapshots] = await Promise.all([
    getDevices(),
    getOfflineSnapshots(),
  ]);

  return (
    <AppShell>
      <AnalyticsDashboard devices={devices} snapshots={snapshots} />
    </AppShell>
  );
}
