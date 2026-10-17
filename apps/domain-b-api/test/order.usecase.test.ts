import { describe, expect, it } from "vitest";
import { ConflictError, NotFoundError, ValidationError } from "@packages/core-domain";
import { CancelOrderUseCase } from "../src/application/usecases/cancel-order.usecase";
import { GetOrderUseCase } from "../src/application/usecases/get-order.usecase";
import { PlaceOrderUseCase } from "../src/application/usecases/place-order.usecase";
import { InMemoryOrderRepository } from "../src/infrastructure/repositories/in-memory-order-repository";

const ITEM_ID = "11111111-1111-4111-8111-111111111111";

function setup() {
  const repository = new InMemoryOrderRepository();
  let seq = 0;
  const idGenerator = { generate: () => `00000000-0000-4000-8000-${String(++seq).padStart(12, "0")}` };
  let now = new Date("2026-01-01T00:00:00.000Z");
  const clock = { now: () => now };
  return {
    placeOrder: new PlaceOrderUseCase(repository, idGenerator, clock),
    getOrder: new GetOrderUseCase(repository),
    cancelOrder: new CancelOrderUseCase(repository, clock),
    advanceClock: (iso: string) => {
      now = new Date(iso);
    },
  };
}

describe("PlaceOrderUseCase / GetOrderUseCase / CancelOrderUseCase", () => {
  it("注文して取得できる", async () => {
    const { placeOrder, getOrder } = setup();

    const placed = await placeOrder.execute({ itemId: ITEM_ID, quantity: 2 });

    expect(placed).toEqual({
      id: "00000000-0000-4000-8000-000000000001",
      itemId: ITEM_ID,
      quantity: 2,
      status: "PLACED",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    await expect(getOrder.execute(placed.id)).resolves.toEqual(placed);
  });

  it.each([
    { itemId: "not-a-uuid", quantity: 1 },
    { itemId: ITEM_ID, quantity: 0 },
    { itemId: ITEM_ID, quantity: 101 },
    { itemId: ITEM_ID, quantity: 1.5 },
  ])("不正な入力は ValidationError になる: %o", async (input) => {
    const { placeOrder } = setup();
    await expect(placeOrder.execute(input)).rejects.toBeInstanceOf(ValidationError);
  });

  it("キャンセルすると CANCELLED になり、二重キャンセルは ConflictError", async () => {
    const { placeOrder, cancelOrder, getOrder, advanceClock } = setup();
    const placed = await placeOrder.execute({ itemId: ITEM_ID, quantity: 1 });

    advanceClock("2026-01-02T00:00:00.000Z");
    const cancelled = await cancelOrder.execute(placed.id);

    expect(cancelled).toMatchObject({ status: "CANCELLED", updatedAt: "2026-01-02T00:00:00.000Z" });
    await expect(getOrder.execute(placed.id)).resolves.toEqual(cancelled);
    await expect(cancelOrder.execute(placed.id)).rejects.toBeInstanceOf(ConflictError);
  });

  it("存在しない注文は NotFoundError になる", async () => {
    const { getOrder, cancelOrder } = setup();
    await expect(getOrder.execute("missing")).rejects.toBeInstanceOf(NotFoundError);
    await expect(cancelOrder.execute("missing")).rejects.toBeInstanceOf(NotFoundError);
  });
});
