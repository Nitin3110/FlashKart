import { Request, Response } from 'express';
import { CheckoutService } from '../services/checkout.service';

export class OrderController {
  private checkoutService: CheckoutService;

  constructor() {
    this.checkoutService = new CheckoutService();
  }

  /**
   * POST /order/checkout
   * Converts a stock reservation into a confirmed order.
   * Requires an Idempotency-Key header to eliminate duplicate order creation.
   */
  checkout = async (req: Request, res: Response): Promise<void> => {
    try {
      const idempotencyKey =
        (req.headers['idempotency-key'] as string) || req.body.idempotencyKey;
      const { userId, cartId, reservationId } = req.body;

      if (!idempotencyKey) {
        res.status(400).json({
          success: false,
          error: 'Header "Idempotency-Key" or field "idempotencyKey" in body is required.'
        });
        return;
      }

      if (!userId || !reservationId) {
        res.status(400).json({
          success: false,
          error: 'userId and reservationId are required in request body.'
        });
        return;
      }

      const result = await this.checkoutService.processCheckout({
        userId,
        cartId,
        reservationId,
        idempotencyKey
      });

      if (!result.success) {
        res.status(result.statusCode || 400).json({
          success: false,
          error: result.error
        });
        return;
      }

      res.status(result.statusCode || (result.isIdempotentReplay ? 200 : 201)).json({
        success: true,
        isIdempotentReplay: result.isIdempotentReplay,
        message: result.isIdempotentReplay
          ? 'Idempotent request: Order previously placed and confirmed'
          : 'Order successfully confirmed',
        data: result.order
      });
    } catch (error: any) {
      console.error('[OrderController] Checkout error:', error);
      res.status(500).json({
        success: false,
        error: 'An internal error occurred during checkout'
      });
    }
  };
}
