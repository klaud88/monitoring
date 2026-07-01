import bcrypt from "bcryptjs";
import { NextResponse, type NextRequest } from "next/server";
import { createSessionToken, sanitizeUser, SESSION_COOKIE, verifyPassword } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { getUserByLogin } from "@/lib/repositories";
import { shouldUseSecureCookie } from "@/lib/session";
import { clearLoginAttempts, recordFailedLogin } from "@/lib/rate-limit";

const DUMMY_HASH = "$2a$10$dummy.hash.to.prevent.timing.oracle.attacks.XXXXXXXX";

function getClientIp(request: NextRequest): string {
  return (
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const identifier = String(body?.email || body?.identifier || "").trim().toLowerCase();
  const password = String(body?.password || "");
  const ip = getClientIp(request);

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
