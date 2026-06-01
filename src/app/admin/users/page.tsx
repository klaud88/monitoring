import { cookies } from "next/headers";
import { AppShell } from "@/components/layout/app-shell";
import { UsersManager } from "@/components/users/users-manager";
import { SESSION_COOKIE, hasPermission, verifySessionToken } from "@/lib/auth";
import { getUsers } from "@/lib/repositories";

export default async function UsersPage() {
  const cookieStore = await cookies();
  const user = await verifySessionToken(cookieStore.get(SESSION_COOKIE)?.value);
  const canView = hasPermission(user, "users.view");
  const users = await getUsers();

  return (
    <AppShell>
      {canView ? (
        <UsersManager
          initialUsers={users}
          permissions={{
            create: hasPermission(user, "users.create"),
            edit: hasPermission(user, "users.edit"),
            delete: hasPermission(user, "users.delete"),
          }}
        />
      ) : (
        <section className="surface empty-state">წვდომა შეზღუდულია.</section>
      )}
    </AppShell>
  );
}
