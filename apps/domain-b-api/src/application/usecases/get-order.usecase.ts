import { NotFoundError } from "@packages/core-domain";
import type { OrderRepository } from "../ports/order-repository";
import { type OrderDto, toOrderDto } from "./order-dto";

export class GetOrderUseCase {
  constructor(private readonly orderRepository: OrderRepository) {}

  async execute(id: string): Promise<OrderDto> {
    const order = await this.orderRepository.findById(id);
    if (!order) {
      throw new NotFoundError("Order", id);
    }
    return toOrderDto(order);
  }
}
