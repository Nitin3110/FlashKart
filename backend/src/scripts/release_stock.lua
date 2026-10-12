--[[
  FlashKart: Atomic Stock Release Lua Script
  Restores reserved stock back to the active pool if checkout fails or is cancelled.

  KEYS:
    KEYS[1]: Stock Key            (e.g., 'flash:stock:{productId}')
    KEYS[2]: Reservation Key      (e.g., 'flash:res:{reservationId}')
    KEYS[3]: User Reservation Key (e.g., 'flash:user_res:{userId}:{productId}')

  ARGV:
    ARGV[1]: Quantity to restore
--]]

local stockKey = KEYS[1]
local resKey = KEYS[2]
local userResKey = KEYS[3]
local quantity = tonumber(ARGV[1])

if redis.call('EXISTS', resKey) == 1 then
  redis.call('DEL', resKey)
  if userResKey ~= '' and redis.call('EXISTS', userResKey) == 1 then
    redis.call('DEL', userResKey)
  end
  redis.call('INCRBY', stockKey, quantity)
  local newStock = redis.call('GET', stockKey)
  return { 1, "Reservation released and stock returned", newStock }
end

return { 0, "Reservation already expired or not found" }
