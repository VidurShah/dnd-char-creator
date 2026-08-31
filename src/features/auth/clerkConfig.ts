/**
 * Grimoire runs with or without Clerk configured.
 *
 * The app is local-first: building and playing a character needs no account.
 * So a missing publishable key is a supported state, not a crash — the UI
 * simply renders no account controls, and the API treats every request as
 * signed out. This keeps `pnpm dev` working for a fresh clone with no
 * credentials.
 *
 * The publishable key is public by design (it identifies the Clerk instance and
 * is safe in client code), which is why VITE_ is the correct prefix here —
 * unlike GEMINI_API_KEY or CLERK_SECRET_KEY, which must never carry it.
 */
export const CLERK_PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined;

export const authEnabled = Boolean(CLERK_PUBLISHABLE_KEY);
