import { NextResponse, type NextRequest } from "next/server";
import { clearSessionPermissionCache } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { isFeatureKnown, isFeatureLocked } from "@/lib/feature-flags";
import { getDisabledFeatures, setDisabledFeatures } from "@/lib/features";
import { isInternalRequest } from "@/lib/internal-auth";

/*
 * This organisation's switched-off features, read and replaced by the
 * platform admin page in the portal (src/app/platform). Guarded like
 * login-identifiers: localhost + PORTAL_SYNC_SECRET.
 */
export async function GET(request: NextRequest) {
  if (!isInternalRequest(request)) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({ disabled: await getDisabledFeatures() });
}

export async function PUT(request: NextRequest) {
  if (!isInternalRequest(request)) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (!Array.isArray(body?.disabled)) {
    return NextResponse.json({ message: "disabled must be an array" }, { status: 400 });
  }

  const keys = [...new Set((body.disabled as unknown[]).map(String))];
  const invalid = keys.filter((key) => !isFeatureKnown(key) || isFeatureLocked(key));
  if (invalid.length) {
    return NextResponse.json(
      { message: `Unknown or locked features: ${invalid.join(", ")}` },
      { status: 400 },
    );
  }

  const before = await getDisabledFeatures();
  const disabled = await setDisabledFeatures(keys);
  if (!disabled) {
    return NextResponse.json({ message: "Database unavailable" }, { status: 503 });
  }
  clearSessionPermissionCache();

  await logAudit({
    userId: "platform",
    action: "features.update",
    entityType: "organisation",
    metadata: { before, after: disabled },
    ipAddress: request.headers.get("x-forwarded-for") ?? undefined,
    userAgent: request.headers.get("user-agent") ?? undefined,
  });

  return NextResponse.json({ disabled });
}
