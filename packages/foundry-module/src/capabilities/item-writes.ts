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

export function buildDnd5eItemData(item: ItemStatResult, edition: RulesEdition): Record<string, unknown> {
  switch (item.itemType) {
    case "weapon": return buildWeapon(item, edition);
    case "spell": return buildSpell(item, edition);
    case "feat": return buildFeat(item, edition);
    case "consumable": return buildConsumable(item, edition);
    case "equipment": return buildEquipment(item, edition);
    case "loot": return buildLoot(item, edition);
    case "tool": return buildTool(item, edition);
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
