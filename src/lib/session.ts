export const SESSION_COOKIE = "biostar_session";
// Short-lived cookie that names the user mid-login, once the password
// checked out but their authenticator-app code hasn't been verified yet.
export const PENDING_2FA_COOKIE = "biostar_2fa_pending";
// Names the organisation whose process nginx routes this browser to when
// several organisations share one domain (see src/lib/portal.ts).
export const TENANT_COOKIE = "kgm_tenant";

export function shouldUseSecureCookie() {
  return process.env.NODE_ENV === "production";
}
