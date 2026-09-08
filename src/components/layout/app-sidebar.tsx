"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  BarChart3,
  ClipboardList,
  FileText,
  LogOut,
  MapPinned,
  MonitorCog,
  PanelLeftClose,
  PanelLeftOpen,
  ScrollText,
  ShieldCheck,
  Users,
  WifiOff,
} from "lucide-react";
import { AgencyLogo } from "./agency-logo";
import { useNavBadges } from "./use-nav-badges";

type BadgeKey = "formOne" | "offline";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  badge?: BadgeKey;
};

type NavGroup = {
  id: string;
  label: string;
  items: NavItem[];
};

const navGroups: NavGroup[] = [
  {
    id: "monitoring",
    label: "მონიტორინგი",
    items: [
      { href: "/dashboard", label: "რუკა", icon: MapPinned },
      { href: "/analytics", label: "ანალიტიკა", icon: BarChart3 },
    ],
  },
  {
    id: "ops",
    label: "ოპერაციები",
    items: [
      { href: "/tasks", label: "დავალებები", icon: ClipboardList },
      { href: "/problem-reports", label: "პრობლემის დაფიქსირება", icon: AlertCircle },
      { href: "/formaerti", label: "ფორმაერთი", icon: FileText, badge: "formOne" },
    ],
  },
  {
    id: "devices",
    label: "მოწყობილობები",
    items: [
      { href: "/devices/regions", label: "X-Stations", icon: MonitorCog },
      {
        href: "/offline-records",
        label: "Offline აღრიცხვა",
        icon: WifiOff,
        badge: "offline",
      },
    ],
  },
  {
    id: "admin",
    label: "ადმინისტრირება",
    items: [
      { href: "/admin/users", label: "მომხმარებლები", icon: Users },
      { href: "/admin/permissions", label: "წვდომის უფლებები", icon: ShieldCheck },
      { href: "/admin/audit-logs", label: "Audit Logs", icon: ScrollText },
    ],
  },
];

const storageKey = "bagebi-sidebar";

export type SidebarUser = {
  name: string;
  initials: string;
  role: string;
  color?: string;
};

export function AppSidebar({
  allowedHrefs,
  homeHref,
  user,
  canFormOne,
  canOfflineMonitor,
}: {
  allowedHrefs: string[];
  homeHref: string;
  user: SidebarUser;
  canFormOne: boolean;
  canOfflineMonitor: boolean;
}) {
  const pathname = usePathname();
  const [expanded, setExpanded] = useState(true);
  const badges = useNavBadges({ canFormOne, canOfflineMonitor });

  useEffect(() => {
    setExpanded(document.documentElement.dataset.sidebar !== "collapsed");
  }, []);

  const toggle = useCallback(() => {
    setExpanded((current) => {
      const next = !current;
      document.documentElement.dataset.sidebar = next ? "expanded" : "collapsed";
      try {
        window.localStorage.setItem(storageKey, next ? "expanded" : "collapsed");
      } catch {
        // localStorage may be unavailable in restricted contexts.
      }
      return next;
    });
  }, []);

  const allowed = new Set(allowedHrefs);
  const visibleGroups = navGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => allowed.has(item.href)),
    }))
    .filter((group) => group.items.length > 0);

  return (
    <aside
      className="side-nav"
      data-expanded={expanded ? "true" : "false"}
      aria-label="მთავარი მენიუ"
    >
      <div className="side-nav-head">
        <Link
          href={homeHref}
          className="side-brand"
          aria-label="თბილისის საბავშვო ბაგა-ბაღების მართვის სააგენტო"
        >
          <AgencyLogo className="agency-logo side-brand-logo" />
        </Link>
        <button
          className="side-toggle"
          type="button"
          onClick={toggle}
          aria-expanded={expanded}
          aria-label={expanded ? "მენიუს დაკეცვა" : "მენიუს გაშლა"}
          title={expanded ? "მენიუს დაკეცვა" : "მენიუს გაშლა"}
        >
          {expanded ? <PanelLeftClose size={17} /> : <PanelLeftOpen size={17} />}
        </button>
      </div>

      <nav className="side-nav-scroll">
        {visibleGroups.map((group) => (
          <div className="side-group" key={group.id}>
            <p className="side-group-label">{group.label}</p>
            {group.items.map((item) => {
              const Icon = item.icon;
              const count = item.badge ? badges[item.badge] : 0;
              const active = isActivePath(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`side-link${active ? " active" : ""}`}
                  aria-current={active ? "page" : undefined}
                  title={item.label}
                >
                  <span className="side-link-icon">
                    <Icon size={17} strokeWidth={1.8} />
                    {count > 0 ? (
                      <span className="side-link-badge-dot">
                        {count > 99 ? "99+" : count}
                      </span>
                    ) : null}
                  </span>
                  <span className="side-link-label">{item.label}</span>
                  {count > 0 ? (
                    <span className="side-link-badge">
                      {count > 99 ? "99+" : count}
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="side-nav-foot">
        <Link
          className="side-profile"
          href="/profile"
          title={expanded ? undefined : user.name}
          aria-label="პროფილში შესვლა"
        >
          <span className="avatar" style={{ backgroundColor: user.color }}>
            {user.initials || "?"}
          </span>
          <span className="side-profile-copy">
            <strong>{user.name}</strong>
            <small>{user.role}</small>
          </span>
        </Link>
        <form action="/api/auth/logout" method="post">
          <button
            className="side-logout"
            type="submit"
            aria-label="გასვლა"
            title="გასვლა"
          >
            <LogOut size={17} strokeWidth={1.8} />
            <span className="side-link-label">გასვლა</span>
          </button>
        </form>
      </div>
    </aside>
  );
}

function isActivePath(pathname: string | null, href: string) {
  if (!pathname) {
    return false;
  }

  if (href === "/devices/regions") {
    return pathname === href || pathname.startsWith("/devices");
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}
