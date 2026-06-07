import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { PermissionsManager } from "@/components/permissions/permissions-manager";
import {
  SESSION_COOKIE,
  hasPermission,
  isAdmin,
  verifySessionToken,
} from "@/lib/auth";
import { getFirstAllowedPath } from "@/lib/navigation";
import { getRoles } from "@/lib/repositories";

export default async function PermissionsPage() {
  const cookieStore = await cookies();
  const user = await verifySessionToken(cookieStore.get(SESSION_COOKIE)?.value);
  if (!hasPermission(user, "permissions.view")) {
    redirect(getFirstAllowedPath(user));
  }

  const roles = await getRoles();

  return (
    <AppShell>
      <PermissionsManager
        roles={roles}
        canEdit={isAdmin(user)}
      />
    </AppShell>
  );
}
