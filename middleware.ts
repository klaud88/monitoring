import { jwtVerify } from "jose";
import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/session";

const publicRoutes = ["/login", "/api/auth/login", "/api/cron/offline-capture"];
const fallbackSecret = "development-only-secret-change-before-production";

function getSecret() {
  return new TextEncoder().encode(process.env.AUTH_SECRET || fallbackSecret);
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

  if (pathname === "/login" && valid) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  if (isPublic) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api") && !valid) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  if (!valid) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"]
};
