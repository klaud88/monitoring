#!/usr/bin/env node
/*
 * Writes real emails and phone numbers onto the existing garden accounts
 * (matched by garden number = users.device_group_code) and gives every
 * updated account the same one-time password; the user must change it at
 * first login. Names stay as they are ("ბაღი <N>").
 *
 *   IMPORT_PASSWORD='...' node scripts/import-garden-contacts.mjs /etc/kgm/org1.env contacts.json
 *   IMPORT_PASSWORD='...' node scripts/import-garden-contacts.mjs /etc/kgm/org1.env contacts.json --apply
 *
 * contacts.json: [{ "code": "101", "email": "x@example.ge", "phone": "599123456" }, ...]
 * Without --apply nothing is written; the same report is printed.
 */
import { readFileSync } from "node:fs";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import mysql from "mysql2/promise";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const [envFile, contactsFile] = args.filter((arg) => arg !== "--apply");
if (!envFile || !contactsFile) {
  console.error("usage: IMPORT_PASSWORD=... node scripts/import-garden-contacts.mjs <env-file> <contacts.json> [--apply]");
  process.exit(1);
}

const password = process.env.IMPORT_PASSWORD || "";
if (password.length < 8) {
  console.error("IMPORT_PASSWORD is not set or shorter than 8 characters");
  process.exit(1);
}

const env = dotenv.parse(readFileSync(envFile));
if (!env.DATABASE_URL) {
  console.error(`${envFile}: DATABASE_URL is not set`);
  process.exit(1);
}

const contacts = JSON.parse(readFileSync(contactsFile, "utf8")).map((row) => ({
  code: String(row.code ?? "").trim(),
  email: String(row.email ?? "").trim().toLowerCase(),
  phone: String(row.phone ?? "").trim(),
}));

const skipped = [];
const emailCounts = new Map();
for (const row of contacts) {
  emailCounts.set(row.email, (emailCounts.get(row.email) ?? 0) + 1);
}

const connection = await mysql.createConnection(env.DATABASE_URL);
try {
  const [columns] = await connection.query("show columns from users like 'phone'");
  if (!columns.length) {
    if (apply) {
      await connection.query("alter table users add column phone varchar(80) null after email");
    } else {
      console.log("note: users.phone does not exist yet; --apply will add it");
    }
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const updates = [];

  for (const row of contacts) {
    if (!/^\d+$/.test(row.code)) {
      skipped.push([row.code || "?", "ბაღის ნომერი არასწორია"]);
      continue;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email) || row.email.length > 180) {
      skipped.push([row.code, "ელ-ფოსტა არასწორია"]);
      continue;
    }
    if (row.phone && !/^\+?[\d\s-]{6,20}$/.test(row.phone)) {
      skipped.push([row.code, "ტელეფონი არასწორია"]);
      continue;
    }
    if (emailCounts.get(row.email) > 1) {
      skipped.push([row.code, `ელ-ფოსტა ${row.email} ფაილში რამდენჯერმეა`]);
      continue;
    }

    const [gardens] = await connection.query(
      `
        select u.id, u.email
        from users u
        join roles r on r.id = u.role_id and r.name = 'garden'
        where u.is_active = true and u.device_group_code = ?
      `,
      [row.code],
    );
    if (gardens.length !== 1) {
      skipped.push([
        row.code,
        gardens.length ? `ბაზაში ${gardens.length} ანგარიშია ამ ნომრით` : "ბაზაში ბაღის ანგარიში ვერ მოიძებნა",
      ]);
      continue;
    }

    const [owners] = await connection.query(
      "select id, name from users where email = ? and id <> ? limit 1",
      [row.email, gardens[0].id],
    );
    if (owners.length) {
      skipped.push([row.code, `ელ-ფოსტა ${row.email} უკვე აქვს: ${owners[0].name}`]);
      continue;
    }

    updates.push({ id: gardens[0].id, ...row, previousEmail: gardens[0].email });
  }

  if (apply && updates.length) {
    await connection.beginTransaction();
    try {
      for (const update of updates) {
        await connection.query(
          `
            update users
            set email = ?, phone = ?, password_hash = ?, must_change_password = true, updated_at = now()
            where id = ?
          `,
          [update.email, update.phone || null, passwordHash, update.id],
        );
      }
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    }
  }

  for (const update of updates) {
    console.log(`${apply ? "updated" : "would update"}  ${update.code}: ${update.previousEmail} -> ${update.email}`);
  }
  console.log("");
  console.log(`${apply ? "updated" : "would update"}: ${updates.length}`);
  console.log(`skipped: ${skipped.length}`);
  for (const [code, reason] of skipped) {
    console.log(`  ${code}: ${reason}`);
  }
  if (!apply) {
    console.log("\ndry run — nothing written. Re-run with --apply.");
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await connection.end();
}
