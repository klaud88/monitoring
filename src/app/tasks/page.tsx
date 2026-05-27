import { AppShell } from "@/components/layout/app-shell";
import { TasksManager } from "@/components/tasks/tasks-manager";
import { getDevices, getTasks, getUsers } from "@/lib/repositories";

export default async function TasksPage() {
  const [devices, tasks, users] = await Promise.all([getDevices(), getTasks(), getUsers()]);

  return (
    <AppShell>
      <TasksManager initialTasks={tasks} devices={devices} users={users} />
    </AppShell>
  );
}
