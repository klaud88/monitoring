import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { FormOneManager } from "@/components/form-one/form-one-manager";
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
  const [devices, initialRecords] = await Promise.all([
    getDevices(),
    getFormOneRecords({ deviceGroupCode: deviceGroupCode || undefined }),
  ]);
  const visibleDevices = deviceGroupCode
    ? devices.filter((device) => getDeviceGroupCode(device) === deviceGroupCode)
    : devices;

  return (
    <FormOneManager
      canSelectGarden={user?.role !== "garden"}
      devices={visibleDevices}
      initialRecords={initialRecords}
      permissions={{
        commentEdit: hasPermission(user, "form_one.comment_edit"),
        completionRequest: hasPermission(user, "form_one.completion_request"),
        completionResponse: hasPermission(user, "form_one.completion_response"),
        create: hasPermission(user, "form_one.create"),
        dueDateEdit: hasPermission(user, "form_one.due_date_edit"),
        edit: hasPermission(user, "form_one.edit"),
        flag: hasPermission(user, "form_one.flag"),
        gardenEdit: hasPermission(user, "form_one.garden_edit"),
        modelAdd: hasPermission(user, "form_one.model_add"),
        modelEdit: hasPermission(user, "form_one.model_edit"),
        phoneEdit: hasPermission(user, "form_one.phone_edit"),
        quantityEdit: hasPermission(user, "form_one.quantity_edit"),
        serviceAdd: hasPermission(user, "form_one.service_add"),
        serviceDelete: hasPermission(user, "form_one.service_delete"),
        serviceEdit: hasPermission(user, "form_one.service_edit"),
        delete: hasPermission(user, "form_one.delete"),
      }}
      todayLabel={formatTbilisiDate(new Date())}
      todayValue={formatTbilisiDateKey(new Date())}
    />
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
