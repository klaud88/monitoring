import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, hasPermission, verifySessionToken } from "@/lib/auth";
import { syncBiostarDevices } from "@/lib/repositories";

/**
 * The short-interval poll (run it every ~5 minutes). It only pulls BioStar2
 * statuses, which is what opens and closes the offline periods every device's
 * history is built from. The daily 09:00 picture stays in /api/cron/offline-capture.
 */
export async function POST(request: NextRequest) {
  const user = await verifySessionToken(
    request.cookies.get(SESSION_COOKIE)?.value,
  );
  const secret = process.env.OFFLINE_CAPTURE_SECRET;
  const authorization = request.headers.get("authorization");
  const hasCronSecret = Boolean(secret && authorization === `Bearer ${secret}`);

  if (!hasCronSecret && !hasPermission(user, "offline_records.create")) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    // force: the cron schedule is the rate limit, not the in-process TTL.
    const result = await syncBiostarDevices({ force: true });
    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "BioStar sync failed";
    console.warn(`[biostar] ${message}`);
    return NextResponse.json({ message }, { status: 502 });
  }
}
