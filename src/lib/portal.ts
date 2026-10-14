import { normalizeDeviceGroupCode } from "@/lib/repositories";
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
  /** Initials a garden types before its X-Station code, e.g. "TB-101". */
  prefix: string;
};

export type TenantLookup =
  | { tenant: PortalTenant }
  /* The X-Station code exists in several organisations and was typed
     without a prefix, so the garden has to say which one it means. */
  | { ambiguous: true }
  | null;

const AMBIGUOUS = Symbol("ambiguous");

const REFRESH_INTERVAL_MS = 30_000;
const FETCH_TIMEOUT_MS = 5_000;

let directory = new Map<string, string | typeof AMBIGUOUS>();
let lastRefreshAt = 0;
let refreshPromise: Promise<void> | null = null;

export function isPortalMode() {
  return process.env.PORTAL_MODE === "1";
}

/**
 * PORTAL_TENANTS="org1:3001:TB,org2:3002:VK" — slug, localhost port and
 * optional X-Station prefix (2–6 Latin letters, default: slug in capitals).
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
          `[portal] "${slug}": X-Station prefix "${prefix}" is invalid or already used; prefixed login disabled for it`,
        );
        prefix = "";
      } else {
        seenPrefixes.add(prefix);
      }

      return [{ slug, origin: `http://127.0.0.1:${port}`, prefix }];
    });
}

const PREFIXED_XSTATION = /^([a-z]{2,6})[\s-]*(\d+)$/i;

/** Same normalisation the organisation app applies in getUserByLogin. */
export function normalizeLoginIdentifier(identifier: string) {
  const normalized = identifier.trim().toLowerCase();
  if (!normalized) {
    return "";
  }
  return normalized.includes("@")
    ? normalized
    : `xstation:${normalizeDeviceGroupCode(normalized)}`;
}

export async function findTenantForIdentifier(
  identifier: string,
): Promise<TenantLookup> {
  const tenants = getPortalTenants();

  /* "TB-101" names its organisation outright. The organisation app strips
     the letters itself (normalizeDeviceGroupCode), so the identifier is
     forwarded as typed and the code's existence is checked by its login. */
  const prefixed = identifier.trim().match(PREFIXED_XSTATION);
  if (prefixed) {
    const prefix = prefixed[1].toUpperCase();
    const tenant = tenants.find((item) => item.prefix === prefix);
    return tenant ? { tenant } : null;
  }

  const key = normalizeLoginIdentifier(identifier);
  if (!key) {
    return null;
  }

  if (!directory.has(key)) {
    await refreshDirectory();
  }

  const owner = directory.get(key);
  if (owner === AMBIGUOUS) {
    return { ambiguous: true };
  }
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

  /* An identifier in several organisations can't be routed on its own.
     X-Station codes (garden numbers) clash naturally, so the garden is
     asked to add its organisation's prefix; a shared email is an error. */
  const next = new Map<string, string | typeof AMBIGUOUS>();
  for (const [key, slugs] of owners) {
    if (slugs.size === 1) {
      next.set(key, [...slugs][0]);
    } else if (isGardenIdentifier(key)) {
      next.set(key, AMBIGUOUS);
    } else {
      console.error(
        `[portal] login identifier "${key}" exists in several organisations (${[...slugs].join(", ")}); login refused`,
      );
    }
  }

  return next;
}

/* X-Station codes, and the email generated for every garden account
   (repositories.ts: `xstation-<code>@local.ge`), repeat across
   organisations by design. */
function isGardenIdentifier(key: string) {
  return key.startsWith("xstation:") || /^xstation-.+@local\.ge$/.test(key);
}
