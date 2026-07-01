import { jwtVerify } from "jose";
import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/session";
import { isLoginRateLimited } from "@/lib/rate-limit";

const publicRoutes = ["/login", "/api/auth/login", "/api/auth/change-password", "/api/cron/offline-capture"];

const MUTATION_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const ALLOWED_ORIGINS = process.env.APP_URL ? [process.env.APP_URL] : [];

function getSecret() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("AUTH_SECRET environment variable is not set.");
  }
  return new TextEncoder().encode(secret);
}

function getClientIp(request: NextRequest): string {
  return (
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
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
  const isPublic = publicRoutes.some((route) => pathname === route || pathname.startsWith(`${route}/`));
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const valid = await isValidSession(token);
  const ip = getClientIp(request);

  // Rate limit login endpoint
  if (pathname === "/api/auth/login" && request.method === "POST") {
    if (isLoginRateLimited(ip)) {
      return NextResponse.json(
        { message: "ძალიან ბევრი მცდელობა. სცადეთ მოგვიანებით." },
        { status: 429 },
      );
    }
  }

  if (isPublic) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api") && !valid) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  if (!valid) {
    const loginUrl = new URL("/login", request.url);
    if (pathname !== "/") {
      loginUrl.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
    }
    return NextResponse.redirect(loginUrl);
  }

  // CSRF: reject cross-origin mutation requests
  if (MUTATION_METHODS.has(request.method) && pathname.startsWith("/api")) {
    const origin = request.headers.get("origin");
    if (origin && ALLOWED_ORIGINS.length > 0 && !ALLOWED_ORIGINS.includes(origin)) {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
