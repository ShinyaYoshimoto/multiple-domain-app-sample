import { resolveDatabaseUrl } from "./database-url";

/**
 * 各アプリは自身の schema.prisma から個別に Prisma Client を生成する（ドメインごとに DB スキーマを分離するため）。
 * そのため、ここでは生成済みクライアントのコンストラクタを受け取る汎用ファクトリとして実装する。
 */
export interface PrismaLikeClient {
  $connect(): Promise<void>;
  $disconnect(): Promise<void>;
}

export interface PrismaClientOptionsLike {
  datasourceUrl?: string;
  log?: Array<"query" | "info" | "warn" | "error">;
}

export type PrismaClientConstructor<TClient extends PrismaLikeClient> = new (
  options?: PrismaClientOptionsLike,
) => TClient;

export function createPrismaClient<TClient extends PrismaLikeClient>(
  ClientCtor: PrismaClientConstructor<TClient>,
  env: NodeJS.ProcessEnv = process.env,
): TClient {
  return new ClientCtor({
    datasourceUrl: resolveDatabaseUrl(env),
    log: env.NODE_ENV === "production" ? ["warn", "error"] : ["query", "warn", "error"],
  });
}
