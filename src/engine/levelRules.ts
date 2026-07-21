/**
 * Small hardcoded rules tables for level-up gating that the content data
 * doesn't (and doesn't need to) encode: which levels grant an Ability Score
 * Improvement, and which level a class's subclass choice unlocks at. These
 * are fixed, well-known 5e rules — same in the 2014 and 2024 rulesets —
 * rather than per-entry data, per the project convention of hardcoding
 * genuinely-fixed mechanics instead of over-modeling them.
 */

const DEFAULT_ASI_LEVELS = [4, 8, 12, 16, 19];

const ASI_LEVELS_BY_CLASS: Record<string, number[]> = {
  fighter: [4, 6, 8, 12, 14, 16, 19],
  rogue: [4, 8, 10, 12, 16, 19],
};

export function asiLevelsFor(classShortId: string): number[] {
  return ASI_LEVELS_BY_CLASS[classShortId] ?? DEFAULT_ASI_LEVELS;
}

export function isAsiLevel(classShortId: string, level: number): boolean {
  return asiLevelsFor(classShortId).includes(level);
}

/**
 * The level a class's subclass pick unlocks — derived from the actual seeded
 * subclass data (the lowest level any of its subclasses grants a feature at)
 * rather than a hardcoded table, since this genuinely differs by edition —
 * e.g. Cleric unlocks its Divine Domain at level 1 in 2014 but level 3 in
 * the 2024 PHB. Falls back to 3 (the most common unlock level) if no
 * subclasses are seeded for this class yet.
 */
export function subclassLevelFor(subclassOptions: { data: { featuresByLevel: Record<string, string[]> } }[]): number {
  const levels = subclassOptions.flatMap((s) => Object.keys(s.data.featuresByLevel).map(Number));
  return levels.length > 0 ? Math.min(...levels) : 3;
}
