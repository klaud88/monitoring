import { NextResponse } from "next/server";
import { PLATFORM_COOKIE } from "@/lib/session";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.delete({ name: PLATFORM_COOKIE, path: "/platform" });
  return response;
}
