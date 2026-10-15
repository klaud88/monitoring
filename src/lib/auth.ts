import bcrypt from "bcryptjs";
import { jwtVerify, SignJWT } from "jose";
import { queryRows } from "./db";
import { hasPermission, isAdmin } from "./permissions";
import { SESSION_COOKIE } from "./session";
import type { AppUser, PermissionKey, SessionUser } from "./types";

export { SESSION_COOKIE, hasPermission, isAdmin };

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
type LiveAccess = { active: boolean; role: string; permissions: PermissionKey[] };

const LIVE_ACCESS_TTL_MS = 10_000;
const liveAccessCache = new Map<string, { at: number; value: LiveAccess | null }>();

/** Drops cached role/permission lookups, e.g. right after roles are saved. */
export function clearSessionPermissionCache() {
  liveAccessCache.clear();
}

/* The JWT only proves who the user is. Role and permissions come from the
   database (cached briefly), so changes on the Permissions page apply
   within seconds instead of at the next login, and a deleted or disabled
   user loses access straight away. Returns undefined when the database
   can't be reached, so callers fall back to what the token says. */
async function getLiveAccess(userId: string): Promise<LiveAccess | null | undefined> {
  const cached = liveAccessCache.get(userId);
  if (cached && Date.now() - cached.at < LIVE_ACCESS_TTL_MS) {
    return cached.value;
  }

  const rows = await queryRows<{
    is_active: number | boolean;
    role_name: string;
    permissions: string | null;
  }>(
    `
      select
        u.is_active,
        r.name as role_name,
        group_concat(distinct p.code order by p.code separator ',') as permissions
      from users u
      join roles r on r.id = u.role_id
      left join role_permissions rp on rp.role_id = r.id
      left join permissions p on p.id = rp.permission_id
      where u.id = ?
      group by u.id, u.is_active, r.name
      limit 1
    `,
    [userId],
  ).catch(() => null);

  if (!rows) {
    return undefined;
  }

  const row = rows[0];
  const value: LiveAccess | null = row
    ? {
        active: Boolean(Number(row.is_active)),
        role: String(row.role_name),
        permissions: (row.permissions ?? "")
          .split(",")
          .filter(Boolean) as PermissionKey[],
      }
    : null;
  liveAccessCache.set(userId, { at: Date.now(), value });
  return value;
}

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

    const live = await getLiveAccess(payload.sub);
    if (live === null || (live && !live.active)) {
      // Deleted or disabled since this token was issued.
      return null;
    }

    return {
      id: payload.sub,
      name: String(payload.name),
      email: String(payload.email),
      role: live?.role ?? String(payload.role),
      initials: String(payload.initials ?? ""),
      color: String(payload.color ?? "#2563eb"),
      permissions:
        live?.permissions ??
        (Array.isArray(payload.permissions)
          ? (payload.permissions as PermissionKey[])
          : []),
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

