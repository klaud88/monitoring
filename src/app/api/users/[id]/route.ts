import bcrypt from "bcryptjs";
import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, hasPermission, verifySessionToken } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { deleteUser, getRoles, updateUser } from "@/lib/repositories";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const actor = await verifySessionToken(
    request.cookies.get(SESSION_COOKIE)?.value,
  );
  if (!hasPermission(actor, "users.edit")) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  const name = String(body?.name || "").trim();
  const email = String(body?.email || "").trim().toLowerCase();
  const role = String(body?.role || "").trim();
  const password = String(body?.password || "");
  const initials = String(body?.initials || buildInitials(name))
    .trim()
    .toUpperCase()
    .slice(0, 3);
  const color = String(body?.color || "#2563eb");
  const roleNames = new Set((await getRoles()).map((item) => item.name));

  if (!name || !email || !roleNames.has(role)) {
    return NextResponse.json({ message: "Invalid user payload" }, { status: 400 });
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return NextResponse.json({ message: "ელფოსტის ფორმატი არასწორია." }, { status: 400 });
  }

  if (password && password.length < 8) {
    return NextResponse.json({ message: "პაროლი მინიმუმ 8 სიმბოლო უნდა იყოს." }, { status: 400 });
  }

  if (!/^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(color)) {
    return NextResponse.json({ message: "ფერის ფორმატი არასწორია." }, { status: 400 });
  }

  const updatedUser = await updateUser(id, {
    name,
    email,
    role,
    initials,
    color,
    passwordHash: password ? await bcrypt.hash(password, 10) : undefined,
  });

  if (!updatedUser) {
    return NextResponse.json({ message: "User not found" }, { status: 404 });
  }

  await logAudit({
    userId: actor!.id,
    action: "user.update",
    entityType: "user",
    entityId: id,
    metadata: { email, role },
    ipAddress: request.headers.get("x-forwarded-for") ?? undefined,
    userAgent: request.headers.get("user-agent") ?? undefined,
  });

  return NextResponse.json({ user: updatedUser });
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const actor = await verifySessionToken(
    request.cookies.get(SESSION_COOKIE)?.value,
  );
  if (!hasPermission(actor, "users.delete")) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const { id } = await context.params;
  if (id === actor?.id) {
    return NextResponse.json(
      { message: "You cannot delete your active session user" },
      { status: 400 },
    );
  }

  const deleted = await deleteUser(id);
  if (!deleted) {
    return NextResponse.json({ message: "User not found" }, { status: 404 });
  }

  await logAudit({
    userId: actor!.id,
    action: "user.delete",
    entityType: "user",
    entityId: id,
    ipAddress: request.headers.get("x-forwarded-for") ?? undefined,
    userAgent: request.headers.get("user-agent") ?? undefined,
  });

  return NextResponse.json({ ok: true });
}

function buildInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("");
}
