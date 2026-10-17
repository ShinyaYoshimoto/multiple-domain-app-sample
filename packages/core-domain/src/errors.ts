/**
 * ドメイン層で投げるエラーの基底クラス。
 * Web アダプター側でこの型を見て HTTP ステータスへ変換する（ドメインは HTTP を知らない）。
 */
export abstract class DomainError extends Error {
  abstract readonly code: string;

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** 不変条件・入力値の検証違反 */
export class ValidationError extends DomainError {
  readonly code = "VALIDATION_ERROR";
}

/** 対象リソースが存在しない */
export class NotFoundError extends DomainError {
  readonly code = "NOT_FOUND";

  constructor(resource: string, id: string) {
    super(`${resource} not found: ${id}`);
  }
}

/** 一意制約違反など、現在の状態と矛盾する操作 */
export class ConflictError extends DomainError {
  readonly code = "CONFLICT";
}
