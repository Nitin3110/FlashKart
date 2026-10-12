import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { getRedisClient, IRedisClient } from '../config/redis';

export interface ReservationResult {
  success: boolean;
  reservationId?: string;
  productId: string;
  quantity: number;
  remainingStock?: number;
  expiresAt?: string;
  ttlSeconds?: number;
  error?: string;
  statusCode?: number;
}

export class StockReservationService {
  private redis: IRedisClient;
  private reserveLuaScript: string;
  private releaseLuaScript: string;
  private readonly DEFAULT_TTL_SECONDS = 300; // 5 minutes reservation TTL

  constructor() {
    this.redis = getRedisClient();
    this.reserveLuaScript = fs.readFileSync(
      path.join(__dirname, '../scripts/reserve_stock.lua'),
      'utf8'
    );
    this.releaseLuaScript = fs.readFileSync(
      path.join(__dirname, '../scripts/release_stock.lua'),
      'utf8'
    );
  }

  /**
   * Initializes Redis cache with current product stock for the flash sale.
   */
  async initializeProductStock(productId: string, initialStock: number): Promise<void> {
    const stockKey = `flash:stock:${productId}`;
    await this.redis.set(stockKey, String(initialStock));
  }

  /**
   * Retrieves remaining stock from Redis cache.
   */
  async getProductStock(productId: string): Promise<number> {
    const stockKey = `flash:stock:${productId}`;
    const val = await this.redis.get(stockKey);
    return val !== null ? parseInt(val, 10) : 0;
  }

  /**
   * Reserves stock for 5 minutes using atomic Redis Lua execution.
   * 
   * How Redis prevents race conditions:
   * Redis executes commands and Lua scripts sequentially in a single-threaded event loop.
   * Because a Lua script executes as an atomic transactional unit, no other Redis client
   * can inspect or mutate keys between the stock check (`GET`) and decrement (`DECRBY`).
   * This completely prevents the classic check-then-act / read-modify-write race condition.
   */
  async reserveStock(
    userId: string,
    productId: string,
    quantity: number = 1
  ): Promise<ReservationResult> {
    if (!userId || !productId || quantity <= 0) {
      return {
        success: false,
        productId,
        quantity,
        error: 'Invalid input: userId, productId, and positive quantity required',
        statusCode: 400
      };
    }

    const reservationId = `res_${uuidv4()}`;
    const ttlSeconds = this.DEFAULT_TTL_SECONDS;
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();

    const stockKey = `flash:stock:${productId}`;
    const resKey = `flash:res:${reservationId}`;
    const userResKey = `flash:user_res:${userId}:${productId}`;

    try {
      const result = await this.redis.eval(
        this.reserveLuaScript,
        3,
        stockKey,
        resKey,
        userResKey,
        quantity,
        ttlSeconds,
        userId,
        reservationId,
        expiresAt,
        productId
      );

      const [statusCode, message, remaining] = result;

      if (statusCode === 1) {
        return {
          success: true,
          reservationId,
          productId,
          quantity,
          remainingStock: parseInt(remaining, 10),
          expiresAt,
          ttlSeconds,
          statusCode: 201
        };
      }

      if (statusCode === -2) {
        // User already has an active reservation
        return {
          success: false,
          productId,
          quantity,
          error: message || 'You already have an active reservation for this product',
          statusCode: 429
        };
      }

      if (statusCode === 0) {
        // Sold out / insufficient stock
        return {
          success: false,
          productId,
          quantity,
          error: 'Product is sold out or insufficient stock remaining',
          statusCode: 409
        };
      }

      return {
        success: false,
        productId,
        quantity,
        error: message || 'Unable to reserve stock',
        statusCode: 400
      };
    } catch (err: any) {
      console.error('[StockReservationService] Error executing reserve Lua script:', err);
      return {
        success: false,
        productId,
        quantity,
        error: 'Internal reservation service error',
        statusCode: 500
      };
    }
  }

  /**
   * Retrieves reservation details from Redis hash if still valid.
   */
  async getReservation(reservationId: string): Promise<Record<string, string> | null> {
    const resKey = `flash:res:${reservationId}`;
    const data = await this.redis.hgetall(resKey);
    if (!data || Object.keys(data).length === 0) {
      return null;
    }
    return data;
  }

  /**
   * Releases reserved stock back to the active pool (e.g. upon payment failure or user cancellation).
   */
  async releaseReservation(
    productId: string,
    reservationId: string,
    quantity: number,
    userId?: string
  ): Promise<boolean> {
    const stockKey = `flash:stock:${productId}`;
    const resKey = `flash:res:${reservationId}`;
    const userResKey = userId ? `flash:user_res:${userId}:${productId}` : '';

    try {
      const result = await this.redis.eval(
        this.releaseLuaScript,
        3,
        stockKey,
        resKey,
        userResKey,
        quantity
      );
      return result[0] === 1;
    } catch (err) {
      console.error('[StockReservationService] Error releasing reservation:', err);
      return false;
    }
  }
}
