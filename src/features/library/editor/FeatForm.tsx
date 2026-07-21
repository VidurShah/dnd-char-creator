import type { FeatPayload } from '@/schema/content';

interface FeatFormProps {
  value: FeatPayload;
  onChange: (value: FeatPayload) => void;
}

export function FeatForm({ value, onChange }: FeatFormProps) {
  return (
    <div className="flex flex-col gap-4">
      <label className="flex flex-col gap-1">
        <span className="font-mono text-xs uppercase tracking-wider text-ink-500 dark:text-kraft-300">Prerequisite (optional)</span>
        <input
          type="text"
          value={value.prerequisite ?? ''}
          onChange={(e) => onChange({ ...value, prerequisite: e.target.value || undefined })}
          placeholder="Str 13+"
          className="border-b-2 border-dashed border-ink-900/30 bg-transparent px-1 py-1 outline-none focus:border-rust-500 dark:border-kraft-100/30"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="font-mono text-xs uppercase tracking-wider text-ink-500 dark:text-kraft-300">Description</span>
        <textarea
          value={value.description}
          onChange={(e) => onChange({ ...value, description: e.target.value })}
          rows={5}
          className="border-2 border-ink-900/20 bg-transparent p-2 text-sm outline-none focus:border-rust-500 dark:border-kraft-100/20"
        />
      </label>
    </div>
  );
}
