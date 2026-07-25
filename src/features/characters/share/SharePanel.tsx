import { useMemo, useState } from 'react';
import type { Character } from '@/schema/character';
import type { ContentEntry } from '@/schema/content';
import type { DerivedSheet } from '@/engine/compute';
import { downloadText } from '@/lib/download';
import { buildShareModel, shareModelToHtml, shareModelToMarkdown } from './shareCharacter';

/** Filesystem-safe slug for the download filename. */
function fileSlug(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'character';
}

/**
 * Popover offering three shareable renderings of one character: a copy-to-clipboard
 * text summary (paste into Discord/chat), a styled printable HTML one-pager, and the
 * raw Markdown. All derived from the live sheet — never the persisted JSON, which is
 * for re-import, not reading.
 */
export function SharePanel({
  character,
  sheet,
  index,
  onClose,
}: {
  character: Character;
  sheet: DerivedSheet;
  index: Map<string, ContentEntry>;
  onClose: () => void;
}) {
  const model = useMemo(() => buildShareModel(character, sheet, index), [character, sheet, index]);
  const [copied, setCopied] = useState(false);
  const slug = fileSlug(character.name);

  async function copySummary() {
    try {
      await navigator.clipboard.writeText(shareModelToMarkdown(model));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked (e.g. insecure context) — fall back to a download instead.
      downloadText(`${slug}.md`, shareModelToMarkdown(model), 'text/markdown');
    }
  }

  return (
    <div className="absolute left-0 top-full z-20 mt-2 w-64 border-2 border-ink-900 bg-kraft-50 p-3 shadow-xl dark:border-kraft-100 dark:bg-ink-900">
      <div className="mb-2 flex items-center justify-between">
        <p className="font-mono text-xs uppercase tracking-wider text-ink-500 dark:text-kraft-300">Share this character</p>
        <button type="button" onClick={onClose} aria-label="Close" className="font-mono text-sm text-ink-700 hover:text-rust-500 dark:text-kraft-200">
          ✕
        </button>
      </div>
      <div className="flex flex-col gap-1.5">
        <button
          type="button"
          onClick={copySummary}
          className="border-2 border-ink-900 bg-ink-900 px-3 py-1.5 text-left font-mono text-xs uppercase tracking-wide text-kraft-50 dark:border-kraft-100 dark:bg-kraft-100 dark:text-ink-900"
        >
          {copied ? '✓ Copied to clipboard' : 'Copy summary (text)'}
        </button>
        <button
          type="button"
          onClick={() => downloadText(`${slug}.html`, shareModelToHtml(model), 'text/html')}
          className="border-2 border-ink-900/30 px-3 py-1.5 text-left font-mono text-xs uppercase tracking-wide text-ink-700 hover:border-rust-500 dark:border-kraft-100/30 dark:text-kraft-200"
        >
          Download sheet (HTML)
        </button>
        <button
          type="button"
          onClick={() => downloadText(`${slug}.md`, shareModelToMarkdown(model), 'text/markdown')}
          className="border-2 border-ink-900/30 px-3 py-1.5 text-left font-mono text-xs uppercase tracking-wide text-ink-700 hover:border-rust-500 dark:border-kraft-100/30 dark:text-kraft-200"
        >
          Download Markdown (.md)
        </button>
      </div>
      <p className="mt-2 text-[11px] leading-snug text-ink-500 dark:text-kraft-300">
        Text is great for chat; the HTML sheet opens in any browser and prints to PDF.
      </p>
    </div>
  );
}
