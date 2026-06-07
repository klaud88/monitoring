import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { AnalyticsDashboard } from "@/components/analytics/analytics-dashboard";
import { SESSION_COOKIE, hasPermission, verifySessionToken } from "@/lib/auth";
import { getFirstAllowedPath } from "@/lib/navigation";
import { getDevices, getOfflineSnapshots } from "@/lib/repositories";

export default async function AnalyticsPage() {
  const cookieStore = await cookies();
  const user = await verifySessionToken(cookieStore.get(SESSION_COOKIE)?.value);
  if (!hasPermission(user, "analytics.view")) {
    redirect(getFirstAllowedPath(user));
  }

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
