import { NavLink, Outlet } from 'react-router';
import { AccountMenu } from '@/features/auth/AccountMenu';
import { FeedbackDialog } from '@/features/feedback/FeedbackDialog';

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-sm px-2 py-1.5 text-xs font-medium uppercase tracking-wide transition-colors sm:px-3 sm:text-sm ${
    isActive
      ? 'bg-ink-900 text-kraft-50 dark:bg-kraft-100 dark:text-ink-900'
      : 'text-ink-700 hover:bg-kraft-200 dark:text-kraft-200 dark:hover:bg-charcoal-800'
  }`;

export function Shell() {
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
            <FeedbackDialog />
            <AccountMenu />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        <Outlet />
      </main>
    </div>
  );
}
