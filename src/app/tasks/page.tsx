import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { TasksManager } from "@/components/tasks/tasks-manager";
import { SESSION_COOKIE, hasPermission, verifySessionToken } from "@/lib/auth";
import { getFirstAllowedPath } from "@/lib/navigation";
import { getDevices, getTasks, getUsers } from "@/lib/repositories";

export default async function TasksPage({
  searchParams,
}: {
  searchParams?: Promise<{ edit?: string | string[] }>;
}) {
  const cookieStore = await cookies();
  const user = await verifySessionToken(cookieStore.get(SESSION_COOKIE)?.value);
  const canView = hasPermission(user, "tasks.view");
  if (!canView) {
    redirect(getFirstAllowedPath(user));
  }

  const [devices, tasks, users] = await Promise.all([getDevices(), getTasks(), getUsers()]);
  const resolvedSearchParams = await searchParams;
  const editParam = resolvedSearchParams?.edit;
  const initialEditTaskId = Array.isArray(editParam) ? editParam[0] : editParam;

  return (
    <AppShell>
      <TasksManager
        initialTasks={tasks}
        devices={devices}
        users={users}
        initialEditTaskId={initialEditTaskId}
        permissions={{
          create: hasPermission(user, "tasks.create"),
          edit: hasPermission(user, "tasks.edit"),
          delete: hasPermission(user, "tasks.delete"),
        }}
      />
    </AppShell>
  );
}
