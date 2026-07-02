import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { getAuditLogs } from "@/lib/repositories";

export async function GET(request: NextRequest) {
  const user = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (!user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ message: "Forbidden" }, { status: 403 });

  const sp = request.nextUrl.searchParams;
  const result = await getAuditLogs({
    page:       sp.has("page")       ? Number(sp.get("page"))     : 1,
    pageSize:   sp.has("pageSize")   ? Number(sp.get("pageSize")) : 50,
    action:     sp.get("action")     ?? undefined,
    entityType: sp.get("entityType") ?? undefined,
    userId:     sp.get("userId")     ?? undefined,
    from:       sp.get("from")       ?? undefined,
    to:         sp.get("to")         ?? undefined,
  });

  return NextResponse.json(result);
}

export async function POST(request: NextRequest) {
  const user = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  if (!user || user.role !== "admin") {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const action = String(body?.action || "");
  const entityType = String(body?.entityType || "");

  if (!action || !entityType) {
    return NextResponse.json({ message: "Invalid audit payload" }, { status: 400 });
  }

  await logAudit({
    userId: user.id,
    action,
    entityType,
    entityId: body?.entityId ? String(body.entityId) : undefined,
    metadata: body?.metadata && typeof body.metadata === "object" ? body.metadata : undefined,
    ipAddress: request.headers.get("x-forwarded-for") ?? undefined,
    userAgent: request.headers.get("user-agent") ?? undefined
  });

  return NextResponse.json({ ok: true });
}
