import { type Request, type Response, Router } from "express";
import { ValidationError } from "@packages/core-domain";
import type { CancelOrderUseCase } from "../../application/usecases/cancel-order.usecase";
import type { GetOrderUseCase } from "../../application/usecases/get-order.usecase";
import type { PlaceOrderUseCase } from "../../application/usecases/place-order.usecase";

export interface OrderRouterDeps {
  placeOrderUseCase: PlaceOrderUseCase;
  getOrderUseCase: GetOrderUseCase;
  cancelOrderUseCase: CancelOrderUseCase;
}

/**
 * Order の HTTP アダプター（Driving Adapter）。
 * HTTP リクエストをユースケースの入力に変換し、結果を HTTP レスポンスへ変換するだけで、ビジネスロジックは持たない。
 */
export function createOrderRouter({
  placeOrderUseCase,
  getOrderUseCase,
  cancelOrderUseCase,
}: OrderRouterDeps): Router {
  const router = Router();

  router.post("/", async (req: Request, res: Response) => {
    const body: unknown = req.body;
    if (typeof body !== "object" || body === null) {
      throw new ValidationError("request body must be a JSON object");
    }
    const { itemId, quantity } = body as Record<string, unknown>;
    if (typeof itemId !== "string") {
      throw new ValidationError("itemId must be a string");
    }
    if (typeof quantity !== "number") {
      throw new ValidationError("quantity must be a number");
    }

    const order = await placeOrderUseCase.execute({ itemId, quantity });
    res.status(201).location(`${req.baseUrl}/${order.id}`).json(order);
  });

  router.get("/:id", async (req: Request<{ id: string }>, res: Response) => {
    res.json(await getOrderUseCase.execute(req.params.id));
  });

  router.post("/:id/cancel", async (req: Request<{ id: string }>, res: Response) => {
    res.json(await cancelOrderUseCase.execute(req.params.id));
  });

  return router;
}
