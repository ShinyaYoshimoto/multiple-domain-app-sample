export interface AppConfig {
  port: number;
  /** "prisma"（デフォルト）または "memory"（DB なしでのローカル動作確認用） */
  orderRepository: "prisma" | "memory";
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const port = Number(env.PORT ?? 8080); // Cloud Run は PORT 環境変数でポートを指定する
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(`Invalid PORT: ${env.PORT}`);
  }

  const orderRepository = env.ORDER_REPOSITORY ?? "prisma";
  if (orderRepository !== "prisma" && orderRepository !== "memory") {
    throw new Error(`Invalid ORDER_REPOSITORY: ${orderRepository}`);
  }

  return { port, orderRepository };
}
