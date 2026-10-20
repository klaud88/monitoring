import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, isAdmin, verifySessionToken, clearSessionPermissionCache } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { getRoles, updateRolePermissions } from "@/lib/repositories";
import { isKnownPermissionKey } from "@/lib/permission-catalog";
import { isFeatureDisabled } from "@/lib/feature-flags";
import { getDisabledFeatures } from "@/lib/features";

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

  // Only keys the Permissions page offers are stored. Unknown or retired
  // keys a role still carries are dropped instead of failing the whole
  // save — that used to make every switch on such a role snap back.
  const permissions = [
    ...new Set((body.permissions as unknown[]).map(String)),
  ].filter(isKnownPermissionKey);

  // What the platform admin switched off can't be granted from here. Rows a
  // role already holds for such a feature are kept, so switching it back on
  // restores them.
  const disabled = await getDisabledFeatures();
  if (disabled.length) {
    const current = (await getRoles()).find((role) => role.id === id);
    const blocked = permissions.filter(
      (key) =>
        isFeatureDisabled(disabled, key) && !current?.permissions.includes(key),
    );
    if (blocked.length) {
      return NextResponse.json(
        { message: `გამორთულია პლატფორმიდან: ${blocked.join(", ")}` },
        { status: 400 },
      );
    }
  }

  const role = await updateRolePermissions(id, permissions);
  // Sessions read permissions live; make this change apply right away.
  clearSessionPermissionCache();
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
