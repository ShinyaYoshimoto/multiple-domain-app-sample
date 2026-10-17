import { ConflictError } from "@packages/core-domain";
import type { ItemRepository } from "../../application/ports/item-repository";
import type { Item } from "../../domain/item";

/**
 * ItemRepository のインメモリ実装。
 * テストや DB なしでのローカル起動（ITEM_REPOSITORY=memory）に使う。
 * 同じポートに対してアダプターを差し替えられることがヘキサゴナルアーキテクチャの利点。
 */
export class InMemoryItemRepository implements ItemRepository {
  private readonly items = new Map<string, Item>();

  async findById(id: string): Promise<Item | null> {
    return this.items.get(id) ?? null;
  }

  async create(item: Item): Promise<void> {
    for (const existing of this.items.values()) {
      if (existing.name === item.name) {
        throw new ConflictError("Item already exists");
      }
    }
    this.items.set(item.id, item);
  }
}
