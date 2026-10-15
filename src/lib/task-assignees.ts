import { hasPermission } from "./permissions";
import type { AppUser } from "./types";

// Who can be a task/problem-report assignee is governed by the
// tasks.assignable permission (Permissions page, "შემსრულებლებში
// დამატება") rather than a fixed role list, so new roles can be opened up
// without a code change. Admin always qualifies via hasPermission's own
// role === "admin" bypass.
export function isAssignableTaskUser(
  user: Pick<AppUser, "role" | "permissions">,
) {
  return hasPermission(user, "tasks.assignable");
}

export function getAssignableTaskUsers<
  T extends Pick<AppUser, "role" | "permissions">,
>(users: T[]) {
  return users.filter(isAssignableTaskUser);
}

export function filterAssignableTaskUserIds<
  T extends Pick<AppUser, "id" | "role" | "permissions">,
>(userIds: string[], users: T[]) {
  const allowedUserIds = new Set(
    getAssignableTaskUsers(users).map((user) => user.id),
  );
  return userIds.filter((userId) => allowedUserIds.has(userId));
}
