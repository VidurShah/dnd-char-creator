#!/usr/bin/env python3
"""
One-time hand curation pass over the raw extracted pending entries.

The extraction pipeline correctly pulls rules text, but it can't reliably
figure out WHERE a piece of content belongs in the app's data model (is this
a new species option? A subclass, and which one, unlocked at what level? Or
truly a standalone feature?) — that requires domain knowledge the model
doesn't reliably have and the flat extraction schema doesn't capture.

This script re-homes the clear cases by hand:
  - Two species alternatives that were flattened into generic prose
    (Custom Lineage, Aasimar) become real 'species' entries.
  - A wholly new class (Artificer) that Tasha's introduces, with its four
    subclasses, gets built from its extracted base features.
  - ~15 more subclasses across existing classes get real subclass containers
    (parentClassRef + featuresByLevel) built from already-extracted feature
    entries, using known official level tables. Where a subclass's exact
    unlock levels aren't confidently known, they're a best-effort guess —
    flagged in the output for manual double-checking.

Everything else passes through unchanged as browsable 'feature'/'feat'/
'spell' entries.

Run with: python3 scripts/extract/curate.py
"""
import json
import os

ROOT = os.path.join(os.path.dirname(__file__), "..", "..")


def load_pending(book):
    with open(os.path.join(ROOT, "data", "packs", "_pending", f"{book}.json")) as f:
        return json.load(f)


def by_name(entries):
    return {e["entry"]["name"]: e["entry"] for e in entries}


def by_name_page(entries, name, page):
    """Disambiguates entries that share a name (Fighter's Psi Warrior and
    Rogue's Soulknife both have a feature named "Psionic Power" — the
    extractor even minted them the identical id, which by_name()'s
    name-keyed dict can't tell apart)."""
    for e in entries:
        ent = e["entry"]
        if ent["name"] == name and ent["source"].get("page") == page:
            return ent
    raise KeyError(f"{name} @ page {page} not found")


tashas = load_pending("tashas")
phb = load_pending("phb2024")

# Fix an id collision from extraction: Fighter's Psi Warrior and Rogue's
# Soulknife each have their own distinct "Psionic Power" feature (different
# text, different class), but the extractor minted both the same id. Give
# the Psi Warrior one (page 47; Soulknife's is page 64) a distinct id before
# anything reads t_by_name, otherwise one silently clobbers the other
# wherever entries get merged by id (loader, search index, engine index).
by_name_page(tashas, "Psionic Power", 47)["id"] = "2014/feature/extracted-psionic-power-psi-warrior"

t_by_name = by_name(tashas)
p_by_name = by_name(phb)

# Names that should NOT also appear as a bare passthrough 'feature' entry —
# only the species alternatives below, since those get replaced wholesale by
# a proper 'species' entry with a different id, and keeping the
# generic-feature version around too would just be a confusing duplicate in
# the Library. Every other feature referenced by a subclass/class below
# (via feature_ref) is still a legitimate standalone feature entry and must
# stay in the passthrough output, since subclasses point at its id.
HIDE_FROM_PASSTHROUGH_2014 = set()
HIDE_FROM_PASSTHROUGH_2024 = set()

species_2014 = []
species_2024 = []
classes_2014 = []
subclasses_2014 = []
subclasses_2024 = []
LEVEL_UNCERTAIN = []  # (subclass name, note) — surfaced in the summary at the end


def feature_ref(edition, name_map, name):
    return name_map[name]["id"]


def feature_ref_page(entries, name, page):
    return by_name_page(entries, name, page)["id"]


def make_subclass(edition, id_, name, parent_class_id, book, page, description, features_by_level, name_map, uncertain=False, granted_spells_by_level=None):
    if uncertain:
        LEVEL_UNCERTAIN.append(name)
    fbl = {}
    for level, names in features_by_level.items():
        fbl[str(level)] = [feature_ref(edition, name_map, n) for n in names]
    data = {"parentClassRef": parent_class_id, "description": description, "featuresByLevel": fbl}
    if granted_spells_by_level:
        data["grantedSpellsByLevel"] = {str(lvl): [f"{edition}/spell/{slug}" for slug in slugs] for lvl, slugs in granted_spells_by_level.items()}
    entry = {
        "id": id_,
        "edition": edition,
        "kind": "subclass",
        "name": name,
        "source": {"book": book, "page": page},
        "origin": "extracted",
        "schemaVersion": 1,
        "data": data,
    }
    (subclasses_2014 if edition == "2014" else subclasses_2024).append(entry)


# ---------------------------------------------------------------------------
# Species: Custom Lineage (Tasha's, 2014) and Aasimar (PHB2024, 2024)
# ---------------------------------------------------------------------------

HIDE_FROM_PASSTHROUGH_2014.add("Custom Lineage")
species_2014.append({
    "id": "2014/species/custom-lineage",
    "edition": "2014",
    "kind": "species",
    "name": "Custom Lineage",
    "source": {"book": "TCE", "page": 12},
    "origin": "extracted",
    "schemaVersion": 1,
    "data": {
        "size": "medium",  # player picks Small or Medium — schema only allows one; Medium chosen as the default, editable per-character if needed
        "speed": 30,
        "traits": [],
    },
    "effects": [],
})

HIDE_FROM_PASSTHROUGH_2024.add("Aasimar")
species_2024.append({
    "id": "2024/species/aasimar",
    "edition": "2024",
    "kind": "species",
    "name": "Aasimar",
    "source": {"book": "PHB2024", "page": 186},
    "origin": "extracted",
    "schemaVersion": 1,
    "data": {
        "size": "medium",
        "speed": 30,
        # A single reference feature, not five — see species_2024_traits_note below;
        # the model didn't break the Aasimar's traits out into separate entries.
        "traits": ["2024/feature/trait-aasimar-traits"],
    },
    "effects": [],
})
# The Aasimar's own trait descriptions live in its extracted 'feature' text as one blob
# (the model didn't break them out individually) — kept as a single reference feature
# rather than five, since splitting the prose accurately isn't safe to automate.
species_2024_traits_note = {
    "id": "2024/feature/trait-aasimar-traits",
    "edition": "2024",
    "kind": "feature",
    "name": "Aasimar Traits",
    "source": {"book": "PHB2024", "page": 186},
    "origin": "extracted",
    "schemaVersion": 1,
    "data": {"description": p_by_name["Aasimar"]["data"]["description"]},
}

# ---------------------------------------------------------------------------
# New class: Artificer (Tasha's, 2014) — not in any of our seeded 12 classes.
# Core stats are hand-authored from the official class (not extracted, since
# the extraction only captured individual features, not the class chassis
# itself); the spell-slot table reuses the standard half-caster progression
# as a reasonable approximation (Artificer's real table differs slightly at
# levels 1-2) — flagged here rather than silently treated as exact.
# ---------------------------------------------------------------------------
LEVEL_UNCERTAIN.append("Artificer (spell slot table approximated from the standard half-caster progression)")

HALF_CASTER_SLOTS = {
    1: {}, 2: {"spell_slots_level_1": 2}, 3: {"spell_slots_level_1": 3},
    4: {"spell_slots_level_1": 3}, 5: {"spell_slots_level_1": 4, "spell_slots_level_2": 2},
    6: {"spell_slots_level_1": 4, "spell_slots_level_2": 2}, 7: {"spell_slots_level_1": 4, "spell_slots_level_2": 3},
    8: {"spell_slots_level_1": 4, "spell_slots_level_2": 3}, 9: {"spell_slots_level_1": 4, "spell_slots_level_2": 3, "spell_slots_level_3": 2},
    10: {"spell_slots_level_1": 4, "spell_slots_level_2": 3, "spell_slots_level_3": 2},
    11: {"spell_slots_level_1": 4, "spell_slots_level_2": 3, "spell_slots_level_3": 3},
    12: {"spell_slots_level_1": 4, "spell_slots_level_2": 3, "spell_slots_level_3": 3},
    13: {"spell_slots_level_1": 4, "spell_slots_level_2": 3, "spell_slots_level_3": 3, "spell_slots_level_4": 1},
    14: {"spell_slots_level_1": 4, "spell_slots_level_2": 3, "spell_slots_level_3": 3, "spell_slots_level_4": 1},
    15: {"spell_slots_level_1": 4, "spell_slots_level_2": 3, "spell_slots_level_3": 3, "spell_slots_level_4": 2},
    16: {"spell_slots_level_1": 4, "spell_slots_level_2": 3, "spell_slots_level_3": 3, "spell_slots_level_4": 2},
    17: {"spell_slots_level_1": 4, "spell_slots_level_2": 3, "spell_slots_level_3": 3, "spell_slots_level_4": 3, "spell_slots_level_5": 1},
    18: {"spell_slots_level_1": 4, "spell_slots_level_2": 3, "spell_slots_level_3": 3, "spell_slots_level_4": 3, "spell_slots_level_5": 1},
    19: {"spell_slots_level_1": 4, "spell_slots_level_2": 3, "spell_slots_level_3": 3, "spell_slots_level_4": 3, "spell_slots_level_5": 2},
    20: {"spell_slots_level_1": 4, "spell_slots_level_2": 3, "spell_slots_level_3": 3, "spell_slots_level_4": 3, "spell_slots_level_5": 2},
}

ARTIFICER_BASE_FEATURES = {1: ["Magical Tinkering"], 2: ["Infuse Item"]}

artificer_levels = []
for lvl in range(1, 21):
    cols = dict(HALF_CASTER_SLOTS[lvl])
    refs = [feature_ref("2014", t_by_name, n) for n in ARTIFICER_BASE_FEATURES.get(lvl, [])]
    artificer_levels.append({"level": lvl, "proficiencyBonus": 2 + (lvl - 1) // 4, "featureRefs": refs, "columns": cols})

classes_2014.append({
    "id": "2014/class/artificer",
    "edition": "2014",
    "kind": "class",
    "name": "Artificer",
    "source": {"book": "TCE", "page": 10},
    "origin": "extracted",
    "schemaVersion": 1,
    "data": {
        "hitDie": "d8",
        "savingThrowProficiencies": ["con", "int"],
        "armorProficiencies": ["light-armor", "medium-armor", "shields"],
        "weaponProficiencies": ["simple-weapons"],
        "toolProficiencies": ["thieves-tools", "tinkers-tools", "one-type-of-artisans-tools"],
        "skillChoice": {"count": 2, "options": ["arcana", "history", "investigation", "medicine", "nature", "perception", "sleightOfHand"]},
        "spellcasting": {"progression": "half", "ability": "int", "knownOrPrepared": "prepared"},
        "levels": artificer_levels,
        "startingEquipment": {
            "fixed": ["studded-leather-armor", "thieves-tools", "dungeoneers-pack", "tinkers-tools"],
            "choices": [
                {"prompt": "(a) a light crossbow and 20 bolts or (b) any simple weapon", "options": [["crossbow-light", "crossbow-bolt"], ["dagger"]]},
            ],
            "goldAlternative": 125,
        },
    },
})

make_subclass("2014", "2014/subclass/alchemist", "Alchemist", "2014/class/artificer", "TCE", 15,
               "Alchemists are Masters of Chemical Combinations, using their creations to give life and to leach it away.",
               {3: ["Experimental Elixir"]}, t_by_name, uncertain=True)
make_subclass("2014", "2014/subclass/armorer", "Armorer", "2014/class/artificer", "TCE", 19,
               "Artificers of the Armorer specialization use their magic armor as a focus for their expertise, turning it into a weapon.",
               {3: ["Arcane Armor"]}, t_by_name, uncertain=True)
make_subclass("2014", "2014/subclass/artillerist", "Artillerist", "2014/class/artificer", "TCE", 21,
               "Artificers who specialize as Artillerists learn how to invoke magical forces to create powerful magical cannons.",
               {3: ["Eldritch Cannon"]}, t_by_name, uncertain=True)
make_subclass("2014", "2014/subclass/battle-smith", "Battle Smith", "2014/class/artificer", "TCE", 23,
               "Battle Smiths use magic to aid them in combat, supported by a steel defender.",
               {3: ["Steel Defender (Feature)"]}, t_by_name, uncertain=True)

# ---------------------------------------------------------------------------
# Existing-class subclasses (Tasha's, 2014)
# ---------------------------------------------------------------------------

make_subclass("2014", "2014/subclass/oath-of-glory", "Oath of Glory", "2014/class/paladin", "TCE", 53,
              "Paladins who swear the Oath of Glory believe that they are meant for legendary deeds.",
              {3: ["Oath of Glory Spells", "Channel Divinity (Oath of Glory)"], 7: ["Aura of Alacrity"], 15: ["Glorious Defense"], 20: ["Living Legend"]},
              t_by_name,
              granted_spells_by_level={3: ["guiding-bolt", "heroism"], 5: ["enhance-ability", "magic-weapon"], 9: ["haste", "protection-from-energy"], 13: ["freedom-of-movement"], 17: ["legend-lore", "teleport"]})

make_subclass("2014", "2014/subclass/oath-of-the-watchers", "Oath of the Watchers", "2014/class/paladin", "TCE", 55,
              "Paladins who have sworn the Oath of the Watchers have dedicated themselves to guarding the world against extraplanar threats.",
              {3: ["Oath of the Watchers Spells", "Channel Divinity (Oath of the Watchers)"], 7: ["Aura of the Sentinel"], 15: ["Vigilant Rebuke"], 20: ["Mortal Bulwark"]},
              t_by_name,
              granted_spells_by_level={3: ["alarm", "detect-magic"], 5: ["moonbeam", "see-invisibility"], 9: ["counterspell", "nondetection"], 13: ["banishment"], 17: ["hold-monster", "scrying"]})

make_subclass("2014", "2014/subclass/fey-wanderer", "Fey Wanderer", "2014/class/ranger", "TCE", 58,
              "Fey Wanderers serve fey lords and ladies, or the mysterious powers of the Feywild itself.",
              {3: ["Dreadful Strikes", "Fey Wanderer Magic"], 7: ["Otherworldly Glamour"], 11: ["Beguiling Twist"], 15: ["Fey Reinforcements", "Misty Wanderer"]},
              t_by_name, uncertain=True)

make_subclass("2014", "2014/subclass/swarmkeeper", "Swarmkeeper", "2014/class/ranger", "TCE", 60,
              "Swarmkeepers are bonded to a swarm of tiny, magical creatures.",
              {3: ["Gathered Swarm", "Swarmkeeper Magic"], 7: ["Writhing Tide"], 11: ["Mighty Swarm"], 15: ["Swarming Dispersal"]},
              t_by_name, uncertain=True)

make_subclass("2014", "2014/subclass/way-of-mercy", "Way of Mercy", "2014/class/monk", "TCE", 49,
              "Monks of the Way of Mercy learn techniques to manipulate life force, using it to heal or harm.",
              {3: ["Implements of Mercy", "Hand of Healing", "Hand of Harm"], 6: ["Physician's Touch"], 11: ["Flurry of Healing and Harm"], 17: ["Hand of Ultimate Mercy"]},
              t_by_name)

make_subclass("2014", "2014/subclass/way-of-the-astral-self", "Way of the Astral Self", "2014/class/monk", "TCE", 50,
              "Monks of the Way of the Astral Self reach deep within themselves to project the visage of their spirit's astral form.",
              {3: ["Arms of the Astral Self", "Visage of the Astral Self"], 6: ["Body of the Astral Self"], 17: ["Awakened Astral Self"]},
              t_by_name, uncertain=True)

make_subclass("2014", "2014/subclass/soulknife", "Soulknife", "2014/class/rogue", "TCE", 64,
              "Soulknives learn to manifest a blade of psychic energy.",
              {3: ["Psionic Power", "Psychic Blades"], 9: ["Soul Blades"], 13: ["Psychic Veil"], 17: ["Rend Mind"]},
              t_by_name)

make_subclass("2014", "2014/subclass/aberrant-mind", "Aberrant Mind", "2014/class/sorcerer", "TCE", 67,
              "Your innate magic comes from an alien influence that touched your being, or the being of an ancestor.",
              {1: ["Psionic Spells", "Telepathic Speech"], 6: ["Psionic Sorcery", "Psychic Defenses"], 14: ["Revelation in Flesh"], 18: ["Warping Implosion"]},
              t_by_name)

make_subclass("2014", "2014/subclass/clockwork-soul", "Clockwork Soul", "2014/class/sorcerer", "TCE", 69,
              "You draw on the pure, ordered magic of the plane of Mechanus.",
              {1: ["Clockwork Magic", "Restore Balance"], 6: ["Bastion of Law"], 14: ["Trance of Order"], 18: ["Clockwork Cavalcade"]},
              t_by_name)

make_subclass("2014", "2014/subclass/the-fathomless", "The Fathomless", "2014/class/warlock", "TCE", 72,
              "You have made a pact with an entity from the darkest depths of the ocean.",
              {1: ["Expanded Spell List (The Fathomless)", "Tentacle of the Deeps"], 6: ["Gift of the Sea", "Oceanic Soul"], 10: ["Guardian Coil", "Grasping Tentacles"], 14: ["Fathomless Plunge"]},
              t_by_name, uncertain=True,
              # Keyed by warlock level (1/3/5/7/9), not spell level — that's when Pact Magic actually grants slots of the matching spell level.
              granted_spells_by_level={1: ["create-or-destroy-water"], 3: ["augury"], 5: ["sleet-storm", "water-breathing"], 7: ["control-water"], 9: ["legend-lore", "scrying"]})

make_subclass("2014", "2014/subclass/the-genie", "The Genie", "2014/class/warlock", "TCE", 73,
              "Your patron is a genie of noble birth with the ability to grant wishes.",
              {1: ["Expanded Spell List (The Genie)", "Genie's Vessel"], 6: ["Elemental Gift"], 10: ["Sanctuary Vessel"], 14: ["Limited Wish"]},
              t_by_name, uncertain=True,
              # Keyed by warlock level (1/3/5/7/9), not spell level.
              granted_spells_by_level={1: ["detect-magic", "identify"], 3: ["detect-thoughts", "invisibility"], 5: ["tongues", "gaseous-form"], 7: ["wall-of-force"], 9: ["chain-lightning"]})

make_subclass("2014", "2014/subclass/bladesinging", "Bladesinging", "2014/class/wizard", "TCE", 76,
              "Bladesingers use a graceful combination of weapon skill and magic.",
              {2: ["Training in War and Song", "Bladesong"], 6: ["Extra Attack (Bladesinging)"], 10: ["Song of Defense"], 14: ["Song of Victory"]},
              t_by_name)

make_subclass("2014", "2014/subclass/order-of-scribes", "Order of Scribes", "2014/class/wizard", "TCE", 77,
              "Wizards of the Order of Scribes maintain a special relationship with the magic of the written word.",
              {2: ["Wizardly Quill", "Awakened Spellbook"], 6: ["Manifest Mind"], 10: ["Master Scrivener"], 14: ["One with the Word"]},
              t_by_name)

# The following 9 subclasses were only identified after a second pass over
# the raw extraction (checking page numbers against the known official
# Tasha's table of contents) — each has only one or two of its real features
# actually extracted (the rest weren't captured by the model as separate
# entries), so like the Artificer subclasses above these are necessarily
# incomplete: flagged uncertain, safe to extend later if more of their
# levels get extracted.

make_subclass("2014", "2014/subclass/path-of-the-beast", "Path of the Beast", "2014/class/barbarian", "TCE", 28,
              "Deep in your soul, there is a beast that gives you strength, endurance, and ferocity in combat.",
              {3: ["Form of the Beast"]}, t_by_name, uncertain=True)

make_subclass("2014", "2014/subclass/path-of-wild-magic", "Path of Wild Magic", "2014/class/barbarian", "TCE", 29,
              "You have a connection to the wild magic that suffuses the multiverse, and you become a conduit of that power when you rage.",
              {3: ["Wild Surge"]}, t_by_name, uncertain=True)

make_subclass("2014", "2014/subclass/college-of-creation", "College of Creation", "2014/class/bard", "TCE", 32,
              "You have unlocked a font of creation energy within yourself, granting you a connection to the Song of Creation.",
              {3: ["Performance of Creation"]}, t_by_name, uncertain=True)

make_subclass("2014", "2014/subclass/peace-domain", "Peace Domain", "2014/class/cleric", "TCE", 37,
              "Gods of peace value the health and well-being of every soul, and they work to end conflicts that bring suffering, misery, or death.",
              {1: ["Emboldening Bond"]}, t_by_name, uncertain=True,
              granted_spells_by_level={1: ["sanctuary", "heroism"], 3: ["aid", "warding-bond"], 5: ["beacon-of-hope", "sending"]})

make_subclass("2014", "2014/subclass/twilight-domain", "Twilight Domain", "2014/class/cleric", "TCE", 38,
              "Gods of twilight watch over the transition from light to darkness, and embody both the promise of rest and the protection it requires.",
              {1: ["Eyes of Night"]}, t_by_name, uncertain=True,
              granted_spells_by_level={1: ["faerie-fire", "sleep"], 3: ["moonbeam", "see-invisibility"], 5: ["tiny-hut"], 7: ["greater-invisibility"]})

make_subclass("2014", "2014/subclass/circle-of-spores", "Circle of Spores", "2014/class/druid", "TCE", 40,
              "You have dedicated yourself to a mastery of the cycle of life and death, having learned that rot and decay fuel new beginnings.",
              {2: ["Halo of Spores"]}, t_by_name, uncertain=True)

make_subclass("2014", "2014/subclass/circle-of-wildfire", "Circle of Wildfire", "2014/class/druid", "TCE", 44,
              "You have unlocked the secrets of wildfire, a phenomenon that brings devastation and rebirth in equal measure.",
              {2: ["Summon Wildfire Spirit"]}, t_by_name, uncertain=True)

make_subclass("2014", "2014/subclass/rune-knight", "Rune Knight", "2014/class/fighter", "TCE", 49,
              "You are a fighter who augments your martial prowess with the might of runes carved into stone and steel.",
              {3: ["Giant's Might"]}, t_by_name, uncertain=True)

_psi_warrior_entry = {
    "id": "2014/subclass/psi-warrior",
    "edition": "2014",
    "kind": "subclass",
    "name": "Psi Warrior",
    "source": {"book": "TCE", "page": 47},
    "origin": "extracted",
    "schemaVersion": 1,
    "data": {
        "parentClassRef": "2014/class/fighter",
        "description": "You are a fighter who has augmented your physical might with psionic power.",
        "featuresByLevel": {"3": [feature_ref_page(tashas, "Psionic Power", 47)]},
    },
}
LEVEL_UNCERTAIN.append("Psi Warrior")
subclasses_2014.append(_psi_warrior_entry)

# ---------------------------------------------------------------------------
# PHB2024 subclasses
# ---------------------------------------------------------------------------

make_subclass("2024", "2024/subclass/path-of-the-wildheart", "Path of the Wildheart", "2024/class/barbarian", "PHB2024", 54,
              "You draw on the fury and cunning of animal spirits when you rage.",
              {3: ["Animal Speaker", "Rage of the Wilds"], 6: ["Aspect of the Wilds"], 10: ["Nature Speaker"], 14: ["Power of the Wilds"]},
              p_by_name, uncertain=True)

make_subclass("2024", "2024/subclass/path-of-the-world-tree", "Path of the World Tree", "2024/class/barbarian", "PHB2024", 55,
              "Your rage connects you to Yggdrasil, the World Tree that supports the cosmos.",
              {3: ["Vitality of the Tree"], 6: ["Branches of the Tree"], 10: ["Battering Roots"], 14: ["Travel Along the Tree"]},
              p_by_name, uncertain=True)

make_subclass("2024", "2024/subclass/path-of-the-zealot", "Path of the Zealot", "2024/class/barbarian", "PHB2024", 56,
              "You are a fanatical warrior imbued with supernatural might by the deity you serve.",
              {3: ["Divine Fury", "Warrior of the Gods"], 6: ["Fanatical Focus"], 10: ["Zealous Presence"], 14: ["Rage of the Gods"]},
              p_by_name, uncertain=True)

make_subclass("2024", "2024/subclass/college-of-dance", "College of Dance", "2024/class/bard", "PHB2024", 63,
              "You are a master of a dance-based art form practiced by traveling performers.",
              {3: ["Dazzling Footwork", "Inspiring Movement"], 6: ["Tandem Footwork"], 14: ["Leading Evasion"]},
              p_by_name, uncertain=True)

make_subclass("2024", "2024/subclass/college-of-glamour", "College of Glamour", "2024/class/bard", "PHB2024", 64,
              "You learned your bardic arts in the Court of the Feywild.",
              {3: ["Beguiling Magic", "Mantle of Inspiration"], 6: ["Mantle of Majesty"], 14: ["Unbreakable Majesty"]},
              p_by_name, uncertain=True)

make_subclass("2024", "2024/subclass/college-of-valor", "College of Valor", "2024/class/bard", "PHB2024", 66,
              "You learned your craft in front of battle-hardened veterans, telling tales of heroism.",
              {3: ["Combat Inspiration", "Martial Training"], 6: ["Extra Attack (College of Valor)"], 14: ["Battle Magic"]},
              p_by_name, uncertain=True)

make_subclass("2024", "2024/subclass/light-domain", "Light Domain", "2024/class/cleric", "PHB2024", 73,
              "Gods of light promote the ideals of rebirth and renewal, truth, vigilance, and beauty.",
              {3: ["Light Domain Spells", "Radiance of the Dawn", "Warding Flare"], 6: ["Improved Warding Flare"], 17: ["Corona of Light"]},
              p_by_name, uncertain=True,
              granted_spells_by_level={3: ["burning-hands", "faerie-fire"], 5: ["scorching-ray", "see-invisibility"], 7: ["daylight", "fireball"], 9: ["arcane-eye", "wall-of-fire"], 11: ["flame-strike", "scrying"]})

make_subclass("2024", "2024/subclass/trickery-domain", "Trickery Domain", "2024/class/cleric", "PHB2024", 74,
              "Gods of trickery are mischief-makers and instigators who stand as a reminder that trickery is not necessarily evil.",
              {3: ["Trickery Domain Spells", "Blessing of the Trickster", "Invoke Duplicity"], 6: ["Trickster's Transposition"], 17: ["Improved Duplicity"]},
              p_by_name, uncertain=True,
              granted_spells_by_level={3: ["charm-person", "disguise-self"], 5: ["mirror-image", "pass-without-trace"], 7: ["blink", "dispel-magic"], 9: ["dimension-door", "polymorph"], 11: ["seeming"]})

make_subclass("2024", "2024/subclass/war-domain", "War Domain", "2024/class/cleric", "PHB2024", 76,
              "War can take many forms; all gods of war, from the most base to the most righteous, embody this multifaceted nature of armed conflict.",
              {3: ["War Domain Spells", "War Priest", "Guided Strike"], 6: ["War God's Blessing"], 17: ["Avatar of Battle"]},
              p_by_name, uncertain=True,
              granted_spells_by_level={3: ["divine-favor", "shield-of-faith"], 5: ["magic-weapon", "spiritual-weapon"], 7: ["spirit-guardians"], 9: ["freedom-of-movement", "stoneskin"], 11: ["flame-strike", "hold-monster"]})

# ---------------------------------------------------------------------------
# Everything else passes through unchanged
# ---------------------------------------------------------------------------

passthrough_2014 = [e["entry"] for e in tashas if e["entry"]["name"] not in HIDE_FROM_PASSTHROUGH_2014]
passthrough_2024 = [e["entry"] for e in phb if e["entry"]["name"] not in HIDE_FROM_PASSTHROUGH_2024]

extracted_2014 = species_2014 + classes_2014 + subclasses_2014 + passthrough_2014
extracted_2024 = species_2024 + [species_2024_traits_note] + subclasses_2024 + passthrough_2024

# This script writes to a gitignored STAGING path, not directly into the
# committed data files. It rewrites its whole output every run, so pointing it
# at data/<edition>/*.json would silently delete any hand-authored content
# there. Merging staging into the committed files is a deliberate human step.
STAGING = os.path.join(ROOT, "data", "packs", "_curated")
os.makedirs(STAGING, exist_ok=True)

with open(os.path.join(STAGING, "2014.json"), "w") as f:
    json.dump(extracted_2014, f, indent=2)
with open(os.path.join(STAGING, "2024.json"), "w") as f:
    json.dump(extracted_2024, f, indent=2)

print(f"Wrote {len(extracted_2014)} entries to data/packs/_curated/2014.json")
print(f"  species: {len(species_2014)}, classes: {len(classes_2014)}, subclasses: {len(subclasses_2014)}, passthrough: {len(passthrough_2014)}")
print(f"Wrote {len(extracted_2024)} entries to data/packs/_curated/2024.json")
print(f"  species: {len(species_2024) + 1}, subclasses: {len(subclasses_2024)}, passthrough: {len(passthrough_2024)}")
print()
print("NOTE: this is STAGING output. Content already merged into data/<edition>/*.json")
print("      will re-appear here on every run — merge deliberately, don't copy wholesale.")
print()
print("Subclasses/entries with best-effort (not confidently verified) unlock levels:")
for n in LEVEL_UNCERTAIN:
    print(f"  - {n}")
