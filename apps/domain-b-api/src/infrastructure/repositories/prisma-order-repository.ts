import { isUuid } from "@packages/core-domain";
import { translatePrismaError } from "@packages/database-common";
import type { OrderRepository } from "../../application/ports/order-repository";
import { Order } from "../../domain/order";
import type { Order as OrderRecord, PrismaClient } from "../../../generated/prisma";

/**
 * OrderRepository ポートの Prisma アダプター。
 * Prisma のレコード型 <-> ドメインモデルの変換はこのクラスの中に閉じ込める。
 */
export class PrismaOrderRepository implements OrderRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(id: string): Promise<Order | null> {
    // id カラムは uuid 型のため、UUID 形式でない値は DB に問い合わせずに「存在しない」とする
    if (!isUuid(id)) return null;

    const record = await this.prisma.order.findUnique({ where: { id } });
    return record ? toDomain(record) : null;
  }

  async create(order: Order): Promise<void> {
    try {
      await this.prisma.order.create({
        data: {
          id: order.id,
          itemId: order.itemId,
          quantity: order.quantity,
          status: order.status,
          createdAt: order.createdAt,
          updatedAt: order.updatedAt,
        },
      });
    } catch (error) {
      throw translatePrismaError(error, "Order", order.id);
    }
  }

  async update(order: Order): Promise<void> {
    try {
      await this.prisma.order.update({
        where: { id: order.id },
        data: { status: order.status, updatedAt: order.updatedAt },
      });
    } catch (error) {
      throw translatePrismaError(error, "Order", order.id);
    }
  }
}

function toDomain(record: OrderRecord): Order {
  return Order.reconstruct(record.id, {
    itemId: record.itemId,
    quantity: record.quantity,
    status: record.status,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  });
}
