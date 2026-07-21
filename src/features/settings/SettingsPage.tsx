import { useEffect, useState } from 'react';
import { settingsRepo } from '@/db/repos';
import { AI_MODELS, DEFAULT_AI_MODEL } from '@/ai/models';

export function SettingsPage() {
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState(DEFAULT_AI_MODEL);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([settingsRepo.get<string>('geminiApiKey'), settingsRepo.get<string>('aiModel')]).then(([key, savedModel]) => {
      if (key) setApiKey(key);
      if (savedModel) setModel(savedModel);
      setLoading(false);
    });
  }, []);

  async function save() {
    await settingsRepo.set('geminiApiKey', apiKey.trim());
    await settingsRepo.set('aiModel', model);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function clearKey() {
    setApiKey('');
    await settingsRepo.set('geminiApiKey', '');
  }

  if (loading) return <p className="text-sm text-ink-700 dark:text-kraft-200">Loading…</p>;

  return (
    <div className="max-w-lg">
      <h1 className="mb-1 font-display text-xl text-ink-900 dark:text-kraft-100">Settings</h1>
      <p className="mb-6 text-sm text-ink-700 dark:text-kraft-200">
        The AI character builder already uses <span className="font-medium">GEMINI_API_KEY</span> from your local{' '}
        <span className="font-mono">.env</span> file by default (the same key used for the Tasha's/2024 PHB
        extraction pipeline) — that key never leaves your machine and is never part of the built app, since a local
        proxy in the dev/preview server handles the actual API call. Nothing below is required.
      </p>

      <div className="mb-6">
        <label className="mb-1.5 block font-mono text-xs uppercase tracking-wider text-ink-500 dark:text-kraft-300">
          Override key (optional)
        </label>
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="Leave blank to use GEMINI_API_KEY from .env"
          autoComplete="off"
          className="w-full border-b-2 border-dashed border-ink-900/30 bg-transparent px-1 py-1.5 text-sm outline-none focus:border-rust-500 dark:border-kraft-100/30"
        />
        <p className="mt-1.5 text-xs text-ink-700 dark:text-kraft-200">
          Only needed if you want to use a <span className="font-medium">different</span> Gemini key than the one in
          .env — stored unencrypted in this browser's local database (IndexedDB), and sent along with each AI builder
          request when set.
        </p>
        {apiKey && (
          <button type="button" onClick={clearKey} className="mt-1.5 font-mono text-xs text-rust-500">
            Clear override
          </button>
        )}
      </div>

      <div className="mb-6">
        <label className="mb-1.5 block font-mono text-xs uppercase tracking-wider text-ink-500 dark:text-kraft-300">Model</label>
        <select
          value={model}
          onChange={(e) => setModel(e.target.value)}
          className="w-full border-b-2 border-dashed border-ink-900/30 bg-transparent py-1.5 text-sm outline-none dark:border-kraft-100/30"
        >
          {AI_MODELS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
        <p className="mt-1.5 text-xs text-ink-700 dark:text-kraft-200">Used by the AI character builder to turn a plain-English concept into a build.</p>
      </div>

      <button
        type="button"
        onClick={save}
        className="border-2 border-ink-900 bg-ink-900 px-3 py-1.5 font-mono text-xs uppercase tracking-wide text-kraft-50 dark:border-kraft-100 dark:bg-kraft-100 dark:text-ink-900"
      >
        {saved ? 'Saved ✓' : 'Save'}
      </button>
    </div>
  );
}
