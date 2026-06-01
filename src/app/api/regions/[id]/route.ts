import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, hasPermission, verifySessionToken } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { deleteRegion, updateRegion } from "@/lib/repositories";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const user = await verifySessionToken(
    request.cookies.get(SESSION_COOKIE)?.value,
  );
  if (!hasPermission(user, "regions.edit")) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  const name = String(body?.name || "").trim();
  const color = String(body?.color || "#2563eb");

  if (!name) {
    return NextResponse.json({ message: "Region name is required" }, { status: 400 });
  }

  const region = await updateRegion(id, { name, color });
  if (!region) {
    return NextResponse.json({ message: "Region not found" }, { status: 404 });
  }

  await logAudit({
    userId: user!.id,
    action: "region.update",
    entityType: "region",
    entityId: id,
    metadata: { name, color },
    ipAddress: request.headers.get("x-forwarded-for") ?? undefined,
    userAgent: request.headers.get("user-agent") ?? undefined,
  });

  return NextResponse.json({ region });
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const user = await verifySessionToken(
    request.cookies.get(SESSION_COOKIE)?.value,
  );
  if (!hasPermission(user, "regions.delete")) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const { id } = await context.params;
  const deleted = await deleteRegion(id);
  if (!deleted) {
    return NextResponse.json({ message: "Region not found" }, { status: 404 });
  }

  await logAudit({
    userId: user!.id,
    action: "region.delete",
    entityType: "region",
    entityId: id,
    ipAddress: request.headers.get("x-forwarded-for") ?? undefined,
    userAgent: request.headers.get("user-agent") ?? undefined,
  });

  return NextResponse.json({ ok: true });
}
