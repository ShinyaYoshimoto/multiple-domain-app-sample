import { NotFoundError } from "@packages/core-domain";
import type { ItemRepository } from "../ports/item-repository";
import { type ItemDto, toItemDto } from "./item-dto";

export class GetItemUseCase {
  constructor(private readonly itemRepository: ItemRepository) {}

  async execute(id: string): Promise<ItemDto> {
    const item = await this.itemRepository.findById(id);
    if (!item) {
      throw new NotFoundError("Item", id);
    }
    return toItemDto(item);
  }
}
