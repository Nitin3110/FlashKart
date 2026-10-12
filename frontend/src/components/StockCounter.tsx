import React from 'react';

interface StockCounterProps {
  totalStock: number;
  remainingStock: number;
}

export const StockCounter: React.FC<StockCounterProps> = ({ totalStock, remainingStock }) => {
  const percentageClaimed = Math.min(
    100,
    Math.max(0, Math.round(((totalStock - remainingStock) / totalStock) * 100))
  );

  const isLowStock = remainingStock > 0 && remainingStock <= 15;
  const isSoldOut = remainingStock <= 0;

  return (
    <div className="stock-panel" id="stock-counter-panel">
      <div className="stock-panel-header">
        <span style={{ color: 'var(--text-secondary)' }}>Inventory Status</span>
        <span className="stock-count-highlight" id="stock-count-text">
          {isSoldOut ? (
            <span style={{ color: 'var(--danger)' }}>SOLD OUT</span>
          ) : (
            <>
              {remainingStock} / {totalStock} <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>units remaining</span>
            </>
          )}
        </span>
      </div>

      <div className="stock-bar-track">
        <div
          className="stock-bar-fill"
          id="stock-progress-fill"
          style={{ width: `${percentageClaimed}%` }}
        />
      </div>

      {isLowStock && (
        <div className="stock-warning" id="stock-low-warning">
          <span>🔥 Hurry! Only {remainingStock} items left in stock — sells out fast!</span>
        </div>
      )}

      {isSoldOut && (
        <div className="stock-warning" style={{ color: 'var(--danger)' }}>
          <span>🚫 All units have been reserved or claimed for this flash event.</span>
        </div>
      )}
    </div>
  );
};
