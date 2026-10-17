import { describe, expect, it } from "vitest";
import { ConflictError, NotFoundError, ValidationError } from "@packages/core-domain";
import { CreateItemUseCase } from "../src/application/usecases/create-item.usecase";
import { GetItemUseCase } from "../src/application/usecases/get-item.usecase";
import { InMemoryItemRepository } from "../src/infrastructure/repositories/in-memory-item-repository";

// ユースケースはポートにしか依存しないため、DB なしでインメモリアダプターを差し込んでテストできる
function setup() {
  const repository = new InMemoryItemRepository();
  let seq = 0;
  const idGenerator = { generate: () => `00000000-0000-4000-8000-${String(++seq).padStart(12, "0")}` };
  const clock = { now: () => new Date("2026-01-01T00:00:00.000Z") };
  return {
    createItem: new CreateItemUseCase(repository, idGenerator, clock),
    getItem: new GetItemUseCase(repository),
  };
}

describe("CreateItemUseCase / GetItemUseCase", () => {
  it("作成した Item を取得できる", async () => {
    const { createItem, getItem } = setup();

    const created = await createItem.execute({ name: "  Coffee  ", price: 500 });

    expect(created).toEqual({
      id: "00000000-0000-4000-8000-000000000001",
      name: "Coffee",
      description: null,
      price: 500,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    await expect(getItem.execute(created.id)).resolves.toEqual(created);
  });

  it.each([
    { name: "", price: 100 },
    { name: "x".repeat(101), price: 100 },
    { name: "Tea", price: -1 },
    { name: "Tea", price: 1.5 },
  ])("不正な入力は ValidationError になる: %o", async (input) => {
    const { createItem } = setup();
    await expect(createItem.execute(input)).rejects.toBeInstanceOf(ValidationError);
  });

  it("同名の Item は ConflictError になる", async () => {
    const { createItem } = setup();
    await createItem.execute({ name: "Tea", price: 300 });
    await expect(createItem.execute({ name: "Tea", price: 300 })).rejects.toBeInstanceOf(
      ConflictError,
    );
  });

  it("存在しない Item は NotFoundError になる", async () => {
    const { getItem } = setup();
    await expect(getItem.execute("missing")).rejects.toBeInstanceOf(NotFoundError);
  });
});
