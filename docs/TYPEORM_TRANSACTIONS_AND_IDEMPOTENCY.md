# FlashKart: TypeORM Transactions & Idempotency Key Architecture
**Technical Deep Dive: ACID Transactions, Idempotency Pattern, and Duplicate Order Elimination**

---

## 1. Executive Summary & Problem Definition

In e-commerce and high-concurrency flash sales, the checkout operation is the most critical financial and transactional phase of the entire platform. 

Two classic failure modes occur if checkout is naively designed:
1. **The Partial-Write / Inconsistent State Problem**:
   If an application decrements inventory in the `Product` table and then crashes or encounters an unhandled exception before inserting the `Order` record, inventory is permanently leaked while no order is placed.
2. **The Double-Submit / Duplicate Order Problem**:
   Network latency, cellular reconnects, impatient customers double-clicking "Pay Now", or refreshing the page (F5) can resend the identical HTTP `POST /order/checkout` payload. Without idempotency protection, two distinct orders are created, billing the customer twice and deducting inventory twice.

FlashKart resolves these failure modes through **ACID TypeORM Database Transactions (`QueryRunner`)** paired with a **Unique Indexed Idempotency Key**.

---

## 2. TypeORM Transactions Deep Dive

### 2.1 The ACID Guarantee in FlashKart
A standard checkout touches multiple tables simultaneously:
- **`Product`**: Decrements `availableStock` and increments `version`.
- **`Order`**: Inserts a new confirmed order record.
- **`CartItem`**: Updates status from `RESERVED` to `PURCHASED`.
- **`Cart`**: Updates status to `CHECKED_OUT`.

To preserve database integrity, these operations must execute as an **ACID Unit**:
- **Atomicity**: All four mutations succeed together, or **none** take effect. If any step fails, the entire transaction is unwound via `ROLLBACK`.
- **Consistency**: Invariants such as `availableStock >= 0` and `UNIQUE(idempotencyKey)` are never violated.
- **Isolation**: Concurrent transactions cannot read intermediate states (e.g., cannot see stock decremented before order insertion commits).
- **Durability**: Once `COMMIT` executes, writes are permanently written to persistent storage.

---

### 2.2 Why `repository.save()` Is Insufficient
Using standard TypeORM repository methods:
```typescript
// ❌ VULNERABLE TO PARTIAL WRITES:
await productRepo.save(product);  // Operation 1 succeeds
// ... SERVER CRASHES OR PAYMENT GATEWAY THROWS ERROR ...
await orderRepo.save(order);      // Operation 2 NEVER EXECUTES (Inventory leaked!)
```
Standard repository calls execute in independent, auto-committed statements. If a failure occurs between statements, there is no automatic rollback mechanism.

---

### 2.3 The `QueryRunner` Transaction Pattern (Implemented in FlashKart)

FlashKart uses TypeORM's explicit `QueryRunner` interface to take complete control of the transactional boundary:

```typescript
// backend/src/services/checkout.service.ts
const queryRunner = AppDataSource.createQueryRunner();

// 1. Establish dedicated database connection
await queryRunner.connect();

// 2. Open transaction boundary
await queryRunner.startTransaction();

try {
  const productRepo = queryRunner.manager.getRepository(Product);
  const orderRepo = queryRunner.manager.getRepository(Order);
  const cartItemRepo = queryRunner.manager.getRepository(CartItem);
  const cartRepo = queryRunner.manager.getRepository(Cart);

  // Step A: Load product inside transaction
  const product = await productRepo.findOne({ where: { id: productId } });
  if (!product || product.availableStock < quantity) {
    throw new Error('Insufficient persistent inventory');
  }

  // Step B: Decrement persistent stock
  product.availableStock -= quantity;
  await productRepo.save(product);

  // Step C: Insert confirmed order with unique idempotencyKey
  const newOrder = orderRepo.create({
    orderNumber,
    userId,
    cartId,
    idempotencyKey,
    totalAmount,
    status: OrderStatus.CONFIRMED,
    orderItemsSnapshot
  });
  const savedOrder = await orderRepo.save(newOrder);

  // Step D: Update Cart & CartItems
  if (cartId) {
    await cartItemRepo.update({ cartId, productId }, { status: CartItemStatus.PURCHASED });
    await cartRepo.update({ id: cartId }, { status: CartStatus.CHECKED_OUT });
  }

  // 3. Commit all changes atomically
  await queryRunner.commitTransaction();

  return { success: true, order: savedOrder };
} catch (err) {
  // 4. Rollback on ANY failure
  await queryRunner.rollbackTransaction();

  // 5. Compensating action: Restore stock in Redis
  await this.reservationService.releaseReservation(productId, reservationId, quantity, userId);

  return { success: false, error: err.message };
} finally {
  // 6. ALWAYS release connection back to pool
  await queryRunner.release();
}
```

### 2.4 Why the `finally { queryRunner.release(); }` Block is Critical
Every transaction borrows a dedicated physical connection from the database connection pool (`pg-pool` or SQLite handler). If `queryRunner.release()` is omitted:
- Failed or timed-out transactions orphan connections.
- Under high concurrency, the connection pool exhausts within seconds, causing all subsequent API requests to hang and crash with connection timeouts (`EADDRNOTAVAIL` / `ConnectionPoolExhausted`).

---

## 3. Idempotency Key Architecture

### 3.1 What is Idempotency?
In computer science and API architecture:
$$\text{Operation}(x) = \text{Operation}(\text{Operation}(x))$$

An API endpoint is **idempotent** if making multiple identical requests has the exact same side-effect on the server as making a single request.
- `GET`, `PUT`, `DELETE` are naturally idempotent by HTTP specification.
- `POST /order/checkout` is **not** naturally idempotent, meaning each invocation creates a new resource unless explicitly protected.

---

### 3.2 The IETF `Idempotency-Key` Pattern

FlashKart implements the standard `Idempotency-Key` header pattern:

```text
Client (React)                  API Gateway / Express                 PostgreSQL Database
     │                                    │                                    │
     │── POST /order/checkout ───────────>│                                    │
     │   Headers:                         │                                    │
     │     Idempotency-Key: "idemp_101"   │                                    │
     │   Body:                            │                                    │
     │     { reservationId: "res_abc" }   │── SELECT * FROM orders ───────────>│
     │                                    │   WHERE idempotencyKey="idemp_101" │
     │                                    │<── NULL (Key not found) ───────────│
     │                                    │                                    │
     │                                    │── BEGIN TRANSACTION                │
     │                                    │── INSERT INTO orders (...) ───────>│
     │                                    │── COMMIT TRANSACTION               │
     │<── HTTP 201 Created (Order #1) ────│                                    │
     │                                    │                                    │
     │   === USER REFRESHES PAGE (F5) === │                                    │
     │                                    │                                    │
     │── POST /order/checkout ───────────>│                                    │
     │   Headers:                         │                                    │
     │     Idempotency-Key: "idemp_101"   │── SELECT * FROM orders ───────────>│
     │                                    │   WHERE idempotencyKey="idemp_101" │
     │                                    │<── Returns existing Order #1 ──────│
     │<── HTTP 200 OK (Replay Order #1) ──│  (No DB write, no double charge!) │
```

---

### 3.3 Three Layers of Idempotency Protection in FlashKart

#### Layer 1: Client Intent Key Generation
Before triggering checkout, the client generates a unique UUID (v4):
```typescript
// frontend/src/hooks/useFlashSale.ts
const idempotencyKey = `idemp_${Date.now()}_${crypto.randomUUID()}`;

await fetch('http://localhost:5000/api/order/checkout', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Idempotency-Key': idempotencyKey
  },
  body: JSON.stringify({ userId, reservationId, cartId })
});
```

#### Layer 2: Pre-Transaction Lookup (Fast Path)
Before initiating an expensive database transaction, the service queries the database for existing orders with this key:
```typescript
const existingOrder = await orderRepository.findOne({
  where: { idempotencyKey }
});

if (existingOrder) {
  // Safe Replay: Returns the original order immediately without touching inventory
  return {
    success: true,
    order: existingOrder,
    isIdempotentReplay: true,
    statusCode: 200
  };
}
```

#### Layer 3: Database Engine UNIQUE Constraint (The Ultimate Hardware Lock)
What if two identical requests arrive at the **exact same millisecond** in parallel threads?
- Both requests pass Layer 2 simultaneously because neither has committed yet.
- Thread 1 and Thread 2 both execute `INSERT INTO orders (idempotency_key, ...)`.

To defeat this race condition, FlashKart enforces a strict `UNIQUE` index at the database storage engine level:
```typescript
// backend/src/entities/Order.ts
@Entity('orders')
export class Order {
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 128 })
  idempotencyKey!: string;
  // ...
}
```

**How the database handles the collision**:
1. Thread 1 acquires the index page and commits successfully.
2. Thread 2 attempts to write the duplicate key. The database engine immediately aborts with:
   - PostgreSQL error `23505` (`unique_violation`)
   - SQLite error `SQLITE_CONSTRAINT_UNIQUE`
3. Thread 2 triggers the `catch` block, rolls back its transaction, and intercepts the error to fetch and return the order committed by Thread 1.

---

## 4. Cross-System Consistency: Dual-Write & Compensating Transactions

A critical challenge in microservices is coordinating between an in-memory cache (**Redis**) and a relational database (**PostgreSQL**).

### 4.1 The Happy Path Flow
1. **Redis Reservation**: `POST /cart/reserve` atomically decrements Redis stock by 1 and issues a 5-minute reservation token.
2. **Checkout**: `POST /order/checkout` validates the reservation token in Redis.
3. **Database Commit**: Database transaction decrements persistent inventory and inserts the order.
4. **Token Consumption**: Upon successful commit, `flash:res:{reservationId}` is deleted from Redis.
   - *Note*: We do **not** increment Redis stock here because the item has been legally purchased.

### 4.2 The Failure Path: Compensating Transaction (Saga Pattern)
What if payment processing fails or the database write throws an error?
If we only roll back the database transaction, inventory is preserved in PostgreSQL, but Redis stock would remain decremented by 1, leading to an **inventory leak in the cache**.

To prevent this desynchronization, FlashKart executes a **Compensating Transaction**:
```typescript
catch (err) {
  // 1. Rollback relational database
  await queryRunner.rollbackTransaction();

  // 2. Compensating Action: Atomically release stock in Redis
  await this.reservationService.releaseReservation(
    productId,
    reservationId,
    quantity,
    userId
  );
}
```

The atomic Lua script `release_stock.lua` performs:
```lua
if redis.call('EXISTS', resKey) == 1 then
  redis.call('DEL', resKey)
  redis.call('DEL', userResKey)
  redis.call('INCRBY', stockKey, quantity) -- Restores stock back to pool
  return { 1, "Reservation released and stock returned" }
end
```
**Outcome**: The inventory count is instantly restored in Redis, allowing another shopper to purchase the product immediately.

---

## 5. Summary Matrix for Evaluation

| Architecture Dimension | Naive Implementation | FlashKart Implementation |
| :--- | :--- | :--- |
| **Transaction Boundary** | Implicit `save()` calls | Explicit `queryRunner.startTransaction()` |
| **Rollback Handling** | Unhandled partial writes | `queryRunner.rollbackTransaction()` on any error |
| **Connection Pooling** | Vulnerable to connection leaks | Guaranteed `queryRunner.release()` in `finally` |
| **Page Refresh / Double-Click**| Multiple orders created & duplicate billing | Idempotent safe replay via `Idempotency-Key` |
| **Simultaneous Race Conditions** | Duplicate key collision | Hard `UNIQUE` database index constraint |
| **Cache & DB Consistency** | Inventory drift on failure | Distributed rollback via `release_stock.lua` |
| **Reservation Reuse** | Tokens can be reused | Tokens deleted immediately upon commit |
