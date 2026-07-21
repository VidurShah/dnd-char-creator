import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useContentIndex } from '@/content/useContentIndex';
import { loadContentIndex } from '@/content/loader';
import { findCrossEditionMatch } from '@/content/crossEdition';
import { contentRepo } from '@/db/repos';
import type { ContentEntry } from '@/schema/content';
import type { Edition } from '@/schema/common';
import { ContentEntrySchema } from '@/schema/content';
import { emptyFeatDraft, emptyItemDraft, emptySpellDraft, type EditableKind } from './entryDraft';
import { SpellForm } from './SpellForm';
import { ItemForm } from './ItemForm';
import { FeatForm } from './FeatForm';

const KIND_LABEL: Record<EditableKind, string> = { spell: 'Spell', item: 'Item', feat: 'Feat' };
const OTHER_EDITION: Record<Edition, Edition> = { '2014': '2024', '2024': '2014' };

export function EntryEditorPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const edition = (params.get('edition') as Edition | null) ?? '2014';

  const { entries } = useContentIndex(edition);
  const [kind, setKind] = useState<EditableKind>('spell');
  const [name, setName] = useState('');
  const [spellPayload, setSpellPayload] = useState(emptySpellDraft());
  const [itemPayload, setItemPayload] = useState(emptyItemDraft());
  const [featPayload, setFeatPayload] = useState(emptyFeatDraft());
  const [templateQuery, setTemplateQuery] = useState('');
  const [crossEditionMatch, setCrossEditionMatch] = useState<ContentEntry | undefined>(undefined);
  const [saving, setSaving] = useState(false);

  const templateMatches = useMemo(() => {
    const q = templateQuery.trim().toLowerCase();
    if (!q) return [];
    return entries.filter((e) => e.kind === kind && e.name.toLowerCase().includes(q)).slice(0, 6);
  }, [entries, templateQuery, kind]);

  function applyTemplate(entry: ContentEntry) {
    setName(`${entry.name} (Custom)`);
    if (entry.kind === 'spell') setSpellPayload(entry.data);
    if (entry.kind === 'item') setItemPayload(entry.data);
    if (entry.kind === 'feat') setFeatPayload(entry.data);
    setTemplateQuery('');
  }

  function buildEntry(crossEditionRef?: string): ContentEntry {
    const base = {
      id: `${edition}/${kind}/custom-${crypto.randomUUID()}`,
      edition,
      name: name.trim(),
      source: { book: 'custom' as const },
      origin: 'custom' as const,
      schemaVersion: 1,
      crossEditionRef,
    };
    if (kind === 'spell') return ContentEntrySchema.parse({ ...base, kind: 'spell', data: spellPayload });
    if (kind === 'item') return ContentEntrySchema.parse({ ...base, kind: 'item', data: itemPayload });
    return ContentEntrySchema.parse({ ...base, kind: 'feat', data: featPayload });
  }

  async function handleSaveClick() {
    if (!name.trim()) return;
    if (crossEditionMatch === undefined) {
      const otherEntries = await loadContentIndex(OTHER_EDITION[edition]);
      const match = findCrossEditionMatch(name, kind, otherEntries);
      if (match) {
        setCrossEditionMatch(match);
        return; // show the link-or-separate prompt instead of saving yet
      }
    }
    await finalizeSave(undefined);
  }

  async function finalizeSave(crossEditionRef: string | undefined) {
    setSaving(true);
    const entry = buildEntry(crossEditionRef);
    await contentRepo.save(entry);
    navigate(`/library?edition=${edition}`);
  }

  return (
    <div>
      <h1 className="mb-4 font-display text-xl text-ink-900 dark:text-kraft-100">New {KIND_LABEL[kind]}</h1>

      <div className="mb-5 flex gap-2">
        {(['spell', 'item', 'feat'] as EditableKind[]).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => {
              setKind(k);
              setCrossEditionMatch(undefined);
            }}
            className={`border-2 px-3 py-1.5 font-mono text-xs uppercase tracking-wide ${
              kind === k
                ? 'border-ink-900 bg-ink-900 text-kraft-50 dark:border-kraft-100 dark:bg-kraft-100 dark:text-ink-900'
                : 'border-ink-900/25 text-ink-700 dark:border-kraft-100/25 dark:text-kraft-200'
            }`}
          >
            {KIND_LABEL[k]}
          </button>
        ))}
      </div>

      <div className="mb-5">
        <input
          type="search"
          value={templateQuery}
          onChange={(e) => setTemplateQuery(e.target.value)}
          placeholder={`Start from an existing ${KIND_LABEL[kind].toLowerCase()}…`}
          className="w-full border-b-2 border-dashed border-ink-900/30 bg-transparent px-1 py-2 text-sm outline-none focus:border-rust-500 dark:border-kraft-100/30"
        />
        {templateMatches.length > 0 && (
          <ul className="mt-1 flex flex-col gap-1">
            {templateMatches.map((entry) => (
              <li key={entry.id}>
                <button
                  type="button"
                  onClick={() => applyTemplate(entry)}
                  className="flex w-full items-center justify-between px-2 py-1 text-left text-sm hover:bg-ink-900/5 dark:hover:bg-kraft-100/5"
                >
                  <span>{entry.name}</span>
                  <span className="font-mono text-xs text-rust-500">use as template</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <label className="mb-5 flex flex-col gap-1">
        <span className="font-mono text-xs uppercase tracking-wider text-ink-500 dark:text-kraft-300">Name</span>
        <input
          type="text"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setCrossEditionMatch(undefined);
          }}
          className="border-b-2 border-dashed border-ink-900/30 bg-transparent px-1 py-2 text-lg outline-none focus:border-rust-500 dark:border-kraft-100/30"
        />
      </label>

      {kind === 'spell' && <SpellForm value={spellPayload} onChange={setSpellPayload} />}
      {kind === 'item' && <ItemForm value={itemPayload} onChange={setItemPayload} />}
      {kind === 'feat' && <FeatForm value={featPayload} onChange={setFeatPayload} />}

      {crossEditionMatch && (
        <div className="mt-5 border-2 border-rust-500 bg-rust-500/5 p-4">
          <p className="text-sm">
            A <strong>{crossEditionMatch.name}</strong> already exists in {OTHER_EDITION[edition] === '2024' ? '5.5e' : '5e'}. Link to
            it instead of creating an unrelated duplicate?
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => finalizeSave(crossEditionMatch.id)}
              className="border-2 border-ink-900 bg-ink-900 px-3 py-1.5 font-mono text-xs uppercase tracking-wide text-kraft-50 dark:border-kraft-100 dark:bg-kraft-100 dark:text-ink-900"
            >
              Link to it
            </button>
            <button
              type="button"
              onClick={() => finalizeSave(undefined)}
              className="border-2 border-ink-900/30 px-3 py-1.5 font-mono text-xs uppercase tracking-wide dark:border-kraft-100/30"
            >
              Create separate entry
            </button>
          </div>
        </div>
      )}

      {!crossEditionMatch && (
        <button
          type="button"
          disabled={!name.trim() || saving}
          onClick={handleSaveClick}
          className="mt-6 border-2 border-ink-900 bg-ink-900 px-4 py-2 font-mono text-xs uppercase tracking-wide text-kraft-50 disabled:opacity-40 dark:border-kraft-100 dark:bg-kraft-100 dark:text-ink-900"
        >
          Save {KIND_LABEL[kind]}
        </button>
      )}
    </div>
  );
}
