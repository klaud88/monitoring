import { cookies } from "next/headers";
import { AppShell } from "@/components/layout/app-shell";
import { Dashboard } from "@/components/dashboard/dashboard";
import { SESSION_COOKIE, hasPermission, verifySessionToken } from "@/lib/auth";
import { getDevices, getTasks, getUsers } from "@/lib/repositories";

export default async function DashboardPage() {
  const cookieStore = await cookies();
  const user = await verifySessionToken(cookieStore.get(SESSION_COOKIE)?.value);
  const [devices, tasks, users] = await Promise.all([
    getDevices(),
    getTasks(),
    getUsers(),
  ]);

  return (
    <AppShell>
      <Dashboard
        initialDevices={devices}
        initialTasks={tasks}
        users={users}
        canEditDeviceLocations={hasPermission(user, "devices.edit")}
      />
    </AppShell>
  );
}
