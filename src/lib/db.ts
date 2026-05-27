import mysql, { type Pool, type PoolConnection, type PoolOptions } from "mysql2/promise";

let pool: Pool | undefined;

const hasDatabaseConfig = () =>
  Boolean(process.env.DATABASE_URL || process.env.MYSQL_HOST || process.env.MYSQL_DATABASE);

export function getPool(): Pool | null {
  if (!hasDatabaseConfig()) {
    return null;
  }

  if (!pool) {
    if (process.env.DATABASE_URL) {
      pool = mysql.createPool(process.env.DATABASE_URL);
    } else {
      const config: PoolOptions = {
        host: process.env.MYSQL_HOST || "127.0.0.1",
        port: Number(process.env.MYSQL_PORT || 3306),
        database: process.env.MYSQL_DATABASE,
        user: process.env.MYSQL_USER,
        password: process.env.MYSQL_PASSWORD,
        waitForConnections: true,
        connectionLimit: 10,
        namedPlaceholders: true,
        timezone: "Z"
      };
      pool = mysql.createPool(config);
    }
  }

  return pool;
}

export async function queryRows<T>(sql: string, params: unknown[] = []) {
  const activePool = getPool();
  if (!activePool) {
    return null;
  }

  const [rows] = await activePool.query(sql, params);
  return rows as T[];
}

export async function withConnection<T>(
  callback: (connection: PoolConnection) => Promise<T>
): Promise<T | null> {
  const activePool = getPool();
  if (!activePool) {
    return null;
  }

  const connection = await activePool.getConnection();
  try {
    return await callback(connection);
  } finally {
    connection.release();
  }
}
