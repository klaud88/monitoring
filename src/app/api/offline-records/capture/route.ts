import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, hasPermission, verifySessionToken } from "@/lib/auth";
import { captureDailyOfflineSnapshot } from "@/lib/repositories";

export async function POST(request: NextRequest) {
  const user = await verifySessionToken(
    request.cookies.get(SESSION_COOKIE)?.value,
  );
  if (!hasPermission(user, "offline_records.create")) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const snapshot = await captureDailyOfflineSnapshot();
  return NextResponse.json({ snapshot }, { status: 201 });
}
