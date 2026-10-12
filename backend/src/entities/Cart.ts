import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  Index,
  JoinColumn
} from 'typeorm';
import { User } from './User';
import { CartItem } from './CartItem';

export enum CartStatus {
  ACTIVE = 'ACTIVE',
  CHECKED_OUT = 'CHECKED_OUT',
  EXPIRED = 'EXPIRED',
  ABANDONED = 'ABANDONED'
}

/**
 * Cart Entity
 * Holds items selected by a user during a flash sale.
 * Indexed on userId and status for quick cart retrieval.
 */
@Entity('carts')
export class Cart {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'varchar' })
  userId!: string;

  @ManyToOne(() => User, (user) => user.carts, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user!: User;

  @Index()
  @Column({
    type: 'varchar',
    length: 30,
    default: CartStatus.ACTIVE
  })
  status!: CartStatus;

  @OneToMany(() => CartItem, (item) => item.cart, { cascade: true })
  items!: CartItem[];

  @CreateDateColumn({ type: 'datetime' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'datetime' })
  updatedAt!: Date;
}
