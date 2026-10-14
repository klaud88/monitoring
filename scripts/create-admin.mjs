#!/usr/bin/env node
/*
 * Creates the first admin user in an organisation's database.
 *
 *   node scripts/create-admin.mjs /etc/kgm/org2.env admin@org2.ge "სახელი გვარი"
 *
 * Prints a one-time password; the user must change it at first login.
 */
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import mysql from "mysql2/promise";

const [envFile, rawEmail, name = "Administrator"] = process.argv.slice(2);
if (!envFile || !rawEmail) {
  console.error('usage: node scripts/create-admin.mjs <env-file> <email> ["name"]');
  process.exit(1);
}

const env = dotenv.parse(readFileSync(envFile));
if (!env.DATABASE_URL) {
  console.error(`${envFile}: DATABASE_URL is not set`);
  process.exit(1);
}

const email = rawEmail.trim().toLowerCase();
const password = randomBytes(9).toString("base64url");
const initials = name
  .split(/\s+/)
  .filter(Boolean)
  .slice(0, 2)
  .map((part) => part[0].toUpperCase())
  .join("") || "AD";

const connection = await mysql.createConnection(env.DATABASE_URL);
try {
  const [roles] = await connection.query(
    "select id from roles where name = 'admin' limit 1",
  );
  if (!roles.length) {
    throw new Error("role 'admin' not found — copy roles/permissions first");
  }

  const [existing] = await connection.query(
    "select id from users where email = ? limit 1",
    [email],
  );
  if (existing.length) {
    throw new Error(`user ${email} already exists`);
  }

  await connection.query(
    `insert into users (id, role_id, name, email, password_hash, initials, color, must_change_password)
     values (?, ?, ?, ?, ?, ?, ?, true)`,
    [
      `u-${Date.now()}-${randomBytes(3).toString("hex")}`,
      roles[0].id,
      name,
      email,
      await bcrypt.hash(password, 10),
      initials,
      "#1976d2",
    ],
  );

  console.log(`admin created: ${email}`);
  console.log(`one-time password: ${password}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await connection.end();
}
