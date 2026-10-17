export interface AppConfig {
  port: number;
  /** "prisma"（デフォルト）または "memory"（DB なしでのローカル動作確認用） */
  itemRepository: "prisma" | "memory";
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const port = Number(env.PORT ?? 8080); // Cloud Run は PORT 環境変数でポートを指定する
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(`Invalid PORT: ${env.PORT}`);
  }

  const itemRepository = env.ITEM_REPOSITORY ?? "prisma";
  if (itemRepository !== "prisma" && itemRepository !== "memory") {
    throw new Error(`Invalid ITEM_REPOSITORY: ${itemRepository}`);
  }

  return { port, itemRepository };
}
