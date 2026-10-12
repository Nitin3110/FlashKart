--[[
  FlashKart: Atomic Stock Reservation Lua Script
  Executed atomically on Redis single-threaded engine to guarantee ZERO race conditions.

  KEYS:
    KEYS[1]: Stock Key            (e.g., 'flash:stock:{productId}')
    KEYS[2]: Reservation Key      (e.g., 'flash:res:{reservationId}')
    KEYS[3]: User Reservation Key (e.g., 'flash:user_res:{userId}:{productId}')

  ARGV:
    ARGV[1]: Quantity to reserve (e.g., 1)
    ARGV[2]: TTL in seconds      (e.g., 300 for 5 minutes)
    ARGV[3]: User ID
    ARGV[4]: Reservation ID
    ARGV[5]: Expiration timestamp (ISO string)
    ARGV[6]: Product ID
--]]

local stockKey = KEYS[1]
local resKey = KEYS[2]
local userResKey = KEYS[3]

local quantity = tonumber(ARGV[1])
local ttlSeconds = tonumber(ARGV[2])
local userId = ARGV[3]
local reservationId = ARGV[4]
local expiresAt = ARGV[5]
local productId = ARGV[6]

-- 1. Guard against hoarding: Check if user already has an active reservation for this product
if redis.call('EXISTS', userResKey) == 1 then
  return { -2, "User already has an active reservation for this flash sale item" }
end

-- 2. Check stock availability
local currentStock = tonumber(redis.call('GET', stockKey))
if currentStock == nil then
  return { -1, "Product flash stock is not initialized or sale has ended" }
end

if currentStock < quantity then
  return { 0, "Insufficient stock remaining" }
end

-- 3. Atomic stock decrement
redis.call('DECRBY', stockKey, quantity)

-- 4. Store reservation record with 5-minute TTL
redis.call('HSET', resKey,
  'reservationId', reservationId,
  'userId', userId,
  'productId', productId,
  'quantity', tostring(quantity),
  'expiresAt', expiresAt
)
redis.call('EXPIRE', resKey, ttlSeconds)

-- 5. Mark user holding reservation with same TTL
redis.call('SET', userResKey, reservationId, 'EX', ttlSeconds)

return { 1, "Reservation successful", tostring(currentStock - quantity) }
