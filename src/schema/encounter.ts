import { z } from 'zod';

/**
 * A combat encounter: turn order over the party's characters and ad-hoc
 * monsters.
 *
 * Characters are referenced, not copied. Their HP, conditions and
 * concentration stay on the character record and change through the same
 * sheetActions the sheet uses, so the tracker and the sheet can never
 * disagree. Monsters are deliberately ad hoc (name, AC, HP, initiative bonus
 * typed in by hand) rather than a statblock schema — a bestiary is a separate
 * project, and prose-only is a fine end state for a monster too.
 *
 * Device-local play state: stored in the settings table and never synced.
 */

export const MonsterCombatantSchema = z.object({
  kind: z.literal('monster'),
  id: z.string().min(1),
  name: z.string().min(1),
  ac: z.number().int().nonnegative(),
  hp: z.object({
    current: z.number().int().nonnegative(),
    max: z.number().int().positive(),
    temp: z.number().int().nonnegative().default(0),
  }),
  initiativeBonus: z.number().int().default(0),
  initiative: z.number().int().nullable().default(null),
  /** Condition ids, matching CONDITIONS in sheet/conditions.ts. */
  conditions: z.array(z.string()).default([]),
  concentrating: z.boolean().default(false),
});
export type MonsterCombatant = z.infer<typeof MonsterCombatantSchema>;

export const CharacterCombatantSchema = z.object({
  kind: z.literal('character'),
  id: z.string().min(1),
  characterId: z.string().min(1),
  initiative: z.number().int().nullable().default(null),
});
export type CharacterCombatant = z.infer<typeof CharacterCombatantSchema>;

export const CombatantSchema = z.discriminatedUnion('kind', [MonsterCombatantSchema, CharacterCombatantSchema]);
export type Combatant = z.infer<typeof CombatantSchema>;

export const EncounterLogEntrySchema = z.object({
  id: z.string(),
  round: z.number().int(),
  text: z.string(),
});
export type EncounterLogEntry = z.infer<typeof EncounterLogEntrySchema>;

export const EncounterSchema = z.object({
  /** 0 while setting up; 1+ once combat has started. */
  round: z.number().int().nonnegative().default(0),
  /** Whose turn it is. Tracked by id, not index, so adding or removing combatants mid-fight can't shift the turn onto someone else. */
  activeId: z.string().nullable().default(null),
  combatants: z.array(CombatantSchema).default([]),
  /** Newest first, capped. */
  log: z.array(EncounterLogEntrySchema).default([]),
});
export type Encounter = z.infer<typeof EncounterSchema>;
