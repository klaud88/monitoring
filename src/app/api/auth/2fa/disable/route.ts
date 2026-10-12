import { NextResponse, type NextRequest } from "next/server";
import { createSessionToken, SESSION_COOKIE, verifyPassword, verifySessionToken } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { disableTwoFactor, getUserByEmail } from "@/lib/repositories";
import { shouldUseSecureCookie } from "@/lib/session";

// Turning 2FA off is a security downgrade, so it requires the current
// password again rather than just an authenticated session.
export async function POST(request: NextRequest) {
  const user = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const password = String(body?.password || "");
  if (!password) {
    return NextResponse.json({ message: "პაროლის დადასტურება სავალდებულოა." }, { status: 400 });
  }

  const fullUser = await getUserByEmail(user.email);
  const isValid = await verifyPassword(password, fullUser?.passwordHash);
  if (!isValid) {
    return NextResponse.json({ message: "პაროლი არასწორია." }, { status: 400 });
  }

  const disabled = await disableTwoFactor(user.id);
  if (!disabled) {
    return NextResponse.json({ message: "ვერ გამოირთო." }, { status: 500 });
  }

  const updatedUser = { ...user, twoFactorEnabled: false };
  const token = await createSessionToken(updatedUser);
  const response = NextResponse.json({ ok: true });

  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "strict",
    secure: shouldUseSecureCookie(),
    path: "/",
    maxAge: 60 * 60 * 10,
  });

  await logAudit({
    userId: user.id,
    action: "auth.2fa.disabled",
    entityType: "user",
    entityId: user.id,
    ipAddress: request.headers.get("x-forwarded-for") ?? undefined,
    userAgent: request.headers.get("user-agent") ?? undefined,
  });

  return response;
}
