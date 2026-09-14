import { useEffect, useState } from 'react';

/**
 * Whether the browser thinks it has a network.
 *
 * Worth surfacing now that the app runs offline: everything a player needs
 * mid-session — the sheet, dice, HP, the whole Library — works with no
 * connection, but sync and the AI genuinely do not. Without an indicator those
 * two look broken rather than unavailable, which is the wrong thing to be
 * wondering about at a table.
 *
 * navigator.onLine only reports whether an interface is up, not whether the
 * internet is reachable, so it can say true on a captive-portal wifi. It is
 * still the right signal here: a false is reliable, and that is the direction
 * that changes what we tell the player.
 */
export function useOnline(): boolean {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    update();
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  return online;
}
