import bcrypt from "bcryptjs";
import { NextResponse, type NextRequest } from "next/server";
import { createSessionToken, verifySessionToken } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { confirmTwoFactorEnrollment, getTwoFactorRecord } from "@/lib/repositories";
import { SESSION_COOKIE, shouldUseSecureCookie } from "@/lib/session";
import { generateBackupCodes, verifyTotpToken } from "@/lib/totp";

// Confirms enrollment: the user proves they can generate a live code from
// the secret shown by /api/auth/2fa/setup, which flips 2FA on and mints a
// one-time batch of backup codes (shown to them exactly once, here).
export async function POST(request: NextRequest) {
  const user = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const code = String(body?.code || "").trim();

  const record = await getTwoFactorRecord(user.id);
  if (!record?.secret) {
    return NextResponse.json({ message: "ჯერ დაიწყეთ დაყენება." }, { status: 400 });
  }

  if (!verifyTotpToken(record.secret, code)) {
    return NextResponse.json({ message: "კოდი არასწორია." }, { status: 400 });
  }

  const backupCodes = generateBackupCodes();
  const backupCodeHashes = await Promise.all(
    backupCodes.map((plain) => bcrypt.hash(plain.replace(/-/g, ""), 10)),
  );

  const confirmed = await confirmTwoFactorEnrollment(user.id, backupCodeHashes);
  if (!confirmed) {
    return NextResponse.json({ message: "ვერ ჩაირთო." }, { status: 500 });
  }

  // The session cookie's twoFactorEnabled claim was signed before this
  // request — reissue it so the rest of the app sees the change right away.
  const updatedUser = { ...user, twoFactorEnabled: true };
  const token = await createSessionToken(updatedUser);
  const response = NextResponse.json({ backupCodes });

  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "strict",
    secure: shouldUseSecureCookie(),
    path: "/",
    maxAge: 60 * 60 * 10,
  });

  await logAudit({
    userId: user.id,
    action: "auth.2fa.enabled",
    entityType: "user",
    entityId: user.id,
    ipAddress: request.headers.get("x-forwarded-for") ?? undefined,
    userAgent: request.headers.get("user-agent") ?? undefined,
  });

  return response;
}
