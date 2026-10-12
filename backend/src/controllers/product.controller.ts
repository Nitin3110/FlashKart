import { Request, Response } from 'express';
import { AppDataSource } from '../config/database';
import { Product, User } from '../entities';
import { StockReservationService } from '../services/stockReservation.service';

export class ProductController {
  private reservationService: StockReservationService;

  constructor() {
    this.reservationService = new StockReservationService();
  }

  private async getOrCreateFlashProduct(): Promise<Product> {
    const productRepo = AppDataSource.getRepository(Product);

    let product = await productRepo.findOne({
      where: { title: 'FlashKart Lightning Deal: Sony WH-1000XM5 ANC Headphones' }
    });

    if (!product) {
      product = await productRepo.findOne({ order: { createdAt: 'DESC' } });
    }

    if (!product) {
      product = productRepo.create({
        title: 'FlashKart Lightning Deal: Sony WH-1000XM5 ANC Headphones',
        description: 'Industry-leading noise canceling with dual processors and 8 microphones. Up to 30-hour battery life with ultra-fast charging.',
        originalPrice: 399.99,
        flashSalePrice: 199.99,
        totalStock: 50,
        availableStock: 50,
        saleStartTime: new Date(),
        saleEndTime: new Date(Date.now() + 2 * 60 * 60 * 1000)
      });
      await productRepo.save(product);
    }

    return product;
  }

  /**
   * GET /products/active (or /products/current)
   * Fetches the currently active flash sale product and primes Redis.
   */
  getActiveProduct = async (_req: Request, res: Response): Promise<void> => {
    try {
      const product = await this.getOrCreateFlashProduct();

      let liveStock = await this.reservationService.getProductStock(product.id);

      // Auto-prime Redis if cache was cold
      const stockKey = `flash:stock:${product.id}`;
      const exists = await (this.reservationService as any).redis.exists(stockKey);
      if (!exists && product.availableStock > 0) {
        await this.reservationService.initializeProductStock(product.id, product.availableStock);
        liveStock = product.availableStock;
      }

      res.status(200).json({
        success: true,
        data: {
          ...product,
          remainingStock: liveStock
        }
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  };

  /**
   * GET /products/:id
   * Fetches product details combined with current live Redis flash stock.
   */
  getProduct = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const productRepo = AppDataSource.getRepository(Product);

      let product: Product | null = null;
      if (id && id !== 'demo-product-1' && id !== 'active' && id !== 'current') {
        product = await productRepo.findOne({ where: { id } });
      }

      // Fallback for aliases like 'demo-product-1', 'active', 'current', or unseeded states
      if (!product) {
        product = await this.getOrCreateFlashProduct();
      }

      let liveStock = await this.reservationService.getProductStock(product.id);

      // Auto-prime Redis if cache was cold
      const stockKey = `flash:stock:${product.id}`;
      const exists = await (this.reservationService as any).redis.exists(stockKey);
      if (!exists && product.availableStock > 0) {
        await this.reservationService.initializeProductStock(product.id, product.availableStock);
        liveStock = product.availableStock;
      }

      res.status(200).json({
        success: true,
        data: {
          ...product,
          remainingStock: liveStock
        }
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  };

  /**
   * POST /products/seed
   * Creates or updates a flash sale product and primes the Redis stock cache.
   */
  seedFlashSale = async (req: Request, res: Response): Promise<void> => {
    try {
      const {
        title = 'FlashKart Lightning Deal: Sony WH-1000XM5 ANC Headphones',
        description = 'Premium Noise-Cancelling Wireless Headphones with 30-hour battery life and Ultra-Fast Charging.',
        originalPrice = 399.99,
        flashSalePrice = 199.99,
        stock = 100
      } = req.body;

      const productRepo = AppDataSource.getRepository(Product);
      const userRepo = AppDataSource.getRepository(User);

      let demoUser = await userRepo.findOne({ where: { email: 'demo@flashkart.com' } });
      if (!demoUser) {
        demoUser = userRepo.create({
          email: 'demo@flashkart.com',
          name: 'Demo Flash Shopper'
        });
        await userRepo.save(demoUser);
      }

      let product = await productRepo.findOne({ where: { title } });
      if (!product) {
        product = productRepo.create({
          title,
          description,
          originalPrice,
          flashSalePrice,
          totalStock: stock,
          availableStock: stock,
          saleStartTime: new Date(),
          saleEndTime: new Date(Date.now() + 2 * 60 * 60 * 1000)
        });
      } else {
        product.totalStock = stock;
        product.availableStock = stock;
      }
      await productRepo.save(product);

      await this.reservationService.initializeProductStock(product.id, stock);

      res.status(201).json({
        success: true,
        message: 'Flash sale primed and cached in Redis successfully',
        data: {
          product,
          demoUser,
          redisStock: stock
        }
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  };
}
