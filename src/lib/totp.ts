import { createHmac, randomBytes, timingSafeEqual } from "crypto";

// RFC 4226 (HOTP) / RFC 6238 (TOTP): 30s step, 6 digits, HMAC-SHA1 — the
// parameters every authenticator app (Google Authenticator, Authy, 1Password,
// etc.) assumes when it isn't told otherwise.
const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const TOTP_STEP_SECONDS = 30;
const TOTP_DIGITS = 6;
const TOTP_WINDOW = 1; // accept the previous/next step too, for clock drift
const BACKUP_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I

export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

export function base32Encode(buffer: Buffer): string {
  let bits = "";
  for (const byte of buffer) {
    bits += byte.toString(2).padStart(8, "0");
  }

  let output = "";
  for (let i = 0; i + 5 <= bits.length; i += 5) {
    output += BASE32_ALPHABET[parseInt(bits.slice(i, i + 5), 2)];
  }

  const remainder = bits.length % 5;
  if (remainder > 0) {
    const lastChunk = bits.slice(bits.length - remainder).padEnd(5, "0");
    output += BASE32_ALPHABET[parseInt(lastChunk, 2)];
  }

  return output;
}

export function base32Decode(input: string): Buffer {
  const cleaned = input.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = "";
  for (const char of cleaned) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) continue;
    bits += index.toString(2).padStart(5, "0");
  }

  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }

  return Buffer.from(bytes);
}

function hotp(secret: Buffer, counter: number): string {
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));

  const hmac = createHmac("sha1", secret).update(counterBuffer).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  return String(binary % 10 ** TOTP_DIGITS).padStart(TOTP_DIGITS, "0");
}

export function generateTotpToken(secretBase32: string, forTime: number = Date.now()): string {
  const counter = Math.floor(forTime / 1000 / TOTP_STEP_SECONDS);
  return hotp(base32Decode(secretBase32), counter);
}

/** Accepts a code from the current step or the one immediately before/after it. */
export function verifyTotpToken(secretBase32: string, token: string, window = TOTP_WINDOW): boolean {
  return matchTotpCounter(secretBase32, token, window) !== null;
}

/** The time step a code belongs to, or null; lets a caller refuse a code used before. */
export function matchTotpCounter(
  secretBase32: string,
  token: string,
  window = TOTP_WINDOW,
): number | null {
  const normalized = token.trim();
  if (!/^\d{6}$/.test(normalized)) {
    return null;
  }

  const secret = base32Decode(secretBase32);
  const counter = Math.floor(Date.now() / 1000 / TOTP_STEP_SECONDS);

  for (let step = -window; step <= window; step++) {
    const candidate = hotp(secret, counter + step);
    if (timingSafeEqual(Buffer.from(candidate), Buffer.from(normalized))) {
      return counter + step;
    }
  }

  return null;
}

export function buildOtpAuthUrl(opts: { secret: string; accountName: string; issuer: string }): string {
  const label = encodeURIComponent(`${opts.issuer}:${opts.accountName}`);
  const params = new URLSearchParams({
    secret: opts.secret,
    issuer: opts.issuer,
    algorithm: "SHA1",
    digits: String(TOTP_DIGITS),
    period: String(TOTP_STEP_SECONDS),
  });

  return `otpauth://totp/${label}?${params.toString()}`;
}

/** 8 single-use recovery codes, formatted like "ABCDE-23456" for readability. */
export function generateBackupCodes(count = 8): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    const bytes = randomBytes(10);
    let code = "";
    for (let j = 0; j < 10; j++) {
      code += BACKUP_CODE_ALPHABET[bytes[j] % BACKUP_CODE_ALPHABET.length];
    }
    codes.push(`${code.slice(0, 5)}-${code.slice(5)}`);
  }
  return codes;
}

/** Strips the formatting dash/whitespace so entry and stored-hash comparisons line up. */
export function normalizeBackupCode(code: string): string {
  return code.replace(/[\s-]/g, "").toUpperCase();
}
