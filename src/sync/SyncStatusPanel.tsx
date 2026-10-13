import { useEffect, useState } from 'react';
import { Show, useUser } from '@clerk/react';
import { authEnabled } from '@/features/auth/clerkConfig';
import { useOnline } from '@/lib/useOnline';
import { requestSync, subscribeToSync, type SyncStatus } from './syncEngine';

function describe(status: SyncStatus): string {
  switch (status.state) {
    case 'syncing':
      return 'Syncing…';
    case 'error':
      return status.error;
    case 'off':
      return 'Sign in to back up your vault.';
    case 'idle':
      return status.lastSyncedAt
        ? `Last synced ${new Date(status.lastSyncedAt).toLocaleTimeString()}`
        : 'Up to date.';
  }
}

/** Account and sync section for the Settings page. */
export function SyncStatusPanel() {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const online = useOnline();
  const { user } = useUser();

  useEffect(() => subscribeToSync(setStatus), []);

  if (!authEnabled || !status) return null;

  return (
    <div className="mb-6">
      <label className="mb-1.5 block font-mono text-xs uppercase tracking-wider text-ink-500 dark:text-kraft-300">
        Account &amp; sync
      </label>
      <Show when="signed-out">
        <p className="text-sm text-ink-700 dark:text-kraft-200">
          Your characters live in this browser only. Sign in to back them up and pick them up on another
          device.
        </p>
      </Show>
      <Show when="signed-in">
        <p className="text-sm text-ink-700 dark:text-kraft-200">
          Signed in as <span className="font-medium">{user?.primaryEmailAddress?.emailAddress ?? '—'}</span>
        </p>
        <p className="mt-1 text-xs text-ink-700 dark:text-kraft-200">
          {/* Offline outranks the sync state: "Sync failed" is alarming and
              unhelpful when the real answer is that there is no network and
              nothing has been lost. */}
          {online ? describe(status) : 'Offline — your changes are saved here and will upload when you reconnect.'}
          {status.pending > 0 && ` · ${status.pending} change${status.pending === 1 ? '' : 's'} waiting to upload`}
        </p>
        <button
          type="button"
          onClick={() => void requestSync()}
          disabled={status.state === 'syncing' || !online}
          className="mt-2 border-2 border-ink-900/30 px-3 py-1.5 font-mono text-xs uppercase tracking-wide text-ink-700 hover:border-ink-900/60 disabled:opacity-50 dark:border-kraft-100/30 dark:text-kraft-200"
        >
          Sync now
        </button>
      </Show>
    </div>
  );
}
