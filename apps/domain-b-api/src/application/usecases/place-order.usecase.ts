import type { Clock, IdGenerator } from "@packages/core-domain";
import { Order } from "../../domain/order";
import type { OrderRepository } from "../ports/order-repository";
import { type OrderDto, toOrderDto } from "./order-dto";

export interface PlaceOrderInput {
  itemId: string;
  quantity: number;
}

export class PlaceOrderUseCase {
  constructor(
    private readonly orderRepository: OrderRepository,
    private readonly idGenerator: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(input: PlaceOrderInput): Promise<OrderDto> {
    const order = Order.place({
      id: this.idGenerator.generate(),
      itemId: input.itemId,
      quantity: input.quantity,
      now: this.clock.now(),
    });

    await this.orderRepository.create(order);
    return toOrderDto(order);
  }
}
