import { isFeatureDisabled } from "./feature-flags";
import type { PermissionKey, SessionUser } from "./types";

/* Kept free of server-only imports: client components reach this through
   task-assignees, so it must not pull auth.ts (and with it the database
   layer) into the browser bundle. auth.ts re-exports both helpers. */

// Narrowed to just the two fields actually used (rather than requiring a
// full SessionUser) so callers like isAssignableTaskUser can check an
// arbitrary candidate user's permissions, not only the viewer's own.
export function hasPermission(
  user: Pick<SessionUser, "role" | "permissions" | "disabledFeatures"> | null,
  permission: PermissionKey,
) {
  if (!user) {
    return false;
  }

  // An organisation-level switch-off beats every role, admin included.
  if (isFeatureDisabled(user.disabledFeatures, permission)) {
    return false;
  }

  return user.role === "admin" || user.permissions.includes(permission);
}

export function isAdmin(user: SessionUser | null) {
  return user?.role === "admin";
}

/** Admin-only pages that sit outside the role catalog (feature-flags.ts). */
export function canUseAdminFeature(
  user: SessionUser | null,
  feature: "problem_categories" | "audit_logs",
) {
  return isAdmin(user) && !isFeatureDisabled(user?.disabledFeatures, feature);
}
