import { NextResponse, type NextRequest } from "next/server";
import { logAudit } from "@/lib/audit";
import { SESSION_COOKIE, hasPermission, verifySessionToken } from "@/lib/auth";
import { normalizeTaskTagName } from "@/lib/catalog";
import {
  getDeletedTaskTagNames,
  getTaskTagNames,
  restoreTaskTag,
} from "@/lib/repositories";

/* Brings a deleted task tag back onto every task and report that had it. */
export async function POST(request: NextRequest) {
  const user = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (
    !hasPermission(user, "tasks.tag_delete") &&
    !hasPermission(user, "problem_reports.tag_delete")
  ) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const tagName = normalizeTaskTagName(body?.name);
  if (!tagName) {
    return NextResponse.json({ message: "Tag name is required" }, { status: 400 });
  }

  const restored = await restoreTaskTag(tagName);
  if (!restored) {
    return NextResponse.json({ message: "Tag not found" }, { status: 404 });
  }

  await logAudit({
    userId: user!.id,
    action: "task_tag.restore",
    entityType: "task_tag",
    entityId: tagName,
    metadata: { tag: tagName },
    ipAddress: request.headers.get("x-forwarded-for") ?? undefined,
    userAgent: request.headers.get("user-agent") ?? undefined,
  });

  return NextResponse.json({
    ok: true,
    tags: await getTaskTagNames(),
    deletedTags: await getDeletedTaskTagNames(),
  });
}
