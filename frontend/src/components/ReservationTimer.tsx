import React from 'react';
import { useCountdown } from '../hooks/useCountdown';

interface ReservationTimerProps {
  initialSeconds?: number;
  expiresAt?: string;
  onExpire: () => void;
  reservationId: string;
}

export const ReservationTimer: React.FC<ReservationTimerProps> = ({
  initialSeconds = 300,
  expiresAt,
  onExpire,
  reservationId
}) => {
  // If expiresAt is provided, calculate the real server-synchronized remaining seconds
  const computedSeconds = React.useMemo(() => {
    if (expiresAt) {
      const diff = Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000);
      return Math.max(0, diff);
    }
    return initialSeconds;
  }, [expiresAt, initialSeconds]);

  const { minutes, seconds, totalSeconds } = useCountdown(computedSeconds, onExpire, true);

  const percentLeft = Math.max(0, Math.min(100, Math.round((totalSeconds / initialSeconds) * 100)));
  const isUrgent = totalSeconds < 60;

  // Format absolute expiration time (e.g. "5:25 PM")
  const formattedExpiryTime = React.useMemo(() => {
    if (expiresAt) {
      return new Date(expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }
    const future = new Date(Date.now() + totalSeconds * 1000);
    return future.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }, [expiresAt, totalSeconds]);

  return (
    <div
      className={`reservation-banner ${isUrgent ? 'urgent' : ''}`}
      id="reservation-timer-banner"
    >
      <div className="reservation-top">
        <div className="reservation-badge">
          <span className="lock-icon">🔒</span>
          <div>
            <div className="reservation-badge-title">Stock Held Exclusively For You</div>
            <div className="reservation-badge-subtitle">Locked in Redis In-Memory Cache</div>
          </div>
        </div>

        <div className="reservation-countdown-wrapper">
          <span className="countdown-time-label">Time Remaining</span>
          <div
            className="reservation-countdown"
            id="reservation-countdown-digits"
          >
            {minutes}:{seconds}
          </div>
        </div>
      </div>

      <div className="reservation-progress-wrapper">
        <div className="reservation-progress-bar">
          <div
            className="reservation-progress-fill"
            id="reservation-progress-fill"
            style={{ width: `${percentLeft}%` }}
          />
        </div>
        <div className="progress-labels">
          <span>{percentLeft}% of 5-min window left</span>
          <span>Expires at {formattedExpiryTime}</span>
        </div>
      </div>

      {isUrgent ? (
        <div className="urgent-alert-box">
          <span>⚠️ <strong>Urgent:</strong> Under 60 seconds remaining! Click checkout now before your reserved stock is released to other buyers.</span>
        </div>
      ) : (
        <p className="reservation-explainer">
          Hold Token: <code>{reservationId.substring(0, 18)}...</code>
          <br />
          Your unit is guaranteed. If checkout is not completed within 5 minutes, this reservation automatically expires and returns to the flash pool.
        </p>
      )}
    </div>
  );
};
