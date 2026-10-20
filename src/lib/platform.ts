import { getPortalTenants, type PortalTenant } from "./portal";
import type { UserOverview } from "./overview";

/*
 * Platform admin → organisation calls. Each organisation process answers
 * /api/internal/features and /api/internal/overview on localhost, guarded by
 * PORTAL_SYNC_SECRET (the same channel the portal uses for login identifiers).
 */

const FETCH_TIMEOUT_MS = 5_000;

type TenantFailure = { ok: false; status: number; message: string };

export type TenantFeatures = { ok: true; disabled: string[] } | TenantFailure;

export type TenantOverview = { ok: true; users: UserOverview } | TenantFailure;

export function findPortalTenant(slug: string): PortalTenant | null {
  return getPortalTenants().find((tenant) => tenant.slug === slug) ?? null;
}

async function callTenant<T>(
  tenant: PortalTenant,
  path: string,
  read: (payload: Record<string, unknown>) => T | null,
  init?: { method: "PUT"; body: unknown },
): Promise<({ ok: true } & T) | TenantFailure> {
  const response = await fetch(`${tenant.origin}${path}`, {
    method: init?.method ?? "GET",
    headers: {
      Authorization: `Bearer ${process.env.PORTAL_SYNC_SECRET || ""}`,
      ...(init ? { "Content-Type": "application/json" } : {}),
    },
    body: init ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  }).catch(() => null);

  if (!response) {
    return { ok: false, status: 503, message: "ორგანიზაცია მიუწვდომელია." };
  }

  const payload = (await response.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  const value = response.ok && payload ? read(payload) : null;

  if (!value) {
    return {
      ok: false,
      status: response.ok ? 502 : response.status,
      message:
        (typeof payload?.message === "string" && payload.message) ||
        `ორგანიზაციამ დააბრუნა ${response.status}.`,
    };
  }

  return { ok: true, ...value };
}

function readDisabled(payload: Record<string, unknown>) {
  return Array.isArray(payload.disabled)
    ? { disabled: payload.disabled.map(String) }
    : null;
}

export function getTenantFeatures(tenant: PortalTenant): Promise<TenantFeatures> {
  return callTenant(tenant, "/api/internal/features", readDisabled);
}

export function setTenantFeatures(
  tenant: PortalTenant,
  disabled: string[],
): Promise<TenantFeatures> {
  return callTenant(tenant, "/api/internal/features", readDisabled, {
    method: "PUT",
    body: { disabled },
  });
}

export function getTenantOverview(tenant: PortalTenant): Promise<TenantOverview> {
  return callTenant(tenant, "/api/internal/overview", (payload) =>
    payload.users && typeof payload.users === "object"
      ? { users: payload.users as UserOverview }
      : null,
  );
}
