import { ConflictError, NotFoundError } from "@packages/core-domain";
import type { OrderRepository } from "../../application/ports/order-repository";
import type { Order } from "../../domain/order";

/**
 * OrderRepository のインメモリ実装。
 * テストや DB なしでのローカル起動（ORDER_REPOSITORY=memory）に使う。
 */
export class InMemoryOrderRepository implements OrderRepository {
  private readonly orders = new Map<string, Order>();

  async findById(id: string): Promise<Order | null> {
    return this.orders.get(id) ?? null;
  }

  async create(order: Order): Promise<void> {
    if (this.orders.has(order.id)) {
      throw new ConflictError("Order already exists");
    }
    this.orders.set(order.id, order);
  }

  async update(order: Order): Promise<void> {
    if (!this.orders.has(order.id)) {
      throw new NotFoundError("Order", order.id);
    }
    this.orders.set(order.id, order);
  }
}
