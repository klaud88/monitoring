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

  const result = await syncBiostarDevices({ force: true });
  return NextResponse.json(result);
}
