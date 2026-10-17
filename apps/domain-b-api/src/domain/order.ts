import { type Brand, ConflictError, Entity, ValidationError, isUuid } from "@packages/core-domain";

export type OrderId = Brand<string, "OrderId">;

export const ORDER_STATUSES = ["PLACED", "CANCELLED"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_MAX_QUANTITY = 100;

export interface OrderProps {
  itemId: string;
  quantity: number;
  status: OrderStatus;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Order エンティティ。
 * 状態遷移（PLACED -> CANCELLED）のルールをエンティティ自身が持つ。
 */
export class Order extends Entity<OrderId> {
  private constructor(
    id: OrderId,
    private props: OrderProps,
  ) {
    super(id);
  }

  /** 新規注文。ビジネスルールの検証を行う。 */
  static place(params: { id: string; itemId: string; quantity: number; now: Date }): Order {
    if (!isUuid(params.itemId)) {
      throw new ValidationError("itemId must be a UUID");
    }
    if (
      !Number.isSafeInteger(params.quantity) ||
      params.quantity < 1 ||
      params.quantity > ORDER_MAX_QUANTITY
    ) {
      throw new ValidationError(`quantity must be an integer between 1 and ${ORDER_MAX_QUANTITY}`);
    }

    return new Order(params.id as OrderId, {
      itemId: params.itemId.toLowerCase(),
      quantity: params.quantity,
      status: "PLACED",
      createdAt: params.now,
      updatedAt: params.now,
    });
  }

  /** 永続化層からの復元。保存済みデータは検証済みとみなす。 */
  static reconstruct(id: string, props: OrderProps): Order {
    return new Order(id as OrderId, { ...props });
  }

  cancel(now: Date): void {
    if (this.props.status === "CANCELLED") {
      throw new ConflictError("Order is already cancelled");
    }
    this.props = { ...this.props, status: "CANCELLED", updatedAt: now };
  }

  get itemId(): string {
    return this.props.itemId;
  }

  get quantity(): number {
    return this.props.quantity;
  }

  get status(): OrderStatus {
    return this.props.status;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get updatedAt(): Date {
    return this.props.updatedAt;
  }
}
