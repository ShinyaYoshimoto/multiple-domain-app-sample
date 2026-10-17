import { ConflictError, DomainError, NotFoundError } from "@packages/core-domain";

/**
 * Prisma の既知エラー（PrismaClientKnownRequestError）をドメインエラーに変換する。
 * 生成クライアントがアプリごとに異なるため instanceof ではなく `code` で判定する。
 * @see https://www.prisma.io/docs/orm/reference/error-reference
 */
export function translatePrismaError(error: unknown, resource: string, id = "unknown"): unknown {
  if (error instanceof DomainError) return error;
  if (!isPrismaKnownError(error)) return error;

  switch (error.code) {
    case "P2002": // Unique constraint failed
      return new ConflictError(`${resource} already exists`);
    case "P2025": // Record to update/delete not found
      return new NotFoundError(resource, id);
    default:
      return error;
  }
}

function isPrismaKnownError(error: unknown): error is { code: string } {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof (error as { code: unknown }).code === "string" &&
    /^P\d{4}$/.test((error as { code: string }).code)
  );
}
