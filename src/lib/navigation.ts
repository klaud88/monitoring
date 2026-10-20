import { hasPermission } from "./permissions";
import type { PermissionKey, SessionUser } from "./types";

type ProtectedRoute = {
  path: string;
  permissions: PermissionKey[];
};

export const protectedRoutes: ProtectedRoute[] = [
  { path: "/dashboard", permissions: ["dashboard.view"] },
  { path: "/tasks", permissions: ["tasks.view"] },
  { path: "/problem-reports", permissions: ["problem_reports.view"] },
  { path: "/formaerti", permissions: ["form_one.view"] },
  { path: "/devices/regions", permissions: ["devices.view", "regions.view"] },
  { path: "/devices", permissions: ["devices.view", "dashboard.view"] },
  { path: "/offline-records", permissions: ["offline_records.view"] },
  { path: "/admin/users", permissions: ["users.view"] },
  { path: "/admin/permissions", permissions: ["permissions.view"] },
  { path: "/analytics", permissions: ["analytics.view"] },
];

export function hasSessionPermission(
  user: Pick<SessionUser, "role" | "permissions" | "disabledFeatures"> | null | undefined,
  permission: PermissionKey,
) {
  return hasPermission(user ?? null, permission);
}

export function canAccessPath(
  user: Pick<SessionUser, "role" | "permissions" | "disabledFeatures"> | null | undefined,
  path: string,
) {
  if (!user) {
    return false;
  }

  if (path === "/profile") {
    return true;
  }

  const route = protectedRoutes
    .filter((item) => path === item.path || path.startsWith(`${item.path}/`))
    .sort((a, b) => b.path.length - a.path.length)[0];

  if (!route) {
    return true;
  }

  return route.permissions.some((permission) =>
    hasSessionPermission(user, permission),
  );
}

export function getFirstAllowedPath(
  user: Pick<SessionUser, "role" | "permissions" | "disabledFeatures"> | null | undefined,
) {
  if (!user) {
    return "/login";
  }

  return (
    protectedRoutes.find((route) =>
      route.permissions.some((permission) =>
        hasSessionPermission(user, permission),
      ),
    )?.path ?? "/profile"
  );
}
