import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { systemClock, uuidGenerator } from "@packages/core-domain";
import { CreateItemUseCase } from "../src/application/usecases/create-item.usecase";
import { GetItemUseCase } from "../src/application/usecases/get-item.usecase";
import { InMemoryItemRepository } from "../src/infrastructure/repositories/in-memory-item-repository";
import { createApp } from "../src/infrastructure/web/app";

describe("HTTP API", () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    const repository = new InMemoryItemRepository();
    const app = createApp({
      createItemUseCase: new CreateItemUseCase(repository, uuidGenerator, systemClock),
      getItemUseCase: new GetItemUseCase(repository),
    });
    server = app.listen(0);
    await new Promise<void>((resolve) => server.once("listening", resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  const postItem = (body: unknown) =>
    fetch(`${baseUrl}/items`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    });

  it("POST /items -> GET /items/:id", async () => {
    const created = await postItem({ name: "Coffee", description: "Hot", price: 500 });
    expect(created.status).toBe(201);
    const item = (await created.json()) as { id: string };
    expect(created.headers.get("location")).toBe(`/items/${item.id}`);

    const fetched = await fetch(`${baseUrl}/items/${item.id}`);
    expect(fetched.status).toBe(200);
    expect(await fetched.json()).toMatchObject({ name: "Coffee", description: "Hot", price: 500 });
  });

  it("エラーを HTTP ステータスに変換する", async () => {
    expect((await postItem({ name: "Coffee", price: "500" })).status).toBe(400);
    expect((await postItem("{not json")).status).toBe(400);
    expect((await postItem({ name: "Coffee", price: 500 })).status).toBe(409);
    expect((await fetch(`${baseUrl}/items/unknown`)).status).toBe(404);
    expect((await fetch(`${baseUrl}/healthz`)).status).toBe(200);
  });
});
