import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AuditLogsManager } from "@/components/admin/audit-logs-manager";
import { SESSION_COOKIE, isAdmin, verifySessionToken } from "@/lib/auth";
import { getFirstAllowedPath } from "@/lib/navigation";
import { getAuditLogs, getUsers } from "@/lib/repositories";

export default async function AuditLogsPage() {
  const cookieStore = await cookies();
  const user = await verifySessionToken(cookieStore.get(SESSION_COOKIE)?.value);

  if (!isAdmin(user)) {
    redirect(getFirstAllowedPath(user));
  }

  const [initial, users] = await Promise.all([
    getAuditLogs({ page: 1, pageSize: 50 }),
    getUsers(),
  ]);

  return <AuditLogsManager initial={initial} users={users} />;
}
