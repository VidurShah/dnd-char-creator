import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useContentIndex } from '@/content/useContentIndex';
import { computeSheet } from '@/engine/compute';
import { characterRepo } from '@/db/repos';
import type { Edition } from '@/schema/common';
import { buildCharacter } from './characterFactory';
import { listTemplates, templateToBuilderState } from './templates';

const EDITIONS: { id: Edition; label: string }[] = [
  { id: '2014', label: "5e (2014 + Tasha's)" },
  { id: '2024', label: '5.5e (2024)' },
];

export function TemplatesPage() {
  const navigate = useNavigate();
  const [edition, setEdition] = useState<Edition>('2014');
  const { entries, byId, loading } = useContentIndex(edition);
  const [creatingId, setCreatingId] = useState<string | null>(null);
  const templates = listTemplates(edition);

  function createFromTemplate(templateId: string) {
    const template = templates.find((t) => t.id === templateId);
    if (!template) return;
    setCreatingId(templateId);
    const state = templateToBuilderState(template);
    const items = entries.filter((e) => e.kind === 'item');
    const character = buildCharacter({ ...state, name: template.name }, items, byId);
    const finalSheet = computeSheet(character, byId);
    character.state.hp.current = finalSheet.hp.max;
    characterRepo.save(character).then(() => navigate(`/characters/${character.id}`));
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-xl text-ink-900 dark:text-kraft-100">Premade Characters</h1>
          <p className="mt-1 text-sm text-ink-700 dark:text-kraft-200">
            Pick a ready-to-play level-1 character and jump straight into the sheet — you can rename, re-equip, or rebuild
            anything afterward.
          </p>
        </div>
        <div className="flex gap-1 border-2 border-ink-900/20 p-1 dark:border-kraft-100/20">
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
      </div>

      <hr className="rule-sketch mb-5" />

      {loading ? (
        <p className="text-sm text-ink-700 dark:text-kraft-200">Loading…</p>
      ) : templates.length === 0 ? (
        <p className="text-sm text-ink-700 dark:text-kraft-200">No premade characters for this edition yet.</p>
      ) : (
        <ul className="divide-y-2 divide-dashed divide-ink-900/15 dark:divide-kraft-100/15">
          {templates.map((t) => (
            <li key={t.id} className="flex items-start justify-between gap-4 py-4">
              <div>
                <p className="font-display text-base text-ink-900 dark:text-kraft-100">{t.name}</p>
                <p className="mt-1 text-sm text-ink-700 dark:text-kraft-200">{t.blurb}</p>
              </div>
              <button
                type="button"
                disabled={creatingId != null}
                onClick={() => createFromTemplate(t.id)}
                className="shrink-0 border-2 border-ink-900 bg-ink-900 px-3 py-1.5 font-mono text-xs uppercase tracking-wide text-kraft-50 disabled:opacity-30 dark:border-kraft-100 dark:bg-kraft-100 dark:text-ink-900"
              >
                {creatingId === t.id ? 'Creating…' : 'Play this one'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
