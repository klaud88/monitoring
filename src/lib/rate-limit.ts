import type { NextRequest } from "next/server";

// nginx sits directly in front of this app and forwards with
// `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for`, which
// APPENDS its own observed $remote_addr to whatever X-Forwarded-For the
// client already sent — it never strips a client-supplied value. That
// means the FIRST entry is attacker-controlled (trivially spoofable to
// defeat the rate limiter below) and the LAST entry is always the one
// nginx itself appended, which a client cannot forge. Cloudflare is not in
// front of this deployment (its DNS resolves straight to the origin IP),
// so cf-connecting-ip isn't a trustworthy signal here either and is no
// longer consulted.
export function getClientIp(request: NextRequest): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (!forwardedFor) {
    return "unknown";
  }

  const parts = forwardedFor.split(",").map((part) => part.trim()).filter(Boolean);
  return parts[parts.length - 1] ?? "unknown";
}

const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 10;

export function isLoginRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry || now >= entry.resetAt) return false;
  return entry.count >= LOGIN_MAX_ATTEMPTS;
}

export function recordFailedLogin(ip: string) {
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry || now >= entry.resetAt) {
    loginAttempts.set(ip, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
  } else {
    entry.count += 1;
  }
}

export function clearLoginAttempts(ip: string) {
  loginAttempts.delete(ip);
}
