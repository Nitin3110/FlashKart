import { useState, useEffect } from 'react';

export interface TimeLeft {
  hours: string;
  minutes: string;
  seconds: string;
  totalSeconds: number;
}

/**
 * useCountdown Hook
 * Reusable countdown timer for flash deals and reservation holds.
 */
export const useCountdown = (
  initialSeconds: number,
  onExpire?: () => void,
  isActive: boolean = true
): TimeLeft => {
  const [secondsRemaining, setSecondsRemaining] = useState<number>(initialSeconds);

  useEffect(() => {
    setSecondsRemaining(initialSeconds);
  }, [initialSeconds]);

  useEffect(() => {
    if (!isActive || secondsRemaining <= 0) {
      if (secondsRemaining === 0 && onExpire) {
        onExpire();
      }
      return;
    }

    const interval = setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          if (onExpire) onExpire();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isActive, secondsRemaining, onExpire]);

  const h = Math.floor(secondsRemaining / 3600);
  const m = Math.floor((secondsRemaining % 3600) / 60);
  const s = secondsRemaining % 60;

  return {
    hours: String(h).padStart(2, '0'),
    minutes: String(m).padStart(2, '0'),
    seconds: String(s).padStart(2, '0'),
    totalSeconds: secondsRemaining
  };
};
