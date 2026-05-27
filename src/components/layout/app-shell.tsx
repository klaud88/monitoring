import Link from "next/link";
import { cookies } from "next/headers";
import {
  Activity,
  BarChart3,
  ClipboardList,
  DoorOpen,
  LogOut,
  MapPinned,
  MonitorCog,
  ShieldCheck,
  UserCircle,
  Users
} from "lucide-react";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import type { PermissionKey } from "@/lib/types";

type NavItem = {
  href: string;
  label: string;
  permission?: PermissionKey;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
};

const navItems: NavItem[] = [
  { href: "/", label: "რუკა", permission: "dashboard.view", icon: MapPinned },
  { href: "/tasks", label: "ტასკები", permission: "tasks.view", icon: ClipboardList },
  { href: "/devices/regions", label: "დავაისები/რეგიონები", permission: "regions.view", icon: MonitorCog },
  { href: "/admin/users", label: "მომხმარებლები", permission: "users.view", icon: Users },
  { href: "/admin/permissions", label: "უფლებების დამატება", permission: "permissions.view", icon: ShieldCheck },
  { href: "/analytics", label: "ანალიტიკა", permission: "analytics.view", icon: BarChart3 },
];

export async function AppShell({ children }: Readonly<{ children: React.ReactNode }>) {
  const cookieStore = await cookies();
  const user = await verifySessionToken(cookieStore.get(SESSION_COOKIE)?.value);
  const visibleItems = navItems;

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-main">
          <Link href="/" className="brand" aria-label="BioStar2 Status Ops">
            <span className="brand-mark">
              <Activity size={20} strokeWidth={2.4} />
            </span>
            <span>
              <strong>BioStar2 Ops</strong>
              <small>სტატუსები და დავალებები</small>
            </span>
          </Link>

          <div className="account-actions">
            <Link className="profile-button" href="/profile" aria-label="პროფილში შესვლა">
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
              <button className="icon-button danger" type="submit" aria-label="გასვლა" title="გასვლა">
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
  );
}
