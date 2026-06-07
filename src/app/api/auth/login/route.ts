import { NextResponse, type NextRequest } from "next/server";
import { createSessionToken, sanitizeUser, SESSION_COOKIE, verifyPassword } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { getUserByLogin } from "@/lib/repositories";
import { shouldUseSecureCookie } from "@/lib/session";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const identifier = String(body?.email || body?.identifier || "").trim().toLowerCase();
  const password = String(body?.password || "");

  if (!identifier || !password) {
    return NextResponse.json({ message: "ელფოსტა/X-Station და პაროლი აუცილებელია." }, { status: 400 });
  }

  const user = await getUserByLogin(identifier);
  const isValid = user ? await verifyPassword(password, user.passwordHash) : false;

  if (!user || !isValid) {
    return NextResponse.json({ message: "არასწორი ელფოსტა/X-Station ან პაროლი." }, { status: 401 });
  }

  const sessionUser = sanitizeUser(user);
  const token = await createSessionToken(sessionUser);
  const response = NextResponse.json({ user: sessionUser });

  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: shouldUseSecureCookie(request),
    path: "/",
    maxAge: 60 * 60 * 10
  });

  await logAudit({
    userId: user.id,
    action: "auth.login",
    entityType: "user",
    entityId: user.id,
    ipAddress: request.headers.get("x-forwarded-for") ?? undefined,
    userAgent: request.headers.get("user-agent") ?? undefined
  });

  return response;
}
