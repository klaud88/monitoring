import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, hasPermission, verifySessionToken } from "@/lib/auth";
import { captureDailyOfflineSnapshot, syncBiostarDevices } from "@/lib/repositories";

export async function POST(request: NextRequest) {
  const user = await verifySessionToken(
    request.cookies.get(SESSION_COOKIE)?.value,
  );
  const secret = process.env.OFFLINE_CAPTURE_SECRET;
  const authorization = request.headers.get("authorization");
  const hasCronSecret = Boolean(
    secret && authorization === `Bearer ${secret}`,
  );

  if (!hasCronSecret && !hasPermission(user, "offline_records.create")) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    await syncBiostarDevices({ force: true });
  } catch (error) {
    console.warn(`[biostar] ${error instanceof Error ? error.message : "Sync failed"}`);
  }

  const snapshot = await captureDailyOfflineSnapshot();
  return NextResponse.json({ snapshot }, { status: 201 });
}
