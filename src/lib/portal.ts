import { TENANT_COOKIE } from "@/lib/session";

/*
 * Portal mode: one public domain, one app process per organisation.
 *
 * The portal process (PORTAL_MODE=1) owns no business data. It works out
 * which organisation a login identifier belongs to, forwards the login to
 * that organisation's own process on localhost, and sets TENANT_COOKIE so
 * nginx routes every later request on the same domain to that process.
 */

export { TENANT_COOKIE };

export type PortalTenant = {
  slug: string;
  origin: string;
  /** Organisation initials, e.g. "TB". Not used for login: accounts sign in by email only. */
  prefix: string;
};

export type TenantLookup = { tenant: PortalTenant } | null;

const REFRESH_INTERVAL_MS = 30_000;
const FETCH_TIMEOUT_MS = 5_000;

let directory = new Map<string, string>();
let lastRefreshAt = 0;
let refreshPromise: Promise<void> | null = null;

export function isPortalMode() {
  return process.env.PORTAL_MODE === "1";
}

/**
 * PORTAL_TENANTS="org1:3001:TB,org2:3002:VK" — slug, localhost port and
 * optional organisation prefix (2–6 Latin letters, default: slug in capitals).
 */
export function getPortalTenants(): PortalTenant[] {
  const seenPrefixes = new Set<string>();
  return (process.env.PORTAL_TENANTS || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .flatMap((entry) => {
      const [slug, port, rawPrefix] = entry.split(":").map((part) => part.trim());
      if (!/^[a-z0-9-]+$/.test(slug || "") || !/^\d+$/.test(port || "")) {
        console.error(`[portal] ignoring malformed PORTAL_TENANTS entry "${entry}"`);
        return [];
      }

      let prefix = (rawPrefix || slug).toUpperCase();
      if (!/^[A-Z]{2,6}$/.test(prefix) || seenPrefixes.has(prefix)) {
        console.error(
          `[portal] "${slug}": prefix "${prefix}" is invalid or already used; ignored`,
        );
        prefix = "";
      } else {
        seenPrefixes.add(prefix);
      }

      return [{ slug, origin: `http://127.0.0.1:${port}`, prefix }];
    });
}

/** Same normalisation the organisation app applies in getUserByLogin: email only. */
export function normalizeLoginIdentifier(identifier: string) {
  const normalized = identifier.trim().toLowerCase();
  return normalized.includes("@") ? normalized : "";
}

export async function findTenantForIdentifier(
  identifier: string,
): Promise<TenantLookup> {
  const tenants = getPortalTenants();
  const key = normalizeLoginIdentifier(identifier);
  if (!key) {
    return null;
  }

  if (!directory.has(key)) {
    await refreshDirectory();
  }

  const owner = directory.get(key);
  const tenant = tenants.find((item) => item.slug === owner);
  return tenant ? { tenant } : null;
}

/* Misses trigger a refresh, but at most once per REFRESH_INTERVAL_MS, so
   unknown identifiers can't be used to hammer the organisation processes. */
async function refreshDirectory() {
  if (refreshPromise) {
    return refreshPromise;
  }
  if (Date.now() - lastRefreshAt < REFRESH_INTERVAL_MS) {
    return;
  }

  lastRefreshAt = Date.now();
  refreshPromise = loadDirectory()
    .then((next) => {
      directory = next;
    })
    .catch((error) => {
      console.error("[portal] directory refresh failed", error);
    })
    .finally(() => {
      refreshPromise = null;
    });

  return refreshPromise;
}

async function loadDirectory() {
  const tenants = getPortalTenants();
  const secret = process.env.PORTAL_SYNC_SECRET || "";
  const owners = new Map<string, Set<string>>();

  await Promise.all(
    tenants.map(async (tenant) => {
      const response = await fetch(
        `${tenant.origin}/api/internal/login-identifiers`,
        {
          headers: { Authorization: `Bearer ${secret}` },
          cache: "no-store",
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        },
      ).catch(() => null);

      if (!response?.ok) {
        console.error(
          `[portal] could not load identifiers for "${tenant.slug}" (${response?.status ?? "unreachable"})`,
        );
        return;
      }

      const payload = (await response.json().catch(() => null)) as {
        identifiers?: unknown;
      } | null;
      const identifiers = Array.isArray(payload?.identifiers)
        ? payload.identifiers
        : [];

      for (const identifier of identifiers) {
        const key = String(identifier);
        const slugs = owners.get(key) ?? new Set<string>();
        slugs.add(tenant.slug);
        owners.set(key, slugs);
      }
    }),
  );

  /* An email in several organisations can't be routed, so it can't log
     in. Generated garden emails repeat by design and aren't worth a log line. */
  const next = new Map<string, string>();
  for (const [key, slugs] of owners) {
    if (slugs.size === 1) {
      next.set(key, [...slugs][0]);
    } else if (!isGardenIdentifier(key)) {
      console.error(
        `[portal] login identifier "${key}" exists in several organisations (${[...slugs].join(", ")}); login refused`,
      );
    }
  }

  return next;
}

/* The email generated for every garden account (repositories.ts:
   `xstation-<code>@local.ge`) repeats across organisations by design. */
function isGardenIdentifier(key: string) {
  return /^xstation-.+@local\.ge$/.test(key);
}
