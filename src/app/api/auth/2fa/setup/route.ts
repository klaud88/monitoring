import QRCode from "qrcode";
import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifyPassword, verifySessionToken } from "@/lib/auth";
import { getUserByEmail, startTwoFactorEnrollment } from "@/lib/repositories";
import { buildOtpAuthUrl, generateTotpSecret } from "@/lib/totp";

const ISSUER = "BioStar2 Status Ops";

// Starts (or restarts) enrollment: generates a fresh secret, stores it
// unconfirmed, and returns everything needed to render the QR code. 2FA
// only turns on once /api/auth/2fa/verify confirms a live code against it.
export async function POST(request: NextRequest) {
  const user = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  // Overwriting an already-enabled factor is a security-sensitive action —
  // a stolen/hijacked session alone shouldn't be able to silently replace a
  // victim's 2FA and lock them out, so this re-checks the password the same
  // way /api/auth/2fa/disable does. First-time enrollment needs no such
  // check since there's nothing active to take over yet.
  if (user.twoFactorEnabled) {
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
  }

  const secret = generateTotpSecret();
  const started = await startTwoFactorEnrollment(user.id, secret);
  if (!started) {
    return NextResponse.json({ message: "ვერ მოხერხდა ინიციალიზაცია." }, { status: 500 });
  }

  const otpauthUrl = buildOtpAuthUrl({ secret, accountName: user.email, issuer: ISSUER });
  const qrDataUrl = await QRCode.toDataURL(otpauthUrl, { margin: 1, width: 240 });

  return NextResponse.json({ secret, otpauthUrl, qrDataUrl });
}
