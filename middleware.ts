import { jwtVerify } from "jose";
import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, TENANT_COOKIE } from "@/lib/session";

const publicRoutes = [
  "/login",
  "/api/auth/login",
  // Second step of a 2FA login: the password already checked out, but no
  // full session cookie exists yet, so this can't require one — it reads
  // its own short-lived pending-2FA cookie instead (see /lib/auth.ts).
  "/api/auth/login/2fa",
  // change-password is intentionally NOT here: the user already holds a
  // full session cookie when calling it (including the forced-reset flow,
  // which gets its session at login), so there's no reason to exempt it
  // from middleware's session check or the CSRF origin check below — it
  // should be defended exactly like every other mutating route.
  "/api/cron/offline-capture",
  "/api/cron/status-poll",
  // Called by the portal on localhost; guarded by PORTAL_SYNC_SECRET.
  "/api/internal/login-identifiers",
];

const MUTATION_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const ALLOWED_ORIGINS = process.env.APP_URL
  ? [process.env.APP_URL.replace(/\/+$/, "")]
  : [];

function getSecret() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("AUTH_SECRET environment variable is not set.");
  }
  return new TextEncoder().encode(secret);
}

async function isValidSession(token?: string) {
  if (!token) {
    return false;
  }

  try {
    await jwtVerify(token, getSecret());
    return true;
  } catch {
    return false;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // The portal process only serves the login page and the login call it
  // forwards to an organisation; it holds no data of its own.
  if (process.env.PORTAL_MODE === "1") {
    if (pathname === "/login" || pathname === "/api/auth/login") {
      return NextResponse.next();
    }
    if (pathname.startsWith("/api")) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const isPublic = publicRoutes.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const valid = await isValidSession(token);

  // Login rate limiting lives in the route handler itself
  // (src/app/api/auth/login/route.ts), not here — middleware runs in the
  // Edge runtime and the route runs in the Node.js runtime, so a check
  // here would consult a separate, always-empty copy of the in-memory
  // attempt counter and never actually block anything.

  // Behind the portal, an organisation process never shows its own login
  // page: without a valid session it drops the routing cookie and sends
  // the browser back to the portal (same URL, nginx now routes there), so
  // a user of any organisation can sign in on this browser.
  const routedByPortal =
    Boolean(process.env.TENANT_SLUG) && request.cookies.has(TENANT_COOKIE);
  if (
    routedByPortal &&
    !valid &&
    !pathname.startsWith("/api") &&
    (!isPublic || pathname === "/login")
  ) {
    const loginUrl = new URL("/login", request.url);
    if (pathname !== "/" && pathname !== "/login") {
      loginUrl.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
    }
    const response = NextResponse.redirect(loginUrl);
    response.cookies.delete(TENANT_COOKIE);
    return response;
  }

  if (isPublic) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api") && !valid) {
    const response = NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    if (routedByPortal) {
      response.cookies.delete(TENANT_COOKIE);
    }
    return response;
  }

  if (!valid) {
    const loginUrl = new URL("/login", request.url);
    if (pathname !== "/") {
      loginUrl.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
    }
    return NextResponse.redirect(loginUrl);
  }

  // CSRF: reject cross-origin mutation requests. Fails CLOSED: if
  // APP_URL is ever unset/misconfigured (ALLOWED_ORIGINS empty) or a
  // mutating request arrives with no Origin header at all, that's treated
  // as untrusted rather than silently allowed through — a same-origin
  // browser request always sends a matching Origin on state-changing
  // methods, so neither case should occur in normal operation.
  if (MUTATION_METHODS.has(request.method) && pathname.startsWith("/api")) {
    const origin = request.headers.get("origin");
    if (ALLOWED_ORIGINS.length === 0 || !origin || !ALLOWED_ORIGINS.includes(origin)) {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
