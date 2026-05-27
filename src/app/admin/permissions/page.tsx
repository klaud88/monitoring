import { AppShell } from "@/components/layout/app-shell";
import { PermissionsManager } from "@/components/permissions/permissions-manager";
import { getUsers } from "@/lib/repositories";

export default async function PermissionsPage() {
  const users = await getUsers();

  return (
    <AppShell>
      <PermissionsManager users={users} />
    </AppShell>
  );
}
