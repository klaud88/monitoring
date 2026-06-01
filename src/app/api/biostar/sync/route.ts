import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, hasPermission, verifySessionToken } from "@/lib/auth";
import { syncBiostarDevices } from "@/lib/repositories";

export async function POST(request: NextRequest) {
  const user = await verifySessionToken(
    request.cookies.get(SESSION_COOKIE)?.value,
  );
  if (
    !hasPermission(user, "dashboard.view") &&
    !hasPermission(user, "offline_records.edit")
  ) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  try {
    const result = await syncBiostarDevices({ force: true });
    return NextResponse.json(result);
  } catch (error) {
    console.warn(
      `[biostar] ${error instanceof Error ? error.message : "Sync failed"}`,
    );
    return NextResponse.json(
      {
        message: "BioStar sync failed.",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 502 },
    );
  }
}
