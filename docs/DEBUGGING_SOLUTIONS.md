# FlashKart: Debugging Scenarios & Technical Solutions
**Root Cause Analysis (RCA) & Production Fixes (Tech Lead Assessment)**

---

## Section D1: Overselling Scenario (Stock = 100, Orders = 120)

### 1. Root Cause Analysis (RCA)

In a traditional or naive implementation, stock checks and order creation suffer from a classic **Read-Modify-Write (Check-Then-Act) Race Condition**:

```sql
-- Request 1 (Thread A) reads stock:
SELECT available_stock FROM products WHERE id = 1; -- Returns 1

-- Context switch: Request 2 (Thread B) also reads stock before Thread A writes:
SELECT available_stock FROM products WHERE id = 1; -- Returns 1

-- Thread A assumes stock >= 1 is valid, updates:
UPDATE products SET available_stock = available_stock - 1 WHERE id = 1; -- Stock becomes 0
INSERT INTO orders (...) VALUES (...);

-- Thread B ALSO assumes stock >= 1 is valid, updates:
UPDATE products SET available_stock = available_stock - 1 WHERE id = 1; -- Stock becomes -1!
INSERT INTO orders (...) VALUES (...);
```

When 10,000 concurrent users execute this pattern concurrently:
1. Multiple worker processes read the exact same positive stock snapshot simultaneously.
2. The check condition `if (stock > 0)` evaluates to `true` for all concurrent requests.
3. Every process proceeds to insert an order, resulting in **120 orders created for an initial inventory of 100 units** (20 oversold units).
4. Lack of database-level constraints allowed `available_stock` to dip into negative values or diverge from order count.

---

### 2. Concrete Production Fixes

#### Fix Option 1: In-Memory Atomic Reservation via Redis Lua Script (Implemented in FlashKart)
Because Redis is single-threaded, executing stock verification and decrement inside a Lua script makes the operation strictly atomic:
```lua
local currentStock = tonumber(redis.call('GET', stockKey))
if currentStock < quantity then
    return { 0, "Insufficient stock remaining" }
end
redis.call('DECRBY', stockKey, quantity)
return { 1, "Reservation successful" }
```
- No two requests can inspect the stock simultaneously.
- If only 100 units are in stock, exactly 100 decrements succeed. The 101st request will evaluate `currentStock < 1` and fail immediately with `0`.

#### Fix Option 2: Database-Level Atomic Conditional Update (Defense-in-Depth)
If executing directly against the relational database, eliminate the separate `SELECT` query and use atomic conditional SQL with non-negative constraints:
```sql
-- 1. Enforce non-negative constraint
ALTER TABLE products ADD CONSTRAINT chk_stock_non_negative CHECK (available_stock >= 0);

-- 2. Atomic conditional decrement
UPDATE products 
SET available_stock = available_stock - 1 
WHERE id = :productId AND available_stock >= 1;

-- Check rows affected in application code:
-- If affectedRows === 0: Throw InsufficientStockError (roll back order).
-- If affectedRows === 1: Proceed with order creation.
```

---

## Section D2: Duplicate Checkout Scenario (Page Refresh Creates Two Orders)

### 1. Root Cause Analysis (RCA)

When a customer submits a payment or confirms checkout:
1. The user clicks **"Place Order"**.
2. Due to high network latency, payment gateway delay, or impatience, the user clicks **"Refresh" (F5)** or clicks **"Place Order" twice**.
3. The browser re-submits the exact same HTTP `POST /order/checkout` payload.
4. If the backend is non-idempotent:
   - Request 1 creates Order #1 in the database.
   - Request 2 creates Order #2 in the database.
   - The user is billed twice and inventory is decremented twice.

---

### 2. Concrete Production Fixes (Implemented in FlashKart)

#### Fix 1: Client-Generated Idempotency Key
Before triggering the checkout request, the client application generates a unique UUID (v4) for the checkout intent:
```typescript
// Frontend checkout call
const idempotencyKey = crypto.randomUUID();
await fetch('/api/order/checkout', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Idempotency-Key': idempotencyKey
  },
  body: JSON.stringify({ userId, reservationId, cartId })
});
```

#### Fix 2: Database Unique Index Constraint
In the `Order` entity, the `idempotencyKey` column is protected by a strict `UNIQUE` constraint at the database engine level:
```typescript
@Index({ unique: true })
@Column({ type: 'varchar', length: 128 })
idempotencyKey!: string;
```

#### Fix 3: Idempotent Request Lifecycle Handling
Inside `checkout.service.ts`:
1. **Lookup Existing**:
   ```typescript
   const existingOrder = await orderRepository.findOne({ where: { idempotencyKey } });
   if (existingOrder) {
     return {
       success: true,
       order: existingOrder,
       isIdempotentReplay: true, // Return HTTP 200 with previously created order
       statusCode: 200
     };
   }
   ```
2. **Atomic Ingestion**:
   If two requests with the same key arrive at the exact same millisecond:
   - Request 1 enters the TypeORM transaction, inserts the row, and commits.
   - Request 2 attempts to insert with the identical `idempotencyKey`. The database throws a unique constraint violation (`23505` in Postgres).
   - The exception is caught gracefully and redirected to return the order created by Request 1.
3. **Single-Use Reservation Consumption**:
   Upon successful checkout, the Redis reservation key `flash:res:{reservationId}` is deleted immediately. Even if an attacker tries to replay with a forged new idempotency key, the reservation check fails with `410 Gone`.
