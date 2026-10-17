import { systemClock, uuidGenerator } from "@packages/core-domain";
import { createPrismaClient } from "@packages/database-common";
import { PrismaClient } from "../generated/prisma";
import type { OrderRepository } from "./application/ports/order-repository";
import { CancelOrderUseCase } from "./application/usecases/cancel-order.usecase";
import { GetOrderUseCase } from "./application/usecases/get-order.usecase";
import { PlaceOrderUseCase } from "./application/usecases/place-order.usecase";
import { loadConfig } from "./infrastructure/config/env";
import { InMemoryOrderRepository } from "./infrastructure/repositories/in-memory-order-repository";
import { PrismaOrderRepository } from "./infrastructure/repositories/prisma-order-repository";
import { createApp } from "./infrastructure/web/app";

/**
 * Composition Root。
 * アダプター（Prisma リポジトリ / Express）を生成し、ポート経由でユースケースに注入する。
 * 具体的な実装クラスを知っているのはこのファイルだけ。
 */
async function main(): Promise<void> {
  const config = loadConfig();

  // --- Driven Adapters (outbound) ---
  let orderRepository: OrderRepository;
  let readinessCheck: (() => Promise<void>) | undefined;
  let shutdownHooks: Array<() => Promise<void>> = [];

  if (config.orderRepository === "prisma") {
    const prisma = createPrismaClient(PrismaClient);
    orderRepository = new PrismaOrderRepository(prisma);
    readinessCheck = async () => {
      await prisma.$queryRaw`SELECT 1`;
    };
    shutdownHooks.push(() => prisma.$disconnect());
  } else {
    orderRepository = new InMemoryOrderRepository();
  }

  // --- Application (use cases) ---
  const placeOrderUseCase = new PlaceOrderUseCase(orderRepository, uuidGenerator, systemClock);
  const getOrderUseCase = new GetOrderUseCase(orderRepository);
  const cancelOrderUseCase = new CancelOrderUseCase(orderRepository, systemClock);

  // --- Driving Adapter (inbound) ---
  const app = createApp({
    placeOrderUseCase,
    getOrderUseCase,
    cancelOrderUseCase,
    readinessCheck,
  });
  const server = app.listen(config.port, () => {
    console.log(
      JSON.stringify({
        severity: "INFO",
        message: `domain-b-api listening on port ${config.port} (repository=${config.orderRepository})`,
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
