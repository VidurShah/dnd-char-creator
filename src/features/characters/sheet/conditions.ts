/**
 * Standard 5e conditions, as the ids the sheet stores. The rules text lives in
 * the seeded `condition` content entries (data/<edition>/conditions.json,
 * e.g. "2014/condition/grappled"); this list stays as the fixed set of
 * toggles the sheet offers.
 */
export const CONDITIONS = [
  'blinded',
  'charmed',
  'deafened',
  'frightened',
  'grappled',
  'incapacitated',
  'invisible',
  'paralyzed',
  'petrified',
  'poisoned',
  'prone',
  'restrained',
  'stunned',
  'unconscious',
] as const;
