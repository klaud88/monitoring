import { cookies } from "next/headers";
import { AppShell } from "@/components/layout/app-shell";
import { TasksManager } from "@/components/tasks/tasks-manager";
import { SESSION_COOKIE, hasPermission, verifySessionToken } from "@/lib/auth";
import { getDevices, getTasks, getUsers } from "@/lib/repositories";

export default async function TasksPage({
  searchParams,
}: {
  searchParams?: Promise<{ edit?: string | string[] }>;
}) {
  const cookieStore = await cookies();
  const user = await verifySessionToken(cookieStore.get(SESSION_COOKIE)?.value);
  const [devices, tasks, users] = await Promise.all([getDevices(), getTasks(), getUsers()]);
  const canView = hasPermission(user, "tasks.view");
  const resolvedSearchParams = await searchParams;
  const editParam = resolvedSearchParams?.edit;
  const initialEditTaskId = Array.isArray(editParam) ? editParam[0] : editParam;

  return (
    <AppShell>
      {canView ? (
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
      ) : (
        <section className="surface empty-state">წვდომა შეზღუდულია.</section>
      )}
    </AppShell>
  );
}
