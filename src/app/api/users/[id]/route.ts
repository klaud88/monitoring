import bcrypt from "bcryptjs";
import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, hasPermission, isAdmin, verifySessionToken, clearSessionPermissionCache } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { parseGardenCodes } from "@/lib/garden-scope";
import {
  deleteUser,
  getGardenCodes,
  getRoles,
  getUserById,
  updateUser,
} from "@/lib/repositories";

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
  const phone = String(body?.phone || "").trim();
  const role = String(body?.role || "").trim();
  const password = String(body?.password || "");
  const initials = String(body?.initials || buildInitials(name))
    .trim()
    .toUpperCase()
    .slice(0, 3);
  const color = String(body?.color || "#2563eb");
  const gardenCodes = parseGardenCodes(body?.gardenCodes);
  const roleNames = new Set((await getRoles()).map((item) => item.name));

  if (!name || !email || !roleNames.has(role)) {
    return NextResponse.json({ message: "Invalid user payload" }, { status: 400 });
  }

  // A users.edit permission is meant to manage accounts, not to hand out
  // admin — granting the role that bypasses every other permission check is
  // reserved for existing admins, however this permission ends up assigned.
  if (role === "admin" && !isAdmin(actor)) {
    return NextResponse.json(
      { message: "მხოლოდ ადმინისტრატორს შეუძლია admin როლის მინიჭება." },
      { status: 403 },
    );
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return NextResponse.json({ message: "ელფოსტის ფორმატი არასწორია." }, { status: 400 });
  }

  if (password && password.length < 8) {
    return NextResponse.json({ message: "პაროლი მინიმუმ 8 სიმბოლო უნდა იყოს." }, { status: 400 });
  }

  if (phone && !/^\+?[\d\s-]{6,20}$/.test(phone)) {
    return NextResponse.json({ message: "ტელეფონის ფორმატი არასწორია." }, { status: 400 });
  }

  if (!/^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(color)) {
    return NextResponse.json({ message: "ფერის ფორმატი არასწორია." }, { status: 400 });
  }

  if (gardenCodes?.length) {
    // A garden kept from before stays valid even if its devices are gone.
    const known = new Set([
      ...(await getGardenCodes()),
      ...((await getUserById(id))?.gardenCodes ?? []),
    ]);
    const unknown = gardenCodes.filter((code) => !known.has(code));
    if (unknown.length) {
      return NextResponse.json(
        { message: `ასეთი ბაღი არ არსებობს: ${unknown.join(", ")}` },
        { status: 400 },
      );
    }
  }

  const updatedUser = await updateUser(id, {
    name,
    email,
    role,
    initials,
    color,
    phone,
    passwordHash: password ? await bcrypt.hash(password, 10) : undefined,
    gardenCodes,
  });
  clearSessionPermissionCache();

  if (!updatedUser) {
    return NextResponse.json({ message: "User not found" }, { status: 404 });
  }

  await logAudit({
    userId: actor!.id,
    action: "user.update",
    entityType: "user",
    entityId: id,
    metadata: { email, role, gardenCodes },
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
  // Deleting an account is destructive and permanent, so it takes actual
  // admin status — a users.delete permission on its own isn't enough,
  // the same boundary as granting the admin role in PATCH above.
  if (!isAdmin(actor)) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const { id } = await context.params;
  if (id === actor?.id) {
    return NextResponse.json(
      { message: "You cannot delete your active session user" },
      { status: 400 },
    );
  }

  // No admin account can be deleted through this endpoint, including by
  // another admin — protects against an accidental or malicious wipeout of
  // every admin account. Removing an admin is a deliberate, separate action.
  const target = await getUserById(id);
  if (target?.role === "admin") {
    return NextResponse.json(
      { message: "ადმინისტრატორის ანგარიშის წაშლა შეზღუდულია." },
      { status: 403 },
    );
  }

  const deleted = await deleteUser(id);
  // Sessions read permissions live; make this change apply right away.
  clearSessionPermissionCache();
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
