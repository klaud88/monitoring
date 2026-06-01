import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, hasPermission, verifySessionToken } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { updateRolePermissions } from "@/lib/repositories";
import type { PermissionKey } from "@/lib/types";

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const user = await verifySessionToken(
    request.cookies.get(SESSION_COOKIE)?.value,
  );
  if (!hasPermission(user, "permissions.edit")) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  const permissions = Array.isArray(body?.permissions)
    ? body.permissions.map(String).filter(isPermissionKey)
    : [];

  const role = await updateRolePermissions(id, permissions);
  if (!role) {
    return NextResponse.json({ message: "Role not found" }, { status: 404 });
  }

  await logAudit({
    userId: user!.id,
    action: "role.permissions_update",
    entityType: "role",
    entityId: id,
    metadata: { permissions },
    ipAddress: request.headers.get("x-forwarded-for") ?? undefined,
    userAgent: request.headers.get("user-agent") ?? undefined,
  });

  return NextResponse.json({ role });
}

function isPermissionKey(value: string): value is PermissionKey {
  return /^[a-z_]+\\.(view|create|edit|delete)$/.test(value);
}
