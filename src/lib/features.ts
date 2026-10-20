import type { ResultSetHeader } from "mysql2/promise";
import { queryRows, withConnection } from "./db";
import { isFeatureKnown, isFeatureLocked } from "./feature-flags";

/*
 * This organisation's switched-off features (see feature-flags.ts). Only
 * disabled keys are stored, so a fresh database has everything on. Set by
 * the platform admin through /api/internal/features.
 */

const FEATURES_TTL_MS = 30_000;
let cache: { at: number; value: string[] } | null = null;

const CREATE_TABLE = `
  create table if not exists disabled_features (
    feature_key varchar(120) primary key,
    disabled_at timestamp not null default current_timestamp
  )
`;

export function clearFeatureCache() {
  cache = null;
}

export async function getDisabledFeatures(): Promise<string[]> {
  if (cache && Date.now() - cache.at < FEATURES_TTL_MS) {
    return cache.value;
  }

  const rows = await queryRows<{ feature_key: string }>(
    "select feature_key from disabled_features",
  ).catch((error: unknown) => {
    // Table not created yet: nothing has ever been switched off.
    if ((error as { code?: string })?.code === "ER_NO_SUCH_TABLE") {
      return [];
    }
    throw error;
  });

  if (!rows) {
    // Database unreachable: keep the last known value rather than caching
    // an empty list.
    return cache?.value ?? [];
  }

  const value = rows.map((row) => row.feature_key).filter(isFeatureKnown);
  cache = { at: Date.now(), value };
  return value;
}

/** Replaces the disabled set. Unknown or locked keys are rejected by the caller. */
export async function setDisabledFeatures(keys: string[]) {
  const unique = [...new Set(keys)].filter(
    (key) => isFeatureKnown(key) && !isFeatureLocked(key),
  );

  const saved = await withConnection(async (connection) => {
    await connection.query(CREATE_TABLE);
    await connection.beginTransaction();
    try {
      await connection.query<ResultSetHeader>("delete from disabled_features");
      if (unique.length) {
        await connection.query<ResultSetHeader>(
          "insert into disabled_features (feature_key) values ?",
          [unique.map((key) => [key])],
        );
      }
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    }
    return true;
  });

  clearFeatureCache();
  return saved ? unique : null;
}
