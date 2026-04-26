function readOptionalEnv(name: string) {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

function readNumberEnv(name: string, fallback: number, min: number, max: number) {
  const rawValue = process.env[name];
  if (!rawValue) return fallback;

  const value = Number.parseInt(rawValue, 10);
  if (!Number.isFinite(value)) return fallback;

  return Math.min(Math.max(value, min), max);
}

function readBooleanEnv(name: string, fallback: boolean) {
  const rawValue = process.env[name]?.trim().toLowerCase();
  if (!rawValue) return fallback;

  if (["0", "false", "no", "off"].includes(rawValue)) return false;
  if (["1", "true", "yes", "on"].includes(rawValue)) return true;

  return fallback;
}

export function getServerConfig() {
  return {
    marketDatabaseUrl: readOptionalEnv("MARKET_DATABASE_URL") ?? readOptionalEnv("DATABASE_URL"),
    marketDatabaseSsl: readBooleanEnv("MARKET_DATABASE_SSL", true),
    marketDatabaseConnectionTimeoutMs: readNumberEnv(
      "MARKET_DATABASE_CONNECTION_TIMEOUT_MS",
      2500,
      500,
      10000
    ),
    marketDatabaseQueryTimeoutMs: readNumberEnv(
      "MARKET_DATABASE_QUERY_TIMEOUT_MS",
      4000,
      1000,
      15000
    ),
    marketDatabaseRetryCount: readNumberEnv("MARKET_DATABASE_RETRY_COUNT", 1, 0, 3),
  };
}
