import { Suspense } from 'react';
import { NavLink, Outlet } from 'react-router';
import { AccountMenu } from '@/features/auth/AccountMenu';
import { FeedbackDialog } from '@/features/feedback/FeedbackDialog';
import { useOnline } from '@/lib/useOnline';

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-sm px-2 py-1.5 text-xs font-medium uppercase tracking-wide transition-colors sm:px-3 sm:text-sm ${
    isActive
      ? 'bg-ink-900 text-kraft-50 dark:bg-kraft-100 dark:text-ink-900'
      : 'text-ink-700 hover:bg-kraft-200 dark:text-kraft-200 dark:hover:bg-charcoal-800'
  }`;

export function Shell() {
  const online = useOnline();

  return (
    <div className="min-h-screen bg-kraft-100 text-ink-900 dark:bg-charcoal-900 dark:text-kraft-100">
      <header className="border-b-2 border-ink-900/15 dark:border-kraft-100/15">
        {/*
          Two rows on a phone, one on desktop. The single-row version measured
          479px of content inside a 390px viewport, pushing Settings, Feedback,
          and the account control off-screen and making every route scroll
          sideways.

          Ordering does the work rather than a second markup tree: on mobile the
          nav takes a full-width row below the wordmark and account controls; at
          sm it drops back between them on one line. No JS, no hamburger, and
          every control stays reachable at 375px.
        */}
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 sm:flex-nowrap sm:px-6 sm:py-4">
          <span className="order-1 -rotate-1 font-display text-xl tracking-tight text-ink-900 sm:text-2xl dark:text-kraft-100">
            Grimoire
          </span>
          <nav className="order-3 flex w-full gap-1 sm:order-2 sm:ml-auto sm:w-auto">
            <NavLink to="/library" className={navLinkClass}>
              Library
            </NavLink>
            <NavLink to="/characters" className={navLinkClass}>
              Characters
            </NavLink>
            <NavLink to="/settings" className={navLinkClass}>
              Settings
            </NavLink>
          </nav>
          <div className="order-2 ml-auto flex items-center gap-2 sm:order-3 sm:ml-0 sm:gap-3">
            {/* The sheet, dice, and Library all work with no network; sync and
                the AI do not. Saying so is cheaper than letting those look broken. */}
            {!online && (
              <span
                title="No network. Your characters and the Library still work; sync and the AI are paused."
                className="border-2 border-rust-500/50 px-2 py-1 font-mono text-[11px] uppercase tracking-wide text-rust-600 dark:border-rust-500/60 dark:text-rust-500"
              >
                Offline
              </span>
            )}
            <FeedbackDialog />
            <AccountMenu />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        {/*
          The boundary belongs here, around the Outlet, not around Shell itself.
          Above Shell it swallows the header with the page: every lazy route
          navigation would blank the wordmark, nav, and offline badge to a bare
          "Loading…", which on a slow phone is the whole app flickering away.
          Here the chrome stays put and only the content area swaps.
        */}
        <Suspense fallback={<p className="text-sm text-ink-700 dark:text-kraft-200">Loading…</p>}>
          <Outlet />
        </Suspense>
      </main>
    </div>
  );
}
