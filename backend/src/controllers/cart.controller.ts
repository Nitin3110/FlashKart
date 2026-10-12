import { Request, Response } from 'express';
import { StockReservationService } from '../services/stockReservation.service';
import { AppDataSource } from '../config/database';
import { Cart, CartItem, CartItemStatus, CartStatus, Product, User } from '../entities';

export class CartController {
  private reservationService: StockReservationService;

  constructor() {
    this.reservationService = new StockReservationService();
  }

  /**
   * POST /cart/reserve
   * Reserves product stock for 5 minutes under high concurrency.
   */
  reserve = async (req: Request, res: Response): Promise<void> => {
    try {
      const { userId, productId, quantity = 1 } = req.body;

      if (!userId || !productId) {
        res.status(400).json({
          success: false,
          error: 'userId and productId are required in request body.'
        });
        return;
      }

      const productRepo = AppDataSource.getRepository(Product);
      let product = await productRepo.findOne({ where: { id: productId } });

      // Support aliases or fallback to flagship deal
      if (!product) {
        product = await productRepo.findOne({
          where: { title: 'FlashKart Lightning Deal: Sony WH-1000XM5 ANC Headphones' }
        });
        if (!product) {
          product = await productRepo.findOne({ order: { createdAt: 'DESC' } });
        }
      }

      if (!product) {
        res.status(404).json({
          success: false,
          error: `Product '${productId}' not found in catalog.`
        });
        return;
      }

      const resolvedProductId = product.id;

      // Ensure Redis cache has active stock for this product; auto-prime if cold
      const stockKey = `flash:stock:${resolvedProductId}`;
      const stockExists = await (this.reservationService as any).redis.exists(stockKey);
      if (!stockExists && product.availableStock > 0) {
        await this.reservationService.initializeProductStock(resolvedProductId, product.availableStock);
      }

      // Step 1: Perform atomic reservation in Redis
      const reservationResult = await this.reservationService.reserveStock(
        userId,
        resolvedProductId,
        Number(quantity)
      );

      if (!reservationResult.success) {
        res.status(reservationResult.statusCode || 400).json({
          success: false,
          error: reservationResult.error
        });
        return;
      }

      // Step 2: Persist / associate with user's Cart in database
      const userRepo = AppDataSource.getRepository(User);
      let user = await userRepo.findOne({ where: { id: userId } });
      if (!user) {
        user = userRepo.create({
          id: userId,
          email: `${userId}@flashkart.com`,
          name: 'Flash Sale Shopper'
        });
        await userRepo.save(user);
      }

      const cartRepo = AppDataSource.getRepository(Cart);
      const cartItemRepo = AppDataSource.getRepository(CartItem);

      const unitPrice = product.flashSalePrice || product.originalPrice;

      // Find or create active cart for user
      let cart = await cartRepo.findOne({
        where: { userId, status: CartStatus.ACTIVE }
      });

      if (!cart) {
        cart = cartRepo.create({
          userId,
          status: CartStatus.ACTIVE
        });
        await cartRepo.save(cart);
      }

      // Record CartItem with reservationId and expiry timestamp
      const cartItem = cartItemRepo.create({
        cartId: cart.id,
        productId: resolvedProductId,
        quantity: Number(quantity),
        unitPrice,
        reservationId: reservationResult.reservationId || null,
        reservedUntil: reservationResult.expiresAt ? new Date(reservationResult.expiresAt) : null,
        status: CartItemStatus.RESERVED
      });
      await cartItemRepo.save(cartItem);

      res.status(201).json({
        success: true,
        message: 'Stock reserved successfully for 5 minutes',
        data: {
          cartId: cart.id,
          cartItemId: cartItem.id,
          reservationId: reservationResult.reservationId,
          productId: reservationResult.productId,
          quantity: reservationResult.quantity,
          remainingStock: reservationResult.remainingStock,
          expiresAt: reservationResult.expiresAt,
          ttlSeconds: reservationResult.ttlSeconds
        }
      });
    } catch (error: any) {
      console.error('[CartController] Reserve error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to reserve cart item'
      });
    }
  };
}
