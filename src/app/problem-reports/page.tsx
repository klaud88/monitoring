import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { ProblemReportsManager } from "@/components/problem-reports/problem-reports-manager";
import { SESSION_COOKIE, hasPermission, verifySessionToken } from "@/lib/auth";
import { getFirstAllowedPath } from "@/lib/navigation";
import {
  getDevices,
  getDeviceGroupCode,
  getProblemReports,
  getUsers,
  normalizeDeviceGroupCode,
} from "@/lib/repositories";

export default async function ProblemReportsPage() {
  const cookieStore = await cookies();
  const user = await verifySessionToken(cookieStore.get(SESSION_COOKIE)?.value);
  if (!hasPermission(user, "problem_reports.view")) {
    redirect(getFirstAllowedPath(user));
  }

  const deviceGroupCode =
    user?.role === "garden" ? normalizeDeviceGroupCode(user.deviceGroupCode) : "";
  const canAssignUsers = hasPermission(user, "problem_reports.assign");
  const [devices, reports, users] = await Promise.all([
    getDevices(),
    getProblemReports({ deviceGroupCode }),
    canAssignUsers ? getUsers() : Promise.resolve([]),
  ]);
  const visibleDevices = deviceGroupCode
    ? devices.filter(
        (device) => getDeviceGroupCode(device) === deviceGroupCode,
      )
    : devices;

  return (
    <AppShell>
      <ProblemReportsManager
        initialReports={reports}
        devices={visibleDevices}
        users={users}
        permissions={{
          create: hasPermission(user, "problem_reports.create"),
          edit: hasPermission(user, "problem_reports.edit"),
          delete: hasPermission(user, "problem_reports.delete"),
          assignUsers: canAssignUsers,
          manageTags: hasPermission(user, "problem_reports.tag"),
          manageStatus: hasPermission(user, "problem_reports.status"),
        }}
      />
    </AppShell>
  );
}
