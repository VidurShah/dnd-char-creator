import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { settingsRepo } from '@/db/repos';
import { useContentIndex } from '@/content/useContentIndex';
import { buildCharacterFromConcept } from '@/ai/buildFromConcept';
import { DEFAULT_AI_MODEL } from '@/ai/models';
import type { Edition } from '@/schema/common';

const EDITIONS: { id: Edition; label: string }[] = [
  { id: '2014', label: "5e (2014 + Tasha's)" },
  { id: '2024', label: '5.5e (2024)' },
];

export function AIBuilderPage() {
  const navigate = useNavigate();
  const [edition, setEdition] = useState<Edition>('2014');
  const [concept, setConcept] = useState('');
  // Optional override — the proxy falls back to GEMINI_API_KEY from .env when this is undefined.
  const [apiKeyOverride, setApiKeyOverride] = useState<string | undefined>(undefined);
  const [model, setModel] = useState(DEFAULT_AI_MODEL);
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { entries, byId, loading: loadingContent } = useContentIndex(edition);

  useEffect(() => {
    Promise.all([settingsRepo.get<string>('geminiApiKey'), settingsRepo.get<string>('aiModel')]).then(([key, savedModel]) => {
      setApiKeyOverride(key || undefined);
      if (savedModel) setModel(savedModel);
      setLoadingSettings(false);
    });
  }, []);

  async function generate() {
    if (!concept.trim()) return;
    setGenerating(true);
    setError(null);
    try {
      const result = await buildCharacterFromConcept({ edition, userConcept: concept.trim(), entries, index: byId, apiKey: apiKeyOverride, model });
      if ('error' in result) {
        setError(result.error);
        return;
      }
      navigate('/characters/new', { state: { prefill: result.state, warnings: result.warnings } });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong talking to the AI.');
    } finally {
      setGenerating(false);
    }
  }

  if (loadingSettings || loadingContent) return <p className="text-sm text-ink-700 dark:text-kraft-200">Loading…</p>;

  return (
    <div className="max-w-xl">
      <h1 className="mb-1 font-display text-xl text-ink-900 dark:text-kraft-100">AI Character Builder</h1>
      <p className="mb-6 text-sm text-ink-700 dark:text-kraft-200">
        Describe the character you want to play. The AI picks a species, class, subclass, background, and everything
        else from this edition's real content — you'll land in the normal builder afterward to review and adjust
        anything before creating them.
      </p>

      <div className="mb-4 flex gap-1 border-2 border-ink-900/20 p-1 dark:border-kraft-100/20">
        {EDITIONS.map((e) => (
          <button
            key={e.id}
            type="button"
            onClick={() => setEdition(e.id)}
            className={`px-3 py-1.5 font-mono text-xs uppercase tracking-wide ${
              edition === e.id ? 'bg-ink-900 text-kraft-50 dark:bg-kraft-100 dark:text-ink-900' : 'text-ink-700 dark:text-kraft-200'
            }`}
          >
            {e.label}
          </button>
        ))}
      </div>

      <textarea
        value={concept}
        onChange={(e) => setConcept(e.target.value)}
        placeholder="A grizzled dwarf veteran who swore off violence and now heals the party instead. Or: a sneaky halfling who wants to talk their way out of every fight but can hold their own in a pinch. Anything goes."
        rows={5}
        className="mb-3 w-full resize-y border-b-2 border-dashed border-ink-900/30 bg-transparent px-1 py-2 text-sm outline-none focus:border-rust-500 dark:border-kraft-100/30"
      />

      {error && <p className="mb-3 text-sm text-rust-500">{error}</p>}

      <button
        type="button"
        disabled={generating || !concept.trim()}
        onClick={generate}
        className="border-2 border-ink-900 bg-ink-900 px-4 py-2 font-mono text-xs uppercase tracking-wide text-kraft-50 disabled:opacity-30 dark:border-kraft-100 dark:bg-kraft-100 dark:text-ink-900"
      >
        {generating ? 'Thinking…' : 'Generate'}
      </button>
    </div>
  );
}
