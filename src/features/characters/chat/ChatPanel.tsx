import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Character } from '@/schema/character';
import type { ContentEntry } from '@/schema/content';
import type { DerivedSheet } from '@/engine/compute';
import { settingsRepo } from '@/db/repos';
import { chatComplete, type ChatMessage } from '@/ai/geminiClient';
import { AI_MODELS, DEFAULT_AI_MODEL } from '@/ai/models';
import { buildShareModel, shareModelToMarkdown } from '../share/shareCharacter';

/** Renders `**bold**` (and `*bold*`) spans inside a line; everything else is plain text. */
function inlineBold(text: string, keyPrefix: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|\*[^*\n]+\*)/g).map((part, i) => {
    const m = /^\*\*?([^*]+)\*\*?$/.exec(part);
    return m ? <strong key={`${keyPrefix}-${i}`}>{m[1]}</strong> : <span key={`${keyPrefix}-${i}`}>{part}</span>;
  });
}

/**
 * Tiny, safe Markdown renderer for model replies — just headings, bullet lists,
 * and bold. Not a full parser; it keeps the chat readable without pulling in a
 * dependency or using dangerouslySetInnerHTML.
 */
function MarkdownLite({ text }: { text: string }) {
  const lines = text.split('\n');
  const blocks: ReactNode[] = [];
  let bullets: string[] = [];
  const flush = () => {
    if (bullets.length === 0) return;
    blocks.push(
      <ul key={`ul-${blocks.length}`} className="my-1 list-disc pl-5">
        {bullets.map((b, i) => (
          <li key={i}>{inlineBold(b, `li-${blocks.length}-${i}`)}</li>
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
          {inlineBold(heading[1], `h-${i}`)}
        </p>,
      );
    } else if (line.trim() === '') {
      flush();
    } else {
      flush();
      blocks.push(
        <p key={`p-${i}`} className="my-1 first:mt-0">
          {inlineBold(line, `p-${i}`)}
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
];

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
export function ChatPanel({ character, sheet, index }: { character: Character; sheet: DerivedSheet; index: Map<string, ContentEntry> }) {
  const [apiKey, setApiKey] = useState<string | undefined>(undefined);
  const [model, setModel] = useState(DEFAULT_AI_MODEL);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const systemPrompt = useMemo(() => buildSystemPrompt(character, sheet, index), [character, sheet, index]);

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

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;
    const next: ChatMessage[] = [...messages, { role: 'user', text: trimmed }];
    setMessages(next);
    setInput('');
    setError(null);
    setLoading(true);
    const res = await chatComplete(apiKey, model, systemPrompt, next);
    setLoading(false);
    if ('error' in res) setError(res.error);
    else setMessages([...next, { role: 'model', text: res.text }]);
  }

  if (!settingsLoaded) return <p className="text-sm text-ink-700 dark:text-kraft-200">Loading…</p>;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-ink-700 dark:text-kraft-200">
        Ask about how to play <span className="font-medium">{character.name}</span> — tactics, when to use a feature or spell, your role in
        the party, or roleplay ideas. Answers are based on this character's actual sheet.
      </p>

      <div
        ref={scrollRef}
        className="flex max-h-[52vh] min-h-[16rem] flex-col gap-3 overflow-y-auto border-2 border-dashed border-ink-900/20 p-3 dark:border-kraft-100/20"
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
                {m.role === 'user' ? m.text : <MarkdownLite text={m.text} />}
              </div>
            </div>
          ))
        )}
        {loading && <p className="self-start font-mono text-xs text-ink-500 dark:text-kraft-300">Thinking…</p>}
      </div>

      {error && <p className="text-sm text-rust-500">{error}</p>}

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
      {messages.length > 0 && (
        <button
          type="button"
          onClick={() => {
            setMessages([]);
            setError(null);
          }}
          className="self-start font-mono text-[11px] uppercase tracking-wide text-ink-500 underline hover:text-rust-500 dark:text-kraft-300"
        >
          Clear conversation
        </button>
      )}
    </div>
  );
}
