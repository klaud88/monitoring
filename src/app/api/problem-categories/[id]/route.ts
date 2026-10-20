import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { canUseAdminFeature } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { readProblemCategoryInput } from "@/lib/problem-category-input";
import { saveProblemCategory } from "@/lib/repositories";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const user = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (!canUseAdminFeature(user, "problem_categories")) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  const input = await readProblemCategoryInput(body);
  if (input.title !== undefined && !input.title) {
    return NextResponse.json({ message: "სათაური აუცილებელია." }, { status: 400 });
  }
  const restore = body?.restore === true;

  const category = await saveProblemCategory({
    id,
    ...input,
    deleted: restore ? false : undefined,
  });
  if (!category) {
    return NextResponse.json({ message: "Category not found" }, { status: 404 });
  }

  await logAudit({
    userId: user!.id,
    action: restore ? "problem_category.restore" : "problem_category.update",
    entityType: "problem_category",
    entityId: id,
    metadata: {
      title: category.title,
      isActive: category.isActive,
      userIds: category.userIds,
      roleIds: category.roleIds,
    },
    ipAddress: request.headers.get("x-forwarded-for") ?? undefined,
    userAgent: request.headers.get("user-agent") ?? undefined,
  });

  return NextResponse.json({ category });
}

/** Soft delete: the category moves to the "deleted" tab and can be restored. */
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const user = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (!canUseAdminFeature(user, "problem_categories")) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const { id } = await context.params;
  const category = await saveProblemCategory({ id, deleted: true });
  if (!category) {
    return NextResponse.json({ message: "Category not found" }, { status: 404 });
  }

  await logAudit({
    userId: user!.id,
    action: "problem_category.delete",
    entityType: "problem_category",
    entityId: id,
    metadata: { title: category.title },
    ipAddress: request.headers.get("x-forwarded-for") ?? undefined,
    userAgent: request.headers.get("user-agent") ?? undefined,
  });

  return NextResponse.json({ category });
}
