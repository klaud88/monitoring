import { NextResponse, type NextRequest } from "next/server";
import { isInternalRequest } from "@/lib/internal-auth";
import { getUserOverview } from "@/lib/overview";

/*
 * This organisation's user counts for the platform admin page in the portal
 * (src/app/platform). Guarded like /api/internal/features.
 */
export async function GET(request: NextRequest) {
  if (!isInternalRequest(request)) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const users = await getUserOverview();
  if (!users) {
    return NextResponse.json({ message: "Database unavailable" }, { status: 503 });
  }
  return NextResponse.json({ users });
}
