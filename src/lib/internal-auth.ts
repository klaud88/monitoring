import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";

/*
 * Guards /api/internal/*: the portal calls them on localhost with
 * PORTAL_SYNC_SECRET as a bearer token. Without the secret set they are off.
 *
 * Also localhost only. Next fills X-Forwarded-For with the socket address
 * when it is absent, and nginx appends the real client address to it, so a
 * request that came through nginx always carries a non-loopback entry.
 */
export function isInternalRequest(request: NextRequest) {
  const secret = process.env.PORTAL_SYNC_SECRET || "";
  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  return Boolean(secret) && isFromLoopback(request) && safeEqual(provided, secret);
}

function isFromLoopback(request: NextRequest) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (!forwardedFor) {
    return false;
  }
  return forwardedFor
    .split(",")
    .map((part) => part.trim())
    .every((address) =>
      /^(127\.\d+\.\d+\.\d+|::1|::ffff:127\.\d+\.\d+\.\d+)$/.test(address),
    );
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
