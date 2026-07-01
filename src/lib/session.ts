export const SESSION_COOKIE = "biostar_session";

export function shouldUseSecureCookie() {
  return process.env.NODE_ENV === "production";
}
