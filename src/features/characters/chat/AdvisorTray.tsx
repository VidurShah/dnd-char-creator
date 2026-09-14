import { useState } from 'react';
import type { Character } from '@/schema/character';
import type { ContentEntry } from '@/schema/content';
import type { DerivedSheet } from '@/engine/compute';
import type { ChatMessage } from '@/ai/geminiClient';
import { ChatPanel } from './ChatPanel';

/**
 * The per-character AI advisor as a pop-out tray on the right edge — same pattern
 * as the dice tray, one notch lower so the two pull-tabs don't overlap. Keeps the
 * chat out of the main sheet tabs while staying one click away during play.
 */
export function AdvisorTray({ character, sheet, index }: { character: Character; sheet: DerivedSheet; index: Map<string, ContentEntry> }) {
  const [open, setOpen] = useState(false);
  // Held here (not in ChatPanel) so the conversation survives closing the tray;
  // only an explicit "New chat" wipes it.
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="fixed right-0 top-[calc(33%+5rem)] z-40 flex items-center gap-1 rounded-l-md border-2 border-r-0 border-ink-900 bg-kraft-50 px-2 py-3 font-mono text-xs uppercase tracking-wide text-ink-900 shadow-md [writing-mode:vertical-rl] hover:bg-ink-900 hover:text-kraft-50 dark:border-kraft-100 dark:bg-ink-900 dark:text-kraft-100 dark:hover:bg-kraft-100 dark:hover:text-ink-900"
      >
        💬 Advisor
      </button>

      {open && (
        <div className="fixed right-0 top-0 z-40 flex h-full w-[26rem] max-w-[92vw] flex-col border-l-2 border-ink-900 bg-kraft-50 p-4 shadow-2xl dark:border-kraft-100 dark:bg-ink-900">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-lg text-ink-900 dark:text-kraft-100">Advisor</h2>
            <div className="flex items-center gap-3">
              {/*
                "New chat" rather than "Clear": the same wipe, framed as the
                thing a player actually wants. It is also the remedy the server
                names when a long conversation trips the shared-key size ceiling,
                so the label has to match that wording.
              */}
              <button
                type="button"
                onClick={() => setMessages([])}
                disabled={messages.length === 0}
                title="Start a fresh conversation about this character"
                className="border-2 border-ink-900/30 px-2 py-1 font-mono text-[11px] uppercase tracking-wide text-ink-700 hover:border-ink-900/60 disabled:cursor-default disabled:opacity-30 disabled:hover:border-ink-900/30 dark:border-kraft-100/30 dark:text-kraft-200"
              >
                New chat
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close advisor"
                className="font-mono text-sm text-ink-700 hover:text-rust-500 dark:text-kraft-200"
              >
                ✕
              </button>
            </div>
          </div>
          <div className="min-h-0 flex-1">
            <ChatPanel character={character} sheet={sheet} index={index} messages={messages} onMessagesChange={setMessages} />
          </div>
        </div>
      )}
    </>
  );
}
