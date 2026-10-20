import { NextResponse, type NextRequest } from "next/server";
import { findPortalTenant, getTenantFeatures, setTenantFeatures } from "@/lib/platform";
import { verifyPlatformToken } from "@/lib/platform-session";
import { PLATFORM_COOKIE } from "@/lib/session";

type Context = { params: Promise<{ slug: string }> };

/* Middleware already requires the platform session; checked again here so
   the route never depends on the matcher alone. */
async function resolveTenant(request: NextRequest, context: Context) {
  if (!(await verifyPlatformToken(request.cookies.get(PLATFORM_COOKIE)?.value))) {
    return { error: NextResponse.json({ message: "Unauthorized" }, { status: 401 }) };
  }
  const { slug } = await context.params;
  const tenant = findPortalTenant(slug);
  if (!tenant) {
    return { error: NextResponse.json({ message: "Organisation not found" }, { status: 404 }) };
  }
  return { tenant };
}

export async function GET(request: NextRequest, context: Context) {
  const resolved = await resolveTenant(request, context);
  if (!resolved.tenant) {
    return resolved.error;
  }
  const result = await getTenantFeatures(resolved.tenant);
  return result.ok
    ? NextResponse.json({ disabled: result.disabled })
    : NextResponse.json({ message: result.message }, { status: result.status });
}

export async function PUT(request: NextRequest, context: Context) {
  const resolved = await resolveTenant(request, context);
  if (!resolved.tenant) {
    return resolved.error;
  }
  const body = await request.json().catch(() => null);
  if (!Array.isArray(body?.disabled)) {
    return NextResponse.json({ message: "disabled must be an array" }, { status: 400 });
  }
  const result = await setTenantFeatures(
    resolved.tenant,
    (body.disabled as unknown[]).map(String),
  );
  if (result.ok) {
    console.info(`[platform] ${resolved.tenant.slug}: disabled features -> ${result.disabled.join(", ") || "(none)"}`);
  }
  return result.ok
    ? NextResponse.json({ disabled: result.disabled })
    : NextResponse.json({ message: result.message }, { status: result.status });
}
