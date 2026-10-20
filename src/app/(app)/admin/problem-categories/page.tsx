import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ProblemCategoriesManager } from "@/components/admin/problem-categories-manager";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { canUseAdminFeature } from "@/lib/permissions";
import { getFirstAllowedPath } from "@/lib/navigation";
import { getProblemCategories, getRoles, getUsers } from "@/lib/repositories";
import { isAssignableTaskUser } from "@/lib/task-assignees";

export default async function ProblemCategoriesPage() {
  const cookieStore = await cookies();
  const user = await verifySessionToken(cookieStore.get(SESSION_COOKIE)?.value);

  if (!canUseAdminFeature(user, "problem_categories")) {
    redirect(getFirstAllowedPath(user));
  }

  const [categories, users, roles] = await Promise.all([
    getProblemCategories({ includeDeleted: true }),
    getUsers(),
    getRoles(),
  ]);

  return (
    <ProblemCategoriesManager
      initialCategories={categories}
      // Everyone, so links to people who lost the assignee permission still
      // show in the list; the pickers only offer the assignable ones.
      users={users.map((item) => ({ ...item, assignable: isAssignableTaskUser(item) }))}
      roles={roles.map(({ id, name, label }) => ({ id, name, label }))}
    />
  );
}
