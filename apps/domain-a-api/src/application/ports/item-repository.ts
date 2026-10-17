import type { Item } from "../../domain/item";

/**
 * Item 永続化のポート（Driven Port）。
 * ユースケースはこのインターフェースにのみ依存し、Prisma などの具体実装は infrastructure 層が提供する。
 */
export interface ItemRepository {
  findById(id: string): Promise<Item | null>;
  /** 新規作成。name が重複する場合は ConflictError を投げる。 */
  create(item: Item): Promise<void>;
}
