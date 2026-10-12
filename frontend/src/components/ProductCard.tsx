import React from 'react';
import type { ProductData, FlashSaleStatus, ReservationInfo } from '../hooks/useFlashSale';
import { StockCounter } from './StockCounter';
import { SaleCountdown } from './SaleCountdown';
import { ReservationTimer } from './ReservationTimer';

interface ProductCardProps {
  product: ProductData;
  status: FlashSaleStatus;
  reservation: ReservationInfo | null;
  errorMessage: string | null;
  onReserve: () => void;
  onStartDemo?: () => void;
  onCheckout: () => void;
  onExpire: () => void;
}

export const ProductCard: React.FC<ProductCardProps> = ({
  product,
  status,
  reservation,
  errorMessage,
  onReserve,
  onStartDemo,
  onCheckout,
  onExpire
}) => {
  const isSoldOut = product.remainingStock <= 0;
  const isReserved = status === 'RESERVED';
  const isReserving = status === 'RESERVING';
  const isCheckingOut = status === 'CHECKING_OUT';

  const discountPercent = Math.round(
    ((product.originalPrice - product.flashSalePrice) / product.originalPrice) * 100
  );

  return (
    <div className="sale-layout">
      {/* Left: Product Showcase & Media */}
      <div className="product-showcase">
        <div className="product-glow" />

        <div className="image-wrapper">
          <div className="product-badge-discount">🔥 {discountPercent}% OFF</div>
          <div className="product-image-placeholder">
            <svg
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth="1.5"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z"
              />
            </svg>
            <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>
              Sony WH-1000XM5 Studio ANC
            </span>
          </div>
        </div>

        <p style={{ color: 'var(--text-secondary)', fontSize: '0.92rem', lineHeight: 1.6 }}>
          {product.description}
        </p>

        <div className="feature-list">
          <div className="feature-item">
            <div className="feature-bullet" />
            <span>Dual Processor ANC</span>
          </div>
          <div className="feature-item">
            <div className="feature-bullet" />
            <span>30-Hour Battery Life</span>
          </div>
          <div className="feature-item">
            <div className="feature-bullet" />
            <span>Ultra-Fast 3-Min Charge</span>
          </div>
          <div className="feature-item">
            <div className="feature-bullet" />
            <span>Multipoint Bluetooth 5.2</span>
          </div>
        </div>
      </div>

      {/* Right: Product Card with Interactive Concurrency Controls */}
      <div className="product-card" id="flash-sale-product-card">
        <div className="card-header-status">
          <SaleCountdown initialSeconds={7200} />
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Deal ID: <code style={{ color: 'var(--text-secondary)' }}>{product.id}</code>
          </span>
        </div>

        <div>
          <h2 className="product-title">{product.title}</h2>
          <div className="pricing-row" style={{ marginTop: '0.75rem' }}>
            <span className="price-current">${product.flashSalePrice.toFixed(2)}</span>
            <span className="price-original">${product.originalPrice.toFixed(2)}</span>
            <span className="price-save">Save ${(product.originalPrice - product.flashSalePrice).toFixed(2)}</span>
          </div>
        </div>

        {/* Live Stock Counter */}
        <StockCounter
          totalStock={product.totalStock}
          remainingStock={product.remainingStock}
        />

        {/* 5-Minute Hold Policy (Before Reservation) */}
        {!isReserved && (
          <div className="reservation-guarantee-box">
            <div className="guarantee-header">
              <span className="guarantee-icon">⏱️</span>
              <span className="guarantee-title">5-Minute Stock Hold Guarantee</span>
            </div>
            <p className="guarantee-desc">
              Clicking <strong>Add to Cart</strong> locks 1 unit exclusively in Redis for <strong>5 minutes (300 seconds)</strong>. No other shopper can claim your inventory while your hold timer runs.
            </p>
          </div>
        )}

        {/* Active 5-Minute Reservation Banner (Shows when user holds reserved stock) */}
        {isReserved && reservation && (
          <ReservationTimer
            initialSeconds={reservation.ttlSeconds || 300}
            expiresAt={reservation.expiresAt}
            reservationId={reservation.reservationId}
            onExpire={onExpire}
          />
        )}

        {/* Error / Alert notification */}
        {errorMessage && (
          <div className="alert-box alert-danger" id="flash-error-alert">
            <span>⚠️ {errorMessage}</span>
          </div>
        )}

        {/* Action Button: State Driven */}
        <div style={{ marginTop: '0.5rem' }}>
          {!isReserved ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
              <button
                className="btn-primary"
                id="reserve-stock-btn"
                onClick={onReserve}
                disabled={isSoldOut || isReserving}
              >
                {isReserving ? (
                  <>⏳ Reserving In Redis...</>
                ) : isSoldOut ? (
                  <>🚫 Deal Sold Out</>
                ) : (
                  <>⚡ Add to Cart (Hold for 5 Mins)</>
                )}
              </button>
              {onStartDemo && (
                <button
                  type="button"
                  id="preview-timer-btn"
                  onClick={onStartDemo}
                  style={{
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    color: 'var(--text-secondary)',
                    padding: '0.55rem 1rem',
                    borderRadius: 'var(--radius-md)',
                    fontSize: '0.82rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.4rem'
                  }}
                >
                  <span>⏱️</span>
                  <span>Test / Preview 5-Minute Hold Timer Directly</span>
                </button>
              )}
            </div>
          ) : (
            <button
              className="btn-primary btn-checkout"
              id="complete-checkout-btn"
              onClick={onCheckout}
              disabled={isCheckingOut}
            >
              {isCheckingOut ? (
                <>🔄 Finalizing Transaction...</>
              ) : (
                <>💳 Complete Checkout & Pay (${product.flashSalePrice.toFixed(2)})</>
              )}
            </button>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', gap: '1.5rem', color: 'var(--text-muted)', fontSize: '0.78rem' }}>
          <span>🔒 Safe 256-Bit SSL Checkout</span>
          <span>⚡ Atomic Redis Stock Protection</span>
        </div>
      </div>
    </div>
  );
};
