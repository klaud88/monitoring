/*
 * pm2 processes for several organisations on one domain.
 *
 * Every file in ONEBIT_ENV_DIR (default /etc/onebit) becomes one process running
 * this same build:
 *   portal.env   PORTAL_MODE=1, PORT, PORTAL_SYNC_SECRET (no DATABASE_URL)
 *   <slug>.env   TENANT_SLUG=<slug>, TENANT_PREFIX=<X-Station initials>,
 *                PORT, DATABASE_URL, AUTH_SECRET,
 *                BIOSTAR_*, APP_URL, PORTAL_SYNC_SECRET, ...
 *
 * The portal's PORTAL_TENANTS list is built from the organisation files,
 * so adding an organisation is: new env file + nginx map line + reload.
 *
 *   pm2 startOrReload ecosystem.config.cjs --update-env && pm2 save
 */
const fs = require("node:fs");
const path = require("node:path");
const dotenv = require("dotenv");

const envDir = process.env.ONEBIT_ENV_DIR || "/etc/onebit";
const files = fs.existsSync(envDir)
  ? fs.readdirSync(envDir).filter((file) => file.endsWith(".env")).sort()
  : [];

const entries = files.map((file) => ({
  name: path.basename(file, ".env"),
  env: dotenv.parse(fs.readFileSync(path.join(envDir, file))),
}));

const tenants = entries.filter((entry) => entry.env.PORTAL_MODE !== "1");
const portalTenants = tenants
  .map((entry) =>
    [entry.env.TENANT_SLUG || entry.name, entry.env.PORT, entry.env.TENANT_PREFIX]
      .filter(Boolean)
      .join(":"),
  )
  .join(",");

module.exports = {
  apps: entries.map((entry) => {
    const env = { NODE_ENV: "production", ...entry.env };
    if (env.PORTAL_MODE === "1" && !env.PORTAL_TENANTS) {
      env.PORTAL_TENANTS = portalTenants;
    }
    if (!env.PORT) {
      throw new Error(`${entry.name}.env: PORT is required`);
    }

    return {
      name: `onebit-${entry.name}`,
      cwd: __dirname,
      script: "node_modules/next/dist/bin/next",
      args: ["start", "-H", "127.0.0.1", "-p", env.PORT],
      env,
      max_memory_restart: "700M",
    };
  }),
};
