import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, hasPermission, verifySessionToken } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { restoreRegion } from "@/lib/repositories";

/* Brings a soft-deleted region back, with the gardens that pointed at it. */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const user = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (!hasPermission(user, "regions.delete")) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const { id } = await context.params;
  const restored = await restoreRegion(id);
  if (!restored) {
    return NextResponse.json({ message: "Region not found" }, { status: 404 });
  }

  await logAudit({
    userId: user!.id,
    action: "region.restore",
    entityType: "region",
    entityId: id,
    ipAddress: request.headers.get("x-forwarded-for") ?? undefined,
    userAgent: request.headers.get("user-agent") ?? undefined,
  });

  return NextResponse.json({ ok: true });
}
