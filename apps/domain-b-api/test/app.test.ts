import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { systemClock, uuidGenerator } from "@packages/core-domain";
import { CancelOrderUseCase } from "../src/application/usecases/cancel-order.usecase";
import { GetOrderUseCase } from "../src/application/usecases/get-order.usecase";
import { PlaceOrderUseCase } from "../src/application/usecases/place-order.usecase";
import { InMemoryOrderRepository } from "../src/infrastructure/repositories/in-memory-order-repository";
import { createApp } from "../src/infrastructure/web/app";

const ITEM_ID = "11111111-1111-4111-8111-111111111111";

describe("HTTP API", () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    const repository = new InMemoryOrderRepository();
    const app = createApp({
      placeOrderUseCase: new PlaceOrderUseCase(repository, uuidGenerator, systemClock),
      getOrderUseCase: new GetOrderUseCase(repository),
      cancelOrderUseCase: new CancelOrderUseCase(repository, systemClock),
    });
    server = app.listen(0);
    await new Promise<void>((resolve) => server.once("listening", resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  const post = (path: string, body?: unknown) =>
    fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

  it("POST /orders -> GET /orders/:id -> POST /orders/:id/cancel", async () => {
    const placed = await post("/orders", { itemId: ITEM_ID, quantity: 3 });
    expect(placed.status).toBe(201);
    const order = (await placed.json()) as { id: string };
    expect(placed.headers.get("location")).toBe(`/orders/${order.id}`);

    const fetched = await fetch(`${baseUrl}/orders/${order.id}`);
    expect(await fetched.json()).toMatchObject({ itemId: ITEM_ID, quantity: 3, status: "PLACED" });

    const cancelled = await post(`/orders/${order.id}/cancel`);
    expect(cancelled.status).toBe(200);
    expect(await cancelled.json()).toMatchObject({ status: "CANCELLED" });
    expect((await post(`/orders/${order.id}/cancel`)).status).toBe(409);
  });

  it("エラーを HTTP ステータスに変換する", async () => {
    expect((await post("/orders", { itemId: ITEM_ID, quantity: "1" })).status).toBe(400);
    expect((await post("/orders", { itemId: "x", quantity: 1 })).status).toBe(400);
    expect((await fetch(`${baseUrl}/orders/unknown`)).status).toBe(404);
    expect((await fetch(`${baseUrl}/healthz`)).status).toBe(200);
  });
});
