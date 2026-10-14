import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getLoginIdentifiers } from "@/lib/repositories";

/*
 * Lets the portal (src/lib/portal.ts) learn which login identifiers belong
 * to this organisation. Disabled unless PORTAL_SYNC_SECRET is set; the
 * portal calls it on localhost with that secret as a bearer token.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.PORTAL_SYNC_SECRET || "";
  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";

  if (!secret || !safeEqual(provided, secret)) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const identifiers = await getLoginIdentifiers();
  if (!identifiers) {
    return NextResponse.json({ message: "Database unavailable" }, { status: 503 });
  }

  return NextResponse.json({ identifiers });
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
