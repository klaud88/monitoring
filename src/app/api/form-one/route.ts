import { NextResponse, type NextRequest } from "next/server";
import { logAudit } from "@/lib/audit";
import { SESSION_COOKIE, hasPermission, verifySessionToken } from "@/lib/auth";
import {
  createFormOneRecord,
  getFormOneRecords,
  normalizeDeviceGroupCode,
} from "@/lib/repositories";
import type { FormOneRecordItem } from "@/lib/types";

export async function GET(request: NextRequest) {
  const user = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (!hasPermission(user, "form_one.view")) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({
    records: await getFormOneRecords({
      deviceGroupCode: getScopedDeviceGroupCode(user),
    }),
  });
}

export async function POST(request: NextRequest) {
  const user = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (!hasPermission(user, "form_one.view")) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const deviceId = String(body?.deviceId || "").trim();
  const gardenLabel = String(body?.gardenLabel || "").trim();
  const phone = String(body?.phone || "").trim();
  const submittedDate = String(body?.submittedDate || "").trim();
  const items = normalizeApiItems(body?.items);

  if (!deviceId || !submittedDate || !items.length) {
    return NextResponse.json(
      { message: "Missing required form one fields" },
      { status: 400 },
    );
  }

  const record = await createFormOneRecord(
    {
      deviceId,
      gardenLabel,
      phone,
      submittedDate,
      items,
    },
    {
      createdBy: user?.id,
      allowedDeviceGroupCode: getScopedDeviceGroupCode(user),
    },
  );

  if (!record) {
    return NextResponse.json({ message: "Form one record not found" }, { status: 404 });
  }

  await logAudit({
    userId: user!.id,
    action: "form_one.create",
    entityType: "form_one_record",
    entityId: record.id,
    metadata: { deviceId, itemCount: items.length },
    ipAddress: request.headers.get("x-forwarded-for") ?? undefined,
    userAgent: request.headers.get("user-agent") ?? undefined,
  });

  return NextResponse.json({ record }, { status: 201 });
}

function getScopedDeviceGroupCode(user: Awaited<ReturnType<typeof verifySessionToken>>) {
  return user?.role === "garden"
    ? normalizeDeviceGroupCode(user.deviceGroupCode)
    : undefined;
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
