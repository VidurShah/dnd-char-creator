import { NavLink, Outlet } from 'react-router';

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-sm px-3 py-1.5 text-sm font-medium uppercase tracking-wide transition-colors ${
    isActive
      ? 'bg-ink-900 text-kraft-50 dark:bg-kraft-100 dark:text-ink-900'
      : 'text-ink-700 hover:bg-kraft-200 dark:text-kraft-200 dark:hover:bg-charcoal-800'
  }`;

export function Shell() {
  return (
    <div className="min-h-screen bg-kraft-100 text-ink-900 dark:bg-charcoal-900 dark:text-kraft-100">
      <header className="border-b-2 border-ink-900/15 dark:border-kraft-100/15">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <span className="-rotate-1 font-display text-2xl tracking-tight text-ink-900 dark:text-kraft-100">
            Grimoire
          </span>
          <nav className="flex gap-1">
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
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">
        <Outlet />
      </main>
    </div>
  );
}
