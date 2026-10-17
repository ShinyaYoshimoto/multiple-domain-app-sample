import { systemClock, uuidGenerator } from "@packages/core-domain";
import { createPrismaClient } from "@packages/database-common";
import { PrismaClient } from "../generated/prisma";
import type { ItemRepository } from "./application/ports/item-repository";
import { CreateItemUseCase } from "./application/usecases/create-item.usecase";
import { GetItemUseCase } from "./application/usecases/get-item.usecase";
import { loadConfig } from "./infrastructure/config/env";
import { InMemoryItemRepository } from "./infrastructure/repositories/in-memory-item-repository";
import { PrismaItemRepository } from "./infrastructure/repositories/prisma-item-repository";
import { createApp } from "./infrastructure/web/app";

/**
 * Composition Root。
 * アダプター（Prisma リポジトリ / Express）を生成し、ポート経由でユースケースに注入する。
 * 具体的な実装クラスを知っているのはこのファイルだけ。
 */
async function main(): Promise<void> {
  const config = loadConfig();

  // --- Driven Adapters (outbound) ---
  let itemRepository: ItemRepository;
  let readinessCheck: (() => Promise<void>) | undefined;
  let shutdownHooks: Array<() => Promise<void>> = [];

  if (config.itemRepository === "prisma") {
    const prisma = createPrismaClient(PrismaClient);
    itemRepository = new PrismaItemRepository(prisma);
    readinessCheck = async () => {
      await prisma.$queryRaw`SELECT 1`;
    };
    shutdownHooks.push(() => prisma.$disconnect());
  } else {
    itemRepository = new InMemoryItemRepository();
  }

  // --- Application (use cases) ---
  const createItemUseCase = new CreateItemUseCase(itemRepository, uuidGenerator, systemClock);
  const getItemUseCase = new GetItemUseCase(itemRepository);

  // --- Driving Adapter (inbound) ---
  const app = createApp({ createItemUseCase, getItemUseCase, readinessCheck });
  const server = app.listen(config.port, () => {
    console.log(
      JSON.stringify({
        severity: "INFO",
        message: `domain-a-api listening on port ${config.port} (repository=${config.itemRepository})`,
      }),
    );
  });

  // Cloud Run はインスタンス停止時に SIGTERM を送り、約 10 秒後に SIGKILL する
  const shutdown = (signal: string) => {
    console.log(JSON.stringify({ severity: "INFO", message: `${signal} received, shutting down` }));
    server.close(async () => {
      await Promise.allSettled(shutdownHooks.map((hook) => hook()));
      shutdownHooks = [];
      process.exit(0);
    });
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main().catch((error: unknown) => {
  console.error(
    JSON.stringify({
      severity: "CRITICAL",
      message: "Failed to start server",
      error: error instanceof Error ? error.stack : String(error),
    }),
  );
  process.exit(1);
});
