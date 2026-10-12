# FlashKart ⚡ High-Concurrency Flash Sale Platform
> **Tech Lead Hands-on Assessment Implementation**  
> Complete, production-quality implementation of an ultra-high concurrency flash sale platform similar to Amazon Lightning Deals.

---

## 📖 Team Guides & Documentation

- 📘 **[Team Run & Onboarding Guide](file:///e:/Work/Aure/FlashKart/docs/TEAM_RUN_GUIDE.md)**: Detailed step-by-step instructions for running services, running tests, Docker setup, and troubleshooting.
- ⚡ **[Redis, Overselling, Consistency & Concurrency Guide](file:///e:/Work/Aure/FlashKart/docs/CONCURRENCY_REDIS_CONSISTENCY.md)**: Comprehensive deep dive on Redis single-threaded mechanics, mathematical proof of zero overselling, dual-state data consistency, and 10k req/s concurrency.
- 🔒 **[TypeORM Transactions & Idempotency Key Guide](file:///e:/Work/Aure/FlashKart/docs/TYPEORM_TRANSACTIONS_AND_IDEMPOTENCY.md)**: In-depth technical breakdown of ACID transactions, QueryRunner pattern, connection pool safety, duplicate checkout elimination, and compensating rollbacks.
- 📐 **[System Design Document](file:///e:/Work/Aure/FlashKart/docs/SYSTEM_DESIGN.md)**: 10,000 req/sec architecture, Mermaid diagram, Redis concurrency, and disaster recovery.
- 🐞 **[Debugging Solutions](file:///e:/Work/Aure/FlashKart/docs/DEBUGGING_SOLUTIONS.md)**: Root cause analysis and production fixes for overselling (100 stock / 120 orders) and duplicate checkouts.

---

## 🏗️ Architecture Overview

FlashKart is designed to withstand 10,000+ requests per second with **zero overselling**, **strict data consistency**, and **sub-millisecond latency**:

- **Backend**: Node.js, Express, TypeScript, TypeORM, Redis (ioredis), SQLite / PostgreSQL.
- **Frontend**: React, TypeScript, Vite, responsive vanilla CSS design system with countdown and reservation progress animations.
- **Concurrency Control**: Atomic Redis Lua scripts (`reserve_stock.lua` & `release_stock.lua`) executing inside Redis's single-threaded event loop.
- **Idempotency & Transactions**: ACID transactions via TypeORM `QueryRunner` + database-level unique index on `idempotencyKey` preventing duplicate checkouts on browser refreshes or double submissions.

```text
FlashKart/
├── backend/                       # Node.js + TypeORM + Redis Backend
│   ├── src/
│   │   ├── entities/              # User, Product, Cart, CartItem, Order
│   │   ├── scripts/               # Atomic Lua scripts (reserve & release)
│   │   ├── services/              # StockReservationService & CheckoutService
│   │   ├── controllers/           # Cart, Order, and Product controllers
│   │   └── config/                # TypeORM DataSource & Redis Proxy
│   ├── tests/
│   │   └── concurrency.test.ts    # Concurrency, Overselling & Idempotency tests
│   └── docker-compose.yml         # Redis & PostgreSQL services
│
├── frontend/                      # React.js Flash Sale Deal Interface
│   ├── src/
│   │   ├── components/            # ProductCard, StockCounter, SaleCountdown, ReservationTimer, CheckoutModal
│   │   ├── hooks/                 # useFlashSale, useCountdown
│   │   ├── index.css              # Custom styling & micro-animations
│   │   └── App.tsx
│
└── docs/
    ├── TEAM_RUN_GUIDE.md          # Developer onboarding, single-command run, and Docker guide
    ├── SYSTEM_DESIGN.md           # 10,000 req/s System Design, Mermaid diagram, Consistency & Failover (Section C)
    └── DEBUGGING_SOLUTIONS.md     # Detailed Root Cause Analysis & Fixes for Overselling & Duplicate Checkout (Section D)
```

---

## 🚀 Single-Command Startup (For Team)

### 1. Install Dependencies Across Monorepo (One-Time)
```bash
npm run install:all
```

### 2. Start Full Platform (Backend + Frontend)
```bash
npm start
```
*(or `npm run dev`, or simply run `./start.bat` on Windows)*

- **Backend API**: [`http://localhost:5000`](http://localhost:5000) (auto-reloads on edits via `tsx watch`)
- **Frontend App**: [`http://localhost:5173`](http://localhost:5173) (Vite HMR)
- **Unified Logging**: Output from both services is streamed with colored labels (`[BACKEND]` / `[FRONTEND]`).

---

## 🧪 Run Automated Concurrency & Idempotency Tests
To verify zero overselling under race conditions and safe idempotent replay:
```bash
npm run test:concurrency
```
**Test Results:**
- 50 concurrent requests for 15 units $\rightarrow$ Exactly 15 succeed, 35 rejected with HTTP 409, Redis stock is 0 (Zero overselling).
- Duplicate checkout with same `Idempotency-Key` $\rightarrow$ Replays original order safely, exactly 1 order record in DB.
- Expired reservation $\rightarrow$ Rejected with HTTP 410.

---

## 📋 Assessment Section Coverage

| Section | Topic | Marks | Implementation Reference |
| :--- | :--- | :---: | :--- |
| **A1** | Entity Design | 10 | [`backend/src/entities/`](file:///e:/Work/Aure/FlashKart/backend/src/entities/) (`User.ts`, `Product.ts`, `Cart.ts`, `CartItem.ts`, `Order.ts`) with optimistic locking and unique indexes. |
| **A2** | Stock Reservation API | 25 | `POST /cart/reserve` via [`stockReservation.service.ts`](file:///e:/Work/Aure/FlashKart/backend/src/services/stockReservation.service.ts) & [`reserve_stock.lua`](file:///e:/Work/Aure/FlashKart/backend/src/scripts/reserve_stock.lua) with 5-minute TTL. |
| **A3** | Checkout API | 20 | `POST /order/checkout` via [`checkout.service.ts`](file:///e:/Work/Aure/FlashKart/backend/src/services/checkout.service.ts) with TypeORM transactions and idempotency key. |
| **B** | React.js Flash Sale Page | 15 | [`frontend/src/App.tsx`](file:///e:/Work/Aure/FlashKart/frontend/src/App.tsx) and components with 5-minute countdown and state machine. |
| **C1 & C2** | High-Concurrency System Design | 20 | [`docs/SYSTEM_DESIGN.md`](file:///e:/Work/Aure/FlashKart/docs/SYSTEM_DESIGN.md) (10,000 req/sec architecture, Mermaid diagram, Redis/DB consistency). |
| **D1 & D2** | Debugging (Overselling & Duplicates) | 10 | [`docs/DEBUGGING_SOLUTIONS.md`](file:///e:/Work/Aure/FlashKart/docs/DEBUGGING_SOLUTIONS.md) (In-depth root cause analysis and production solutions). |
| **Total** | | **100** | Production-ready code, tests, and documentation. |
