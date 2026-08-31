import { useState } from 'react';
import { useLocation } from 'react-router';
import * as Dialog from '@radix-ui/react-dialog';
import { Show } from '@clerk/react';
import { Link } from 'react-router';
import { authEnabled } from '@/features/auth/clerkConfig';
import { withAuthHeaders } from '@/features/auth/authToken';
import { FEEDBACK_CATEGORIES, FEEDBACK_MAX_LENGTH, type FeedbackCategory } from '@/schema/feedback';

const CATEGORY_LABELS: Record<FeedbackCategory, string> = {
  bug: "Something's broken",
  idea: 'Idea or request',
  content: 'Wrong rules content',
  other: 'Something else',
};

const triggerClass =
  'border-2 border-ink-900/30 px-3 py-1.5 font-mono text-xs uppercase tracking-wide text-ink-700 hover:border-ink-900/60 dark:border-kraft-100/30 dark:text-kraft-200';
const primaryClass =
  'border-2 border-ink-900 bg-ink-900 px-3 py-1.5 font-mono text-xs uppercase tracking-wide text-kraft-50 disabled:opacity-50 dark:border-kraft-100 dark:bg-kraft-100 dark:text-ink-900';

type Phase = { state: 'form' } | { state: 'sending' } | { state: 'sent'; issueUrl?: string } | { state: 'error'; error: string };

export function FeedbackDialog() {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<FeedbackCategory>('bug');
  const [message, setMessage] = useState('');
  const [phase, setPhase] = useState<Phase>({ state: 'form' });
  const location = useLocation();

  if (!authEnabled) return null;

  function reset() {
    setMessage('');
    setCategory('bug');
    setPhase({ state: 'form' });
  }

  async function submit() {
    if (!message.trim()) return;
    setPhase({ state: 'sending' });
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: await withAuthHeaders({ 'content-type': 'application/json' }),
        body: JSON.stringify({
          category,
          message: message.trim(),
          // Captured automatically so the reporter doesn't have to describe
          // where they were, which is the detail people always leave out.
          context: { route: location.pathname },
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPhase({ state: 'error', error: body.error ?? `Failed to send (${res.status}).` });
        return;
      }
      setPhase({ state: 'sent', issueUrl: body.issueUrl });
    } catch {
      setPhase({ state: 'error', error: 'Could not reach the server. Check your connection.' });
    }
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <Dialog.Trigger className={triggerClass} aria-label="Send feedback">
        Feedback
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-ink-900/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 w-[min(32rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 border-2 border-ink-900 bg-kraft-100 p-6 dark:border-kraft-100 dark:bg-charcoal-900">
          <Dialog.Title className="mb-1 font-display text-xl text-ink-900 dark:text-kraft-100">
            Send feedback
          </Dialog.Title>

          <Show when="signed-out">
            <Dialog.Description className="mb-4 text-sm text-ink-700 dark:text-kraft-200">
              Feedback goes straight to the project's issue tracker, so it needs an account — that's what keeps
              it from filling up with spam.
            </Dialog.Description>
            <Link to="/sign-in" className={primaryClass} onClick={() => setOpen(false)}>
              Sign in
            </Link>
          </Show>

          <Show when="signed-in">
            {phase.state === 'sent' ? (
              <>
                <Dialog.Description className="mb-4 text-sm text-ink-700 dark:text-kraft-200">
                  Thanks — that's been filed.{' '}
                  {phase.issueUrl && (
                    <a href={phase.issueUrl} target="_blank" rel="noreferrer" className="underline">
                      Track it on GitHub
                    </a>
                  )}
                </Dialog.Description>
                <button type="button" className={primaryClass} onClick={() => setOpen(false)}>
                  Close
                </button>
              </>
            ) : (
              <>
                <Dialog.Description className="mb-4 text-sm text-ink-700 dark:text-kraft-200">
                  This opens an issue on the project's GitHub. Your email isn't included.
                </Dialog.Description>

                <label className="mb-1.5 block font-mono text-xs uppercase tracking-wider text-ink-500 dark:text-kraft-300">
                  Kind
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as FeedbackCategory)}
                  className="mb-4 w-full border-b-2 border-dashed border-ink-900/30 bg-transparent py-1.5 text-sm outline-none dark:border-kraft-100/30"
                >
                  {FEEDBACK_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {CATEGORY_LABELS[c]}
                    </option>
                  ))}
                </select>

                <label className="mb-1.5 block font-mono text-xs uppercase tracking-wider text-ink-500 dark:text-kraft-300">
                  What happened?
                </label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value.slice(0, FEEDBACK_MAX_LENGTH))}
                  rows={5}
                  placeholder="The more specific, the more fixable."
                  className="mb-1 w-full resize-y border-2 border-ink-900/30 bg-transparent p-2 text-sm outline-none focus:border-rust-500 dark:border-kraft-100/30"
                />
                <p className="mb-4 text-xs text-ink-500 dark:text-kraft-300">
                  {message.length}/{FEEDBACK_MAX_LENGTH}
                </p>

                {phase.state === 'error' && (
                  <p className="mb-3 text-xs text-rust-500">{phase.error}</p>
                )}

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className={primaryClass}
                    disabled={!message.trim() || phase.state === 'sending'}
                    onClick={() => void submit()}
                  >
                    {phase.state === 'sending' ? 'Sending…' : 'Send'}
                  </button>
                  <Dialog.Close className={triggerClass}>Cancel</Dialog.Close>
                </div>
              </>
            )}
          </Show>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
