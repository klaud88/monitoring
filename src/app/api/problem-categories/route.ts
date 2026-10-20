import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, hasPermission, isAdmin, verifySessionToken } from "@/lib/auth";
import { canUseAdminFeature } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { readProblemCategoryInput } from "@/lib/problem-category-input";
import { getProblemCategories, saveProblemCategory } from "@/lib/repositories";

export async function GET(request: NextRequest) {
  const user = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (!hasPermission(user, "problem_reports.view")) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  // The full list (disabled, deleted, links) is for the admin page only;
  // everyone else gets the active titles the report form offers.
  if (isAdmin(user) && request.nextUrl.searchParams.get("all") === "1") {
    return NextResponse.json({
      categories: await getProblemCategories({ includeDeleted: true }),
    });
  }

  const categories = await getProblemCategories({ activeOnly: true });
  return NextResponse.json({
    categories: categories.map(({ id, title }) => ({ id, title })),
  });
}

export async function POST(request: NextRequest) {
  const user = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (!canUseAdminFeature(user, "problem_categories")) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const input = await readProblemCategoryInput(await request.json().catch(() => null));
  if (!input.title) {
    return NextResponse.json({ message: "სათაური აუცილებელია." }, { status: 400 });
  }

  const category = await saveProblemCategory(
    {
      title: input.title,
      userIds: input.userIds ?? [],
      roleIds: input.roleIds ?? [],
      isActive: input.isActive,
    },
    { createdBy: user!.id },
  );
  if (!category) {
    return NextResponse.json({ message: "შენახვა ვერ მოხერხდა." }, { status: 500 });
  }

  await logAudit({
    userId: user!.id,
    action: "problem_category.create",
    entityType: "problem_category",
    entityId: category.id,
    metadata: { title: category.title, userIds: category.userIds, roleIds: category.roleIds },
    ipAddress: request.headers.get("x-forwarded-for") ?? undefined,
    userAgent: request.headers.get("user-agent") ?? undefined,
  });

  return NextResponse.json({ category }, { status: 201 });
}
