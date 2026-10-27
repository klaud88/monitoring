import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AnalyticsDashboard } from "@/components/analytics/analytics-dashboard";
import type { TaskStatRow, TaskStatUser } from "@/components/analytics/task-stats";
import { SESSION_COOKIE, hasPermission, verifySessionToken } from "@/lib/auth";
import { getGardenDisplayName } from "@/lib/device-options";
import { getFirstAllowedPath } from "@/lib/navigation";
import {
  getDevices,
  getOfflineSnapshots,
  getProblemReports,
  getTasks,
  getUsers,
} from "@/lib/repositories";

export default async function AnalyticsPage() {
  const cookieStore = await cookies();
  const user = await verifySessionToken(cookieStore.get(SESSION_COOKIE)?.value);
  if (!hasPermission(user, "analytics.view")) {
    redirect(getFirstAllowedPath(user));
  }

  const [devices, snapshots, allDevices, tasks, reports, users] =
    await Promise.all([
      getDevices(),
      getOfflineSnapshots(),
      // Deleted gardens and users too, so old tasks keep their names.
      getDevices({ includeDeleted: true }),
      getTasks({ includeInfoTasks: true }),
      getProblemReports(),
      getUsers({ includeDeleted: true }),
    ]);

  /* A task made from a problem report was registered when the report was. */
  const reportCreatedAt = new Map(
    reports.map((report) => [report.id, report.createdAt]),
  );
  const deviceMap = new Map(allDevices.map((device) => [device.id, device]));
  // INFO tasks close themselves, so they say nothing about anyone's work.
  const taskRows: TaskStatRow[] = tasks
    .filter((task) => !task.info)
    .map((task) => {
      const device = deviceMap.get(task.deviceId);
      return {
        id: task.id,
        title: task.title,
        garden: device ? getGardenDisplayName(device) : "—",
        assigneeIds: task.assigneeIds,
        status: task.status,
        dueDate: task.dueDate,
        registeredAt:
          (task.problemReportId && reportCreatedAt.get(task.problemReportId)) ||
          task.createdAt,
        completedAt: task.status === "done" ? task.completedAt : undefined,
      };
    });
  const assigneeIds = new Set(taskRows.flatMap((task) => task.assigneeIds));
  const taskUsers: TaskStatUser[] = users
    .filter((item) => assigneeIds.has(item.id))
    .map((item) => ({ id: item.id, name: item.name }))
    .sort((a, b) => a.name.localeCompare(b.name, "ka"));

  return (
    <AnalyticsDashboard
      devices={devices}
      snapshots={snapshots}
      canExport={hasPermission(user, "analytics.export")}
      taskStats={{ tasks: taskRows, users: taskUsers }}
    />
  );
}
