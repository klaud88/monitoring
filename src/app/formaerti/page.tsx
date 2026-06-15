import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { FormOneManager } from "@/components/form-one/form-one-manager";
import { AppShell } from "@/components/layout/app-shell";
import { SESSION_COOKIE, hasPermission, verifySessionToken } from "@/lib/auth";
import { getFirstAllowedPath } from "@/lib/navigation";
import {
  getDeviceGroupCode,
  getDevices,
  getFormOneRecords,
  normalizeDeviceGroupCode,
} from "@/lib/repositories";

const TBILISI_TIME_ZONE = "Asia/Tbilisi";

export default async function FormOnePage() {
  const cookieStore = await cookies();
  const user = await verifySessionToken(cookieStore.get(SESSION_COOKIE)?.value);
  if (!hasPermission(user, "form_one.view")) {
    redirect(getFirstAllowedPath(user));
  }

  const deviceGroupCode =
    user?.role === "garden" ? normalizeDeviceGroupCode(user.deviceGroupCode) : "";
  const devices = await getDevices();
  const visibleDevices = deviceGroupCode
    ? devices.filter(
        (device) => getDeviceGroupCode(device) === deviceGroupCode,
      )
    : devices;
  const initialRecords = await getFormOneRecords({
    deviceGroupCode: deviceGroupCode || undefined,
  });

  return (
    <AppShell>
      <FormOneManager
        canSelectGarden={user?.role !== "garden"}
        devices={visibleDevices}
        initialRecords={initialRecords}
        permissions={{
          edit: hasPermission(user, "form_one.edit"),
          delete: hasPermission(user, "form_one.delete"),
        }}
        todayLabel={formatTbilisiDate(new Date())}
        todayValue={formatTbilisiDateKey(new Date())}
      />
    </AppShell>
  );
}

function formatTbilisiDate(date: Date) {
  return new Intl.DateTimeFormat("ka-GE", {
    day: "2-digit",
    month: "2-digit",
    timeZone: TBILISI_TIME_ZONE,
    year: "numeric",
  }).format(date);
}

function formatTbilisiDateKey(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: TBILISI_TIME_ZONE,
    year: "numeric",
  }).formatToParts(date);

  const readPart = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "01";

  return `${readPart("year")}-${readPart("month")}-${readPart("day")}`;
}
