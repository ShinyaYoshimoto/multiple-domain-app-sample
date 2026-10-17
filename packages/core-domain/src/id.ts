import { randomUUID } from "node:crypto";

/**
 * 公称型（Branded Type）。`ItemId` と `UserId` のような異なる ID の取り違えを型レベルで防ぐ。
 */
export type Brand<T, TBrand extends string> = T & { readonly __brand: TBrand };

/** ID 採番のポート。テストでは固定値を返す実装に差し替えられる。 */
export interface IdGenerator {
  generate(): string;
}

export const uuidGenerator: IdGenerator = {
  generate: () => randomUUID(),
};
