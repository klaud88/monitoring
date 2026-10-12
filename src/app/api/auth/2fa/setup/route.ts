import QRCode from "qrcode";
import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { startTwoFactorEnrollment } from "@/lib/repositories";
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

  const secret = generateTotpSecret();
  const started = await startTwoFactorEnrollment(user.id, secret);
  if (!started) {
    return NextResponse.json({ message: "ვერ მოხერხდა ინიციალიზაცია." }, { status: 500 });
  }

  const otpauthUrl = buildOtpAuthUrl({ secret, accountName: user.email, issuer: ISSUER });
  const qrDataUrl = await QRCode.toDataURL(otpauthUrl, { margin: 1, width: 240 });

  return NextResponse.json({ secret, otpauthUrl, qrDataUrl });
}
