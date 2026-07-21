/** "adventuringGear" -> "Adventuring Gear" */
export function humanizeCamel(value: string): string {
  const spaced = value.replace(/([a-z])([A-Z])/g, '$1 $2');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** Words that stay lowercase inside a skill name ("Sleight of Hand"). */
const SKILL_MINOR_WORDS = new Set(['of', 'and', 'the']);

/** Skill id -> display label: "sleightOfHand" -> "Sleight of Hand", "animalHandling" -> "Animal Handling" */
export function humanizeSkill(skill: string): string {
  return skill
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .split(' ')
    .map((word, i) => {
      const lower = word.toLowerCase();
      if (i > 0 && SKILL_MINOR_WORDS.has(lower)) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(' ');
}

/** "simple-weapons" / "thieves_tools" -> "Simple Weapons" / "Thieves Tools" */
export function humanizeSlug(value: string): string {
  return value
    .split(/[-_]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}
