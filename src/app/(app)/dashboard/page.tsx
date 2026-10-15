import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Dashboard } from "@/components/dashboard/dashboard";
import { SESSION_COOKIE, hasPermission, verifySessionToken } from "@/lib/auth";
import { getFirstAllowedPath } from "@/lib/navigation";
import {
  getDevices,
  getRegions,
  getTaskTagNames,
  getTasks,
  getUsers,
} from "@/lib/repositories";
import { resolveTaskVisibilityScope } from "@/lib/task-visibility";

export default async function DashboardPage() {
  const cookieStore = await cookies();
  const user = await verifySessionToken(cookieStore.get(SESSION_COOKIE)?.value);
  if (!hasPermission(user, "dashboard.view")) {
    redirect(getFirstAllowedPath(user));
  }

  const [devices, tasks, users, taskTags, regions] = await Promise.all([
    getDevices(),
    getTasks(resolveTaskVisibilityScope(user)),
    getUsers(),
    getTaskTagNames(),
    getRegions(),
  ]);

  return (
    <Dashboard
      initialDevices={devices}
      initialTasks={tasks}
      initialTags={taskTags}
      regionNames={regions.map((region) => region.name)}
      users={users}
      canEditDeviceLocations={hasPermission(user, "devices.edit")}
      canCreateTaskTags={hasPermission(user, "tasks.tag_create")}
      canDeleteTaskTags={hasPermission(user, "tasks.tag_delete")}
    />
  );
}
