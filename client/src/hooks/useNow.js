import { useEffect, useState } from 'react';

// Difference between the server clock and this device's clock, so "x s ago" stays right on any phone.
let clockOffset = 0;
export const setClockOffset = (serverNow) => { clockOffset = serverNow - Date.now(); };
export const serverNow = () => Date.now() + clockOffset;

export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(serverNow());
  useEffect(() => {
    const t = setInterval(() => setNow(serverNow()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}
