#!/usr/bin/env node
/*
 * Generates the platform admin's credentials for portal.env (the /platform
 * page that switches organisation features on and off).
 *
 *   node scripts/platform-admin.mjs admin@onebit.ge
 *
 * Prints a generated password, the env lines to append to
 * /etc/onebit/portal.env, and a QR code for the authenticator app.
 * Then: pm2 startOrReload ecosystem.config.cjs --update-env
 */
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import QRCode from "qrcode";

const [rawEmail] = process.argv.slice(2);
if (!rawEmail || !rawEmail.includes("@")) {
  console.error("usage: node scripts/platform-admin.mjs <email>");
  process.exit(1);
}

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
function base32Encode(buffer) {
  let bits = "";
  for (const byte of buffer) {
    bits += byte.toString(2).padStart(8, "0");
  }
  let output = "";
  for (let i = 0; i < bits.length; i += 5) {
    output += BASE32_ALPHABET[parseInt(bits.slice(i, i + 5).padEnd(5, "0"), 2)];
  }
  return output;
}

const email = rawEmail.trim().toLowerCase();
const password = randomBytes(12).toString("base64url");
const totpSecret = base32Encode(randomBytes(20));
const authSecret = randomBytes(32).toString("hex");
const otpauth = `otpauth://totp/${encodeURIComponent(`OneBit Platform:${email}`)}?${new URLSearchParams({
  secret: totpSecret,
  issuer: "OneBit Platform",
  algorithm: "SHA1",
  digits: "6",
  period: "30",
})}`;

console.log("# append to /etc/onebit/portal.env (single quotes keep the $ in the hash literal)");
console.log(`PLATFORM_ADMIN_EMAIL=${email}`);
console.log(`PLATFORM_ADMIN_PASSWORD_HASH='${await bcrypt.hash(password, 10)}'`);
console.log(`PLATFORM_TOTP_SECRET=${totpSecret}`);
console.log(`PLATFORM_AUTH_SECRET=${authSecret}`);
console.log("");
console.log(`password (shown once — store it in a password manager): ${password}`);
console.log("");
console.log("scan with the authenticator app:");
console.log(await QRCode.toString(otpauth, { type: "terminal", small: true }));
console.log(otpauth);
