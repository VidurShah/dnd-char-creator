import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import type { Character } from '@/schema/character';
import type { ContentEntry } from '@/schema/content';
import type { DerivedSheet } from '@/engine/compute';
import { settingsRepo } from '@/db/repos';
import { chatComplete } from '@/ai/geminiClient';
import { AI_MODELS, DEFAULT_AI_MODEL } from '@/ai/models';
import { buildRulesIndex, entryPromptText } from '@/ai/rulesRetrieval';
import {
  CITATION_RE,
  citationRefs,
  citedRefs,
  groundTurn,
  rulesPromptSection,
  type AdvisorMessage,
  type RuleSource,
} from './grounding';
import { buildShareModel, shareModelToMarkdown } from '../share/shareCharacter';

/** Renders a citation token like [R2] or [R1, R3]. */
type CiteRenderer = (refs: number[], key: string) => ReactNode;

/**
 * Renders `**bold**` (and `*bold*`) spans inside a line, plus [R1]-style
 * citations when a renderer is given; everything else is plain text.
 */
function inlineBold(text: string, keyPrefix: string, cite?: CiteRenderer): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|\*[^*\n]+\*)/g).flatMap((part, i) => {
    const m = /^\*\*?([^*]+)\*\*?$/.exec(part);
    if (m) return [<strong key={`${keyPrefix}-${i}`}>{m[1]}</strong>];
    if (!cite) return [<span key={`${keyPrefix}-${i}`}>{part}</span>];
    return part.split(new RegExp(`(${CITATION_RE.source})`)).map((piece, j) =>
      j % 2 === 1 ? cite(citationRefs(piece), `${keyPrefix}-${i}-${j}`) : <span key={`${keyPrefix}-${i}-${j}`}>{piece}</span>,
    );
  });
}

/**
 * Tiny, safe Markdown renderer for model replies — just headings, bullet lists,
 * and bold. Not a full parser; it keeps the chat readable without pulling in a
 * dependency or using dangerouslySetInnerHTML.
 */
function MarkdownLite({ text, cite }: { text: string; cite?: CiteRenderer }) {
  const lines = text.split('\n');
  const blocks: ReactNode[] = [];
  let bullets: string[] = [];
  const flush = () => {
    if (bullets.length === 0) return;
    blocks.push(
      <ul key={`ul-${blocks.length}`} className="my-1 list-disc pl-5">
        {bullets.map((b, i) => (
          <li key={i}>{inlineBold(b, `li-${blocks.length}-${i}`, cite)}</li>
        ))}
      </ul>,
    );
    bullets = [];
  };
  lines.forEach((raw, i) => {
    const line = raw.trimEnd();
    const bullet = /^\s*[*-]\s+(.*)/.exec(line);
    const heading = /^#{1,6}\s+(.*)/.exec(line);
    if (bullet) {
      bullets.push(bullet[1]);
    } else if (heading) {
      flush();
      blocks.push(
        <p key={`h-${i}`} className="mt-2 font-semibold first:mt-0">
          {inlineBold(heading[1], `h-${i}`, cite)}
        </p>,
      );
    } else if (line.trim() === '') {
      flush();
    } else {
      flush();
      blocks.push(
        <p key={`p-${i}`} className="my-1 first:mt-0">
          {inlineBold(line, `p-${i}`, cite)}
        </p>,
      );
    }
  });
  flush();
  return <>{blocks}</>;
}

const SUGGESTIONS = [
  "What are this character's biggest strengths and weaknesses?",
  'How should I play them in a fight?',
  'What can I do outside of combat?',
  'Give me a roleplay hook to lean into.',
  'What happens to me if I get grappled?',
];

/**
 * The entries one reply consulted, under the reply. Each opens inline to its
 * full text — mid-session, a player checking a ruling should not have to leave
 * the sheet — with a link through to the Library entry.
 */
function SourcesList({
  sources,
  cited,
  index,
  edition,
  open,
  onToggle,
}: {
  sources: RuleSource[];
  cited: Set<number>;
  index: Map<string, ContentEntry>;
  edition: Character['edition'];
  open: number | null;
  onToggle: (ref: number) => void;
}) {
  if (sources.length === 0) {
    // Visible on purpose: an answer with nothing behind it should look unsupported.
    return <p className="mt-1 font-mono text-[11px] text-ink-500 dark:text-kraft-300">No rules entries matched — general knowledge only.</p>;
  }
  const openSource = sources.find((s) => s.ref === open);
  const openEntry = openSource ? index.get(openSource.id) : undefined;
  return (
    <div className="mt-1.5">
      <p className="font-mono text-[11px] uppercase tracking-wide text-ink-500 dark:text-kraft-300">
        Consulted {sources.length} {sources.length === 1 ? 'entry' : 'entries'}
      </p>
      <div className="mt-1 flex flex-wrap gap-1">
        {sources.map((s) => (
          <button
            key={s.ref}
            type="button"
            onClick={() => onToggle(s.ref)}
            aria-expanded={open === s.ref}
            title={s.label}
            className={`rounded-sm border px-1.5 py-0.5 text-[11px] ${
              open === s.ref
                ? 'border-rust-500 text-rust-600 dark:text-rust-500'
                : cited.has(s.ref)
                  ? 'border-ink-900/50 text-ink-900 dark:border-kraft-100/50 dark:text-kraft-100'
                  : 'border-ink-900/20 text-ink-500 dark:border-kraft-100/20 dark:text-kraft-300'
            }`}
          >
            <span className="font-mono">R{s.ref}</span> {s.name}
          </button>
        ))}
      </div>
      {openSource && (
        <div className="mt-1.5 border-l-2 border-rust-500/60 pl-2 text-xs text-ink-700 dark:text-kraft-200">
          <p className="font-medium text-ink-900 dark:text-kraft-100">
            {openSource.name} <span className="font-normal text-ink-500 dark:text-kraft-300">· {openSource.label}</span>
          </p>
          <p className="mt-1 max-h-48 overflow-y-auto whitespace-pre-wrap">
            {openEntry ? entryPromptText(openEntry) : 'This entry is no longer in your library.'}
          </p>
          <Link
            to={`/library?edition=${edition}&entry=${encodeURIComponent(openSource.id)}`}
            className="mt-1 inline-block font-mono text-[11px] uppercase tracking-wide text-rust-600 hover:underline dark:text-rust-500"
          >
            Open in Library →
          </Link>
        </div>
      )}
    </div>
  );
}

/** A model reply with clickable citations and its consulted entries. */
function ModelReply({
  message,
  index,
  edition,
}: {
  message: AdvisorMessage;
  index: Map<string, ContentEntry>;
  edition: Character['edition'];
}) {
  const [open, setOpen] = useState<number | null>(null);
  const sources = message.sources;
  const cited = useMemo(() => citedRefs(message.text, sources ?? []), [message.text, sources]);
  const toggle = (ref: number) => setOpen((cur) => (cur === ref ? null : ref));

  // Replies from before grounding existed carry no sources; render them as before.
  if (!sources) return <MarkdownLite text={message.text} />;

  const known = new Set(sources.map((s) => s.ref));
  const cite: CiteRenderer = (refs, key) => {
    const valid = refs.filter((r) => known.has(r));
    // A marker the model invented for an entry it was never given is dropped
    // rather than rendered as a citation to nothing.
    if (valid.length === 0) return null;
    return (
      <span key={key} className="whitespace-nowrap">
        {valid.map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => toggle(r)}
            title={sources.find((s) => s.ref === r)?.name}
            className="ml-0.5 align-super font-mono text-[10px] text-rust-600 hover:underline dark:text-rust-500"
          >
            [R{r}]
          </button>
        ))}
      </span>
    );
  };

  return (
    <>
      <MarkdownLite text={message.text} cite={cite} />
      <SourcesList sources={sources} cited={cited} index={index} edition={edition} open={open} onToggle={toggle} />
    </>
  );
}

function buildSystemPrompt(character: Character, sheet: DerivedSheet, index: Map<string, ContentEntry>): string {
  const editionRules = character.edition === '2014' ? '5e (2014) rules' : '5.5e (2024) rules';
  const sheetMd = shareModelToMarkdown(buildShareModel(character, sheet, index));
  return [
    `You are a friendly, practical Dungeons & Dragons companion helping a player get the most out of THIS specific character in a ${editionRules} game.`,
    'Answer their questions about how to play the character: combat tactics, when and how to use their features and spells, their role in a party, skill and exploration uses, and roleplay ideas.',
    "Be concrete and ground every suggestion in the character's ACTUAL abilities from the sheet below — never invent feats, spells, or class features they don't have. If they ask about something the character can't do, say so plainly and suggest the nearest real option.",
    'Keep replies focused and fairly short — a few tight paragraphs or a short list. Address the player as "you".',
    '',
    "Here is the character's current sheet:",
    '',
    sheetMd,
  ].join('\n');
}

/**
 * A per-character AI advisor: the player can ask how to use their character —
 * tactics, feature/spell combos, party role, roleplay — and the model answers
 * grounded in this character's real sheet (passed as the system prompt).
 */
export function ChatPanel({
  character,
  sheet,
  index,
  messages,
  onMessagesChange,
}: {
  character: Character;
  sheet: DerivedSheet;
  index: Map<string, ContentEntry>;
  /** Owned by the parent tray so the conversation survives closing/reopening. */
  messages: AdvisorMessage[];
  onMessagesChange: (messages: AdvisorMessage[]) => void;
}) {
  const [apiKey, setApiKey] = useState<string | undefined>(undefined);
  const [model, setModel] = useState(DEFAULT_AI_MODEL);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const systemPrompt = useMemo(() => buildSystemPrompt(character, sheet, index), [character, sheet, index]);
  const rules = useMemo(() => buildRulesIndex([...index.values()], character.edition), [index, character.edition]);
  /** What the character actually has, so a name shared by several entries resolves to theirs. */
  const ownedIds = useMemo(
    () =>
      new Set([
        ...sheet.features.map((f) => f.ref),
        ...character.build.knownSpells,
        ...character.build.preparedSpells,
        ...character.build.feats.map((f) => f.ref),
      ]),
    [sheet.features, character.build],
  );

  useEffect(() => {
    Promise.all([settingsRepo.get<string>('geminiApiKey'), settingsRepo.get<string>('aiModel')]).then(([key, savedModel]) => {
      setApiKey(key || undefined);
      if (savedModel && AI_MODELS.some((m) => m.id === savedModel)) setModel(savedModel);
      setSettingsLoaded(true);
    });
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading]);

  // Clearing the conversation from the tray header should drop any stale error too.
  useEffect(() => {
    if (messages.length === 0) setError(null);
  }, [messages.length]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;
    const next: AdvisorMessage[] = [...messages, { role: 'user', text: trimmed }];
    onMessagesChange(next);
    setInput('');
    setError(null);
    setLoading(true);
    const { sources, entries } = groundTurn(next, rules, index, ownedIds);
    const grounded = `${systemPrompt}\n\n${rulesPromptSection(character.edition, sources, entries)}`;
    const res = await chatComplete(apiKey, model, grounded, next);
    setLoading(false);
    if ('error' in res) setError(res.error);
    else onMessagesChange([...next, { role: 'model', text: res.text, sources }]);
  }

  if (!settingsLoaded) return <p className="text-sm text-ink-700 dark:text-kraft-200">Loading…</p>;

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <p className="text-sm text-ink-700 dark:text-kraft-200">
        Ask about how to play <span className="font-medium">{character.name}</span> — tactics, when to use a feature or spell, your role in
        the party, or how a rule works. Answers are based on this character's actual sheet and cite the rules text they used.
      </p>

      <div
        ref={scrollRef}
        className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto border-2 border-dashed border-ink-900/20 p-3 dark:border-kraft-100/20"
      >
        {messages.length === 0 ? (
          <div className="m-auto flex flex-col items-center gap-2 text-center">
            <p className="text-sm text-ink-500 dark:text-kraft-300">Not sure where to start? Try:</p>
            <div className="flex flex-wrap justify-center gap-1.5">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => send(s)}
                  className="rounded-sm border border-ink-900/25 px-2 py-1 text-xs text-ink-700 hover:border-rust-500 dark:border-kraft-100/25 dark:text-kraft-200"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m, i) => (
            <div key={i} className={m.role === 'user' ? 'self-end' : 'self-start'}>
              <div
                className={`max-w-[85%] px-3 py-2 text-sm ${
                  m.role === 'user'
                    ? 'ml-auto whitespace-pre-wrap border-2 border-ink-900 bg-ink-900 text-kraft-50 dark:border-kraft-100 dark:bg-kraft-100 dark:text-ink-900'
                    : 'border-2 border-ink-900/20 text-ink-900 dark:border-kraft-100/20 dark:text-kraft-100'
                }`}
              >
                {m.role === 'user' ? m.text : <ModelReply message={m} index={index} edition={character.edition} />}
              </div>
            </div>
          ))
        )}
        {loading && <p className="self-start font-mono text-xs text-ink-500 dark:text-kraft-300">Thinking…</p>}
      </div>

      {error && (
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm text-rust-500">{error}</p>
          {/*
            A conversation long enough to trip the server's size ceiling cannot
            recover by retrying — every send carries the whole history, so it
            fails identically forever. The way out is a fresh conversation, and
            leaving the player to find that in the tray header is the difference
            between a dead end and a one-click fix.
          */}
          {messages.length > 0 && (
            <button
              type="button"
              onClick={() => onMessagesChange([])}
              className="border-2 border-rust-500/50 px-2 py-1 font-mono text-[11px] uppercase tracking-wide text-rust-600 hover:border-rust-500 dark:text-rust-500"
            >
              New chat
            </button>
          )}
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="flex gap-2"
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={`Ask about ${character.name}…`}
          className="flex-1 border-b-2 border-dashed border-ink-900/30 bg-transparent px-1 py-2 text-sm outline-none focus:border-rust-500 dark:border-kraft-100/30"
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="border-2 border-ink-900 bg-ink-900 px-4 py-2 font-mono text-xs uppercase tracking-wide text-kraft-50 disabled:opacity-30 dark:border-kraft-100 dark:bg-kraft-100 dark:text-ink-900"
        >
          Send
        </button>
      </form>
    </div>
  );
}
