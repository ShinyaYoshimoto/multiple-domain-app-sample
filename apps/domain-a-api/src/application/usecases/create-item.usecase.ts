import type { Clock, IdGenerator } from "@packages/core-domain";
import { Item } from "../../domain/item";
import type { ItemRepository } from "../ports/item-repository";
import { type ItemDto, toItemDto } from "./item-dto";

export interface CreateItemInput {
  name: string;
  description?: string | null;
  price: number;
}

export class CreateItemUseCase {
  constructor(
    private readonly itemRepository: ItemRepository,
    private readonly idGenerator: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(input: CreateItemInput): Promise<ItemDto> {
    const item = Item.create({
      id: this.idGenerator.generate(),
      name: input.name,
      description: input.description,
      price: input.price,
      now: this.clock.now(),
    });

    await this.itemRepository.create(item);
    return toItemDto(item);
  }
}
