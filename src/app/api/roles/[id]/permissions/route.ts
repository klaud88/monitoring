import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, isAdmin, verifySessionToken } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { updateRolePermissions } from "@/lib/repositories";
import type { PageKey, PermissionAction, PermissionKey } from "@/lib/types";

const pageKeys = new Set<PageKey>([
  "dashboard",
  "devices",
  "tasks",
  "regions",
  "offline_records",
  "users",
  "permissions",
  "analytics",
]);
const permissionActions = new Set<PermissionAction>([
  "view",
  "create",
  "edit",
  "delete",
]);

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const user = await verifySessionToken(
    request.cookies.get(SESSION_COOKIE)?.value,
  );
  if (!isAdmin(user)) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  if (!Array.isArray(body?.permissions)) {
    return NextResponse.json(
      { message: "Permissions must be an array." },
      { status: 400 },
    );
  }

  const permissions = body.permissions.map(String);
  if (!permissions.every(isPermissionKey)) {
    return NextResponse.json(
      { message: "Invalid permission key." },
      { status: 400 },
    );
  }

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
  const [pageKey, actionKey, extra] = value.split(".");
  return (
    !extra &&
    pageKeys.has(pageKey as PageKey) &&
    permissionActions.has(actionKey as PermissionAction)
  );
}
