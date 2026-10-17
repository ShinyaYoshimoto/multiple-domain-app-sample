import type { ErrorRequestHandler } from "express";
import { ConflictError, DomainError, NotFoundError, ValidationError } from "@packages/core-domain";

/**
 * ドメインエラー -> HTTP ステータスの変換。
 * HTTP の知識はこのアダプター層だけが持つ。
 */
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof DomainError) {
    res.status(statusOf(err)).json({ error: { code: err.code, message: err.message } });
    return;
  }

  // express.json() が投げる不正 JSON エラー
  if (isBodyParserError(err)) {
    res.status(400).json({ error: { code: "INVALID_JSON", message: "Malformed JSON body" } });
    return;
  }

  // Cloud Logging が構造化ログとして解釈できるよう JSON で出力する
  console.error(
    JSON.stringify({
      severity: "ERROR",
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    }),
  );
  res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Internal server error" } });
};

function statusOf(err: DomainError): number {
  if (err instanceof ValidationError) return 400;
  if (err instanceof NotFoundError) return 404;
  if (err instanceof ConflictError) return 409;
  return 400;
}

function isBodyParserError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { type?: unknown }).type === "entity.parse.failed"
  );
}
