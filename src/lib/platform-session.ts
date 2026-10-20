import { jwtVerify, SignJWT } from "jose";

/*
 * Platform admin session (portal process). Edge-safe — middleware imports
 * it — so no bcrypt/TOTP here; credentials are checked in platform-auth.ts.
 * Signed with PLATFORM_AUTH_SECRET, never an organisation's AUTH_SECRET.
 */

export const PLATFORM_SESSION_SECONDS = 2 * 60 * 60;

function getSecret() {
  const secret = process.env.PLATFORM_AUTH_SECRET;
  if (!secret || secret.length < 32) {
    return null;
  }
  return new TextEncoder().encode(secret);
}

export function isPlatformConfigured() {
  return Boolean(
    getSecret() &&
      process.env.PLATFORM_ADMIN_EMAIL &&
      process.env.PLATFORM_ADMIN_PASSWORD_HASH &&
      process.env.PLATFORM_TOTP_SECRET,
  );
}

export async function createPlatformToken(email: string) {
  const secret = getSecret();
  if (!secret) {
    throw new Error("PLATFORM_AUTH_SECRET is not set or shorter than 32 characters.");
  }
  return new SignJWT({ platform: true })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(email)
    .setIssuedAt()
    .setExpirationTime(`${PLATFORM_SESSION_SECONDS}s`)
    .sign(secret);
}

export async function verifyPlatformToken(token?: string) {
  const secret = getSecret();
  if (!token || !secret) {
    return false;
  }
  try {
    const { payload } = await jwtVerify(token, secret);
    const email = (process.env.PLATFORM_ADMIN_EMAIL || "").trim().toLowerCase();
    return payload.platform === true && Boolean(email) && payload.sub === email;
  } catch {
    return false;
  }
}
