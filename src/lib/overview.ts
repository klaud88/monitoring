import { queryRows } from "./db";

/*
 * Counts the platform admin sees for this organisation (src/app/platform),
 * served through /api/internal/overview.
 */

export type UserOverview = {
  active: number;
  inactive: number;
  gardens: number;
  mustChangePassword: number;
  twoFactor: number;
  byRole: { role: string; label: string; count: number }[];
  lastLoginAt: string | null;
  activeLast7Days: number;
};

export async function getUserOverview(): Promise<UserOverview | null> {
  const [totals, byRole, logins] = await Promise.all([
    queryRows<{
      active: number | null;
      inactive: number | null;
      gardens: number | null;
      must_change: number | null;
      twofa: number | null;
    }>(
      `select
         sum(is_active = true) as active,
         sum(is_active = false) as inactive,
         sum(is_active = true and device_group_code is not null and device_group_code <> '') as gardens,
         sum(is_active = true and must_change_password = true) as must_change,
         sum(is_active = true and twofa_enabled = true) as twofa
       from users`,
    ),
    queryRows<{ name: string; label: string; count: number }>(
      `select r.name, r.label, count(*) as count
       from users u
       join roles r on r.id = u.role_id
       where u.is_active = true
       group by r.id, r.name, r.label
       order by count desc, r.label`,
    ),
    queryRows<{ last_login: Date | string | null; recent: number | null }>(
      `select
         max(created_at) as last_login,
         count(distinct case
           when created_at >= now() - interval 7 day then user_id
         end) as recent
       from audit_logs
       where action = 'auth.login'`,
    ),
  ]);

  if (!totals || !byRole || !logins) {
    return null;
  }

  const total = totals[0];
  const lastLogin = logins[0]?.last_login;
  return {
    active: Number(total?.active ?? 0),
    inactive: Number(total?.inactive ?? 0),
    gardens: Number(total?.gardens ?? 0),
    mustChangePassword: Number(total?.must_change ?? 0),
    twoFactor: Number(total?.twofa ?? 0),
    byRole: byRole.map((row) => ({
      role: row.name,
      label: row.label,
      count: Number(row.count),
    })),
    lastLoginAt: lastLogin ? new Date(lastLogin).toISOString() : null,
    activeLast7Days: Number(logins[0]?.recent ?? 0),
  };
}
