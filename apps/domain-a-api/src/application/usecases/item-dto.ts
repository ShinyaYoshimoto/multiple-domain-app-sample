import type { Item } from "../../domain/item";

/** ユースケースの出力。ドメインオブジェクトをアダプター層へ直接漏らさないためのプレーンな DTO。 */
export interface ItemDto {
  id: string;
  name: string;
  description: string | null;
  price: number;
  createdAt: string;
  updatedAt: string;
}

export function toItemDto(item: Item): ItemDto {
  return {
    id: item.id,
    name: item.name,
    description: item.description,
    price: item.price,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}
