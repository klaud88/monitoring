export const SESSION_COOKIE = "biostar_session";
// Short-lived cookie that names the user mid-login, once the password
// checked out but their authenticator-app code hasn't been verified yet.
export const PENDING_2FA_COOKIE = "biostar_2fa_pending";

export function shouldUseSecureCookie() {
  return process.env.NODE_ENV === "production";
}
