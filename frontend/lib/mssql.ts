import sql from "mssql";

// Re-use the pool across hot-reloads in development
declare global {
  var _mssqlPool: sql.ConnectionPool | undefined;
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const config: sql.config = {
  server: requiredEnv("AZURE_SQL_DB_HOST"),
  port: Number.parseInt(process.env.AZURE_SQL_DB_PORT ?? "1433", 10),
  database: requiredEnv("AZURE_SQL_DB_NAME"),
  user: requiredEnv("AZURE_SQL_DB_USER"),
  password: requiredEnv("AZURE_SQL_DB_PASSWORD"),
  options: {
    encrypt: true,
    trustServerCertificate: false,
  },
  pool: {
    max: 5,
    min: 0,
    idleTimeoutMillis: 30_000,
  },
  connectionTimeout: 15_000,
  requestTimeout: 30_000,
};

async function getPool(): Promise<sql.ConnectionPool> {
  if (process.env.NODE_ENV === "production") {
    return new sql.ConnectionPool(config).connect();
  }
  if (!globalThis._mssqlPool) {
    globalThis._mssqlPool = await new sql.ConnectionPool(config).connect();
  }
  return globalThis._mssqlPool;
}

export async function mssqlQuery<T = Record<string, unknown>>(
  sqlText: string,
  params?: Record<string, unknown>
): Promise<T[]> {
  const pool = await getPool();
  const request = pool.request();
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      request.input(key, value);
    }
  }
  const result = await request.query(sqlText);
  return result.recordset as T[];
}
