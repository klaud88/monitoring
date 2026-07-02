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
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime("10h")
    .sign(getSecret());
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

export function hasPermission(user: SessionUser | null, permission: PermissionKey) {
  if (!user) {
    return false;
  }

  return user.role === "admin" || user.permissions.includes(permission);
}

export function isAdmin(user: SessionUser | null) {
  return user?.role === "admin";
}
