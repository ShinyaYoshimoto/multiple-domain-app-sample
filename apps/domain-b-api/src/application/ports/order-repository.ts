import type { Order } from "../../domain/order";

/**
 * Order 永続化のポート（Driven Port）。
 * ユースケースはこのインターフェースにのみ依存し、Prisma などの具体実装は infrastructure 層が提供する。
 */
export interface OrderRepository {
  findById(id: string): Promise<Order | null>;
  create(order: Order): Promise<void>;
  /** 既存注文の状態を更新する。存在しない場合は NotFoundError を投げる。 */
  update(order: Order): Promise<void>;
}
