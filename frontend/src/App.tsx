import React from 'react';
import { useFlashSale } from './hooks/useFlashSale';
import { ProductCard } from './components/ProductCard';
import { CheckoutModal } from './components/CheckoutModal';

export const App: React.FC = () => {
  const {
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
  } = useFlashSale();

  return (
    <div>
      {/* Sticky Active Hold Ribbon across the page */}
      {status === 'RESERVED' && reservation && (
        <div className="sticky-reservation-bar" id="sticky-reservation-bar">
          <div className="sticky-bar-content">
            <span className="sticky-bar-pill">🔒 5-Minute Hold Active</span>
            <span className="sticky-bar-text">
              1 unit locked exclusively in memory for you. Complete your purchase before the hold expires!
            </span>
            <button
              className="sticky-bar-btn"
              onClick={checkout}
            >
              Checkout Now (${product.flashSalePrice.toFixed(2)}) →
            </button>
          </div>
        </div>
      )}

      {/* Top Navigation */}
      <header className="header">
        <div className="brand">
          <span>⚡ FlashKart</span>
          <span className="brand-badge">Lightning Deals</span>
        </div>
        <div className="user-tag">
          <div className="status-dot" />
          <span>Active Session: <code>{userId}</code></span>
        </div>
      </header>

      {/* Main Page Container */}
      <main className="page-container">
        {/* Hero Section */}
        <div className="hero-banner">
          <div className="hero-pill">
            <span>🔥 LIVE FLASH SALE • LIMITED UNITS</span>
          </div>
          <h1 className="hero-title">Exclusive Lightning Deal</h1>
          <p className="hero-subtitle">
            Thousands of shoppers are competing in real-time. Atomic stock reservations guarantee your item for 5 minutes once added to cart.
          </p>
        </div>

        {/* Core Product Deal Interface */}
        <ProductCard
          product={product}
          status={status}
          reservation={reservation}
          errorMessage={errorMessage}
          onReserve={reserveStock}
          onStartDemo={startDemoReservation}
          onCheckout={checkout}
          onExpire={handleReservationExpired}
        />

        {/* Order Confirmation Modal */}
        <CheckoutModal order={order} onClose={resetSale} />

        {/* System Architecture & Assessment Explainer */}
        <section className="tech-explainer-card">
          <div className="tech-explainer-header">
            <span>🛠️</span>
            <h3>Frontend State Management & Expiry Handling (Section B Documentation)</h3>
          </div>

          <div className="tech-grid">
            <div className="tech-item">
              <h4>1. State Machine Lifecycle</h4>
              <p>
                Managed through <code>useFlashSale</code> hook with strictly validated transitions:
                <br />
                <code>IDLE → RESERVING → RESERVED → CHECKING_OUT → ORDER_CONFIRMED</code>.
                State prevents multi-click submissions and synchronizes UI with backend Redis cache.
              </p>
            </div>

            <div className="tech-item">
              <h4>2. 5-Minute Reservation Expiry Handling</h4>
              <p>
                When <code>POST /cart/reserve</code> succeeds, backend assigns a 300s TTL token.
                Frontend starts a client-side ticking countdown via <code>useCountdown</code>.
                If timer hits <code>00:00</code> before checkout, <code>onExpire</code> automatically resets state to <code>EXPIRED</code>, alerts the shopper, and refreshes the live inventory.
              </p>
            </div>

            <div className="tech-item">
              <h4>3. Idempotency Key Generation</h4>
              <p>
                Checkout generates a unique client-side <code>UUIDv4</code> attached as an <code>Idempotency-Key</code> HTTP header.
                If network drops, double-clicks, or browser refreshes occur, the transaction safely returns the existing order rather than charging twice.
              </p>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
};

export default App;
