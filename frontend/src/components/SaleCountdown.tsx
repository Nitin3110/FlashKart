import React from 'react';
import { useCountdown } from '../hooks/useCountdown';

interface SaleCountdownProps {
  initialSeconds?: number;
}

export const SaleCountdown: React.FC<SaleCountdownProps> = ({ initialSeconds = 7200 }) => {
  const { hours, minutes, seconds } = useCountdown(initialSeconds);

  return (
    <div className="countdown-box" id="sale-countdown-box">
      <span className="countdown-label">⚡ Ends In:</span>
      <span className="countdown-timer-digits" id="sale-countdown-digits">
        {hours}:{minutes}:{seconds}
      </span>
    </div>
  );
};
