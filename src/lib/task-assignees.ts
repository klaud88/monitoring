import type { AppUser } from "./types";

const assignableTaskUserRoles = new Set(["admin", "dispatcher", "technician"]);

export function isAssignableTaskUser(user: Pick<AppUser, "role">) {
  return assignableTaskUserRoles.has(user.role);
}

export function getAssignableTaskUsers<T extends Pick<AppUser, "role">>(
  users: T[],
) {
  return users.filter(isAssignableTaskUser);
}

export function filterAssignableTaskUserIds<
  T extends Pick<AppUser, "id" | "role">,
>(userIds: string[], users: T[]) {
  const allowedUserIds = new Set(
    getAssignableTaskUsers(users).map((user) => user.id),
  );
  return userIds.filter((userId) => allowedUserIds.has(userId));
}
