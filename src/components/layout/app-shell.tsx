import { cookies } from "next/headers";
import { SESSION_COOKIE, hasPermission, isAdmin, verifySessionToken } from "@/lib/auth";
import { getFirstAllowedPath } from "@/lib/navigation";
import type { PermissionKey } from "@/lib/types";
import { MustChangePasswordModal } from "@/components/auth/must-change-password-modal";
import { AppSidebar } from "./app-sidebar";
import { NotificationsBell } from "./notifications-bell";
import { ThemeToggle } from "./theme-toggle";

type NavPermission = {
  href: string;
  permission?: PermissionKey | PermissionKey[];
  adminOnly?: boolean;
};

const navPermissions: NavPermission[] = [
  { href: "/dashboard", permission: "dashboard.view" },
  { href: "/tasks", permission: "tasks.view" },
  { href: "/problem-reports", permission: "problem_reports.view" },
  { href: "/formaerti", permission: "form_one.view" },
  { href: "/devices/regions", permission: ["devices.view", "regions.view"] },
  { href: "/offline-records", permission: "offline_records.view" },
  { href: "/admin/users", permission: "users.view" },
  { href: "/admin/permissions", permission: "permissions.view" },
  { href: "/analytics", permission: "analytics.view" },
  { href: "/admin/audit-logs", adminOnly: true },
];

export async function AppShell({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const cookieStore = await cookies();
  const user = await verifySessionToken(cookieStore.get(SESSION_COOKIE)?.value);
  const homeHref = getFirstAllowedPath(user);
  const adminOnly = isAdmin(user);

  const allowedHrefs = navPermissions
    .filter((item) => {
      if (item.adminOnly) {
        return adminOnly;
      }

      if (!item.permission) {
        return true;
      }

      const permissions = Array.isArray(item.permission)
        ? item.permission
        : [item.permission];
      return permissions.some((permission) => hasPermission(user, permission));
    })
    .map((item) => item.href);

  const canOfflineMonitor = hasPermission(user, "offline_records.alerts");
  const canFormOne = hasPermission(user, "form_one.view");

  return (
    <>
      <MustChangePasswordModal
        mustChangePassword={user?.mustChangePassword ?? false}
      />
      <div className="app-shell">
        <AppSidebar
          allowedHrefs={allowedHrefs}
          homeHref={homeHref}
          canFormOne={canFormOne}
          canOfflineMonitor={canOfflineMonitor}
          user={{
            name: user?.name || "მომხმარებელი",
            initials: user?.initials || "?",
            role: user?.role || "role",
            color: user?.color,
          }}
        />

        <div className="app-body">
          <header className="app-topbar">
            <div className="app-topbar-actions">
              <ThemeToggle />
              {canOfflineMonitor || canFormOne ? (
                <NotificationsBell
                  canOfflineMonitor={canOfflineMonitor}
                  canFormOne={canFormOne}
                  canRespondToCompletion={hasPermission(
                    user,
                    "form_one.completion_response",
                  )}
                  canEditFormOne={hasPermission(user, "form_one.edit")}
                />
              ) : null}
            </div>
          </header>

          <main className="app-main">{children}</main>
        </div>
      </div>
    </>
  );
}
