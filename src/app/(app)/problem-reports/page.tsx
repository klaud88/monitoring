import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ProblemReportsManager } from "@/components/problem-reports/problem-reports-manager";
import { SESSION_COOKIE, hasPermission, verifySessionToken } from "@/lib/auth";
import { getFirstAllowedPath } from "@/lib/navigation";
import {
  getDeletedTaskTagNames,
  getDevices,
  getDeviceGroupCode,
  getProblemCategories,
  getProblemReports,
  getTaskTagNames,
  getUsers,
} from "@/lib/repositories";
import { canAccessGarden, getGardenScope } from "@/lib/garden-scope";
import { redactTaskFields } from "@/lib/problem-report-view";
import { canChooseDueDate } from "@/lib/working-days";

export default async function ProblemReportsPage({
  searchParams,
}: {
  searchParams?: Promise<{ edit?: string | string[] }>;
}) {
  const resolvedSearchParams = await searchParams;
  const editParam = resolvedSearchParams?.edit;
  const initialEditReportId = Array.isArray(editParam) ? editParam[0] : editParam;
  const cookieStore = await cookies();
  const user = await verifySessionToken(cookieStore.get(SESSION_COOKIE)?.value);
  if (!hasPermission(user, "problem_reports.view")) {
    redirect(getFirstAllowedPath(user));
  }

  // Linked gardens only, or every garden (see garden-scope.ts).
  const gardenScope = getGardenScope(user, "problem_reports");
  const canAssignUsers = hasPermission(user, "problem_reports.assign");
  const canDelete = hasPermission(user, "problem_reports.delete");
  const canDeleteTags = hasPermission(user, "problem_reports.tag_delete");
  const [devices, reports, users, taskTags, categories, deletedTags] = await Promise.all([
    // Deleted gardens too, so their reports still show the garden's name.
    getDevices({ includeDeleted: true }),
    // Deleted reports are loaded only for those who may restore them.
    getProblemReports({ gardenCodes: gardenScope, includeDeleted: canDelete }),
    canAssignUsers ? getUsers() : Promise.resolve([]),
    getTaskTagNames(),
    getProblemCategories({ activeOnly: true }),
    canDeleteTags ? getDeletedTaskTagNames() : Promise.resolve([]),
  ]);
  const visibleDevices = devices.filter((device) =>
    canAccessGarden(gardenScope, getDeviceGroupCode(device)),
  );

  return (
    <ProblemReportsManager
      initialReports={reports.map((report) => redactTaskFields(report, user))}
      categories={categories.map(({ id, title, resolvedUserIds }) => ({
        id,
        title,
        // Who a category reaches is only shown to those who may assign.
        ...(canAssignUsers ? { resolvedUserIds } : {}),
      }))}
      devices={visibleDevices}
      users={users}
      initialTags={taskTags}
      initialDeletedTags={deletedTags}
      canChooseDueDate={canChooseDueDate(user?.role)}
      initialEditReportId={initialEditReportId}
      permissions={{
        create: hasPermission(user, "problem_reports.create"),
        edit: hasPermission(user, "problem_reports.edit"),
        delete: canDelete,
        assignUsers: canAssignUsers,
        manageTags: hasPermission(user, "problem_reports.tag"),
        createTags: hasPermission(user, "problem_reports.tag_create"),
        renameTags: hasPermission(user, "problem_reports.tag_edit"),
        deleteTags: canDeleteTags,
        manageStatus: hasPermission(user, "problem_reports.status"),
      }}
    />
  );
}
