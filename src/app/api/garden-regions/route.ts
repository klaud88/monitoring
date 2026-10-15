import { NextResponse, type NextRequest } from "next/server";
import { logAudit } from "@/lib/audit";
import { SESSION_COOKIE, hasPermission, verifySessionToken } from "@/lib/auth";
import { getDevices, setGardenRegion } from "@/lib/repositories";

/** Sets a garden's region; all its devices move with it. */
export async function PUT(request: NextRequest) {
  const user = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (!hasPermission(user, "devices.edit")) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const gardenKey = String(body?.gardenKey || "").trim();
  const region = body?.region ? String(body.region).trim() : null;
  if (!gardenKey) {
    return NextResponse.json({ message: "gardenKey is required" }, { status: 400 });
  }

  const saved = await setGardenRegion(gardenKey, region);
  if (!saved) {
    return NextResponse.json({ message: "რაიონი ვერ მოიძებნა." }, { status: 400 });
  }

  await logAudit({
    userId: user!.id,
    action: "garden_region.update",
    entityType: "garden",
    entityId: saved.gardenKey,
    metadata: { region: saved.region },
    ipAddress: request.headers.get("x-forwarded-for") ?? undefined,
    userAgent: request.headers.get("user-agent") ?? undefined,
  });

  // The page swaps in each device's new region from this list.
  const devices = (await getDevices()).map(({ id, region: deviceRegion }) => ({
    id,
    region: deviceRegion,
  }));
  return NextResponse.json({ ...saved, devices });
}
