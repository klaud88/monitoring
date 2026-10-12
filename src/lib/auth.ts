import bcrypt from "bcryptjs";
import { jwtVerify, SignJWT } from "jose";
import { SESSION_COOKIE } from "./session";
import type { AppUser, PermissionKey, SessionUser } from "./types";

export { SESSION_COOKIE };

function getSecret() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("AUTH_SECRET environment variable is not set.");
  }
  return new TextEncoder().encode(secret);
}

export function sanitizeUser(user: AppUser): SessionUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    initials: user.initials,
    color: user.color,
    permissions: user.permissions,
    deviceGroupCode: user.deviceGroupCode,
    mustChangePassword: user.mustChangePassword,
    twoFactorEnabled: Boolean(user.twoFactorEnabled),
  };
}

export async function createSessionToken(user: AppUser | SessionUser) {
  return new SignJWT({
    name: user.name,
    email: user.email,
    role: user.role,
    initials: user.initials,
    color: user.color,
    permissions: user.permissions,
    deviceGroupCode: user.deviceGroupCode,
    mustChangePassword: user.mustChangePassword ?? false,
    twoFactorEnabled: user.twoFactorEnabled ?? false,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime("10h")
    .sign(getSecret());
}

// Short-lived token issued right after a correct password when the account
// has 2FA enabled. It only carries the user id, not their profile/permissions
// — a full session token is issued once the authenticator code checks out.
export async function createPendingTwoFactorToken(userId: string) {
  return new SignJWT({ pending2fa: true })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(getSecret());
}

export async function verifyPendingTwoFactorToken(token?: string): Promise<string | null> {
  if (!token) {
    return null;
  }

  try {
    const { payload } = await jwtVerify(token, getSecret());
    if (!payload.sub || payload.pending2fa !== true) {
      return null;
    }

    return payload.sub;
  } catch {
    return null;
  }
}

// Reads user data directly from the signed JWT payload — no DB query needed.
// Security trade-off: if a user is deleted or their permissions change,
// the session remains valid until the JWT expires (10 hours).
// Emergency invalidation: rotate AUTH_SECRET to invalidate all sessions instantly.
export async function verifySessionToken(token?: string): Promise<SessionUser | null> {
  if (!token) {
    return null;
  }

  try {
    const { payload } = await jwtVerify(token, getSecret());
    if (!payload.sub || !payload.email || !payload.name || !payload.role) {
      return null;
    }

    return {
      id: payload.sub,
      name: String(payload.name),
      email: String(payload.email),
      role: String(payload.role),
      initials: String(payload.initials ?? ""),
      color: String(payload.color ?? "#2563eb"),
      permissions: Array.isArray(payload.permissions)
        ? (payload.permissions as PermissionKey[])
        : [],
      deviceGroupCode: payload.deviceGroupCode
        ? String(payload.deviceGroupCode)
        : undefined,
      mustChangePassword: Boolean(payload.mustChangePassword),
      twoFactorEnabled: Boolean(payload.twoFactorEnabled),
    };
  } catch {
    return null;
  }
}

export async function verifyPassword(password: string, storedHash?: string) {
  if (!storedHash) {
    return false;
  }

  return bcrypt.compare(password, storedHash);
}

// Narrowed to just the two fields actually used (rather than requiring a
// full SessionUser) so callers like isAssignableTaskUser can check an
// arbitrary candidate user's permissions, not only the viewer's own.
export function hasPermission(
  user: Pick<SessionUser, "role" | "permissions"> | null,
  permission: PermissionKey,
) {
  if (!user) {
    return false;
  }

  return user.role === "admin" || user.permissions.includes(permission);
}

export function isAdmin(user: SessionUser | null) {
  return user?.role === "admin";
}
