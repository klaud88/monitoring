import { cookies } from "next/headers";
import { LogOut } from "lucide-react";
import { SESSION_COOKIE, hasPermission, verifySessionToken } from "@/lib/auth";
import { canUseAdminFeature } from "@/lib/permissions";
import { getFirstAllowedPath } from "@/lib/navigation";
import { getRoleLabel } from "@/lib/repositories";
import type { PermissionKey } from "@/lib/types";
import { MustChangePasswordModal } from "@/components/auth/must-change-password-modal";
import { AppCredit } from "./app-credit";
import { AppSidebar } from "./app-sidebar";
import { MobileNavToggle } from "./mobile-nav-toggle";
import { MobileWheelNav } from "./mobile-wheel-nav";
import { NotificationsBell } from "./notifications-bell";
import { ThemeToggle } from "./theme-toggle";

type NavPermission = {
  href: string;
  permission?: PermissionKey | PermissionKey[];
  adminFeature?: "problem_categories" | "audit_logs";
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
  { href: "/admin/problem-categories", adminFeature: "problem_categories" },
  { href: "/admin/audit-logs", adminFeature: "audit_logs" },
];

export async function AppShell({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const cookieStore = await cookies();
  const user = await verifySessionToken(cookieStore.get(SESSION_COOKIE)?.value);
  const homeHref = getFirstAllowedPath(user);
  const roleLabel = user ? await getRoleLabel(user.role) : "role";

  const allowedHrefs = navPermissions
    .filter((item) => {
      if (item.adminFeature) {
        return canUseAdminFeature(user, item.adminFeature);
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
            role: roleLabel,
            color: user?.color,
          }}
        />

        <MobileWheelNav
          allowedHrefs={allowedHrefs}
          canFormOne={canFormOne}
          canOfflineMonitor={canOfflineMonitor}
        />

        <div className="app-body">
          <header className="app-topbar">
            <MobileNavToggle />
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
              {/* Phones hide the side rail and its logout, so it lives here. */}
              <form
                className="topbar-logout-form"
                action="/api/auth/logout"
                method="post"
              >
                <button
                  className="topbar-logout"
                  type="submit"
                  aria-label="გასვლა"
                  title="გასვლა"
                >
                  <LogOut size={17} strokeWidth={1.9} />
                </button>
              </form>
            </div>
          </header>

          <main className="app-main">{children}</main>
          <AppCredit />
        </div>
      </div>
    </>
  );
}
