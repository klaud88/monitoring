import { NextResponse, type NextRequest } from "next/server";
import { logAudit } from "@/lib/audit";
import { SESSION_COOKIE, hasPermission, verifySessionToken } from "@/lib/auth";
import { setGardenTags } from "@/lib/repositories";

/** Replaces one garden's tags (device tag catalog) on the devices page. */
export async function PUT(request: NextRequest) {
  const user = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (!hasPermission(user, "devices.edit")) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const gardenKey = String(body?.gardenKey || "").trim();
  const requested = Array.isArray(body?.tags) ? body.tags.map(String) : null;
  if (!gardenKey || !requested) {
    return NextResponse.json({ message: "gardenKey and tags are required" }, { status: 400 });
  }

  const tags = await setGardenTags(gardenKey, requested);
  if (!tags) {
    return NextResponse.json({ message: "შენახვა ვერ მოხერხდა." }, { status: 500 });
  }

  await logAudit({
    userId: user!.id,
    action: "garden_tags.update",
    entityType: "garden",
    entityId: gardenKey,
    metadata: { tags },
    ipAddress: request.headers.get("x-forwarded-for") ?? undefined,
    userAgent: request.headers.get("user-agent") ?? undefined,
  });

  return NextResponse.json({ gardenKey, tags });
}
