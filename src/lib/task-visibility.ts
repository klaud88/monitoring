import { hasPermission } from "./permissions";
import type { SessionUser, Task } from "./types";

export type TaskVisibilityScope = {
  /** undefined = unrestricted (tasks.view_all). Set = only this user's tasks
   *  (plus INFO-flagged ones when includeInfoTasks is true). */
  assigneeUserId?: string;
  includeInfoTasks: boolean;
};

/**
 * tasks.view_all always wins when present. Its absence means "only my own
 * assigned tasks" by design — this is the restrictive default, not a
 * fallback to "see everything": a role must be explicitly granted
 * tasks.view_all to see tasks it isn't personally assigned to. tasks.info additionally pulls
 * in every task marked informational, regardless of assignment.
 */
export function resolveTaskVisibilityScope(
  user: SessionUser | null,
): TaskVisibilityScope {
  return {
    assigneeUserId: hasPermission(user, "tasks.view_all") ? undefined : user?.id,
    includeInfoTasks: hasPermission(user, "tasks.info"),
  };
}

/** A role with plain tasks.edit/tasks.delete (no tasks.view_all) is meant to
 *  act only on tasks it can actually see — mirrors the GET list's own scope
 *  so PATCH/DELETE/restore can't reach a task outside it just because the id
 *  is guessable. */
export function canAccessTask(user: SessionUser | null, task: Task): boolean {
  const scope = resolveTaskVisibilityScope(user);
  if (!scope.assigneeUserId) {
    return true;
  }
  if (task.assigneeIds.includes(scope.assigneeUserId)) {
    return true;
  }
  return scope.includeInfoTasks && Boolean(task.info);
}
