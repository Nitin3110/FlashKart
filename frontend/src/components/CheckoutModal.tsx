import React from 'react';
import type { OrderInfo } from '../hooks/useFlashSale';

interface CheckoutModalProps {
  order: OrderInfo | null;
  onClose: () => void;
}

export const CheckoutModal: React.FC<CheckoutModalProps> = ({ order, onClose }) => {
  if (!order) return null;

  return (
    <div className="modal-overlay" id="checkout-success-modal">
      <div className="modal-card">
        <div className="modal-header">
          <div style={{ fontSize: '3rem', lineHeight: 1 }}>🎉</div>
          <h3 className="modal-title">Order Confirmed!</h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', marginTop: '0.35rem' }}>
            Thank you for participating in FlashKart Lightning Deals.
          </p>
        </div>

        {order.isIdempotentReplay && (
          <div
            className="alert-box alert-success"
            style={{ marginBottom: '1rem', fontSize: '0.8rem' }}
          >
            <span>ℹ️ <strong>Idempotent Safe Replay:</strong> Duplicate submission safely intercepted. Your original order details are displayed below without additional charge.</span>
          </div>
        )}

        <div style={{ margin: '1.25rem 0' }}>
          <div className="modal-detail-row">
            <span className="modal-detail-label">Order Number</span>
            <span className="modal-detail-value" id="order-number-val">
              {order.orderNumber}
            </span>
          </div>

          <div className="modal-detail-row">
            <span className="modal-detail-label">Order Status</span>
            <span className="modal-detail-value" style={{ color: 'var(--success)' }}>
              ● {order.status}
            </span>
          </div>

          <div className="modal-detail-row">
            <span className="modal-detail-label">Total Paid</span>
            <span className="modal-detail-value" style={{ fontSize: '1.1rem' }}>
              ${order.totalAmount.toFixed(2)}
            </span>
          </div>
        </div>

        <button
          className="btn-primary"
          onClick={onClose}
          id="modal-close-btn"
          style={{ marginTop: '1rem' }}
        >
          Done & Back to Deals
        </button>
      </div>
    </div>
  );
};
