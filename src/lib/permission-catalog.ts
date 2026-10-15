import type { PageKey, PermissionAction, PermissionKey } from "./types";

/*
 * Every permission the Permissions page offers, page by page. Shared by the
 * page (what to show) and PUT /api/roles/[id]/permissions (what to accept),
 * so the two can no longer drift apart.
 */

export type ActionDef = { key: PermissionAction; label: string; dependsOn?: PermissionAction };

export const defaultActions: ActionDef[] = [
  { key: "view", label: "ნახვა" },
  { key: "create", label: "დამატება" },
  { key: "edit", label: "შეცვლა" },
  { key: "delete", label: "წაშლა" },
];

const tagRegistryActions: ActionDef[] = [
  { key: "tag_create", label: "ახალი ტეგი" },
  { key: "tag_edit", label: "ტეგის რედაქტირება" },
  { key: "tag_delete", label: "ტეგის წაშლა" },
];

const deviceActions: ActionDef[] = [...defaultActions, ...tagRegistryActions];

const taskActions: ActionDef[] = [
  ...defaultActions,
  { key: "view_all", label: "დავალებები სრული", dependsOn: "view" },
  { key: "view_assigned", label: "დავალებები მონიშნული", dependsOn: "view" },
  { key: "info", label: "INFO", dependsOn: "view" },
  { key: "assignable", label: "შემსრულებლებში დამატება", dependsOn: "view" },
  ...tagRegistryActions,
];

const problemReportActions: ActionDef[] = [
  ...defaultActions,
  { key: "assign", label: "მომხმარებლები" },
  { key: "tag", label: "ტეგები" },
  { key: "status", label: "სტატუსები" },
  ...tagRegistryActions,
];

const formOneActions: ActionDef[] = [
  { key: "view", label: "ნახვა" },
  { key: "create", label: "ახალი ფორმის დამატება" },
  { key: "edit", label: "არჩეული ფორმის რედაქტირება" },
  { key: "garden_edit", label: "ბაღის ველი", dependsOn: "edit" },
  { key: "phone_edit", label: "ტელეფონის ნომერი", dependsOn: "edit" },
  { key: "due_date_edit", label: "შესრულების თარიღი", dependsOn: "edit" },
  { key: "model_add", label: "მოდელის დამატება", dependsOn: "edit" },
  { key: "model_edit", label: "მოდელის ცვლილება", dependsOn: "edit" },
  { key: "service_add", label: "მომსახურების დამატება", dependsOn: "edit" },
  { key: "service_edit", label: "მომსახურების ცვლილება", dependsOn: "edit" },
  { key: "service_delete", label: "მომსახურების წაშლა", dependsOn: "edit" },
  { key: "quantity_edit", label: "რაოდენობის ცვლილება", dependsOn: "edit" },
  { key: "completion_request", label: "დადასტურებაზე გადაგზავნა" },
  { key: "completion_response", label: "დადასტურება/გაუქმება" },
  { key: "comment_edit", label: "კომენტარი" },
  { key: "delete", label: "ფორმა ერთის წაშლა" },
  { key: "flag", label: "დახარვეზება (ჩართვა/გამორთვა)" },
];

export const permissionPages: {
  key: PageKey;
  label: string;
  actions?: ActionDef[];
}[] = [
  { key: "dashboard", label: "რუკა" },
  { key: "devices", label: "მოწყობილობები", actions: deviceActions },
  { key: "regions", label: "რაიონები" },
  { key: "tasks", label: "დავალებები", actions: taskActions },
  {
    key: "problem_reports",
    label: "პრობლემის დაფიქსირება",
    actions: problemReportActions,
  },
  {
    key: "form_one",
    label: "ფორმა ერთი",
    actions: formOneActions,
  },
  {
    key: "offline_records",
    label: "Offline აღრიცხვა",
    actions: [...defaultActions, { key: "alerts", label: "შეტყობინებები" }],
  },
  { key: "users", label: "მომხმარებლები" },
  { key: "analytics", label: "ანალიტიკა" },
  { key: "permissions", label: "უფლებები" },
];

/** Every key the Permissions page can grant. */
export const knownPermissionKeys = new Set<PermissionKey>(
  permissionPages.flatMap((page) =>
    (page.actions ?? defaultActions).map(
      (action) => `${page.key}.${action.key}` as PermissionKey,
    ),
  ),
);

export function isKnownPermissionKey(value: string): value is PermissionKey {
  return knownPermissionKeys.has(value as PermissionKey);
}

export type { PageKey, PermissionAction };
