import { getToken } from '@clerk/react';
import { authEnabled } from './clerkConfig';

/**
 * Session token access for plain (non-React) modules.
 *
 * src/ai/geminiClient.ts isn't a component and can't call useAuth(), but it
 * still has to identify the caller to the server. Clerk's top-level getToken()
 * is built for exactly this — it's documented as safe to call from API
 * interceptors and data-fetching layers — so no context bridge is needed.
 */

/** The current session token, or null when signed out or Clerk isn't configured. */
export async function getAuthToken(): Promise<string | null> {
  // Short-circuit when unconfigured: getToken() waits for a Clerk instance that
  // will never load and eventually throws a timeout, which would stall every
  // AI request in a local-only build.
  if (!authEnabled) return null;
  try {
    return await getToken();
  } catch {
    // Signed out, offline, or Clerk failed to load. All three are equivalent
    // here: no token, so the server treats this as an anonymous request and
    // says so in a way the UI already renders.
    return null;
  }
}

/** Adds the bearer token to a header bag when there is one. */
export async function withAuthHeaders(
  headers: Record<string, string>,
): Promise<Record<string, string>> {
  const token = await getAuthToken();
  return token ? { ...headers, authorization: `Bearer ${token}` } : headers;
}
