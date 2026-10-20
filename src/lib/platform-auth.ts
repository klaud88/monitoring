import bcrypt from "bcryptjs";
import { matchTotpCounter } from "./totp";

const DUMMY_HASH = "$2a$10$dummy.hash.to.prevent.timing.oracle.attacks.XXXXXXXX";

// Time step of the last code that logged in. A code is good for ~90s, so
// without this a code seen over someone's shoulder would work again. The
// portal is one process, so memory is enough.
let lastUsedCounter = -1;

/*
 * The one platform admin lives in portal.env, not in any organisation's
 * database: PLATFORM_ADMIN_EMAIL, PLATFORM_ADMIN_PASSWORD_HASH (bcrypt) and
 * PLATFORM_TOTP_SECRET. scripts/platform-admin.mjs generates them.
 */
export async function checkPlatformCredentials(
  email: string,
  password: string,
  code: string,
) {
  const expectedEmail = (process.env.PLATFORM_ADMIN_EMAIL || "").trim().toLowerCase();
  const hash = process.env.PLATFORM_ADMIN_PASSWORD_HASH || "";
  const totpSecret = process.env.PLATFORM_TOTP_SECRET || "";

  // Always run bcrypt, so a wrong email costs the same as a wrong password.
  const passwordOk = await bcrypt.compare(password, hash || DUMMY_HASH);
  if (
    !expectedEmail ||
    !hash ||
    !totpSecret ||
    email.trim().toLowerCase() !== expectedEmail ||
    !passwordOk
  ) {
    return false;
  }

  const counter = matchTotpCounter(totpSecret, code.replace(/\s+/g, ""));
  if (counter === null || counter <= lastUsedCounter) {
    return false;
  }
  lastUsedCounter = counter;
  return true;
}
