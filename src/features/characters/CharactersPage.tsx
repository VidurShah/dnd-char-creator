import { useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router';
import { db } from '@/db/dexie';
import { exportVault, importVault } from '@/db/exportImport';
import { downloadJson, readJsonFile } from '@/lib/download';

export function CharactersPage() {
  const characters = useLiveQuery(() => db.characters.orderBy('updatedAt').reverse().toArray(), []);
  const fileInput = useRef<HTMLInputElement>(null);
  const [importError, setImportError] = useState<string | null>(null);

  async function handleExportVault() {
    const vault = await exportVault();
    downloadJson(`grimoire-vault-${new Date().toISOString().slice(0, 10)}.json`, vault);
  }

  async function handleImportFile(file: File) {
    setImportError(null);
    try {
      const data = await readJsonFile(file);
      await importVault(data);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Import failed — check the file is a Grimoire vault export.');
    }
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-xl text-ink-900 dark:text-kraft-100">Characters</h1>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExportVault}
            className="border-2 border-ink-900/30 px-3 py-1.5 font-mono text-xs uppercase tracking-wide text-ink-700 hover:border-ink-900/60 dark:border-kraft-100/30 dark:text-kraft-200"
          >
            Export Vault
          </button>
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            className="border-2 border-ink-900/30 px-3 py-1.5 font-mono text-xs uppercase tracking-wide text-ink-700 hover:border-ink-900/60 dark:border-kraft-100/30 dark:text-kraft-200"
          >
            Import Vault
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleImportFile(file);
              e.target.value = '';
            }}
          />
          <Link
            to="/characters/templates"
            className="border-2 border-ink-900/30 px-3 py-1.5 font-mono text-xs uppercase tracking-wide text-ink-700 hover:border-ink-900/60 dark:border-kraft-100/30 dark:text-kraft-200"
          >
            Premade Characters
          </Link>
          <Link
            to="/characters/ai-new"
            className="border-2 border-ink-900/30 px-3 py-1.5 font-mono text-xs uppercase tracking-wide text-ink-700 hover:border-ink-900/60 dark:border-kraft-100/30 dark:text-kraft-200"
          >
            AI Builder
          </Link>
          <Link
            to="/characters/new"
            className="border-2 border-ink-900 bg-ink-900 px-3 py-1.5 font-mono text-xs uppercase tracking-wide text-kraft-50 dark:border-kraft-100 dark:bg-kraft-100 dark:text-ink-900"
          >
            + New Character
          </Link>
        </div>
      </div>

      {importError && <p className="mb-4 text-sm text-rust-500">{importError}</p>}

      {characters == null ? (
        <p className="text-sm text-ink-700 dark:text-kraft-200">Loading…</p>
      ) : characters.length === 0 ? (
        <div className="border-2 border-dashed border-ink-900/25 px-8 py-16 text-center dark:border-kraft-100/25">
          <h2 className="font-display text-lg text-ink-900 dark:text-kraft-100">No characters yet</h2>
          <p className="mt-2 text-sm text-ink-700 dark:text-kraft-200">
            New to the game? Grab a <span className="font-medium">Premade Character</span> and start playing immediately, or
            build your own with <span className="font-medium">+ New Character</span>.
          </p>
        </div>
      ) : (
        <ul className="divide-y-2 divide-dashed divide-ink-900/15 dark:divide-kraft-100/15">
          {characters.map((c) => (
            <li key={c.id}>
              <Link to={`/characters/${c.id}`} className="flex items-center justify-between px-2 py-3 hover:bg-ink-900/5 dark:hover:bg-kraft-100/5">
                <span className="font-medium">{c.name}</span>
                <span className="font-mono text-xs text-ink-700 dark:text-kraft-200">
                  Level {c.build.classes.reduce((sum, cl) => sum + cl.levels, 0)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
