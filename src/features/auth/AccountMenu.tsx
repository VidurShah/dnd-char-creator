import { Link } from 'react-router';
import { Show, UserButton } from '@clerk/react';
import { authEnabled } from './clerkConfig';

const signInClass =
  'border-2 border-ink-900/30 px-3 py-1.5 font-mono text-xs uppercase tracking-wide text-ink-700 hover:border-ink-900/60 dark:border-kraft-100/30 dark:text-kraft-200';

/**
 * Header account control. Renders nothing at all when Clerk isn't configured,
 * so a local-only build shows no dead sign-in button.
 */
export function AccountMenu() {
  if (!authEnabled) return null;

  return (
    <div className="flex items-center gap-2">
      <Show when="signed-out">
        <Link to="/sign-in" className={signInClass}>
          Sign In
        </Link>
      </Show>
      <Show when="signed-in">
        <UserButton
          appearance={{ elements: { avatarBox: 'h-7 w-7 rounded-none border-2 border-ink-900/30' } }}
        />
      </Show>
    </div>
  );
}
