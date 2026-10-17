import express, { type Express } from "express";
import { errorHandler } from "./error-handler";
import { createOrderRouter, type OrderRouterDeps } from "./order-router";

export interface AppDeps extends OrderRouterDeps {
  /** レディネスチェック（DB 疎通確認など）。未指定なら常に ready。 */
  readinessCheck?: () => Promise<void>;
}

/** Express アプリケーションの組み立て。サーバー起動（listen）は index.ts の責務。 */
export function createApp(deps: AppDeps): Express {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "1mb" }));

  // Cloud Run の startup / liveness probe 用
  app.get("/healthz", (_req, res) => {
    res.json({ status: "ok" });
  });
  app.get("/readyz", async (_req, res) => {
    try {
      await deps.readinessCheck?.();
      res.json({ status: "ready" });
    } catch {
      res.status(503).json({ status: "unavailable" });
    }
  });

  app.use("/orders", createOrderRouter(deps));

  app.use((_req, res) => {
    res.status(404).json({ error: { code: "NOT_FOUND", message: "Route not found" } });
  });
  app.use(errorHandler);

  return app;
}
