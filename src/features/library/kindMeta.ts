import type { ContentKind } from '@/schema/content';

export const KIND_LABEL: Record<ContentKind, string> = {
  spell: 'Spells',
  item: 'Items',
  feat: 'Feats',
  class: 'Classes',
  subclass: 'Subclasses',
  species: 'Species',
  background: 'Backgrounds',
  condition: 'Conditions',
  feature: 'Features',
};

/** Stamp color per kind, used for the tab stamps and entry markers. */
export const KIND_COLOR: Record<ContentKind, string> = {
  spell: 'bg-rust-500',
  item: 'bg-olive-500',
  feat: 'bg-ink-700',
  class: 'bg-rust-600',
  subclass: 'bg-rust-600',
  species: 'bg-olive-600',
  background: 'bg-olive-600',
  condition: 'bg-ink-500',
  feature: 'bg-ink-500',
};
