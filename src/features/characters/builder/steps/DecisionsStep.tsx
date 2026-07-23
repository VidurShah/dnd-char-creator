import type { Decision } from '@/schema/common';
import type { ContentEntry } from '@/schema/content';
import type { UnresolvedDecision } from '@/engine/decisions';
import { humanizeCamel, humanizeSlug } from '@/lib/text';

interface DecisionsStepProps {
  decisions: UnresolvedDecision[];
  answers: Decision[];
  onChange: (answers: Decision[]) => void;
  /** Optional — lets option ids that are content refs (e.g. a spell pick) show their real name instead of the raw id. */
  byId?: Map<string, ContentEntry>;
}

export function DecisionsStep({ decisions, answers, onChange, byId }: DecisionsStepProps) {
  // Option ids come in three shapes: a content ref (resolve to its name), a kebab/
  // underscore slug (tool proficiencies), or a camelCase token (skills, abilities).
  const label = (option: string): string =>
    byId?.get(option)?.name ?? (/[-_]/.test(option) ? humanizeSlug(option) : humanizeCamel(option));
  if (decisions.length === 0) {
    return <p className="text-sm text-ink-700 dark:text-kraft-200">Nothing to choose here yet — carry on.</p>;
  }

  function toggleOption(decision: UnresolvedDecision, option: string) {
    const existing = answers.find((a) => a.decisionId === decision.decisionId);
    const current = Array.isArray(existing?.choice) ? existing.choice : [];
    const has = current.includes(option);
    let next: string[];
    if (has) {
      next = current.filter((o) => o !== option);
    } else if (current.length < decision.count) {
      next = [...current, option];
    } else {
      next = current; // already at the limit — ignore extra picks
    }
    const rest = answers.filter((a) => a.decisionId !== decision.decisionId);
    onChange([...rest, { decisionId: decision.decisionId, choice: next }]);
  }

  return (
    <div className="flex flex-col gap-6">
      {decisions.map((decision) => {
        const selected = (answers.find((a) => a.decisionId === decision.decisionId)?.choice as string[]) ?? [];
        return (
          <div key={decision.decisionId}>
            <p className="mb-2 font-mono text-xs uppercase tracking-wider text-ink-500 dark:text-kraft-300">
              {decision.prompt} ({selected.length}/{decision.count})
            </p>
            <div className="flex flex-wrap gap-1.5">
              {(decision.options ?? []).map((option) => {
                const active = selected.includes(option);
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => toggleOption(decision, option)}
                    className={`rounded-sm border px-2 py-1 font-mono text-[11px] uppercase tracking-wide transition-colors ${
                      active
                        ? 'border-ink-900 bg-ink-900 text-kraft-50 dark:border-kraft-100 dark:bg-kraft-100 dark:text-ink-900'
                        : 'border-ink-900/25 text-ink-700 hover:border-ink-900/50 dark:border-kraft-100/25 dark:text-kraft-200'
                    }`}
                  >
                    {label(option)}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
