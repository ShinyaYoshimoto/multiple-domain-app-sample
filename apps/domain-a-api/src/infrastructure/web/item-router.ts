import { type Request, type Response, Router } from "express";
import { ValidationError } from "@packages/core-domain";
import type { CreateItemUseCase } from "../../application/usecases/create-item.usecase";
import type { GetItemUseCase } from "../../application/usecases/get-item.usecase";

export interface ItemRouterDeps {
  createItemUseCase: CreateItemUseCase;
  getItemUseCase: GetItemUseCase;
}

/**
 * Item の HTTP アダプター（Driving Adapter）。
 * HTTP リクエストをユースケースの入力に変換し、結果を HTTP レスポンスへ変換するだけで、ビジネスロジックは持たない。
 * Express 5 は async ハンドラの reject を自動でエラーハンドラへ渡すため try/catch は不要。
 */
export function createItemRouter({ createItemUseCase, getItemUseCase }: ItemRouterDeps): Router {
  const router = Router();

  router.post("/", async (req: Request, res: Response) => {
    const body: unknown = req.body;
    if (typeof body !== "object" || body === null) {
      throw new ValidationError("request body must be a JSON object");
    }
    const { name, description, price } = body as Record<string, unknown>;
    if (typeof name !== "string") {
      throw new ValidationError("name must be a string");
    }
    if (description !== undefined && description !== null && typeof description !== "string") {
      throw new ValidationError("description must be a string or null");
    }
    if (typeof price !== "number") {
      throw new ValidationError("price must be a number");
    }

    const item = await createItemUseCase.execute({ name, description, price });
    res.status(201).location(`${req.baseUrl}/${item.id}`).json(item);
  });

  router.get("/:id", async (req: Request<{ id: string }>, res: Response) => {
    const item = await getItemUseCase.execute(req.params.id);
    res.json(item);
  });

  return router;
}
