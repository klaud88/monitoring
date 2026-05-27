import { AppShell } from "@/components/layout/app-shell";
import { Dashboard } from "@/components/dashboard/dashboard";
import { getDevices, getTasks, getUsers } from "@/lib/repositories";

export default async function DashboardPage() {
  const [devices, tasks, users] = await Promise.all([getDevices(), getTasks(), getUsers()]);

  return (
    <AppShell>
      <Dashboard initialDevices={devices} initialTasks={tasks} users={users} />
    </AppShell>
  );
}
