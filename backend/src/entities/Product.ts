import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  VersionColumn,
  Index
} from 'typeorm';

/**
 * Product Entity
 * Represents flash sale inventory.
 * 
 * Key Design Features:
 * - availableStock: Tracked for database-level baseline.
 * - version: Optimistic locking field to prevent race conditions during DB updates.
 * - Index on availableStock & sale times for fast query filtering during high traffic.
 */
@Entity('products')
export class Product {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 255 })
  title!: string;

  @Column({ type: 'text', nullable: true })
  description!: string;

  @Column({ type: 'float' })
  originalPrice!: number;

  @Column({ type: 'float' })
  flashSalePrice!: number;

  @Column({ type: 'int', default: 0 })
  totalStock!: number;

  @Index()
  @Column({ type: 'int', default: 0 })
  availableStock!: number;

  @Index()
  @Column({ type: 'datetime', nullable: true })
  saleStartTime!: Date;

  @Index()
  @Column({ type: 'datetime', nullable: true })
  saleEndTime!: Date;

  /**
   * Version column provides built-in optimistic locking support
   * in TypeORM. Every update increments this value and verifies
   * that no concurrent transaction has modified the row.
   */
  @VersionColumn()
  version!: number;

  @CreateDateColumn({ type: 'datetime' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'datetime' })
  updatedAt!: Date;
}
