import { hasPermission } from "./permissions";
import type { SessionUser } from "./types";

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
