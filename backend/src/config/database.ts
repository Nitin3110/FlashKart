import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { User, Product, Cart, CartItem, Order } from '../entities';
import path from 'path';

/**
 * TypeORM Data Source Configuration
 * Configured with SQLite for zero-dependency local runtime and testing,
 * with full configuration switchable to PostgreSQL via environment variables.
 */
export const AppDataSource = new DataSource({
  type: (process.env.DB_TYPE as any) || 'sqlite',
  database: process.env.DB_NAME || path.join(__dirname, '../../flashkart.sqlite'),
  synchronize: true, // Auto-sync schema for development / assessment setup
  logging: process.env.DB_LOGGING === 'true',
  entities: [User, Product, Cart, CartItem, Order],
  subscribers: [],
  migrations: [],
});

export const initializeDatabase = async (): Promise<DataSource> => {
  if (!AppDataSource.isInitialized) {
    await AppDataSource.initialize();
    console.log('[Database] TypeORM DataSource initialized successfully.');
  }
  return AppDataSource;
};
