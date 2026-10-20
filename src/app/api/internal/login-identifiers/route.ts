import { NextResponse, type NextRequest } from "next/server";
import { isInternalRequest } from "@/lib/internal-auth";
import { getLoginIdentifiers } from "@/lib/repositories";

/*
 * Lets the portal (src/lib/portal.ts) learn which login identifiers belong
 * to this organisation. Disabled unless PORTAL_SYNC_SECRET is set; the
 * portal calls it on localhost with that secret as a bearer token.
 */
export async function GET(request: NextRequest) {
  if (!isInternalRequest(request)) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const identifiers = await getLoginIdentifiers();
  if (!identifiers) {
    return NextResponse.json({ message: "Database unavailable" }, { status: 503 });
  }

  return NextResponse.json({ identifiers });
}
