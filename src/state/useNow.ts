import { useEffect, useState } from 'react';

/** "Nu" som uppdateras med jämna mellanrum, så att nedräkningar och sektioner hålls aktuella. */
export function useNow(intervalMs = 30_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
