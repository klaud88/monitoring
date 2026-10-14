import { getRoles, getUsers } from "@/lib/repositories";
import { filterAssignableTaskUserIds } from "@/lib/task-assignees";

/**
 * Validates an admin's category payload: a non-empty title, assignable
 * user ids only, existing role ids only. Fields left out stay undefined
 * so a PATCH only touches what it sends.
 */
export async function readProblemCategoryInput(body: unknown) {
  const input = (body ?? {}) as Record<string, unknown>;
  const title =
    input.title === undefined ? undefined : String(input.title).trim().slice(0, 160);
  const userIds = Array.isArray(input.userIds)
    ? filterAssignableTaskUserIds(
        [...new Set(input.userIds.map(String).filter(Boolean))],
        await getUsers(),
      )
    : undefined;
  const roleIds = Array.isArray(input.roleIds)
    ? await (async () => {
        const known = new Set((await getRoles()).map((role) => role.id));
        return [...new Set(input.roleIds as unknown[])]
          .map(String)
          .filter((roleId) => known.has(roleId));
      })()
    : undefined;
  const isActive =
    typeof input.isActive === "boolean" ? input.isActive : undefined;

  return { title, userIds, roleIds, isActive };
}
