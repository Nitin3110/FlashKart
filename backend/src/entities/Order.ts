import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  Index,
  JoinColumn
} from 'typeorm';
import { User } from './User';

export enum OrderStatus {
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED'
}

/**
 * Order Entity
 * Represents finalized purchases from the flash sale.
 * 
 * Concurrency & Idempotency Safeguards:
 * - idempotencyKey: UNIQUE indexed field ensuring that network retries,
 *   double-clicks, or browser refreshes can NEVER create duplicate orders.
 */
@Entity('orders')
export class Order {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 50 })
  orderNumber!: string;

  @Index()
  @Column({ type: 'varchar' })
  userId!: string;

  @ManyToOne(() => User, (user) => user.orders)
  @JoinColumn({ name: 'userId' })
  user!: User;

  @Column({ type: 'varchar', nullable: true })
  cartId!: string | null;

  /**
   * Unique idempotency key supplied by the client during checkout.
   * If a duplicate request arrives with the same key, it is rejected or returned idempotently.
   */
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 128 })
  idempotencyKey!: string;

  @Column({ type: 'float' })
  totalAmount!: number;

  @Index()
  @Column({
    type: 'varchar',
    length: 30,
    default: OrderStatus.CONFIRMED
  })
  status!: OrderStatus;

  /**
   * JSON snapshot of ordered products, pricing, and reserved quantities
   */
  @Column({ type: 'simple-json', nullable: true })
  orderItemsSnapshot!: Array<{
    productId: string;
    productTitle: string;
    quantity: number;
    unitPrice: number;
    subtotal: number;
  }>;

  @Index()
  @CreateDateColumn({ type: 'datetime' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'datetime' })
  updatedAt!: Date;
}
