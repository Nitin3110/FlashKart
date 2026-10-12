import Redis from 'ioredis';
import fs from 'fs';
import path from 'path';

export interface IRedisClient {
  get(key: string): Promise<string | null>;
  set(key: string, val: string, ...args: any[]): Promise<'OK' | null>;
  del(...keys: string[]): Promise<number>;
  hgetall(key: string): Promise<Record<string, string>>;
  exists(...keys: string[]): Promise<number>;
  ttl(key: string): Promise<number>;
  eval(script: string, numkeys: number, ...args: (string | number)[]): Promise<any>;
}

export class InMemoryRedisMock implements IRedisClient {
  private store: Map<string, { value: any; expiresAt?: number }> = new Map();

  private isExpired(entry?: { value: any; expiresAt?: number }): boolean {
    if (!entry) return true;
    if (entry.expiresAt && Date.now() > entry.expiresAt) return true;
    return false;
  }

  private cleanIfExpired(key: string) {
    const entry = this.store.get(key);
    if (entry && this.isExpired(entry)) {
      this.store.delete(key);
    }
  }

  async get(key: string): Promise<string | null> {
    this.cleanIfExpired(key);
    const entry = this.store.get(key);
    return entry ? String(entry.value) : null;
  }

  async set(key: string, val: string, ...args: any[]): Promise<'OK' | null> {
    let ttlMs: number | undefined;
    for (let i = 0; i < args.length; i++) {
      if (typeof args[i] === 'string' && args[i].toUpperCase() === 'EX' && args[i + 1]) {
        ttlMs = Number(args[i + 1]) * 1000;
      }
      if (typeof args[i] === 'string' && args[i].toUpperCase() === 'PX' && args[i + 1]) {
        ttlMs = Number(args[i + 1]);
      }
    }
    this.store.set(key, {
      value: val,
      expiresAt: ttlMs ? Date.now() + ttlMs : undefined
    });
    return 'OK';
  }

  async del(...keys: string[]): Promise<number> {
    let count = 0;
    for (const k of keys) {
      if (this.store.delete(k)) count++;
    }
    return count;
  }

  async hgetall(key: string): Promise<Record<string, string>> {
    this.cleanIfExpired(key);
    const entry = this.store.get(key);
    if (!entry || typeof entry.value !== 'object') return {};
    return entry.value;
  }

  async exists(...keys: string[]): Promise<number> {
    let count = 0;
    for (const k of keys) {
      this.cleanIfExpired(k);
      if (this.store.has(k)) count++;
    }
    return count;
  }

  async ttl(key: string): Promise<number> {
    this.cleanIfExpired(key);
    const entry = this.store.get(key);
    if (!entry) return -2;
    if (!entry.expiresAt) return -1;
    return Math.max(0, Math.floor((entry.expiresAt - Date.now()) / 1000));
  }

  async eval(script: string, numkeys: number, ...args: (string | number)[]): Promise<any> {
    const keys = args.slice(0, numkeys) as string[];
    const argv = args.slice(numkeys) as (string | number)[];

    if (script.includes("Atomic Stock Reservation Lua Script")) {
      const stockKey = keys[0];
      const resKey = keys[1];
      const userResKey = keys[2];
      const quantity = Number(argv[0]);
      const ttlSeconds = Number(argv[1]);
      const userId = String(argv[2]);
      const reservationId = String(argv[3]);
      const expiresAt = String(argv[4]);
      const productId = String(argv[5]);

      this.cleanIfExpired(userResKey);
      if (this.store.has(userResKey)) {
        return [-2, "User already has an active reservation for this flash sale item"];
      }

      this.cleanIfExpired(stockKey);
      const stockEntry = this.store.get(stockKey);
      if (!stockEntry) {
        return [-1, "Product flash stock is not initialized or sale has ended"];
      }
      const currentStock = Number(stockEntry.value);
      if (currentStock < quantity) {
        return [0, "Insufficient stock remaining"];
      }

      // Decrement stock
      const newStock = currentStock - quantity;
      this.store.set(stockKey, { value: newStock, expiresAt: stockEntry.expiresAt });

      // Set reservation
      const ttlMs = ttlSeconds * 1000;
      this.store.set(resKey, {
        value: {
          reservationId,
          userId,
          productId,
          quantity: String(quantity),
          expiresAt
        },
        expiresAt: Date.now() + ttlMs
      });

      // Set user reservation lock
      this.store.set(userResKey, {
        value: reservationId,
        expiresAt: Date.now() + ttlMs
      });

      return [1, "Reservation successful", String(newStock)];
    }

    if (script.includes("Atomic Stock Release Lua Script")) {
      const stockKey = keys[0];
      const resKey = keys[1];
      const userResKey = keys[2];
      const quantity = Number(argv[0]);

      this.cleanIfExpired(resKey);
      if (this.store.has(resKey)) {
        this.store.delete(resKey);
        if (userResKey) this.store.delete(userResKey);

        const stockEntry = this.store.get(stockKey);
        const currentStock = stockEntry ? Number(stockEntry.value) : 0;
        const restored = currentStock + quantity;
        this.store.set(stockKey, { value: restored, expiresAt: stockEntry?.expiresAt });
        return [1, "Reservation released and stock returned", String(restored)];
      }
      return [0, "Reservation already expired or not found"];
    }

    throw new Error("Unsupported script in InMemoryRedisMock");
  }
}

// Resilient Client Proxy that dynamically delegates
class ResilientRedisProxy implements IRedisClient {
  private activeClient: IRedisClient;

  constructor() {
    // Default to in-memory mock for rock-solid zero-dependency operation
    this.activeClient = new InMemoryRedisMock();

    if (process.env.USE_REAL_REDIS === 'true') {
      try {
        const realRedis = new Redis({
          host: process.env.REDIS_HOST || '127.0.0.1',
          port: Number(process.env.REDIS_PORT) || 6379,
          lazyConnect: true,
          maxRetriesPerRequest: 1
        });

        realRedis.connect().then(() => {
          console.log('[Redis] Connected to real Redis cluster/instance.');
          this.activeClient = realRedis;
        }).catch((err) => {
          console.warn(`[Redis] Real Redis unreachable: ${err.message}. Running on atomic mock.`);
        });
      } catch {
        // keep mock
      }
    }
  }

  get(key: string) { return this.activeClient.get(key); }
  set(key: string, val: string, ...args: any[]) { return this.activeClient.set(key, val, ...args); }
  del(...keys: string[]) { return this.activeClient.del(...keys); }
  hgetall(key: string) { return this.activeClient.hgetall(key); }
  exists(...keys: string[]) { return this.activeClient.exists(...keys); }
  ttl(key: string) { return this.activeClient.ttl(key); }
  eval(script: string, numkeys: number, ...args: (string | number)[]) {
    return this.activeClient.eval(script, numkeys, ...args);
  }
}

const singletonProxy = new ResilientRedisProxy();

export const getRedisClient = (): IRedisClient => {
  return singletonProxy;
};
