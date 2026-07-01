import bcrypt from "bcryptjs";
import { NextResponse, type NextRequest } from "next/server";
import { createSessionToken, SESSION_COOKIE, verifyPassword, verifySessionToken } from "@/lib/auth";
import { changeUserPassword, getUserByEmail } from "@/lib/repositories";
import { shouldUseSecureCookie } from "@/lib/session";

export async function POST(request: NextRequest) {
  const user = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const newPassword = String(body?.newPassword || "").trim();
  const currentPassword = String(body?.currentPassword || "");

  if (!newPassword || newPassword.length < 8) {
    return NextResponse.json(
      { message: "პაროლი მინიმუმ 8 სიმბოლო უნდა იყოს." },
      { status: 400 },
    );
  }

  // When mustChangePassword is set, skip current password check (admin-forced reset flow)
  if (!user.mustChangePassword) {
    if (!currentPassword) {
      return NextResponse.json(
        { message: "მიმდინარე პაროლის შეყვანა სავალდებულოა." },
        { status: 400 },
      );
    }

    const fullUser = await getUserByEmail(user.email);
    const isCurrentValid = await verifyPassword(currentPassword, fullUser?.passwordHash);
    if (!isCurrentValid) {
      return NextResponse.json(
        { message: "მიმდინარე პაროლი არასწორია." },
        { status: 400 },
      );
    }
  }

  const newHash = await bcrypt.hash(newPassword, 10);
  const changed = await changeUserPassword(user.id, newHash);

  if (!changed) {
    return NextResponse.json({ message: "პაროლის შეცვლა ვერ მოხერხდა." }, { status: 500 });
  }

  // Issue a fresh token with mustChangePassword cleared
  const updatedUser = { ...user, mustChangePassword: false };
  const token = await createSessionToken(updatedUser);
  const response = NextResponse.json({ ok: true });

  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "strict",
    secure: shouldUseSecureCookie(),
    path: "/",
    maxAge: 60 * 60 * 10,
  });

  return response;
}
