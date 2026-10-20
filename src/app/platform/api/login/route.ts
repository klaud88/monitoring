import { NextResponse, type NextRequest } from "next/server";
import { checkPlatformCredentials } from "@/lib/platform-auth";
import {
  createPlatformToken,
  isPlatformConfigured,
  PLATFORM_SESSION_SECONDS,
} from "@/lib/platform-session";
import { clearLoginAttempts, getClientIp, isLoginRateLimited, recordFailedLogin } from "@/lib/rate-limit";
import { PLATFORM_COOKIE, shouldUseSecureCookie } from "@/lib/session";

export async function POST(request: NextRequest) {
  if (process.env.PORTAL_MODE !== "1" || !isPlatformConfigured()) {
    return NextResponse.json({ message: "Not found" }, { status: 404 });
  }

  const ip = getClientIp(request);
  if (isLoginRateLimited(ip)) {
    return NextResponse.json(
      { message: "ძალიან ბევრი მცდელობა. სცადეთ მოგვიანებით." },
      { status: 429 },
    );
  }

  const body = await request.json().catch(() => null);
  const email = String(body?.email || "");
  const password = String(body?.password || "");
  const code = String(body?.code || "");

  if (!(await checkPlatformCredentials(email, password, code))) {
    recordFailedLogin(ip);
    console.warn(`[platform] failed login from ${ip}`);
    return NextResponse.json(
      { message: "არასწორი ელფოსტა, პაროლი ან კოდი." },
      { status: 401 },
    );
  }

  clearLoginAttempts(ip);
  const response = NextResponse.json({ ok: true });
  response.cookies.set(PLATFORM_COOKIE, await createPlatformToken(email.trim().toLowerCase()), {
    httpOnly: true,
    sameSite: "strict",
    secure: shouldUseSecureCookie(),
    // Pages and API both sit under /platform; organisation processes on the
    // same domain never receive this cookie.
    path: "/platform",
    maxAge: PLATFORM_SESSION_SECONDS,
  });
  return response;
}
