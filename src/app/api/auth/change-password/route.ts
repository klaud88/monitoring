import bcrypt from "bcryptjs";
import { NextResponse, type NextRequest } from "next/server";
import { clearSessionPermissionCache, SESSION_COOKIE, verifyPassword, verifySessionToken } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { changeUserPassword, getUserByEmail } from "@/lib/repositories";
import { shouldUseSecureCookie, TENANT_COOKIE } from "@/lib/session";

export async function POST(request: NextRequest) {
  const user = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const newPassword = String(body?.newPassword || "").trim();
  const currentPassword = String(body?.currentPassword || "");

  if (!newPassword || newPassword.length < 8) {
    return NextResponse.json(
      { message: "პაროლი მინიმუმ 8 სიმბოლო უნდა იყოს." },
      { status: 400 },
    );
  }

  // When mustChangePassword is set, skip current password check (admin-forced reset flow)
  if (!user.mustChangePassword) {
    if (!currentPassword) {
      return NextResponse.json(
        { message: "მიმდინარე პაროლის შეყვანა სავალდებულოა." },
        { status: 400 },
      );
    }

    const fullUser = await getUserByEmail(user.email);
    const isCurrentValid = await verifyPassword(currentPassword, fullUser?.passwordHash);
    if (!isCurrentValid) {
      return NextResponse.json(
        { message: "მიმდინარე პაროლი არასწორია." },
        { status: 400 },
      );
    }
  }

  const newHash = await bcrypt.hash(newPassword, 10);
  const changed = await changeUserPassword(user.id, newHash);

  if (!changed) {
    return NextResponse.json({ message: "პაროლის შეცვლა ვერ მოხერხდა." }, { status: 500 });
  }

  // Drop the cached must-change flag so the next login doesn't see it.
  clearSessionPermissionCache();

  await logAudit({
    userId: user.id,
    action: "auth.change_password",
    entityType: "user",
    entityId: user.id,
    metadata: { forced: user.mustChangePassword ?? false },
    ipAddress: request.headers.get("x-forwarded-for") ?? undefined,
    userAgent: request.headers.get("user-agent") ?? undefined,
  });

  await logAudit({
    userId: user.id,
    action: "auth.logout",
    entityType: "user",
    entityId: user.id,
    metadata: { reason: "password_changed" },
    ipAddress: request.headers.get("x-forwarded-for") ?? undefined,
    userAgent: request.headers.get("user-agent") ?? undefined,
  });

  // A changed password ends the session: the user signs in again with it.
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "strict",
    secure: shouldUseSecureCookie(),
    path: "/",
    maxAge: 0,
  });
  response.cookies.delete(TENANT_COOKIE);

  return response;
}
