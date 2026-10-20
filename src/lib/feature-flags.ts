import { defaultActions, permissionPages, type ActionDef } from "./permission-catalog";

/*
 * What the platform admin can switch off per organisation. A disabled
 * feature is a ceiling over role permissions: no role, admin included, gets
 * it while it is off. Keys are a page ("tasks") or one action of a page
 * ("tasks.create"). Kept free of server-only imports: client components
 * reach this through permissions.ts.
 */

export type FeaturePage = {
  key: string;
  label: string;
  actions: ActionDef[];
  /* Always on, so an organisation's admin can't be locked out. */
  locked?: boolean;
};

const lockedPages = new Set(["users", "permissions"]);

/* Role traits rather than functions: tasks.assignable marks who can be picked
   as an assignee, and *.all_gardens sets which gardens a role sees, so
   switching them off would only empty a list. */
const hiddenActions = new Set([
  "tasks.assignable",
  "problem_reports.all_gardens",
  "form_one.all_gardens",
]);

export const featurePages: FeaturePage[] = [
  ...permissionPages.map((page) => ({
    key: page.key as string,
    label: page.label,
    actions: (page.actions ?? defaultActions).filter(
      (action) => !hiddenActions.has(`${page.key}.${action.key}`),
    ),
    locked: lockedPages.has(page.key),
  })),
  // Admin-only pages outside the role permission catalog.
  { key: "problem_categories", label: "პრობლემის კატეგორიები", actions: [] },
  { key: "audit_logs", label: "Audit Logs", actions: [] },
];

const knownFeatureKeys = new Set(
  featurePages.flatMap((page) => [
    page.key,
    ...page.actions.map((action) => `${page.key}.${action.key}`),
  ]),
);

const lockedFeatureKeys = new Set(
  featurePages
    .filter((page) => page.locked)
    .flatMap((page) => [
      page.key,
      ...page.actions.map((action) => `${page.key}.${action.key}`),
    ]),
);

export function isFeatureKnown(key: string) {
  return knownFeatureKeys.has(key);
}

export function isFeatureLocked(key: string) {
  return lockedFeatureKeys.has(key);
}

/* "tasks.view_all" → "tasks.view": a function needs the one it builds on. */
const parentKeys = new Map<string, string>(
  featurePages.flatMap((page) =>
    page.actions
      .filter((action) => action.dependsOn)
      .map(
        (action) =>
          [`${page.key}.${action.key}`, `${page.key}.${action.dependsOn}`] as const,
      ),
  ),
);

/** What an organisation has on, for the platform admin's overview. */
export function summarizeFeatures(disabled: readonly string[]) {
  const enabledPages = featurePages.filter(
    (page) => !isFeatureDisabled(disabled, page.key),
  );
  const actions = featurePages.flatMap((page) =>
    page.actions.map(
      (action) => !isFeatureDisabled(disabled, `${page.key}.${action.key}`),
    ),
  );
  return {
    enabledPages: enabledPages.map((page) => page.label),
    pagesOn: enabledPages.length,
    pagesTotal: featurePages.length,
    actionsOn: actions.filter(Boolean).length,
    actionsTotal: actions.length,
  };
}

/**
 * True when `key` ("tasks.create" or "audit_logs") is switched off: the key
 * itself, its page, the page's "view" (no page, no functions on it), or the
 * function it depends on.
 */
export function isFeatureDisabled(
  disabled: readonly string[] | undefined,
  key: string,
) {
  if (!disabled?.length) {
    return false;
  }
  const pageKey = key.split(".")[0];
  const parentKey = parentKeys.get(key);
  return (
    disabled.includes(key) ||
    disabled.includes(pageKey) ||
    disabled.includes(`${pageKey}.view`) ||
    (parentKey !== undefined && disabled.includes(parentKey))
  );
}
