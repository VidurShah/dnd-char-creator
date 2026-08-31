import { SignIn, SignUp } from '@clerk/react';
import { authEnabled } from './clerkConfig';

/**
 * Clerk's prebuilt forms, restyled to sit inside the app shell rather than
 * taking over the page. Both handle email/password and GitHub in one widget,
 * so there is no hand-rolled form to keep in sync.
 */
const appearance = {
  elements: {
    rootBox: 'w-full',
    cardBox: 'shadow-none border-2 border-ink-900/15 dark:border-kraft-100/15',
  },
};

function Unavailable() {
  return (
    <div className="max-w-lg">
      <h1 className="mb-1 font-display text-xl text-ink-900 dark:text-kraft-100">Accounts are off</h1>
      <p className="text-sm text-ink-700 dark:text-kraft-200">
        This build has no Clerk publishable key configured, so sign-in is disabled. Grimoire still works
        fully — your characters live in this browser.
      </p>
    </div>
  );
}

export function SignInPage() {
  if (!authEnabled) return <Unavailable />;
  return (
    <div className="flex justify-center py-4">
      <SignIn appearance={appearance} routing="path" path="/sign-in" signUpUrl="/sign-up" />
    </div>
  );
}

export function SignUpPage() {
  if (!authEnabled) return <Unavailable />;
  return (
    <div className="flex justify-center py-4">
      <SignUp appearance={appearance} routing="path" path="/sign-up" signInUrl="/sign-in" />
    </div>
  );
}
