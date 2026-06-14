import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { Dashboard } from "@/components/dashboard/dashboard";
import { SESSION_COOKIE, hasPermission, verifySessionToken } from "@/lib/auth";
import { getFirstAllowedPath } from "@/lib/navigation";
import {
  getDevices,
  getTaskTagNames,
  getTasks,
  getUsers,
} from "@/lib/repositories";

export default async function DashboardPage() {
  const cookieStore = await cookies();
  const user = await verifySessionToken(cookieStore.get(SESSION_COOKIE)?.value);
  if (!hasPermission(user, "dashboard.view")) {
    redirect(getFirstAllowedPath(user));
  }

  const [devices, tasks, users, taskTags] = await Promise.all([
    getDevices(),
    getTasks(),
    getUsers(),
    getTaskTagNames(),
  ]);

  return (
    <AppShell>
      <Dashboard
        initialDevices={devices}
        initialTasks={tasks}
        initialTags={taskTags}
        users={users}
        canEditDeviceLocations={hasPermission(user, "devices.edit")}
        canCreateTaskTags={hasPermission(user, "tasks.tag_create")}
        canDeleteTaskTags={hasPermission(user, "tasks.tag_delete")}
      />
    </AppShell>
  );
}
