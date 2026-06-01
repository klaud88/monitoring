export const SESSION_COOKIE = "biostar_session";

export function shouldUseSecureCookie(request: {
  headers: Headers;
  nextUrl: { protocol: string };
}) {
  return (
    request.headers.get("x-forwarded-proto") === "https" ||
    request.nextUrl.protocol === "https:" ||
    process.env.APP_URL?.startsWith("https://")
  );
}
