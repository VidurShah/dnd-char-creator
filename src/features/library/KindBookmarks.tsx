import type { ContentKind } from '@/schema/content';
import { KIND_COLOR, KIND_LABEL } from './kindMeta';

interface KindBookmarksProps {
  kinds: { kind: ContentKind; count: number }[];
  active: ContentKind | 'all';
  onSelect: (kind: ContentKind | 'all') => void;
}

/** A row of ink-stamped tabs, each slightly askew like it was pressed on by hand. */
export function KindBookmarks({ kinds, active, onSelect }: KindBookmarksProps) {
  return (
    <div className="flex flex-wrap gap-3">
      <StampTab label="All" isActive={active === 'all'} color="bg-ink-700" rotate="-rotate-1" onClick={() => onSelect('all')} />
      {kinds.map(({ kind, count }, i) => (
        <StampTab
          key={kind}
          label={`${KIND_LABEL[kind]} · ${count}`}
          isActive={active === kind}
          color={KIND_COLOR[kind]}
          rotate={i % 2 === 0 ? 'rotate-1' : '-rotate-1'}
          onClick={() => onSelect(kind)}
        />
      ))}
    </div>
  );
}

function StampTab({
  label,
  isActive,
  color,
  rotate,
  onClick,
}: {
  label: string;
  isActive: boolean;
  color: string;
  rotate: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${rotate} rounded-sm border-2 px-3 py-1.5 font-mono text-xs font-semibold uppercase tracking-wider transition-transform hover:rotate-0 ${
        isActive
          ? `${color} border-ink-900 text-kraft-50 dark:border-kraft-100`
          : 'border-ink-900/30 bg-transparent text-ink-700 hover:border-ink-900/60 dark:border-kraft-100/30 dark:text-kraft-200'
      }`}
    >
      {label}
    </button>
  );
}
