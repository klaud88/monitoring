import { cookies } from "next/headers";
import { AppShell } from "@/components/layout/app-shell";
import { PermissionsManager } from "@/components/permissions/permissions-manager";
import { SESSION_COOKIE, hasPermission, verifySessionToken } from "@/lib/auth";
import { getRoles } from "@/lib/repositories";

export default async function PermissionsPage() {
  const cookieStore = await cookies();
  const user = await verifySessionToken(cookieStore.get(SESSION_COOKIE)?.value);
  const roles = await getRoles();

  return (
    <AppShell>
      {hasPermission(user, "permissions.view") ? (
        <PermissionsManager
          roles={roles}
          canEdit={hasPermission(user, "permissions.edit")}
        />
      ) : (
        <section className="surface empty-state">წვდომა შეზღუდულია.</section>
      )}
    </AppShell>
  );
}
