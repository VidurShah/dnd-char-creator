import { useEffect } from 'react';
import { useAuth } from '@clerk/react';
import { setSyncEnabled, startSyncScheduler } from './syncEngine';

/**
 * Ties sync to the Clerk session: on while signed in, off otherwise. Rendered
 * only when Clerk is configured (see AuthProvider), because useAuth requires a
 * provider above it. Renders nothing.
 */
export function SyncController() {
  const { isLoaded, isSignedIn } = useAuth();

  useEffect(() => {
    if (!isLoaded) return;
    void setSyncEnabled(Boolean(isSignedIn));
  }, [isLoaded, isSignedIn]);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    return startSyncScheduler();
  }, [isLoaded, isSignedIn]);

  return null;
}
