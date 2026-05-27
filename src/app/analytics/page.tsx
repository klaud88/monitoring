import { AppShell } from "@/components/layout/app-shell";
import { AnalyticsDashboard } from "@/components/analytics/analytics-dashboard";
import { getDevices } from "@/lib/repositories";

export default async function AnalyticsPage() {
  const devices = await getDevices();

  return (
    <AppShell>
      <AnalyticsDashboard devices={devices} />
    </AppShell>
  );
}
