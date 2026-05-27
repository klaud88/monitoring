import bcrypt from "bcryptjs";
import { jwtVerify, SignJWT } from "jose";
import type { AppUser, PermissionKey, SessionUser } from "./types";

export const SESSION_COOKIE = "biostar_session";

const fallbackSecret = "development-only-secret-change-before-production";

function getSecret() {
  return new TextEncoder().encode(process.env.AUTH_SECRET || fallbackSecret);
}

export function sanitizeUser(user: AppUser): SessionUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    initials: user.initials,
    color: user.color,
    permissions: user.permissions
  };
}

export async function createSessionToken(user: AppUser | SessionUser) {
  return new SignJWT({
    name: user.name,
    email: user.email,
    role: user.role,
    initials: user.initials,
    color: user.color,
    permissions: user.permissions
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime("10h")
    .sign(getSecret());
}

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
      initials: String(payload.initials || "?"),
      color: String(payload.color || "#2563eb"),
      permissions: Array.isArray(payload.permissions)
        ? (payload.permissions as PermissionKey[])
        : []
    };
  } catch {
    return null;
  }
}

export async function verifyPassword(password: string, storedHash?: string) {
  if (!storedHash) {
    return false;
  }

  if (storedHash.startsWith("dev:")) {
    return process.env.NODE_ENV !== "production" && password === storedHash.slice(4);
  }

  return bcrypt.compare(password, storedHash);
}

export function hasPermission(user: SessionUser | null, permission: PermissionKey) {
  if (!user) {
    return false;
  }

  return user.role === "admin" || user.permissions.includes(permission);
}
