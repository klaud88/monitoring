import { NextResponse, type NextRequest } from "next/server";
import {
  SESSION_COOKIE,
  clearSessionPermissionCache,
  isAdmin,
  verifySessionToken,
} from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { getUserById, restoreUser } from "@/lib/repositories";

/* Reactivates a deleted account as it was (role, gardens, password). Same
   boundary as deleting one: admin status. */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const actor = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (!isAdmin(actor)) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const { id } = await context.params;
  const restored = await restoreUser(id);
  clearSessionPermissionCache();
  if (!restored) {
    return NextResponse.json({ message: "User not found" }, { status: 404 });
  }

  await logAudit({
    userId: actor!.id,
    action: "user.restore",
    entityType: "user",
    entityId: id,
    ipAddress: request.headers.get("x-forwarded-for") ?? undefined,
    userAgent: request.headers.get("user-agent") ?? undefined,
  });

  return NextResponse.json({ user: await getUserById(id) });
}
