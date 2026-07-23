import { useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router';
import { db } from '@/db/dexie';
import { characterRepo } from '@/db/repos';
import { exportVault, importVault } from '@/db/exportImport';
import { downloadJson, readJsonFile } from '@/lib/download';
import { humanizeSlug } from '@/lib/text';
import type { CharacterBuild } from '@/schema/character';

/** "Life Domain Cleric 1" / "Fighter 3 / Wizard 2" — derived from the class refs
 * so the list can label each character without loading the whole content index. */
function classSummary(build: CharacterBuild): string {
  if (build.classes.length === 0) return 'No class yet';
  return build.classes
    .map((c) => {
      const className = humanizeSlug(c.classRef.split('/').pop() ?? '');
      const subclass = c.subclassRef ? humanizeSlug(c.subclassRef.split('/').pop() ?? '') : undefined;
      const label = subclass ? `${subclass} ${className}` : className;
      return `${label} ${c.levels}`;
    })
    .join(' / ');
}

export function CharactersPage() {
  const characters = useLiveQuery(() => db.characters.orderBy('updatedAt').reverse().toArray(), []);
  const fileInput = useRef<HTMLInputElement>(null);
  const [importError, setImportError] = useState<string | null>(null);
  /** Id of the character whose delete button is awaiting confirmation, if any. */
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  async function handleDelete(id: string) {
    await characterRepo.remove(id);
    setPendingDelete(null);
  }

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
            <li key={c.id} className="flex items-center gap-2 pr-2">
              <Link to={`/characters/${c.id}`} className="flex flex-1 items-center justify-between gap-3 px-2 py-3 hover:bg-ink-900/5 dark:hover:bg-kraft-100/5">
                <span className="min-w-0">
                  <span className="block truncate font-medium">{c.name}</span>
                  <span className="block truncate font-mono text-xs text-ink-700 dark:text-kraft-200">{classSummary(c.build)}</span>
                </span>
                <span className="shrink-0 font-mono text-xs text-ink-700 dark:text-kraft-200">
                  Level {c.build.classes.reduce((sum, cl) => sum + cl.levels, 0)}
                </span>
              </Link>
              {/* Deleting a character is irreversible and local-only — there's no
                  server copy to restore from — so it takes an explicit second click. */}
              {pendingDelete === c.id ? (
                <span className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => handleDelete(c.id)}
                    className="border-2 border-rust-500 bg-rust-500 px-2 py-1 font-mono text-[10px] uppercase tracking-wide text-kraft-50"
                  >
                    Delete
                  </button>
                  <button
                    type="button"
                    onClick={() => setPendingDelete(null)}
                    className="border-2 border-ink-900/30 px-2 py-1 font-mono text-[10px] uppercase tracking-wide text-ink-700 hover:border-ink-900/60 dark:border-kraft-100/30 dark:text-kraft-200"
                  >
                    Cancel
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  aria-label={`Delete ${c.name}`}
                  onClick={() => setPendingDelete(c.id)}
                  className="shrink-0 border-2 border-ink-900/30 px-2 py-1 font-mono text-[10px] uppercase tracking-wide text-ink-700 hover:border-rust-500 hover:text-rust-500 dark:border-kraft-100/30 dark:text-kraft-200"
                >
                  Delete
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
