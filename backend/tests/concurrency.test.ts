import 'reflect-metadata';
import { v4 as uuidv4 } from 'uuid';
import { initializeDatabase, AppDataSource } from '../src/config/database';
import { Product, Order, User } from '../src/entities';
import { StockReservationService } from '../src/services/stockReservation.service';
import { CheckoutService } from '../src/services/checkout.service';

async function runConcurrencyTests() {
  console.log('====================================================');
  console.log('🧪 FLASHKART TEST SUITE: CONCURRENCY & IDEMPOTENCY');
  console.log('====================================================\n');

  await initializeDatabase();
  const productRepo = AppDataSource.getRepository(Product);
  const userRepo = AppDataSource.getRepository(User);
  const orderRepo = AppDataSource.getRepository(Order);

  const reservationService = new StockReservationService();
  const checkoutService = new CheckoutService(reservationService);

  // 1. Create a test flash sale product with limited stock (e.g. 15 items)
  const initialStock = 15;
  const product = productRepo.create({
    title: `Flash Test Item - ${Date.now()}`,
    originalPrice: 100,
    flashSalePrice: 50,
    totalStock: initialStock,
    availableStock: initialStock,
    saleStartTime: new Date(),
    saleEndTime: new Date(Date.now() + 3600000)
  });
  await productRepo.save(product);
  await reservationService.initializeProductStock(product.id, initialStock);

  console.log(`[Setup] Created Flash Sale Product "${product.title}"`);
  console.log(`[Setup] Initial Stock set to: ${initialStock}\n`);

  // =========================================================================
  // TEST 1: HIGH CONCURRENCY OVERSALE PREVENTION
  // =========================================================================
  console.log('----------------------------------------------------');
  console.log('TEST 1: Simulating 50 Concurrent Reservation Requests for 15 Units');
  console.log('----------------------------------------------------');

  const concurrentRequests = 50;
  const userIds = Array.from({ length: concurrentRequests }, () => `user_${uuidv4()}`);

  // Fire all 50 requests concurrently in parallel
  const reservationPromises = userIds.map((userId) =>
    reservationService.reserveStock(userId, product.id, 1)
  );

  const results = await Promise.all(reservationPromises);

  const successfulReservations = results.filter((r) => r.success);
  const failedReservations = results.filter((r) => !r.success);

  console.log(`✓ Total Requests Sent:         ${concurrentRequests}`);
  console.log(`✓ Successful Reservations:     ${successfulReservations.length} (Expected: ${initialStock})`);
  console.log(`✓ Rejected (Sold Out) Requests: ${failedReservations.length} (Expected: ${concurrentRequests - initialStock})`);

  const remainingRedisStock = await reservationService.getProductStock(product.id);
  console.log(`✓ Remaining Stock in Redis:    ${remainingRedisStock} (Expected: 0)`);

  if (successfulReservations.length === initialStock && remainingRedisStock === 0) {
    console.log('🎉 TEST 1 PASSED: Zero Overselling Guaranteed!\n');
  } else {
    console.error('❌ TEST 1 FAILED: Stock mismatch detected!\n');
    process.exit(1);
  }

  // =========================================================================
  // TEST 2: CHECKOUT & IDEMPOTENCY KEY VERIFICATION
  // =========================================================================
  console.log('----------------------------------------------------');
  console.log('TEST 2: Verifying Idempotent Checkout (Duplicate Request Handling)');
  console.log('----------------------------------------------------');

  // Grab one valid reservation from Test 1
  const validReservation = successfulReservations[0];
  const firstUserId = userIds[0];
  const idempotencyKey = `idemp_${uuidv4()}`;

  // Ensure user exists in DB
  const testUser = userRepo.create({
    id: firstUserId,
    email: `${firstUserId}@test.com`,
    name: 'Test Buyer'
  });
  await userRepo.save(testUser);

  // Call checkout First Time
  const firstCheckout = await checkoutService.processCheckout({
    userId: firstUserId,
    reservationId: validReservation.reservationId!,
    idempotencyKey
  });

  console.log(`✓ First Checkout Status:  ${firstCheckout.success ? 'SUCCESS' : 'FAILED'}`);
  console.log(`✓ Is Idempotent Replay:    ${firstCheckout.isIdempotentReplay}`);
  console.log(`✓ Order Number:            ${firstCheckout.order?.orderNumber}`);

  // Call checkout Second Time with the EXACT SAME Idempotency Key (simulating browser refresh / double click)
  const secondCheckout = await checkoutService.processCheckout({
    userId: firstUserId,
    reservationId: validReservation.reservationId!,
    idempotencyKey
  });

  console.log(`✓ Second Checkout Status: ${secondCheckout.success ? 'SUCCESS' : 'FAILED'}`);
  console.log(`✓ Is Idempotent Replay:    ${secondCheckout.isIdempotentReplay}`);
  console.log(`✓ Replayed Order Number:   ${secondCheckout.order?.orderNumber}`);

  const totalOrdersWithKey = await orderRepo.count({ where: { idempotencyKey } });
  console.log(`✓ Total Orders in DB with Key: ${totalOrdersWithKey} (Expected: 1)`);

  if (
    firstCheckout.success &&
    secondCheckout.success &&
    secondCheckout.isIdempotentReplay === true &&
    totalOrdersWithKey === 1
  ) {
    console.log('🎉 TEST 2 PASSED: Duplicate Checkout Prevented and Safely Replayed!\n');
  } else {
    console.error('❌ TEST 2 FAILED: Idempotency failed!\n');
    process.exit(1);
  }

  // =========================================================================
  // TEST 3: EXPIRED / INVALID RESERVATION REJECTION
  // =========================================================================
  console.log('----------------------------------------------------');
  console.log('TEST 3: Verifying Checkout Rejects Expired/Invalid Reservations');
  console.log('----------------------------------------------------');

  const invalidCheckout = await checkoutService.processCheckout({
    userId: `user_random_${uuidv4()}`,
    reservationId: 'res_non_existent_or_expired',
    idempotencyKey: `idemp_${uuidv4()}`
  });

  console.log(`✓ Invalid Reservation Checkout Success: ${invalidCheckout.success} (Expected: false)`);
  console.log(`✓ Status Code:                           ${invalidCheckout.statusCode} (Expected: 410)`);
  console.log(`✓ Error Message:                         "${invalidCheckout.error}"`);

  if (!invalidCheckout.success && invalidCheckout.statusCode === 410) {
    console.log('🎉 TEST 3 PASSED: Invalid/Expired Reservations Correctly Rejected!\n');
  } else {
    console.error('❌ TEST 3 FAILED: Invalid reservation was not rejected properly!\n');
    process.exit(1);
  }

  console.log('====================================================');
  console.log('✅ ALL BACKEND CONCURRENCY & TRANSACTION TESTS PASSED!');
  console.log('====================================================');
  process.exit(0);
}

runConcurrencyTests().catch((err) => {
  console.error('Test run failed:', err);
  process.exit(1);
});
