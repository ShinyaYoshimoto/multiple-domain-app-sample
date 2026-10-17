import { translatePrismaError } from "@packages/database-common";
import type { ItemRepository } from "../../application/ports/item-repository";
import { Item } from "../../domain/item";
import type { Item as ItemRecord, PrismaClient } from "../../../generated/prisma";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * ItemRepository ポートの Prisma アダプター。
 * Prisma のレコード型 <-> ドメインモデルの変換はこのクラスの中に閉じ込める。
 */
export class PrismaItemRepository implements ItemRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(id: string): Promise<Item | null> {
    // id カラムは uuid 型のため、UUID 形式でない値は DB に問い合わせずに「存在しない」とする
    if (!UUID_PATTERN.test(id)) return null;

    const record = await this.prisma.item.findUnique({ where: { id } });
    return record ? toDomain(record) : null;
  }

  async create(item: Item): Promise<void> {
    try {
      await this.prisma.item.create({
        data: {
          id: item.id,
          name: item.name,
          description: item.description,
          price: item.price,
          createdAt: item.createdAt,
          updatedAt: item.updatedAt,
        },
      });
    } catch (error) {
      throw translatePrismaError(error, "Item", item.id);
    }
  }
}

function toDomain(record: ItemRecord): Item {
  return Item.reconstruct(record.id, {
    name: record.name,
    description: record.description,
    price: record.price,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  });
}
