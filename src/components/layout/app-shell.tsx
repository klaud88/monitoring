import Link from "next/link";
import { cookies } from "next/headers";
import {
  AlertCircle,
  BarChart3,
  ClipboardList,
  DoorOpen,
  FileText,
  LogOut,
  MapPinned,
  Menu,
  MonitorCog,
  ShieldCheck,
  UserCircle,
  Users,
  WifiOff,
} from "lucide-react";
import { SESSION_COOKIE, hasPermission, verifySessionToken } from "@/lib/auth";
import { getFirstAllowedPath } from "@/lib/navigation";
import type { PermissionKey } from "@/lib/types";
import { MustChangePasswordModal } from "@/components/auth/must-change-password-modal";
import { AgencyLogo } from "./agency-logo";
import { FormOneNotifications } from "./form-one-notifications";
import { OfflineMonitorNotifications } from "./offline-monitor-notifications";
import { ThemeToggle } from "./theme-toggle";

type NavItem = {
  href: string;
  label: string;
  permission?: PermissionKey | PermissionKey[];
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
};

const navItems: NavItem[] = [
  { href: "/dashboard", label: "რუკა", permission: "dashboard.view", icon: MapPinned },
  {
    href: "/tasks",
    label: "დავალებები",
    permission: "tasks.view",
    icon: ClipboardList,
  },
  {
    href: "/problem-reports",
    label: "განაცხადები",
    permission: "problem_reports.view",
    icon: AlertCircle,
  },
  {
    href: "/formaerti",
    label: "ფორმაერთი",
    permission: "form_one.view",
    icon: FileText,
  },
  {
    href: "/devices/regions",
    label: "X-Stations",
    permission: ["devices.view", "regions.view"],
    icon: MonitorCog,
  },
  {
    href: "/offline-records",
    label: "Offline აღრიცხვა",
    permission: "offline_records.view",
    icon: WifiOff,
  },
  {
    href: "/admin/users",
    label: "მომხმარებლები",
    permission: "users.view",
    icon: Users,
  },
  {
    href: "/admin/permissions",
    label: "წვდომის უფლებები",
    permission: "permissions.view",
    icon: ShieldCheck,
  },
  {
    href: "/analytics",
    label: "ანალიტიკა",
    permission: "analytics.view",
    icon: BarChart3,
  },
];

export async function AppShell({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const cookieStore = await cookies();
  const user = await verifySessionToken(cookieStore.get(SESSION_COOKIE)?.value);
  const homeHref = getFirstAllowedPath(user);
  const visibleItems = navItems.filter((item) => {
    if (!item.permission) {
      return true;
    }

    const permissions = Array.isArray(item.permission)
      ? item.permission
      : [item.permission];
    return permissions.some((permission) => hasPermission(user, permission));
  });

  return (
    <>
    <MustChangePasswordModal mustChangePassword={user?.mustChangePassword ?? false} />
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-main">
          <Link
            href={homeHref}
            className="brand"
            aria-label="თბილისის საბავშვო ბაგა-ბაღების მართვის სააგენტო"
          >
            <AgencyLogo className="agency-logo agency-logo-header" />
          </Link>

          <details className="mobile-menu">
            <summary className="mobile-menu-button" aria-label="მენიუს გახსნა">
              <Menu size={20} />
              <span>მენიუ</span>
            </summary>
            <nav className="mobile-menu-panel" aria-label="მობილური მენიუ">
              {visibleItems.map((item) => {
                const Icon = item.icon;
                return (
                  <Link key={item.href} href={item.href} className="menu-link">
                    <Icon size={18} />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>
          </details>

          <div className="account-actions">
            <ThemeToggle />
            {hasPermission(user, "offline_records.view") ? (
              <OfflineMonitorNotifications />
            ) : null}
            {hasPermission(user, "form_one.view") ? (
              <FormOneNotifications
                canRespondToCompletion={hasPermission(
                  user,
                  "form_one.completion_response",
                )}
              />
            ) : null}
            <Link
              className="profile-button"
              href="/profile"
              aria-label="პროფილში შესვლა"
            >
              <span className="avatar" style={{ backgroundColor: user?.color }}>
                {user?.initials || "?"}
              </span>
              <span className="profile-copy">
                <strong>{user?.name || "მომხმარებელი"}</strong>
                <small>{user?.role || "role"}</small>
              </span>
              <UserCircle size={18} />
            </Link>
            <form action="/api/auth/logout" method="post">
              <button
                className="icon-button danger"
                type="submit"
                aria-label="გასვლა"
                title="გასვლა"
              >
                <DoorOpen size={18} />
                <LogOut size={16} />
              </button>
            </form>
          </div>
        </div>

        <nav className="main-menu" aria-label="მთავარი მენიუ">
          {visibleItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href} className="menu-link">
                <Icon size={18} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </header>

      <main className="app-main">{children}</main>
    </div>
    </>
  );
}
