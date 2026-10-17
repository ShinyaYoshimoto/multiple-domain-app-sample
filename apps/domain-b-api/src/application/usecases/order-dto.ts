import type { Order, OrderStatus } from "../../domain/order";

/** ユースケースの出力。ドメインオブジェクトをアダプター層へ直接漏らさないためのプレーンな DTO。 */
export interface OrderDto {
  id: string;
  itemId: string;
  quantity: number;
  status: OrderStatus;
  createdAt: string;
  updatedAt: string;
}

export function toOrderDto(order: Order): OrderDto {
  return {
    id: order.id,
    itemId: order.itemId,
    quantity: order.quantity,
    status: order.status,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
  };
}
