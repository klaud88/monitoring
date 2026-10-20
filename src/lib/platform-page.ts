import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { isPlatformConfigured, verifyPlatformToken } from "./platform-session";
import { PLATFORM_COOKIE } from "./session";

/** Server pages under /platform: portal process only, platform admin only. */
export async function requirePlatformAdmin() {
  if (process.env.PORTAL_MODE !== "1" || !isPlatformConfigured()) {
    notFound();
  }
  const cookieStore = await cookies();
  if (!(await verifyPlatformToken(cookieStore.get(PLATFORM_COOKIE)?.value))) {
    redirect("/platform/login");
  }
}
