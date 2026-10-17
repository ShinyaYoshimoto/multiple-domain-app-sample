/**
 * ID による同一性を持つエンティティの基底クラス。
 */
export abstract class Entity<TId extends string = string> {
  protected constructor(public readonly id: TId) {}

  equals(other: Entity<TId> | null | undefined): boolean {
    return other != null && other.constructor === this.constructor && other.id === this.id;
  }
}
