import bcrypt from "bcryptjs";
import { NextResponse, type NextRequest } from "next/server";
import { createPendingTwoFactorToken, createSessionToken, sanitizeUser, SESSION_COOKIE, verifyPassword } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { getUserByLogin } from "@/lib/repositories";
import { PENDING_2FA_COOKIE, shouldUseSecureCookie } from "@/lib/session";
import { clearLoginAttempts, getClientIp, isLoginRateLimited, recordFailedLogin } from "@/lib/rate-limit";

const DUMMY_HASH = "$2a$10$dummy.hash.to.prevent.timing.oracle.attacks.XXXXXXXX";

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);

  // Middleware runs in the Edge runtime while this route runs in the
  // Node.js runtime — they are separate execution contexts, so the
  // in-memory attempt counter is NOT actually shared between a check in
  // middleware and a record here. The check has to live in the same
  // runtime as the record, exactly like /api/auth/login/2fa already does.
  if (isLoginRateLimited(ip)) {
    return NextResponse.json(
      { message: "ძალიან ბევრი მცდელობა. სცადეთ მოგვიანებით." },
      { status: 429 },
    );
  }

  const body = await request.json().catch(() => null);
  const identifier = String(body?.email || body?.identifier || "").trim().toLowerCase();
  const password = String(body?.password || "");

  if (!identifier || !password) {
    return NextResponse.json({ message: "ელფოსტა/X-Station და პაროლი აუცილებელია." }, { status: 400 });
  }

  const user = await getUserByLogin(identifier);

  // Always run bcrypt to prevent timing-based username enumeration
  const isValid = user
    ? await verifyPassword(password, user.passwordHash)
    : await bcrypt.compare(password, DUMMY_HASH).then(() => false);

  if (!user || !isValid) {
    recordFailedLogin(ip);
    await logAudit({
      userId: "unknown",
      action: "auth.login.failed",
      entityType: "user",
      ipAddress: ip,
      userAgent: request.headers.get("user-agent") ?? undefined,
      metadata: { identifier },
    });
    return NextResponse.json({ message: "არასწორი ელფოსტა/X-Station ან პაროლი." }, { status: 401 });
  }

  clearLoginAttempts(ip);

  // Password checked out, but the account still needs its authenticator-app
  // code before a real session is issued. Hand back a short-lived pending
  // cookie instead of the full session one.
  if (user.twoFactorEnabled) {
    const pendingToken = await createPendingTwoFactorToken(user.id);
    const response = NextResponse.json({ twoFactorRequired: true });

    response.cookies.set(PENDING_2FA_COOKIE, pendingToken, {
      httpOnly: true,
      sameSite: "strict",
      secure: shouldUseSecureCookie(),
      path: "/",
      maxAge: 60 * 5,
    });

    return response;
  }

  const sessionUser = sanitizeUser(user);
  const token = await createSessionToken(sessionUser);
  const response = NextResponse.json({
    user: sessionUser,
    mustChangePassword: sessionUser.mustChangePassword ?? false,
  });

  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "strict",
    secure: shouldUseSecureCookie(),
    path: "/",
    maxAge: 60 * 60 * 10,
  });

  await logAudit({
    userId: user.id,
    action: "auth.login",
    entityType: "user",
    entityId: user.id,
    ipAddress: ip,
    userAgent: request.headers.get("user-agent") ?? undefined,
  });

  return response;
}
