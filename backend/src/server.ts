import 'reflect-metadata';
import dotenv from 'dotenv';
dotenv.config();

import { createApp } from './app';
import { initializeDatabase, AppDataSource } from './config/database';
import { Product, User } from './entities';
import { StockReservationService } from './services/stockReservation.service';

const PORT = process.env.PORT || 5000;

async function bootstrap() {
  try {
    // 1. Initialize Database
    await initializeDatabase();

    // 2. Auto-seed demo product if none exists
    const productRepo = AppDataSource.getRepository(Product);
    const userRepo = AppDataSource.getRepository(User);
    const reservationService = new StockReservationService();

    let demoUser = await userRepo.findOne({ where: { email: 'shopper@flashkart.com' } });
    if (!demoUser) {
      demoUser = userRepo.create({
        email: 'shopper@flashkart.com',
        name: 'Flash Sale Customer'
      });
      await userRepo.save(demoUser);
    }

    let defaultProduct = await productRepo.findOne({
      where: { title: 'FlashKart Lightning Deal: Sony WH-1000XM5 ANC Headphones' }
    });

    if (!defaultProduct) {
      defaultProduct = productRepo.create({
        title: 'FlashKart Lightning Deal: Sony WH-1000XM5 ANC Headphones',
        description: 'Industry-leading noise canceling with two processors and 8 microphones. Up to 30-hour battery life with quick charge (3 min charge for 3 hours of playback).',
        originalPrice: 399.99,
        flashSalePrice: 199.99,
        totalStock: 50,
        availableStock: 50,
        saleStartTime: new Date(),
        saleEndTime: new Date(Date.now() + 2 * 60 * 60 * 1000)
      });
      await productRepo.save(defaultProduct);
      console.log(`[Bootstrap] Seeded default product: ${defaultProduct.id}`);
    }

    // Initialize Redis cache with product stock
    await reservationService.initializeProductStock(defaultProduct.id, defaultProduct.availableStock);
    console.log(`[Bootstrap] Primed Redis stock for product ${defaultProduct.id}: ${defaultProduct.availableStock} units`);

    // 3. Start HTTP Server
    const app = createApp();
    app.listen(PORT, () => {
      console.log(`🚀 FlashKart API Server running on http://localhost:${PORT}`);
      console.log(`📌 Demo Product ID: ${defaultProduct.id}`);
      console.log(`📌 Demo User ID: ${demoUser.id}`);
    });
  } catch (error) {
    console.error('Fatal bootstrap error:', error);
    process.exit(1);
  }
}

bootstrap();
