import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { TasksManager } from "@/components/tasks/tasks-manager";
import { SESSION_COOKIE, hasPermission, verifySessionToken } from "@/lib/auth";
import { getFirstAllowedPath } from "@/lib/navigation";
import {
  getDevices,
  getTaskTagNames,
  getTasks,
  getUsers,
} from "@/lib/repositories";
import { resolveTaskVisibilityScope } from "@/lib/task-visibility";

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

  const scope = resolveTaskVisibilityScope(user);
  const canDelete = hasPermission(user, "tasks.delete");
  const [devices, tasks, users, taskTags] = await Promise.all([
    getDevices(),
    // Deleted tasks are loaded only for those who may restore them.
    getTasks({ ...scope, includeDeleted: canDelete }),
    getUsers(),
    getTaskTagNames(),
  ]);
  const resolvedSearchParams = await searchParams;
  const editParam = resolvedSearchParams?.edit;
  const initialEditTaskId = Array.isArray(editParam) ? editParam[0] : editParam;

  return (
    <TasksManager
      initialTasks={tasks}
      devices={devices}
      users={users}
      initialTags={taskTags}
      initialEditTaskId={initialEditTaskId}
      permissions={{
        create: hasPermission(user, "tasks.create"),
        edit: hasPermission(user, "tasks.edit"),
        delete: canDelete,
        createTags: hasPermission(user, "tasks.tag_create"),
        renameTags: hasPermission(user, "tasks.tag_edit"),
        deleteTags: hasPermission(user, "tasks.tag_delete"),
      }}
    />
  );
}
