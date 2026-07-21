import { characterRepo } from '@/db/repos';
import type { Character } from '@/schema/character';
import type { ContentEntry } from '@/schema/content';
import { computeSheet, type DerivedFeature } from '@/engine/compute';
import { rollDie } from '@/engine/dice';
import { asiLevelsFor, subclassLevelFor } from '@/engine/levelRules';
import { unresolvedDecisions, type UnresolvedDecision } from '@/engine/decisions';

function classShortId(ref: string): string {
  return ref.split('/').pop() ?? ref;
}

export interface LevelUpResult {
  classRef: string;
  newLevel: number;
  newFeatures: DerivedFeature[];
  /** True if this class doesn't have a subclass yet and just reached (or passed) its unlock level. */
  subclassNowAvailable: boolean;
  /** True if this exact class level is one of the class's Ability Score Improvement levels. */
  asiAvailable: boolean;
  /** Unresolved decisions scoped to this specific class (e.g. Rogue/Bard Expertise unlocking at this level) — species/background/feat decisions aren't level-up concerns, so those are left to the builder. */
  pendingClassDecisions: UnresolvedDecision[];
}

/**
 * Levels up one of the character's classes by one — either an existing class
 * (classRef already in build.classes) or a brand-new one to multiclass into
 * (pass subclassRef if it grants one at level 1). Rolls or averages the new
 * hit die and carries the HP gain into current HP as well as max. Returns a
 * summary of what's newly available so the UI can prompt for it instead of
 * silently applying the level.
 */
export async function levelUpClass(
  character: Character,
  index: Map<string, ContentEntry>,
  classRef: string,
  useAverage: boolean,
  newSubclassRef?: string,
): Promise<LevelUpResult> {
  const classEntry = index.get(classRef);
  const hitDieSize = classEntry?.kind === 'class' ? Number(classEntry.data.hitDie.slice(1)) : 8;
  const hpRoll = useAverage ? undefined : rollDie(hitDieSize);

  const before = computeSheet(character, index);
  const beforeRefs = new Set(before.features.map((f) => f.ref));

  const existing = character.build.classes.find((c) => c.classRef === classRef);
  const classes = existing
    ? character.build.classes.map((c) => (c.classRef === classRef ? { ...c, levels: c.levels + 1 } : c))
    : [...character.build.classes, { classRef, subclassRef: newSubclassRef, levels: 1, decisionsByLevel: {} }];

  const leveled: Character = {
    ...character,
    build: {
      ...character.build,
      classes,
      levelOrder: [...character.build.levelOrder, { classRef, hpRoll }],
    },
  };

  const after = computeSheet(leveled, index);
  const gained = after.hp.max - before.hp.max;

  const updated: Character = {
    ...leveled,
    updatedAt: Date.now(),
    state: { ...leveled.state, hp: { ...leveled.state.hp, current: leveled.state.hp.current + gained } },
  };

  await characterRepo.save(updated);

  const newLevel = classes.find((c) => c.classRef === classRef)!.levels;
  const shortId = classShortId(classRef);
  const hasSubclass = (existing?.subclassRef ?? newSubclassRef) != null;
  const subclassOptions = [...index.values()].filter(
    (e): e is Extract<ContentEntry, { kind: 'subclass' }> => e.kind === 'subclass' && e.data.parentClassRef === classRef,
  );

  const pendingClassDecisions = unresolvedDecisions(updated, index).filter(
    (d) => d.scope === 'class' && d.decisionId.startsWith(`${shortId}/`) && d.decisionId !== `${shortId}/skills`,
  );

  return {
    classRef,
    newLevel,
    newFeatures: after.features.filter((f) => !beforeRefs.has(f.ref)),
    subclassNowAvailable: !hasSubclass && newLevel >= subclassLevelFor(subclassOptions),
    asiAvailable: asiLevelsFor(shortId).includes(newLevel),
    pendingClassDecisions,
  };
}
