import { NextResponse, type NextRequest } from "next/server";
import { logAudit } from "@/lib/audit";
import { SESSION_COOKIE, hasPermission, isAdmin, verifySessionToken } from "@/lib/auth";
import { createRole, getRoles } from "@/lib/repositories";

const ROLE_NAME_PATTERN = /^[a-z][a-z0-9_-]{0,79}$/;

export async function GET(request: NextRequest) {
  const user = await verifySessionToken(
    request.cookies.get(SESSION_COOKIE)?.value,
  );
  if (!hasPermission(user, "permissions.view")) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({ roles: await getRoles() });
}

export async function POST(request: NextRequest) {
  const user = await verifySessionToken(
    request.cookies.get(SESSION_COOKIE)?.value,
  );
  if (!isAdmin(user)) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const name = normalizeRoleName(body?.name);
  const label = String(body?.label || "").trim();

  if (!ROLE_NAME_PATTERN.test(name) || !label || label.length > 120) {
    return NextResponse.json(
      { message: "Invalid role payload" },
      { status: 400 },
    );
  }

  const role = await createRole({ name, label });
  if (!role) {
    return NextResponse.json(
      { message: "Role already exists" },
      { status: 409 },
    );
  }

  await logAudit({
    userId: user!.id,
    action: "role.create",
    entityType: "role",
    entityId: role.id,
    metadata: { name, label },
    ipAddress: request.headers.get("x-forwarded-for") ?? undefined,
    userAgent: request.headers.get("user-agent") ?? undefined,
  });

  return NextResponse.json({ role }, { status: 201 });
}

function normalizeRoleName(value: unknown) {
  return String(value || "").trim().toLowerCase();
}
