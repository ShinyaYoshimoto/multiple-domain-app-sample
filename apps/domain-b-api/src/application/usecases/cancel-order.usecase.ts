import { type Clock, NotFoundError } from "@packages/core-domain";
import type { OrderRepository } from "../ports/order-repository";
import { type OrderDto, toOrderDto } from "./order-dto";

export class CancelOrderUseCase {
  constructor(
    private readonly orderRepository: OrderRepository,
    private readonly clock: Clock,
  ) {}

  async execute(id: string): Promise<OrderDto> {
    const order = await this.orderRepository.findById(id);
    if (!order) {
      throw new NotFoundError("Order", id);
    }

    order.cancel(this.clock.now());
    await this.orderRepository.update(order);
    return toOrderDto(order);
  }
}
