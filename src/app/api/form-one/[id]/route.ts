import { NextResponse, type NextRequest } from "next/server";
import { logAudit } from "@/lib/audit";
import { SESSION_COOKIE, hasPermission, verifySessionToken } from "@/lib/auth";
import {
  deleteFormOneRecord,
  getFormOneRecordById,
  normalizeDeviceGroupCode,
  updateFormOneRecord,
} from "@/lib/repositories";
import type { FormOneRecordItem } from "@/lib/types";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const user = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (!hasPermission(user, "form_one.edit")) {
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
  const items = normalizeApiItems(body?.items ?? existing.items);

  if (!deviceId || !submittedDate || !items.length) {
    return NextResponse.json(
      { message: "Missing required form one fields" },
      { status: 400 },
    );
  }

  const record = await updateFormOneRecord(
    id,
    {
      deviceId,
      gardenLabel,
      phone,
      submittedDate,
      items,
    },
    { allowedDeviceGroupCode: getScopedDeviceGroupCode(user) },
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
