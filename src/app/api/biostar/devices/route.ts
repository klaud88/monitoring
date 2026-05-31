import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, hasPermission, verifySessionToken } from "@/lib/auth";
import { fetchBiostarDevicesResponse } from "@/lib/biostar";

export async function GET(request: NextRequest) {
  const user = await verifySessionToken(
    request.cookies.get(SESSION_COOKIE)?.value,
  );
  if (!hasPermission(user, "offline_records.view")) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const response = await fetchBiostarDevicesResponse();
  return NextResponse.json({
    loginUrl: response.loginUrl,
    devicesUrl: response.devicesUrl,
    loginStatus: response.loginStatus,
    devicesStatus: response.devicesStatus,
    sessionHeader: "present",
    payload: response.payload,
  });
}
