import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { UsersManager } from "@/components/users/users-manager";
import { SESSION_COOKIE, hasPermission, verifySessionToken } from "@/lib/auth";
import { getFirstAllowedPath } from "@/lib/navigation";
import { getRoles, getUsers } from "@/lib/repositories";

export default async function UsersPage() {
  const cookieStore = await cookies();
  const user = await verifySessionToken(cookieStore.get(SESSION_COOKIE)?.value);
  const canView = hasPermission(user, "users.view");
  if (!canView) {
    redirect(getFirstAllowedPath(user));
  }

  const [users, roles] = await Promise.all([
    getUsers(),
    getRoles(),
  ]);

  return (
    <AppShell>
      <UsersManager
        initialUsers={users}
        roles={roles}
        permissions={{
          create: hasPermission(user, "users.create"),
          edit: hasPermission(user, "users.edit"),
          delete: hasPermission(user, "users.delete"),
        }}
      />
    </AppShell>
  );
}
