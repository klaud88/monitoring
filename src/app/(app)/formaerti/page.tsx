import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { FormOneManager } from "@/components/form-one/form-one-manager";
import { SESSION_COOKIE, hasPermission, verifySessionToken } from "@/lib/auth";
import { getFirstAllowedPath } from "@/lib/navigation";
import {
  getDeviceGroupCode,
  getDevices,
  getFormOneRecords,
} from "@/lib/repositories";
import { canAccessGarden, getGardenScope } from "@/lib/garden-scope";

const TBILISI_TIME_ZONE = "Asia/Tbilisi";

export default async function FormOnePage() {
  const cookieStore = await cookies();
  const user = await verifySessionToken(cookieStore.get(SESSION_COOKIE)?.value);
  if (!hasPermission(user, "form_one.view")) {
    redirect(getFirstAllowedPath(user));
  }

  // Linked gardens only, or every garden (see garden-scope.ts).
  const gardenScope = getGardenScope(user, "form_one");
  const [devices, initialRecords] = await Promise.all([
    getDevices(),
    // Deleted records are loaded only for those who may restore them.
    getFormOneRecords({
      gardenCodes: gardenScope,
      includeDeleted: hasPermission(user, "form_one.delete"),
    }),
  ]);
  const visibleDevices = devices.filter((device) =>
    canAccessGarden(gardenScope, getDeviceGroupCode(device)),
  );
  // A single garden is preselected and fixed, as for a garden account.
  const gardenCount = new Set(visibleDevices.map(getDeviceGroupCode)).size;

  return (
    <FormOneManager
      canSelectGarden={gardenCount > 1}
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
