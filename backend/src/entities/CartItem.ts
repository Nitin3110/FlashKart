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
import { Cart } from './Cart';
import { Product } from './Product';

export enum CartItemStatus {
  RESERVED = 'RESERVED',
  PURCHASED = 'PURCHASED',
  RELEASED = 'RELEASED',
  EXPIRED = 'EXPIRED'
}

/**
 * CartItem Entity
 * Links items in a cart with reserved product inventory.
 * 
 * Key Fields:
 * - reservationId: Unique token tracking the Redis reservation lock.
 * - reservedUntil: Timestamp representing the 5-minute reservation deadline.
 * - status: Tracks lifecycle from RESERVED to PURCHASED or RELEASED/EXPIRED.
 */
@Entity('cart_items')
export class CartItem {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'varchar' })
  cartId!: string;

  @ManyToOne(() => Cart, (cart) => cart.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'cartId' })
  cart!: Cart;

  @Index()
  @Column({ type: 'varchar' })
  productId!: string;

  @ManyToOne(() => Product, { eager: true })
  @JoinColumn({ name: 'productId' })
  product!: Product;

  @Column({ type: 'int', default: 1 })
  quantity!: number;

  @Column({ type: 'float' })
  unitPrice!: number;

  /**
   * Indexed unique reservation ID issued by the atomic stock reservation system.
   */
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 100, nullable: true })
  reservationId!: string | null;

  /**
   * The exact point in time when this item's hold on inventory expires.
   */
  @Index()
  @Column({ type: 'datetime', nullable: true })
  reservedUntil!: Date | null;

  @Index()
  @Column({
    type: 'varchar',
    length: 30,
    default: CartItemStatus.RESERVED
  })
  status!: CartItemStatus;

  @CreateDateColumn({ type: 'datetime' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'datetime' })
  updatedAt!: Date;
}
