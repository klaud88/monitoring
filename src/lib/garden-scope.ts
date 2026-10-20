import { hasPermission } from "./permissions";
import type { SessionUser } from "./types";

/*
 * Which gardens a user sees on a garden-scoped page (problem reports, form
 * one). A garden is a garden code (getDeviceGroupCode), so the scope covers
 * every device of a linked garden, including ones added later.
 *
 *   - gardens linked on the users page → only those, whatever the role;
 *   - none linked, role has "<page>.all_gardens" → every garden (null);
 *   - none linked, no such permission → nothing ([]).
 */
export type GardenScope = string[] | null;

export type GardenScopedPage = "problem_reports" | "form_one";

export function getGardenScope(
  user: SessionUser | null,
  page: GardenScopedPage,
): GardenScope {
  if (!user) {
    return [];
  }
  if (user.gardenCodes?.length) {
    return user.gardenCodes;
  }
  return hasPermission(user, `${page}.all_gardens`) ? null : [];
}

export function canAccessGarden(scope: GardenScope, gardenCode?: string | null) {
  return scope === null || scope.includes(String(gardenCode ?? ""));
}

/** The users page's garden list from a request body; undefined = not sent. */
export function parseGardenCodes(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return [...new Set(value.map((code) => String(code).trim()).filter(Boolean))];
}
