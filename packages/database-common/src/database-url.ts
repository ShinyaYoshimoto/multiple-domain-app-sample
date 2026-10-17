/**
 * DATABASE_URL を解決する。
 *
 * - `DATABASE_URL` が設定されていればそれを優先（ローカル開発 / Secret Manager から丸ごと注入する場合）
 * - なければ `DB_HOST` / `DB_USER` / `DB_PASSWORD` / `DB_NAME` から組み立てる
 *   （AlloyDB のプライベート IP に Direct VPC Egress で接続し、パスワードだけ Secret Manager から注入する構成を想定）
 */
export function resolveDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  if (env.DATABASE_URL) {
    return env.DATABASE_URL;
  }

  const host = env.DB_HOST;
  const user = env.DB_USER;
  const password = env.DB_PASSWORD;
  const database = env.DB_NAME;
  if (!host || !user || !password || !database) {
    throw new Error(
      "Database configuration is missing. Set DATABASE_URL, or DB_HOST/DB_USER/DB_PASSWORD/DB_NAME.",
    );
  }

  const url = new URL(`postgresql://${host}`);
  url.port = env.DB_PORT ?? "5432";
  url.username = encodeURIComponent(user);
  url.password = encodeURIComponent(password);
  url.pathname = `/${database}`;
  if (env.DB_SCHEMA) url.searchParams.set("schema", env.DB_SCHEMA);
  // Cloud Run はインスタンス数 × connection_limit が DB の最大接続数を超えないよう小さめにする
  url.searchParams.set("connection_limit", env.DB_CONNECTION_LIMIT ?? "5");
  if (env.DB_SSL_MODE) url.searchParams.set("sslmode", env.DB_SSL_MODE);
  return url.toString();
}
