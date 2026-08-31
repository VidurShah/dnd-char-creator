import { getToken } from '@clerk/react';
import { authEnabled } from './clerkConfig';

/**
 * Session token access for plain (non-React) modules.
 *
 * src/ai/geminiClient.ts and the sync engine aren't components and can't call
 * useAuth(), but both have to identify the caller to the server. Clerk's
 * top-level getToken() is built for exactly this — documented as safe to call
 * from API interceptors and data-fetching layers.
 */

/**
 * Ceiling on waiting for Clerk.
 *
 * getToken() blocks until Clerk initializes. When Clerk can't load at all —
 * offline, script blocked, bad key — that wait is long enough to look like a
 * hang, and it would stall every AI request and every sync behind it rather
 * than failing to an ordinary "signed out" path. Two seconds is far more than
 * a loaded Clerk needs and far less than a user will tolerate staring at a
 * spinner.
 */
const TOKEN_TIMEOUT_MS = 2_000;

/** The current session token, or null when signed out or unavailable. */
export async function getAuthToken(): Promise<string | null> {
  if (!authEnabled) return null;
  try {
    return await Promise.race([
      getToken(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), TOKEN_TIMEOUT_MS)),
    ]);
  } catch {
    // Signed out, offline, or Clerk failed to load. All are equivalent here:
    // no token, so the server treats the request as anonymous and says so in a
    // way the UI already renders.
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
