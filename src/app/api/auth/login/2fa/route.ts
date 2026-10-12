import bcrypt from "bcryptjs";
import { NextResponse, type NextRequest } from "next/server";
import { createSessionToken, SESSION_COOKIE, verifyPendingTwoFactorToken } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { consumeBackupCode, getTwoFactorRecord, getUserById } from "@/lib/repositories";
import { PENDING_2FA_COOKIE, shouldUseSecureCookie } from "@/lib/session";
import { clearLoginAttempts, getClientIp, isLoginRateLimited, recordFailedLogin } from "@/lib/rate-limit";
import { normalizeBackupCode, verifyTotpToken } from "@/lib/totp";

// Second step of login for accounts with 2FA on: the password already
// checked out (see /api/auth/login), this exchanges the authenticator-app
// code — or a backup code — for the real session cookie.
export async function POST(request: NextRequest) {
  const ip = getClientIp(request);

  if (isLoginRateLimited(ip)) {
    return NextResponse.json({ message: "მცდელობები ამოწურულია. სცადეთ მოგვიანებით." }, { status: 429 });
  }

  const pendingToken = request.cookies.get(PENDING_2FA_COOKIE)?.value;
  const userId = await verifyPendingTwoFactorToken(pendingToken);
  if (!userId) {
    return NextResponse.json(
      { message: "სესია ვადაგასულია, გთხოვთ შეხვიდეთ თავიდან." },
      { status: 401 },
    );
  }

  const body = await request.json().catch(() => null);
  const rawCode = String(body?.code || "").trim();
  if (!rawCode) {
    return NextResponse.json({ message: "კოდის შეყვანა სავალდებულოა." }, { status: 400 });
  }

  const record = await getTwoFactorRecord(userId);
  if (!record?.enabled || !record.secret) {
    return NextResponse.json({ message: "ორფაქტორიანი დაცვა გამორთულია." }, { status: 400 });
  }

  let matchedBackupHash: string | null = null;
  let ok = verifyTotpToken(record.secret, rawCode);

  if (!ok) {
    const normalizedBackup = normalizeBackupCode(rawCode);
    for (const hash of record.backupCodeHashes) {
      if (await bcrypt.compare(normalizedBackup, hash)) {
        matchedBackupHash = hash;
        ok = true;
        break;
      }
    }
  }

  if (!ok) {
    recordFailedLogin(ip);
    await logAudit({
      userId,
      action: "auth.login.2fa_failed",
      entityType: "user",
      entityId: userId,
      ipAddress: ip,
      userAgent: request.headers.get("user-agent") ?? undefined,
    });
    return NextResponse.json({ message: "კოდი არასწორია." }, { status: 401 });
  }

  clearLoginAttempts(ip);

  if (matchedBackupHash) {
    await consumeBackupCode(userId, matchedBackupHash);
  }

  const sessionUser = await getUserById(userId);
  if (!sessionUser) {
    return NextResponse.json({ message: "მომხმარებელი ვერ მოიძებნა." }, { status: 404 });
  }

  const fullSessionUser = { ...sessionUser, twoFactorEnabled: true };
  const token = await createSessionToken(fullSessionUser);
  const response = NextResponse.json({
    user: fullSessionUser,
    mustChangePassword: fullSessionUser.mustChangePassword ?? false,
  });

  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "strict",
    secure: shouldUseSecureCookie(),
    path: "/",
    maxAge: 60 * 60 * 10,
  });

  // Clear the pending cookie now that a real session exists.
  response.cookies.set(PENDING_2FA_COOKIE, "", {
    httpOnly: true,
    sameSite: "strict",
    secure: shouldUseSecureCookie(),
    path: "/",
    maxAge: 0,
  });

  await logAudit({
    userId,
    action: "auth.login",
    entityType: "user",
    entityId: userId,
    ipAddress: ip,
    userAgent: request.headers.get("user-agent") ?? undefined,
    metadata: matchedBackupHash ? { via: "2fa_backup_code" } : { via: "2fa" },
  });

  return response;
}
