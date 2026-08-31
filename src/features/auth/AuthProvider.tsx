import type { ReactNode } from 'react';
import { ClerkProvider } from '@clerk/react';
import { CLERK_PUBLISHABLE_KEY, authEnabled } from './clerkConfig';

/**
 * Wraps the app in Clerk when it's configured, and is a pass-through when it
 * isn't — see clerkConfig.ts for why an unconfigured build is a supported
 * state rather than an error.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  if (!authEnabled) return <>{children}</>;

  return (
    <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY!} afterSignOutUrl="/">
      {children}
    </ClerkProvider>
  );
}
