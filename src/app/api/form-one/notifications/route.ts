import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, hasPermission, verifySessionToken } from "@/lib/auth";
import { getFormOneNotifications } from "@/lib/repositories";

export async function GET(request: NextRequest) {
  const user = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (!hasPermission(user, "form_one.view")) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const canRespondToCompletion = hasPermission(
    user,
    "form_one.completion_response",
  );
  const notifications = await getFormOneNotifications(user);

  return NextResponse.json({
    notifications: notifications.filter(
      (notification) =>
        notification.type !== "completion_request" || canRespondToCompletion,
    ),
  });
}
