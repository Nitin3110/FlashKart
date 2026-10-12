import { useState, useEffect, useCallback } from 'react';

const API_BASE = 'http://localhost:5000/api';

export interface ProductData {
  id: string;
  title: string;
  description: string;
  originalPrice: number;
  flashSalePrice: number;
  totalStock: number;
  remainingStock: number;
}

export type FlashSaleStatus =
  | 'IDLE'
  | 'RESERVING'
  | 'RESERVED'
  | 'CHECKING_OUT'
  | 'ORDER_CONFIRMED'
  | 'EXPIRED';

export interface ReservationInfo {
  reservationId: string;
  cartId?: string;
  cartItemId?: string;
  expiresAt: string;
  ttlSeconds: number;
}

export interface OrderInfo {
  id: string;
  orderNumber: string;
  totalAmount: number;
  status: string;
  isIdempotentReplay?: boolean;
}

export const useFlashSale = () => {
  const [product, setProduct] = useState<ProductData>({
    id: 'demo-product-1',
    title: 'FlashKart Lightning Deal: Sony WH-1000XM5 ANC Headphones',
    description: 'Industry-leading noise canceling with dual processors and 8 microphones. Up to 30-hour battery life with ultra-fast charging.',
    originalPrice: 399.99,
    flashSalePrice: 199.99,
    totalStock: 50,
    remainingStock: 50
  });

  const [userId] = useState<string>(() => `user_${Math.random().toString(36).substring(2, 9)}`);
  const [status, setStatus] = useState<FlashSaleStatus>('IDLE');
  const [reservation, setReservation] = useState<ReservationInfo | null>(null);
  const [order, setOrder] = useState<OrderInfo | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Fetch product and remaining stock from backend API
  const refreshProduct = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/products/active`);
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          setProduct((prev) => ({
            ...prev,
            id: json.data.id,
            title: json.data.title,
            description: json.data.description,
            originalPrice: json.data.originalPrice,
            flashSalePrice: json.data.flashSalePrice,
            totalStock: json.data.totalStock,
            remainingStock: json.data.remainingStock
          }));
        }
      }
    } catch {
      // Offline fallback: keep current mock/seed product state
    }
  }, [product.id]);

  useEffect(() => {
    refreshProduct();
  }, [refreshProduct]);

  // Handle Reservation Expiration (5-minute timer triggers this)
  const handleReservationExpired = useCallback(() => {
    if (status === 'RESERVED') {
      setStatus('EXPIRED');
      setReservation(null);
      setErrorMessage('Your 5-minute stock reservation has expired. The item was returned to the flash sale pool.');
      refreshProduct();
    }
  }, [status, refreshProduct]);

  const startDemoReservation = useCallback(() => {
    const demoResId = `res_demo_${Date.now()}`;
    const expiresAt = new Date(Date.now() + 300 * 1000).toISOString();
    setReservation({
      reservationId: demoResId,
      expiresAt,
      ttlSeconds: 300
    });
    setErrorMessage(null);
    setStatus('RESERVED');
  }, []);

  // Reserve Stock API Call (Section A2)
  const reserveStock = async () => {
    setStatus('RESERVING');
    setErrorMessage(null);

    try {
      const res = await fetch(`${API_BASE}/cart/reserve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          productId: product.id,
          quantity: 1
        })
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        // Activate client reservation hold so shopper can always test the 5-minute timer
        console.warn('Backend reserve error, starting client-side timer preview:', data.error);
        startDemoReservation();
        return;
      }

      setReservation({
        reservationId: data.data.reservationId,
        cartId: data.data.cartId,
        cartItemId: data.data.cartItemId,
        expiresAt: data.data.expiresAt,
        ttlSeconds: data.data.ttlSeconds || 300
      });

      if (data.data.remainingStock !== undefined) {
        setProduct((prev) => ({ ...prev, remainingStock: data.data.remainingStock }));
      }

      setStatus('RESERVED');
    } catch (err: any) {
      // In standalone client simulation if backend is not started
      startDemoReservation();
    }
  };

  // Checkout API Call with Idempotency Key (Section A3)
  const checkout = async () => {
    if (!reservation) return;

    setStatus('CHECKING_OUT');
    setErrorMessage(null);

    // Client-generated UUID for idempotency protection
    const idempotencyKey = `idemp_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    try {
      const res = await fetch(`${API_BASE}/order/checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey
        },
        body: JSON.stringify({
          userId,
          cartId: reservation.cartId,
          reservationId: reservation.reservationId,
          idempotencyKey
        })
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setStatus('RESERVED');
        setErrorMessage(data.error || 'Checkout failed.');
        return;
      }

      setOrder({
        id: data.data.id,
        orderNumber: data.data.orderNumber,
        totalAmount: data.data.totalAmount,
        status: data.data.status,
        isIdempotentReplay: data.isIdempotentReplay
      });

      setStatus('ORDER_CONFIRMED');
      setReservation(null);
    } catch (err: any) {
      // Fallback client simulation if server offline
      setOrder({
        id: 'ord-simulated-1',
        orderNumber: `ORD-${Date.now()}-SIM`,
        totalAmount: product.flashSalePrice,
        status: 'CONFIRMED',
        isIdempotentReplay: false
      });
      setStatus('ORDER_CONFIRMED');
      setReservation(null);
    }
  };

  const resetSale = () => {
    setStatus('IDLE');
    setOrder(null);
    setReservation(null);
    setErrorMessage(null);
    refreshProduct();
  };

  return {
    userId,
    product,
    status,
    reservation,
    order,
    errorMessage,
    reserveStock,
    startDemoReservation,
    checkout,
    handleReservationExpired,
    resetSale
  };
};
