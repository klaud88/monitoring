import { AppShell } from "@/components/layout/app-shell";
import { UsersManager } from "@/components/users/users-manager";
import { getUsers } from "@/lib/repositories";

export default async function UsersPage() {
  const users = await getUsers();

  return (
    <AppShell>
      <UsersManager initialUsers={users} />
    </AppShell>
  );
}
