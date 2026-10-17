import { type Brand, Entity, ValidationError } from "@packages/core-domain";

export type ItemId = Brand<string, "ItemId">;

export const ITEM_NAME_MAX_LENGTH = 100;
export const ITEM_DESCRIPTION_MAX_LENGTH = 1000;

export interface ItemProps {
  name: string;
  description: string | null;
  price: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Item エンティティ。
 * フレームワークや Prisma の型には一切依存しない純粋な TypeScript クラス。
 * 生成（create）時に不変条件を検証し、不正な状態のインスタンスが存在しないことを保証する。
 */
export class Item extends Entity<ItemId> {
  private constructor(
    id: ItemId,
    private readonly props: ItemProps,
  ) {
    super(id);
  }

  /** 新規作成。ビジネスルールの検証を行う。 */
  static create(params: {
    id: string;
    name: string;
    description?: string | null;
    price: number;
    now: Date;
  }): Item {
    const name = params.name.trim();
    const description = params.description?.trim() || null;

    if (name.length === 0) {
      throw new ValidationError("name must not be empty");
    }
    if (name.length > ITEM_NAME_MAX_LENGTH) {
      throw new ValidationError(`name must be at most ${ITEM_NAME_MAX_LENGTH} characters`);
    }
    if (description !== null && description.length > ITEM_DESCRIPTION_MAX_LENGTH) {
      throw new ValidationError(
        `description must be at most ${ITEM_DESCRIPTION_MAX_LENGTH} characters`,
      );
    }
    if (!Number.isSafeInteger(params.price) || params.price < 0) {
      throw new ValidationError("price must be a non-negative integer");
    }

    return new Item(params.id as ItemId, {
      name,
      description,
      price: params.price,
      createdAt: params.now,
      updatedAt: params.now,
    });
  }

  /** 永続化層からの復元。保存済みデータは検証済みとみなす。 */
  static reconstruct(id: string, props: ItemProps): Item {
    return new Item(id as ItemId, { ...props });
  }

  get name(): string {
    return this.props.name;
  }

  get description(): string | null {
    return this.props.description;
  }

  get price(): number {
    return this.props.price;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get updatedAt(): Date {
    return this.props.updatedAt;
  }
}
