import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { UsersManager } from "@/components/users/users-manager";
import { SESSION_COOKIE, hasPermission, verifySessionToken } from "@/lib/auth";
import { getFirstAllowedPath } from "@/lib/navigation";
import { getGardenCodes, getRoles, getUsers } from "@/lib/repositories";

export default async function UsersPage() {
  const cookieStore = await cookies();
  const user = await verifySessionToken(cookieStore.get(SESSION_COOKIE)?.value);
  const canView = hasPermission(user, "users.view");
  if (!canView) {
    redirect(getFirstAllowedPath(user));
  }

  const [users, roles, gardens] = await Promise.all([
    getUsers(),
    getRoles(),
    getGardenCodes(),
  ]);

  return (
    <UsersManager
      initialUsers={users}
      roles={roles}
      gardens={gardens.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))}
      permissions={{
        create: hasPermission(user, "users.create"),
        edit: hasPermission(user, "users.edit"),
        delete: hasPermission(user, "users.delete"),
      }}
    />
  );
}
