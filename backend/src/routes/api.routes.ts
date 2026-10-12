import { Router } from 'express';
import { CartController } from '../controllers/cart.controller';
import { OrderController } from '../controllers/order.controller';
import { ProductController } from '../controllers/product.controller';

const router = Router();
const cartController = new CartController();
const orderController = new OrderController();
const productController = new ProductController();

// Section A2: Stock Reservation API
router.post('/cart/reserve', cartController.reserve);

// Section A3: Checkout API
router.post('/order/checkout', orderController.checkout);

// Product and Flash Sale Setup APIs
router.get('/products/active', productController.getActiveProduct);
router.get('/products/:id', productController.getProduct);
router.post('/products/seed', productController.seedFlashSale);

export default router;
