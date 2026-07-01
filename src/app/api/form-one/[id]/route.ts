import { NextResponse, type NextRequest } from "next/server";
import { logAudit } from "@/lib/audit";
import { SESSION_COOKIE, hasPermission, verifySessionToken } from "@/lib/auth";
import {
  deleteFormOneRecord,
  getFormOneRecordById,
  normalizeDeviceGroupCode,
  updateFormOneRecord,
} from "@/lib/repositories";
import type { FormOneRecord, FormOneRecordItem } from "@/lib/types";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const user = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (!hasPermission(user, "form_one.view") || !hasPermission(user, "form_one.edit")) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const { id } = await context.params;
  const existing = await getFormOneRecordById(id);
  if (!existing || !canAccessRecord(user, existing.deviceGroupCode)) {
    return NextResponse.json({ message: "Form one record not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const deviceId = String(body?.deviceId ?? existing.deviceId).trim();
  const gardenLabel = String(body?.gardenLabel ?? existing.gardenLabel).trim();
  const phone = String(body?.phone ?? existing.phone ?? "").trim();
  const submittedDate = String(
    body?.submittedDate ?? existing.submittedDate,
  ).trim();
  const dueDate = String(body?.dueDate ?? existing.dueDate ?? "").trim();
  const items = normalizeApiItems(body?.items ?? existing.items);

  if (!deviceId || !submittedDate || !items.length) {
    return NextResponse.json(
      { message: "Missing required form one fields" },
      { status: 400 },
    );
  }

  const permissionError = getFormOnePatchPermissionError(user, existing, {
    deviceId,
    gardenLabel,
    phone,
    submittedDate,
    dueDate,
    items,
  });
  if (permissionError) {
    return NextResponse.json({ message: permissionError }, { status: 403 });
  }

  const record = await updateFormOneRecord(
    id,
    {
      deviceId,
      gardenLabel,
      phone,
      submittedDate,
      dueDate,
      items,
    },
    {
      allowedDeviceGroupCode: getScopedDeviceGroupCode(user),
      updatedBy: user?.id,
    },
  );

  if (!record) {
    return NextResponse.json({ message: "Form one record not found" }, { status: 404 });
  }

  await logAudit({
    userId: user!.id,
    action: "form_one.update",
    entityType: "form_one_record",
    entityId: id,
    metadata: { deviceId: record.deviceId, itemCount: record.items.length },
    ipAddress: request.headers.get("x-forwarded-for") ?? undefined,
    userAgent: request.headers.get("user-agent") ?? undefined,
  });

  return NextResponse.json({ record });
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const user = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (!hasPermission(user, "form_one.delete")) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const { id } = await context.params;
  const existing = await getFormOneRecordById(id);
  if (!existing || !canAccessRecord(user, existing.deviceGroupCode)) {
    return NextResponse.json({ message: "Form one record not found" }, { status: 404 });
  }

  const deleted = await deleteFormOneRecord(id, {
    allowedDeviceGroupCode: getScopedDeviceGroupCode(user),
  });
  if (!deleted) {
    return NextResponse.json({ message: "Form one record not found" }, { status: 404 });
  }

  await logAudit({
    userId: user!.id,
    action: "form_one.delete",
    entityType: "form_one_record",
    entityId: id,
    ipAddress: request.headers.get("x-forwarded-for") ?? undefined,
    userAgent: request.headers.get("user-agent") ?? undefined,
  });

  return NextResponse.json({ ok: true });
}

function getScopedDeviceGroupCode(user: Awaited<ReturnType<typeof verifySessionToken>>) {
  return user?.role === "garden"
    ? normalizeDeviceGroupCode(user.deviceGroupCode)
    : undefined;
}

function canAccessRecord(
  user: Awaited<ReturnType<typeof verifySessionToken>>,
  recordDeviceGroupCode: string,
) {
  const scopedDeviceGroupCode = getScopedDeviceGroupCode(user);
  return (
    !scopedDeviceGroupCode ||
    normalizeDeviceGroupCode(recordDeviceGroupCode) === scopedDeviceGroupCode
  );
}

function normalizeApiItems(value: unknown): FormOneRecordItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      const source =
        typeof item === "object" && item !== null
          ? (item as Record<string, unknown>)
          : {};
      const serviceLabel = String(source.serviceLabel || "").trim();
      const customServiceLabel = String(source.customServiceLabel || "").trim();

      return {
        modelId: String(source.modelId || "").trim(),
        modelLabel: String(source.modelLabel || "").trim(),
        serviceId: String(source.serviceId || "").trim(),
        serviceLabel: serviceLabel || customServiceLabel,
        customServiceLabel: customServiceLabel || undefined,
        quantity: Math.max(1, Number(source.quantity) || 1),
      };
    })
    .filter((item) => item.modelLabel && item.serviceLabel);
}

function getFormOnePatchPermissionError(
  user: Awaited<ReturnType<typeof verifySessionToken>>,
  existing: FormOneRecord,
  next: {
    deviceId: string;
    gardenLabel: string;
    phone: string;
    submittedDate: string;
    dueDate: string;
    items: FormOneRecordItem[];
  },
) {
  if (!hasPermission(user, "form_one.edit")) {
    return "Missing form one edit permission";
  }

  const gardenChanged =
    next.deviceId !== existing.deviceId ||
    next.gardenLabel !== existing.gardenLabel;
  if (gardenChanged && !hasPermission(user, "form_one.garden_edit")) {
    return "Missing form one garden edit permission";
  }

  const phoneChanged = next.phone !== (existing.phone ?? "");
  if (phoneChanged && !hasPermission(user, "form_one.phone_edit")) {
    return "Missing form one phone edit permission";
  }

  const submittedDateChanged = next.submittedDate !== existing.submittedDate;
  if (submittedDateChanged) {
    return "Missing form one submitted date edit permission";
  }

  const dueDateChanged = next.dueDate !== (existing.dueDate ?? "");
  if (
    dueDateChanged &&
    !hasPermission(user, "form_one.due_date_edit")
  ) {
    return "Missing form one due date edit permission";
  }

  const itemChanges = getFormOneItemChanges(existing.items, next.items);
  if (
    itemChanges.modelAdd &&
    !hasPermission(user, "form_one.model_add")
  ) {
    return "Missing form one model add permission";
  }
  if (
    itemChanges.modelEdit &&
    !hasPermission(user, "form_one.model_edit")
  ) {
    return "Missing form one model edit permission";
  }
  if (
    itemChanges.serviceAdd &&
    !hasPermission(user, "form_one.service_add")
  ) {
    return "Missing form one service add permission";
  }
  if (
    itemChanges.serviceEdit &&
    !hasPermission(user, "form_one.service_edit")
  ) {
    return "Missing form one service edit permission";
  }
  if (
    itemChanges.serviceDelete &&
    !hasPermission(user, "form_one.service_delete")
  ) {
    return "Missing form one service delete permission";
  }
  if (
    itemChanges.quantity &&
    !hasPermission(user, "form_one.quantity_edit")
  ) {
    return "Missing form one quantity edit permission";
  }

  return "";
}

function getFormOneItemChanges(
  currentItems: FormOneRecordItem[],
  nextItems: FormOneRecordItem[],
) {
  const changes = {
    modelAdd: false,
    modelEdit: false,
    serviceAdd: false,
    serviceEdit: false,
    serviceDelete: false,
    quantity: false,
  };
  const currentModelCounts = countItemsByModel(currentItems);
  const nextModelCounts = countItemsByModel(nextItems);

  for (const [modelKey, nextCount] of nextModelCounts) {
    const currentCount = currentModelCounts.get(modelKey) ?? 0;
    if (!currentCount) {
      changes.modelAdd = true;
    } else if (nextCount > currentCount) {
      changes.serviceAdd = true;
    }
  }

  for (const [modelKey, currentCount] of currentModelCounts) {
    if ((nextModelCounts.get(modelKey) ?? 0) < currentCount) {
      changes.serviceDelete = true;
    }
  }

  if (currentItems.length === nextItems.length) {
    for (let index = 0; index < currentItems.length; index += 1) {
      const current = currentItems[index];
      const next = nextItems[index];
      if (!current || !next) {
        continue;
      }
      if (
        current.modelId !== next.modelId ||
        current.modelLabel !== next.modelLabel
      ) {
        changes.modelEdit = true;
      }
      if (
        current.serviceId !== next.serviceId ||
        current.serviceLabel !== next.serviceLabel ||
        (current.customServiceLabel ?? "") !== (next.customServiceLabel ?? "")
      ) {
        changes.serviceEdit = true;
      }
      if (current.quantity !== next.quantity) {
        changes.quantity = true;
      }
    }
  }

  return changes;
}

function countItemsByModel(items: FormOneRecordItem[]) {
  const counts = new Map<string, number>();
  items.forEach((item) => {
    const key = `${item.modelId}::${item.modelLabel}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });
  return counts;
}
