import { NextResponse, type NextRequest } from "next/server";
import { logAudit } from "@/lib/audit";
import { SESSION_COOKIE, hasPermission, verifySessionToken } from "@/lib/auth";
import { normalizeTaskTagName } from "@/lib/catalog";
import {
  createTaskTag,
  deleteTaskTag,
  renameTaskTag,
  getTaskTagNames,
  hasDeletedWith,
} from "@/lib/repositories";

export async function GET(request: NextRequest) {
  const user = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (!user) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({ tags: await getTaskTagNames() });
}

export async function POST(request: NextRequest) {
  const user = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (
    !hasPermission(user, "tasks.tag_create") &&
    !hasPermission(user, "problem_reports.tag_create")
  ) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const tagName = normalizeTaskTagName(body?.name);
  if (!tagName) {
    return NextResponse.json({ message: "Tag name is required" }, { status: 400 });
  }

  if (await hasDeletedWith("task_tags", "name", tagName)) {
    return NextResponse.json(
      { message: "ამ სახელით წაშლილი ტეგი არსებობს — აღადგინეთ ის." },
      { status: 409 },
    );
  }

  const tag = await createTaskTag(tagName);
  if (!tag) {
    return NextResponse.json({ message: "Tag name is invalid" }, { status: 400 });
  }

  await logAudit({
    userId: user!.id,
    action: "task_tag.create",
    entityType: "task_tag",
    entityId: tag,
    metadata: { tag },
    ipAddress: request.headers.get("x-forwarded-for") ?? undefined,
    userAgent: request.headers.get("user-agent") ?? undefined,
  });

  return NextResponse.json(
    { tag, tags: await getTaskTagNames() },
    { status: 201 },
  );
}

export async function DELETE(request: NextRequest) {
  const user = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (
    !hasPermission(user, "tasks.tag_delete") &&
    !hasPermission(user, "problem_reports.tag_delete")
  ) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const tagName = normalizeTaskTagName(
    body?.name ?? request.nextUrl.searchParams.get("name"),
  );
  if (!tagName) {
    return NextResponse.json({ message: "Tag name is required" }, { status: 400 });
  }

  const deleted = await deleteTaskTag(tagName);
  if (!deleted) {
    return NextResponse.json({ message: "Tag not found" }, { status: 404 });
  }

  await logAudit({
    userId: user!.id,
    action: "task_tag.delete",
    entityType: "task_tag",
    entityId: tagName,
    metadata: { tag: tagName },
    ipAddress: request.headers.get("x-forwarded-for") ?? undefined,
    userAgent: request.headers.get("user-agent") ?? undefined,
  });

  return NextResponse.json({ ok: true, tags: await getTaskTagNames() });
}


/** Renames a tag everywhere it is used; onto an existing name, merges them. */
export async function PATCH(request: NextRequest) {
  const user = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (
    !hasPermission(user, "tasks.tag_edit") &&
    !hasPermission(user, "problem_reports.tag_edit")
  ) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const tagName = normalizeTaskTagName(body?.name);
  const newName = normalizeTaskTagName(body?.newName);
  if (!tagName || !newName) {
    return NextResponse.json({ message: "Tag name is required" }, { status: 400 });
  }

  const renamed = await renameTaskTag(tagName, newName);
  if (!renamed) {
    return NextResponse.json({ message: "Tag not found" }, { status: 404 });
  }

  await logAudit({
    userId: user!.id,
    action: "task_tag.rename",
    entityType: "task_tag",
    entityId: renamed,
    metadata: { from: tagName, to: renamed },
    ipAddress: request.headers.get("x-forwarded-for") ?? undefined,
    userAgent: request.headers.get("user-agent") ?? undefined,
  });

  return NextResponse.json({ tag: renamed, tags: await getTaskTagNames() });
}
