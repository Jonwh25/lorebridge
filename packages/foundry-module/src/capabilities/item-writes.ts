import type { ItemCreateApprovalPayload, ItemUpdateApprovalPayload } from "@lorebridge/shared/capabilities";

// ---------------------------------------------------------------------------
// Item stat result type (mirrors ItemStatResult from packages/backend)
// ---------------------------------------------------------------------------

type RulesEdition = "modern" | "legacy";

type ItemStatResult = {
  name: string;
  itemType: string;
  description: string;
  weaponType?: string;
  damage?: string;
  damageType?: string;
  versatileDamage?: string;
  properties?: string[];
  range?: string;
  attackBonus?: number;
  spellLevel?: number;
  spellSchool?: string;
  castingTime?: string;
  spellRange?: string;
  rangeUnits?: string;
  components?: string[];
  materialComponent?: string;
  concentration?: boolean;
  ritual?: boolean;
  duration?: string;
  durationValue?: string;
  spellDamage?: string;
  spellDamageType?: string;
  saveAbility?: string;
  healAmount?: string;
  areaShape?: string;
  areaSize?: string;
  attackType?: string;
  featureSubtype?: string;
  activationType?: string;
  uses?: number;
  recharge?: string;
  consumableType?: string;
  charges?: number;
  consumableEffect?: string;
  armorType?: string;
  acValue?: number;
  stealthDisadvantage?: boolean;
  strengthRequirement?: number;
  toolType?: string;
  toolAbility?: string;
  // Container fields
  capacityType?: string;
  capacityValue?: number;
  weightlessContents?: boolean;
  // Background fields
  skillProficiencies?: string[];
  toolProficiencies?: string[];
  backgroundLanguages?: string[];
  backgroundFeatureName?: string;
  backgroundFeatureDescription?: string;
  // Race fields
  walkSpeed?: number;
  flySpeed?: number;
  swimSpeed?: number;
  burrowSpeed?: number;
  climbSpeed?: number;
  raceSize?: string;
  darkvisionRange?: number;
  damageResistances?: string[];
  abilityScoreImprovements?: Record<string, number>;
  raceTraits?: Array<{ name: string; description: string }>;
  // Class fields
  classIdentifier?: string;
  hitDie?: number;
  savingThrows?: string[];
  numSkillChoices?: number;
  skillChoices?: string[];
  armorProficiencies?: string[];
  weaponProficiencies?: string[];
  classToolProficiencies?: string[];
  spellcastingProgression?: string;
  spellcastingAbility?: string;
  classFeatures?: Array<{ level: number; name: string; description: string }>;
  // Subclass fields
  subclassIdentifier?: string;
  subclassParent?: string;
  subclassFeatures?: Array<{ level: number; name: string; description: string }>;
  weight?: number;
  price?: number;
  denomination?: string;
  rarity?: string;
  attunement?: boolean;
};

// ---------------------------------------------------------------------------
// Shared helpers (mirrors npc-statblock.ts helpers)
// ---------------------------------------------------------------------------

function makeSource(edition: RulesEdition, identifier?: string): Record<string, unknown> {
  return {
    book: "",
    page: "",
    custom: "LoreBridge AI",
    license: "",
    rules: edition === "modern" ? "2024" : "2014",
    identifier: identifier ?? "",
    revision: 1,
  };
}

function parseDiceFormula(formula: string | undefined): { number: number; denomination: number; bonus: string } {
  if (!formula) return { number: 1, denomination: 6, bonus: "" };
  const m = /^(\d+)d(\d+)([+-]\d+)?/.exec(formula.trim());
  return m
    ? { number: parseInt(m[1] ?? "1"), denomination: parseInt(m[2] ?? "6"), bonus: m[3] ?? "" }
    : { number: 1, denomination: 6, bonus: "" };
}

function baseActivity(id: string, type: string, activationType: string): Record<string, unknown> {
  return {
    _id: id,
    type,
    name: "",
    img: "",
    sort: 100000,
    activation: { type: activationType, value: 1, condition: "", override: false },
    consumption: { targets: [], scaling: { allowed: false, max: "" }, spellSlot: true },
    description: { chatFlavor: "", value: "" },
    duration: { concentration: false, value: "", units: "inst", special: "", override: false },
    effects: [],
    range: { value: "5", units: "ft", special: "", override: false },
    target: {
      template: { count: "", contiguous: false, type: "", size: "", width: "", height: "", units: "ft", stationary: false },
      affects: { count: "", type: "", choice: false, special: "" },
      prompt: true,
      override: false,
    },
    uses: { spent: 0, max: "", recovery: [] },
    flags: {},
    visibility: {
      identifier: "",
      level: { min: null, max: null },
      requireAttunement: false,
      requireIdentification: false,
      requireMagic: false,
    },
  };
}

function makeAttackActivity(
  activationType: string,
  attackValue: "melee" | "ranged",
  classification: "weapon" | "spell",
  attackBonus: number | undefined,
  dice: { number: number; denomination: number; bonus: string },
  damageType: string,
  rangeValue?: string,
): Record<string, unknown> {
  const id = foundry.utils.randomID(16);
  const base = baseActivity(id, "attack", activationType);
  base["attack"] = {
    ability: classification === "spell" ? "spellcasting" : "str",
    bonus: attackBonus != null ? String(attackBonus) : "",
    critical: { threshold: null },
    flat: false,
    type: { value: attackValue, classification },
  };
  base["damage"] = {
    critical: { bonus: "" },
    includeBase: true,
    parts: [{
      number: dice.number,
      denomination: dice.denomination,
      bonus: dice.bonus,
      types: [damageType],
      custom: { enabled: false, formula: "" },
      scaling: { number: 1 },
    }],
  };
  if (attackValue === "ranged" || (rangeValue && parseInt(rangeValue) > 5)) {
    base["range"] = { value: rangeValue ?? "60", units: "ft", special: "", override: false };
  }
  return { [id]: base };
}

function makeUtilityActivity(activationType: string): Record<string, unknown> {
  const id = foundry.utils.randomID(16);
  return { [id]: baseActivity(id, "utility", activationType) };
}

function makeSaveActivity(
  activationType: string,
  saveAbility?: string,
  damageDice?: { number: number; denomination: number; bonus: string },
  damageType?: string,
): Record<string, unknown> {
  const id = foundry.utils.randomID(16);
  const base = baseActivity(id, "save", activationType);
  base["save"] = { ability: [saveAbility ?? "dex"], dc: { calculation: "spellcasting", formula: "" }, visible: true, bonus: "" };
  if (damageDice && damageType) {
    base["damage"] = {
      onSave: "half",
      parts: [{
        number: damageDice.number,
        denomination: damageDice.denomination,
        bonus: damageDice.bonus,
        types: [damageType],
        custom: { enabled: false, formula: "" },
        scaling: { number: 1 },
      }],
    };
  } else {
    base["damage"] = { onSave: "half", parts: [] };
  }
  return { [id]: base };
}

function makeHealActivity(
  activationType: string,
  healDice?: { number: number; denomination: number; bonus: string },
): Record<string, unknown> {
  const id = foundry.utils.randomID(16);
  const base = baseActivity(id, "heal", activationType);
  const dice = healDice ?? { number: 2, denomination: 8, bonus: "" };
  base["healing"] = {
    number: dice.number,
    denomination: dice.denomination,
    bonus: dice.bonus,
    types: [],
    custom: { enabled: false, formula: "" },
    scaling: { mode: "whole", number: null, formula: "" },
  };
  return { [id]: base };
}

// ---------------------------------------------------------------------------
// Common item base fields
// ---------------------------------------------------------------------------

const CHAT_DESCRIPTION_THRESHOLD = 200;

function buildChatDescription(description: string | undefined): string {
  if (!description || description.length <= CHAT_DESCRIPTION_THRESHOLD) return "";
  const firstSentence = description.split(/(?<=[.!?])\s+/)[0] ?? description;
  return `<p>${firstSentence}</p>`;
}

function commonFields(item: ItemStatResult, edition: RulesEdition, slug: string): Record<string, unknown> {
  return {
    source: makeSource(edition, slug),
    quantity: 1,
    weight: { value: item.weight ?? 0, units: "lb" },
    price: { value: item.price ?? 0, denomination: item.denomination ?? "gp" },
    rarity: item.rarity ?? "common",
    attunement: { required: item.attunement ?? false },
    identified: true,
    description: {
      value: item.description ? `<p>${item.description}</p>` : "",
      chat: buildChatDescription(item.description),
      unidentified: "",
    },
  };
}

// ---------------------------------------------------------------------------
// Per-type Foundry dnd5e system data builders
// ---------------------------------------------------------------------------

function buildWeapon(item: ItemStatResult, edition: RulesEdition): Record<string, unknown> {
  const slug = item.name.toLowerCase().replace(/\s+/g, "-");
  const base = commonFields(item, edition, slug);
  const rangeVal = item.range?.split("/")[0];
  const isRanged = !!rangeVal && parseInt(rangeVal) > 5;

  if (edition === "modern") {
    const dice = parseDiceFormula(item.damage);
    const damageType = item.damageType ?? "slashing";
    const activities = makeAttackActivity(
      "action",
      isRanged ? "ranged" : "melee",
      "weapon",
      item.attackBonus,
      dice,
      damageType,
      rangeVal,
    );
    return {
      name: item.name,
      type: "weapon",
      system: {
        ...base,
        equipped: false,
        weaponType: item.weaponType ?? "martialM",
        baseItem: "",
        properties: item.properties ?? [],
        activities,
      },
    };
  }

  // Legacy
  const damageParts = item.damage && item.damageType
    ? [[
        item.attackBonus && item.attackBonus !== 0
          ? `${item.damage}${item.attackBonus > 0 ? "+" : ""}${item.attackBonus}`
          : item.damage,
        item.damageType,
      ]]
    : [];

  return {
    name: item.name,
    type: "weapon",
    system: {
      ...base,
      equipped: false,
      weaponType: item.weaponType ?? "martialM",
      baseItem: "",
      properties: Object.fromEntries((item.properties ?? []).map(p => [p, true])),
      activation: { type: "action", cost: 1 },
      range: { value: isRanged ? parseInt(rangeVal ?? "60") : null, long: null, units: "ft" },
      damage: { parts: damageParts, versatile: item.versatileDamage ?? "" },
      attackBonus: item.attackBonus != null ? String(item.attackBonus) : "",
      proficient: null,
    },
  };
}

function buildSpell(item: ItemStatResult, edition: RulesEdition): Record<string, unknown> {
  const slug = item.name.toLowerCase().replace(/\s+/g, "-");
  const base = commonFields(item, edition, slug);
  const castingTime = item.castingTime ?? "action";
  const spellRange = item.spellRange ?? "30";
  const rangeUnits = item.rangeUnits ?? "ft";
  const duration = item.duration ?? "inst";
  const spellSchool = item.spellSchool ?? "evo";
  const level = item.spellLevel ?? 0;

  const components: Record<string, unknown> = {
    vocal: (item.components ?? []).includes("V"),
    somatic: (item.components ?? []).includes("S"),
    material: (item.components ?? []).includes("M"),
    ritual: item.ritual ?? false,
    concentration: item.concentration ?? false,
  };
  const materials = item.materialComponent
    ? { value: item.materialComponent, consumed: false, cost: 0, supply: 0 }
    : { value: "", consumed: false, cost: 0, supply: 0 };

  const targetBlock: Record<string, unknown> = item.areaShape
    ? {
        template: { count: item.areaSize ?? "10", contiguous: false, type: item.areaShape, size: "", width: "", height: "", units: "ft", stationary: false },
        affects: { count: "", type: "creature", choice: false, special: "" },
        prompt: true,
        override: false,
      }
    : {
        template: { count: "", contiguous: false, type: "", size: "", width: "", height: "", units: "ft", stationary: false },
        affects: { count: "", type: "", choice: false, special: "" },
        prompt: true,
        override: false,
      };

  if (edition === "modern") {
    let activities: Record<string, unknown> = {};
    if (item.saveAbility && item.spellDamage) {
      activities = makeSaveActivity(castingTime, item.saveAbility, parseDiceFormula(item.spellDamage), item.spellDamageType ?? "fire");
    } else if (item.healAmount) {
      activities = makeHealActivity(castingTime, parseDiceFormula(item.healAmount));
    } else if (item.attackType && item.spellDamage) {
      activities = makeAttackActivity(castingTime, item.attackType === "rsak" ? "ranged" : "melee", "spell", undefined, parseDiceFormula(item.spellDamage), item.spellDamageType ?? "force");
    } else {
      activities = makeUtilityActivity(castingTime);
    }
    return {
      name: item.name,
      type: "spell",
      system: {
        ...base,
        level,
        school: spellSchool,
        components,
        materials,
        duration: { value: item.durationValue ?? "", units: duration, special: "" },
        range: { value: spellRange, units: rangeUnits, special: "" },
        activities,
        preparation: { mode: "prepared", prepared: false },
        properties: [],
        target: targetBlock,
      },
    };
  }

  // Legacy
  let actionType = "util";
  if (item.saveAbility) actionType = "save";
  else if (item.attackType) actionType = item.attackType;
  else if (item.healAmount) actionType = "heal";

  const damageParts: unknown[] = [];
  if (item.spellDamage && item.spellDamageType) damageParts.push([item.spellDamage, item.spellDamageType]);
  if (item.healAmount) damageParts.push([item.healAmount, "healing"]);

  return {
    name: item.name,
    type: "spell",
    system: {
      ...base,
      level,
      school: spellSchool,
      components,
      materials,
      duration: { value: item.durationValue ?? "", units: duration, special: "" },
      range: { value: spellRange, units: rangeUnits, special: "" },
      activation: { type: castingTime, cost: 1 },
      actionType,
      damage: { parts: damageParts },
      save: item.saveAbility ? { ability: item.saveAbility, dc: null, scaling: "spell" } : { ability: "", dc: null, scaling: "spell" },
      preparation: { mode: "prepared", prepared: false },
      target: targetBlock,
    },
  };
}

function buildFeat(item: ItemStatResult, edition: RulesEdition): Record<string, unknown> {
  const slug = item.name.toLowerCase().replace(/\s+/g, "-");
  const base = commonFields(item, edition, slug);
  const activationType = item.activationType ?? "action";
  const subtype = item.featureSubtype ?? "feat";

  if (edition === "modern") {
    let activities: Record<string, unknown> = {};
    if (activationType !== "passive") {
      activities = makeUtilityActivity(activationType);
    }
    const uses = item.uses
      ? { spent: 0, max: String(item.uses), recovery: item.recharge ? [{ period: item.recharge, type: "recoverAll" }] : [] }
      : undefined;
    return {
      name: item.name,
      type: "feat",
      system: {
        ...base,
        type: { value: subtype, subtype: "" },
        activities: activationType !== "passive" ? activities : undefined,
        ...(uses ? { uses } : {}),
      },
    };
  }

  // Legacy
  return {
    name: item.name,
    type: "feat",
    system: {
      ...base,
      type: { value: subtype, subtype: "" },
      activation: { type: activationType, cost: activationType === "passive" ? null : 1 },
      ...(item.uses ? { uses: { value: item.uses, max: String(item.uses), per: item.recharge ?? "sr", recovery: "" } } : {}),
    },
  };
}

function buildConsumable(item: ItemStatResult, edition: RulesEdition): Record<string, unknown> {
  const slug = item.name.toLowerCase().replace(/\s+/g, "-");
  const base = commonFields(item, edition, slug);
  const consumableType = item.consumableType ?? "trinket";
  const charges = item.charges ?? 1;
  const effect = item.consumableEffect ?? "utility";

  if (edition === "modern") {
    let activities: Record<string, unknown> = {};
    if (effect === "heal" && item.healAmount) {
      activities = makeHealActivity("action", parseDiceFormula(item.healAmount));
    } else if (effect === "damage" && item.spellDamage) {
      if (item.saveAbility) {
        activities = makeSaveActivity("action", item.saveAbility, parseDiceFormula(item.spellDamage), item.spellDamageType ?? "fire");
      } else {
        activities = makeUtilityActivity("action");
      }
    } else {
      activities = makeUtilityActivity("action");
    }
    return {
      name: item.name,
      type: "consumable",
      system: {
        ...base,
        type: { value: consumableType, subtype: "" },
        uses: { spent: 0, max: String(charges), recovery: [{ period: "charges", type: "recoverAll" }], autoDestroy: true },
        activities,
      },
    };
  }

  // Legacy
  let actionType = "util";
  if (effect === "heal") actionType = "heal";
  else if (effect === "damage") actionType = "save";

  const damageParts: unknown[] = [];
  if (effect === "heal" && item.healAmount) damageParts.push([item.healAmount, "healing"]);
  if (effect === "damage" && item.spellDamage && item.spellDamageType) damageParts.push([item.spellDamage, item.spellDamageType]);

  return {
    name: item.name,
    type: "consumable",
    system: {
      ...base,
      consumableType,
      uses: { value: charges, max: String(charges), per: "charges", recovery: "", autoDestroy: true },
      activation: { type: "action", cost: 1 },
      actionType,
      ...(damageParts.length > 0 ? { damage: { parts: damageParts } } : {}),
      ...(item.saveAbility && effect === "damage" ? { save: { ability: item.saveAbility, dc: null, scaling: "spell" } } : {}),
    },
  };
}

function buildEquipment(item: ItemStatResult, edition: RulesEdition): Record<string, unknown> {
  const slug = item.name.toLowerCase().replace(/\s+/g, "-");
  const base = commonFields(item, edition, slug);
  const armorType = item.armorType ?? "light";
  const acValue = item.acValue ?? 11;

  const armorTypeMap: Record<string, string> = {
    light: "light",
    medium: "medium",
    heavy: "heavy",
    shield: "shield",
  };

  return {
    name: item.name,
    type: "equipment",
    system: {
      ...base,
      equipped: false,
      armor: {
        type: armorTypeMap[armorType] ?? "light",
        value: acValue,
        magicalBonus: null,
      },
      stealth: { value: item.stealthDisadvantage ?? false },
      strength: { value: item.strengthRequirement ?? 0 },
      type: { value: armorType === "shield" ? "shield" : "trinket", baseItem: "" },
    },
  };
}

function buildLoot(item: ItemStatResult, edition: RulesEdition): Record<string, unknown> {
  const slug = item.name.toLowerCase().replace(/\s+/g, "-");
  const base = commonFields(item, edition, slug);
  return {
    name: item.name,
    type: "loot",
    system: {
      ...base,
      type: { value: "treasure" },
    },
  };
}

function buildTool(item: ItemStatResult, edition: RulesEdition): Record<string, unknown> {
  const slug = item.name.toLowerCase().replace(/\s+/g, "-");
  const base = commonFields(item, edition, slug);
  return {
    name: item.name,
    type: "tool",
    system: {
      ...base,
      toolType: item.toolType ?? "art",
      baseItem: "",
      ability: item.toolAbility ?? "int",
      proficient: 0,
      bonus: "",
    },
  };
}

function makeAdvancementId(): string {
  return foundry.utils.randomID(16);
}

function buildContainer(item: ItemStatResult, edition: RulesEdition): Record<string, unknown> {
  const slug = item.name.toLowerCase().replace(/\s+/g, "-");
  const base = commonFields(item, edition, slug);
  return {
    name: item.name,
    type: "container",
    system: {
      ...base,
      capacity: {
        type: item.capacityType ?? "weight",
        value: item.capacityValue ?? 500,
        weightless: item.weightlessContents ?? false,
      },
      currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
    },
  };
}

function buildBackground(item: ItemStatResult, edition: RulesEdition): Record<string, unknown> {
  const slug = item.name.toLowerCase().replace(/\s+/g, "-");
  const base = commonFields(item, edition, slug);
  const advancement: unknown[] = [];

  // Skill proficiency advancement
  const skillGrants = (item.skillProficiencies ?? []).map(s => `skills:${s}`);
  if (skillGrants.length > 0) {
    advancement.push({
      _id: makeAdvancementId(),
      type: "Trait",
      level: 0,
      title: "Skill Proficiencies",
      icon: null,
      classRestriction: "",
      configuration: {
        mode: "default",
        allowReplacements: false,
        grants: skillGrants,
        choices: [],
        hint: "",
      },
    });
  }

  // Tool proficiency advancement (stored as hint — tool keys vary significantly)
  if (item.toolProficiencies && item.toolProficiencies.length > 0) {
    advancement.push({
      _id: makeAdvancementId(),
      type: "Trait",
      level: 0,
      title: "Tool Proficiencies",
      icon: null,
      classRestriction: "",
      configuration: {
        mode: "default",
        allowReplacements: false,
        grants: [],
        choices: [],
        hint: item.toolProficiencies.join(", "),
      },
    });
  }

  // Language advancement
  const langGrants = (item.backgroundLanguages ?? [])
    .filter(l => l.toLowerCase() !== "any")
    .map(l => `languages:${l.toLowerCase()}`);
  const langChoices = (item.backgroundLanguages ?? []).some(l => l.toLowerCase() === "any") ? 1 : 0;
  if (langGrants.length > 0 || langChoices > 0) {
    advancement.push({
      _id: makeAdvancementId(),
      type: "Trait",
      level: 0,
      title: "Languages",
      icon: null,
      classRestriction: "",
      configuration: {
        mode: "default",
        allowReplacements: false,
        grants: langGrants,
        choices: langChoices > 0 ? [{ count: langChoices, pool: ["languages:*"] }] : [],
        hint: "",
      },
    });
  }

  // Modern edition: ability score improvement advancement (3 points, player-distributed)
  if (edition === "modern") {
    const fixed: Record<string, number> = { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 };
    for (const [k, v] of Object.entries(item.abilityScoreImprovements ?? {})) {
      if (k in fixed) fixed[k] = v;
    }
    advancement.push({
      _id: makeAdvancementId(),
      type: "AbilityScoreImprovement",
      level: 0,
      title: "",
      icon: null,
      classRestriction: "",
      configuration: {
        points: 3,
        cap: 2,
        fixed,
        locked: [],
      },
    });
  }

  // Feature description goes into item description
  const featureHtml = item.backgroundFeatureName && item.backgroundFeatureDescription
    ? `<h3>${item.backgroundFeatureName}</h3><p>${item.backgroundFeatureDescription}</p>`
    : "";
  const fullDescription = `${base["description"] ? (base["description"] as Record<string, unknown>)["value"] ?? "" : ""}${featureHtml}`;

  return {
    name: item.name,
    type: "background",
    system: {
      ...base,
      description: {
        value: fullDescription,
        chat: buildChatDescription(item.description),
        unidentified: "",
      },
      advancement,
    },
  };
}

function buildRace(item: ItemStatResult, edition: RulesEdition): Record<string, unknown> {
  const slug = item.name.toLowerCase().replace(/\s+/g, "-");
  const base = commonFields(item, edition, slug);
  const advancement: unknown[] = [];

  // Ability score improvements — legacy only; modern races don't include fixed ASIs
  if (edition === "legacy" && item.abilityScoreImprovements && Object.keys(item.abilityScoreImprovements).length > 0) {
    const fixed: Record<string, number> = { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 };
    for (const [k, v] of Object.entries(item.abilityScoreImprovements)) {
      if (k in fixed) fixed[k] = v;
    }
    advancement.push({
      _id: makeAdvancementId(),
      type: "AbilityScoreImprovement",
      level: 0,
      title: "",
      icon: null,
      classRestriction: "",
      configuration: {
        points: 0,
        cap: 2,
        fixed,
        locked: Object.keys(fixed).filter(k => fixed[k] !== 0),
      },
    });
  }

  // Damage resistance advancement
  if (item.damageResistances && item.damageResistances.length > 0) {
    advancement.push({
      _id: makeAdvancementId(),
      type: "Trait",
      level: 0,
      title: "Damage Resistances",
      icon: null,
      classRestriction: "",
      configuration: {
        mode: "default",
        allowReplacements: false,
        grants: item.damageResistances.map(r => `dr:${r.toLowerCase()}`),
        choices: [],
        hint: "",
      },
    });
  }

  // Build racial trait descriptions into main description
  const traitsHtml = (item.raceTraits ?? [])
    .map(t => `<h3>${t.name}</h3><p>${t.description}</p>`)
    .join("");
  const baseDesc = base["description"]
    ? String((base["description"] as Record<string, unknown>)["value"] ?? "")
    : "";
  const fullDescription = `${baseDesc}${traitsHtml}`;

  return {
    name: item.name,
    type: "race",
    system: {
      ...base,
      description: {
        value: fullDescription,
        chat: buildChatDescription(item.description),
        unidentified: "",
      },
      movement: {
        burrow: item.burrowSpeed ?? 0,
        climb: item.climbSpeed ?? 0,
        fly: item.flySpeed ?? 0,
        swim: item.swimSpeed ?? 0,
        walk: item.walkSpeed ?? 30,
        hover: false,
        units: "ft",
      },
      senses: {
        darkvision: item.darkvisionRange ?? 0,
        blindsight: 0,
        tremorsense: 0,
        truesight: 0,
        units: "ft",
        special: "",
      },
      size: item.raceSize ?? "med",
      advancement,
    },
  };
}

function buildClass(item: ItemStatResult, edition: RulesEdition): Record<string, unknown> {
  const slug = item.classIdentifier ?? item.name.toLowerCase().replace(/\s+/g, "-");
  const base = commonFields(item, edition, slug);
  const advancement: unknown[] = [];

  // Hit Points (level 0 = applies to all levels)
  advancement.push({
    _id: makeAdvancementId(),
    type: "HitPoints",
    level: 0,
    title: "",
    icon: null,
    classRestriction: "",
    configuration: {},
  });

  // Armor proficiencies (level 1)
  const armorKeyMap: Record<string, string> = { light: "armor:lgt", medium: "armor:med", heavy: "armor:hvy", shield: "armor:shl" };
  const armorGrants = (item.armorProficiencies ?? [])
    .map(a => armorKeyMap[a.toLowerCase()])
    .filter((x): x is string => !!x);
  if (armorGrants.length > 0) {
    advancement.push({
      _id: makeAdvancementId(),
      type: "Trait",
      level: 1,
      title: "Armor Proficiencies",
      icon: null,
      classRestriction: "",
      configuration: { mode: "default", allowReplacements: false, grants: armorGrants, choices: [], hint: "" },
    });
  }

  // Weapon proficiencies (level 1)
  const weaponKeyMap: Record<string, string> = { simple: "weapon:sim", martial: "weapon:mar" };
  const weaponGrants = (item.weaponProficiencies ?? [])
    .map(w => weaponKeyMap[w.toLowerCase()])
    .filter((x): x is string => !!x);
  if (weaponGrants.length > 0) {
    advancement.push({
      _id: makeAdvancementId(),
      type: "Trait",
      level: 1,
      title: "Weapon Proficiencies",
      icon: null,
      classRestriction: "",
      configuration: { mode: "default", allowReplacements: false, grants: weaponGrants, choices: [], hint: "" },
    });
  }

  // Tool proficiencies (level 1, stored as hint)
  if (item.classToolProficiencies && item.classToolProficiencies.length > 0) {
    advancement.push({
      _id: makeAdvancementId(),
      type: "Trait",
      level: 1,
      title: "Tool Proficiencies",
      icon: null,
      classRestriction: "",
      configuration: { mode: "default", allowReplacements: false, grants: [], choices: [], hint: item.classToolProficiencies.join(", ") },
    });
  }

  // Skill choices (level 1)
  const validSkillAbbrs = ["acr","ani","arc","ath","dec","his","ins","itm","inv","med","nat","prc","per","rel","slt","ste","sur"];
  const skillPool = (item.skillChoices ?? []).filter(s => validSkillAbbrs.includes(s)).map(s => `skills:${s}`);
  if (skillPool.length > 0) {
    advancement.push({
      _id: makeAdvancementId(),
      type: "Trait",
      level: 1,
      title: "Skills",
      icon: null,
      classRestriction: "",
      configuration: {
        mode: "default",
        allowReplacements: false,
        grants: [],
        choices: [{ count: item.numSkillChoices ?? 2, pool: skillPool }],
        hint: "",
      },
    });
  }

  // ASI at levels 4, 8, 12, 16, 19
  for (const level of [4, 8, 12, 16, 19]) {
    advancement.push({
      _id: makeAdvancementId(),
      type: "AbilityScoreImprovement",
      level,
      title: "",
      icon: null,
      classRestriction: "",
      configuration: { points: 2, cap: 2, fixed: { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 }, locked: [] },
    });
  }

  // Feature descriptions in item description HTML
  const featuresHtml = (item.classFeatures ?? [])
    .slice()
    .sort((a, b) => a.level - b.level)
    .map(f => `<h3>Level ${f.level}: ${f.name}</h3><p>${f.description}</p>`)
    .join("");
  const baseDesc = String((base["description"] as Record<string, unknown>)?.["value"] ?? "");

  return {
    name: item.name,
    type: "class",
    system: {
      ...base,
      description: {
        value: `${baseDesc}${featuresHtml}`,
        chat: buildChatDescription(item.description),
        unidentified: "",
      },
      identifier: slug,
      hitDice: `d${item.hitDie ?? 8}`,
      hitDiceUsed: 0,
      saves: (item.savingThrows ?? []).filter(s => ["str","dex","con","int","wis","cha"].includes(s)),
      skills: {
        number: item.numSkillChoices ?? 2,
        choices: item.skillChoices ?? [],
        value: [],
      },
      spellcasting: {
        progression: item.spellcastingProgression ?? "none",
        ability: item.spellcastingAbility ?? "",
      },
      advancement,
    },
  };
}

function buildSubclass(item: ItemStatResult, edition: RulesEdition): Record<string, unknown> {
  const slug = item.subclassIdentifier ?? item.name.toLowerCase().replace(/\s+/g, "-");
  const base = commonFields(item, edition, slug);

  const featuresHtml = (item.subclassFeatures ?? [])
    .slice()
    .sort((a, b) => a.level - b.level)
    .map(f => `<h3>Level ${f.level}: ${f.name}</h3><p>${f.description}</p>`)
    .join("");
  const baseDesc = String((base["description"] as Record<string, unknown>)?.["value"] ?? "");

  return {
    name: item.name,
    type: "subclass",
    system: {
      ...base,
      description: {
        value: `${baseDesc}${featuresHtml}`,
        chat: buildChatDescription(item.description),
        unidentified: "",
      },
      identifier: slug,
      classIdentifier: item.subclassParent ?? "",
      spellcasting: {
        progression: item.spellcastingProgression ?? "none",
        ability: item.spellcastingAbility ?? "",
      },
      advancement: [],
    },
  };
}

export function buildDnd5eItemData(item: ItemStatResult, edition: RulesEdition): Record<string, unknown> {
  switch (item.itemType) {
    case "weapon": return buildWeapon(item, edition);
    case "spell": return buildSpell(item, edition);
    case "feat": return buildFeat(item, edition);
    case "consumable": return buildConsumable(item, edition);
    case "equipment": return buildEquipment(item, edition);
    case "loot": return buildLoot(item, edition);
    case "tool": return buildTool(item, edition);
    case "container": return buildContainer(item, edition);
    case "background": return buildBackground(item, edition);
    case "race": return buildRace(item, edition);
    case "class": return buildClass(item, edition);
    case "subclass": return buildSubclass(item, edition);
    default: return buildLoot(item, edition);
  }
}

// ---------------------------------------------------------------------------
// Preview HTML for item approval dialog
// ---------------------------------------------------------------------------

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function buildItemPreviewHtml(item: ItemStatResult): string {
  const rows: string[] = [];
  const row = (label: string, value: string | number | boolean | undefined): void => {
    if (value !== undefined && value !== "" && value !== false) {
      rows.push(`<tr><td style="color:#aaa;width:130px">${esc(label)}</td><td>${esc(String(value))}</td></tr>`);
    }
  };

  row("Type", `${item.itemType}${item.rarity ? ` — ${item.rarity}` : ""}`);
  if (item.itemType === "weapon") {
    row("Weapon Type", item.weaponType);
    row("Damage", item.damage && item.damageType ? `${item.damage} ${item.damageType}` : undefined);
    row("Versatile", item.versatileDamage);
    row("Properties", item.properties?.join(", "));
    row("Range", item.range);
    row("Attack Bonus", item.attackBonus);
  }
  if (item.itemType === "spell") {
    row("Level", item.spellLevel === 0 ? "Cantrip" : item.spellLevel != null ? `Level ${item.spellLevel}` : undefined);
    row("School", item.spellSchool);
    row("Casting Time", item.castingTime);
    row("Range", item.spellRange ? `${item.spellRange} ${item.rangeUnits ?? "ft"}` : undefined);
    row("Components", item.components?.join(", "));
    row("Duration", item.durationValue ? `${item.durationValue} ${item.duration}` : item.duration);
    row("Concentration", item.concentration);
    row("Ritual", item.ritual);
    row("Damage", item.spellDamage && item.spellDamageType ? `${item.spellDamage} ${item.spellDamageType}` : undefined);
    row("Save", item.saveAbility ? `DC vs ${item.saveAbility}` : undefined);
    row("Heal", item.healAmount);
    row("Area", item.areaShape ? `${item.areaSize ?? ""}ft ${item.areaShape}` : undefined);
  }
  if (item.itemType === "feat") {
    row("Subtype", item.featureSubtype);
    row("Activation", item.activationType);
    row("Uses", item.uses != null ? `${item.uses} (recharge: ${item.recharge ?? "–"})` : undefined);
  }
  if (item.itemType === "consumable") {
    row("Consumable Type", item.consumableType);
    row("Charges", item.charges);
  }
  if (item.itemType === "equipment") {
    row("Armor Type", item.armorType);
    row("AC Value", item.acValue);
    row("Stealth Disadv.", item.stealthDisadvantage);
    row("Str Requirement", item.strengthRequirement);
  }
  if (item.itemType === "tool") {
    row("Tool Type", item.toolType);
    row("Ability", item.toolAbility);
  }
  if (item.itemType === "container") {
    row("Capacity Type", item.capacityType);
    row("Capacity", item.capacityValue != null ? String(item.capacityValue) : undefined);
    row("Weightless", item.weightlessContents);
  }
  if (item.itemType === "background") {
    row("Skills", item.skillProficiencies?.join(", "));
    row("Tool Proficiencies", item.toolProficiencies?.join(", "));
    row("Languages", item.backgroundLanguages?.join(", "));
    row("Feature", item.backgroundFeatureName);
  }
  if (item.itemType === "race") {
    row("Size", item.raceSize);
    row("Walk Speed", item.walkSpeed != null ? `${item.walkSpeed} ft` : undefined);
    if (item.flySpeed) row("Fly Speed", `${item.flySpeed} ft`);
    if (item.swimSpeed) row("Swim Speed", `${item.swimSpeed} ft`);
    if (item.burrowSpeed) row("Burrow Speed", `${item.burrowSpeed} ft`);
    if (item.climbSpeed) row("Climb Speed", `${item.climbSpeed} ft`);
    if (item.darkvisionRange) row("Darkvision", `${item.darkvisionRange} ft`);
    row("Resistances", item.damageResistances?.join(", "));
    const asiStr = item.abilityScoreImprovements ? Object.entries(item.abilityScoreImprovements).map(([k, v]) => `${k}+${v}`).join(", ") : undefined;
    row("ASIs", asiStr);
    row("Traits", item.raceTraits?.map(t => t.name).join(", "));
  }
  row("Weight", item.weight != null ? `${item.weight} lb` : undefined);
  row("Price", item.price != null ? `${item.price} ${item.denomination ?? "gp"}` : undefined);
  row("Attunement", item.attunement);

  return `
    <div style="font-size:0.85em;max-height:420px;overflow-y:auto;padding:4px 8px">
      <h3 style="margin:0 0 4px">${esc(item.name)}</h3>
      <hr style="border-color:#555;margin:4px 0">
      <table style="width:100%;border-collapse:collapse;margin-bottom:6px">
        ${rows.join("\n")}
      </table>
      ${item.description ? `<p style="margin:4px 0;color:#bbb;font-style:italic">${esc(item.description)}</p>` : ""}
    </div>`;
}

// ---------------------------------------------------------------------------
// Item create approval dialog
// ---------------------------------------------------------------------------

export async function showItemCreateApprovalDialog(payload: ItemCreateApprovalPayload): Promise<void> {
  if (!game.user?.isGM) return;

  const item = payload.itemStatData as unknown as ItemStatResult;
  const edition = payload.edition;
  const folderId = payload.folderId;

  const gmIds = game.users.filter((u) => u.isGM).map((u) => u.id);

  await ChatMessage.create({
    content: `<p><strong>LoreBridge — Item Creation Proposal</strong></p><p><strong>Item:</strong> ${item.name} (${item.itemType})</p>${payload.rationale ? `<p><strong>Reason:</strong> ${payload.rationale}</p>` : ""}<p style="font-size:0.8em;color:#888;">Respond via the popup dialog.</p>`,
    whisper: gmIds,
    speaker: { alias: "LoreBridge" },
  });

  const dialogContent = `
    <div>
      <p><strong>Item:</strong> ${item.name} <em>(${item.itemType}${item.rarity ? `, ${item.rarity}` : ""})</em></p>
      ${payload.rationale ? `<p><strong>Reason:</strong> ${payload.rationale}</p>` : ""}
      <details open style="margin-top:8px;">
        <summary style="cursor:pointer;font-weight:bold;">Item Preview</summary>
        <div style="max-height:350px;overflow-y:auto;margin-top:4px;">
          ${buildItemPreviewHtml(item)}
        </div>
      </details>
    </div>
  `;

  new foundry.applications.api.DialogV2({
    window: { title: `LoreBridge — Create Item: ${item.name}`, resizable: true },
    position: { width: 500, height: "auto" },
    content: dialogContent,
    buttons: [
      {
        action: "approve",
        label: "Create Item",
        icon: "fas fa-plus",
        callback: () => {
          void (async () => {
            try {
              let folder: FoundryFolderDocument | undefined;
              if (folderId) {
                folder = game.folders?.get(folderId) as FoundryFolderDocument | undefined;
              }

              const itemData: Record<string, unknown> = {
                ...buildDnd5eItemData(item, edition),
                ...(folder?.id ? { folder: folder.id } : {}),
              };

              const created = await Item.create(itemData);
              if (!created) {
                ui.notifications.error("LoreBridge: Item creation returned no document.");
                return;
              }
              ui.notifications.info(`LoreBridge: Created item "${created.name}".`);
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              ui.notifications.error(`LoreBridge: Item creation failed — ${msg}`);
            }
          })();
        },
      },
      {
        action: "reject",
        label: "Reject",
        icon: "fas fa-times",
        default: true,
        callback: () => {
          ui.notifications.info("LoreBridge: Item creation proposal rejected.");
        },
      },
    ],
  }).render({ force: true });
}

// ---------------------------------------------------------------------------
// Item update approval dialog
// ---------------------------------------------------------------------------

export async function showItemUpdateApprovalDialog(payload: ItemUpdateApprovalPayload): Promise<void> {
  if (!game.user?.isGM) return;

  const item = payload.itemStatData as unknown as ItemStatResult;
  const edition = payload.edition;
  const itemId = payload.itemId;

  const gmIds = game.users.filter((u) => u.isGM).map((u) => u.id);

  await ChatMessage.create({
    content: `<p><strong>LoreBridge — Item Update Proposal</strong></p><p><strong>Item:</strong> ${payload.itemName}</p>${payload.rationale ? `<p><strong>Instruction:</strong> ${payload.rationale}</p>` : ""}<p style="font-size:0.8em;color:#888;">Respond via the popup dialog.</p>`,
    whisper: gmIds,
    speaker: { alias: "LoreBridge" },
  });

  const dialogContent = `
    <div>
      <p><strong>Updating:</strong> ${payload.itemName} → ${item.name}</p>
      ${payload.rationale ? `<p><strong>Instruction:</strong> ${payload.rationale}</p>` : ""}
      <details open style="margin-top:8px;">
        <summary style="cursor:pointer;font-weight:bold;">Proposed Item Data</summary>
        <div style="max-height:350px;overflow-y:auto;margin-top:4px;">
          ${buildItemPreviewHtml(item)}
        </div>
      </details>
    </div>
  `;

  new foundry.applications.api.DialogV2({
    window: { title: `LoreBridge — Update Item: ${payload.itemName}`, resizable: true },
    position: { width: 500, height: "auto" },
    content: dialogContent,
    buttons: [
      {
        action: "approve",
        label: "Apply Update",
        icon: "fas fa-save",
        callback: () => {
          void (async () => {
            try {
              const foundryItem = game.items?.get(itemId) as (FoundryItem & { update(data: Record<string, unknown>): Promise<FoundryItem> }) | undefined;
              if (!foundryItem) {
                ui.notifications.error(`LoreBridge: Item "${itemId}" not found in world items.`);
                return;
              }

              const newData = buildDnd5eItemData(item, edition);
              await foundryItem.update(newData);
              ui.notifications.info(`LoreBridge: Updated item "${foundryItem.name}".`);
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              ui.notifications.error(`LoreBridge: Item update failed — ${msg}`);
            }
          })();
        },
      },
      {
        action: "reject",
        label: "Reject",
        icon: "fas fa-times",
        default: true,
        callback: () => {
          ui.notifications.info("LoreBridge: Item update proposal rejected.");
        },
      },
    ],
  }).render({ force: true });
}
