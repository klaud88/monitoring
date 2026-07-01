import bcrypt from "bcryptjs";
import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, hasPermission, verifySessionToken } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { createUser, getRoles, getUsers } from "@/lib/repositories";

const hashPassword = (password: string) => bcrypt.hash(password, 10);

export async function GET(request: NextRequest) {
  const user = await verifySessionToken(
    request.cookies.get(SESSION_COOKIE)?.value,
  );
  if (!hasPermission(user, "users.view")) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({ users: await getUsers() });
}

export async function POST(request: NextRequest) {
  const user = await verifySessionToken(
    request.cookies.get(SESSION_COOKIE)?.value,
  );
  if (!hasPermission(user, "users.create")) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

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

  if (!name || !email || !password || !roleNames.has(role)) {
    return NextResponse.json({ message: "Invalid user payload" }, { status: 400 });
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return NextResponse.json({ message: "ელფოსტის ფორმატი არასწორია." }, { status: 400 });
  }

  if (password.length < 8) {
    return NextResponse.json({ message: "პაროლი მინიმუმ 8 სიმბოლო უნდა იყოს." }, { status: 400 });
  }

  if (!/^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(color)) {
    return NextResponse.json({ message: "ფერის ფორმატი არასწორია." }, { status: 400 });
  }

  const createdUser = await createUser({
    name,
    email,
    role,
    initials,
    color,
    passwordHash: await hashPassword(password),
  });

  await logAudit({
    userId: user!.id,
    action: "user.create",
    entityType: "user",
    entityId: createdUser.id,
    metadata: { email, role },
    ipAddress: request.headers.get("x-forwarded-for") ?? undefined,
    userAgent: request.headers.get("user-agent") ?? undefined,
  });

  return NextResponse.json({ user: createdUser }, { status: 201 });
}

function buildInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("");
}
