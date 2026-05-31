import mysql, { type Pool, type PoolConnection, type PoolOptions } from "mysql2/promise";

const globalForMysql = globalThis as typeof globalThis & {
  __biostarMysqlPool?: Pool;
};

let pool: Pool | undefined = globalForMysql.__biostarMysqlPool;

const recoverableDatabaseErrorCodes = new Set([
  "ECONNREFUSED",
  "ENOTFOUND",
  "ER_CON_COUNT_ERROR",
  "ETIMEDOUT",
  "PROTOCOL_CONNECTION_LOST",
]);

const hasDatabaseConfig = () =>
  Boolean(process.env.DATABASE_URL || process.env.MYSQL_HOST || process.env.MYSQL_DATABASE);

export function getPool(): Pool | null {
  if (!hasDatabaseConfig()) {
    return null;
  }

  if (!pool) {
    if (process.env.DATABASE_URL) {
      pool = mysql.createPool({
        uri: process.env.DATABASE_URL,
        waitForConnections: true,
        connectionLimit: Number(process.env.MYSQL_CONNECTION_LIMIT || 5),
        namedPlaceholders: true,
        timezone: "Z"
      });
    } else {
      const config: PoolOptions = {
        host: process.env.MYSQL_HOST || "127.0.0.1",
        port: Number(process.env.MYSQL_PORT || 3306),
        database: process.env.MYSQL_DATABASE,
        user: process.env.MYSQL_USER,
        password: process.env.MYSQL_PASSWORD,
        waitForConnections: true,
        connectionLimit: Number(process.env.MYSQL_CONNECTION_LIMIT || 5),
        namedPlaceholders: true,
        timezone: "Z"
      };
      pool = mysql.createPool(config);
    }

    globalForMysql.__biostarMysqlPool = pool;
  }

  return pool;
}

export async function queryRows<T>(sql: string, params: unknown[] = []) {
  const activePool = getPool();
  if (!activePool) {
    return null;
  }

  try {
    const [rows] = await activePool.query(sql, params);
    return rows as T[];
  } catch (error) {
    if (isRecoverableDatabaseError(error)) {
      console.warn(`[db] ${getDatabaseErrorMessage(error)}; using fallback data.`);
      return null;
    }

    throw error;
  }
}

export async function withConnection<T>(
  callback: (connection: PoolConnection) => Promise<T>
): Promise<T | null> {
  const activePool = getPool();
  if (!activePool) {
    return null;
  }

  let connection: PoolConnection;
  try {
    connection = await activePool.getConnection();
  } catch (error) {
    if (isRecoverableDatabaseError(error)) {
      console.warn(`[db] ${getDatabaseErrorMessage(error)}; skipping database write.`);
      return null;
    }

    throw error;
  }

  try {
    return await callback(connection);
  } catch (error) {
    if (isRecoverableDatabaseError(error)) {
      console.warn(`[db] ${getDatabaseErrorMessage(error)}; skipping database write.`);
      return null;
    }

    throw error;
  } finally {
    connection.release();
  }
}

function isRecoverableDatabaseError(error: unknown) {
  const databaseError = error as { code?: string; errno?: number };
  return (
    (databaseError.code && recoverableDatabaseErrorCodes.has(databaseError.code)) ||
    databaseError.errno === 1040
  );
}

function getDatabaseErrorMessage(error: unknown) {
  const databaseError = error as { code?: string; message?: string };
  return databaseError.code || databaseError.message || "Database connection failed";
}
