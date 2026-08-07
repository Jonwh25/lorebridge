import { getLoreBridgeSettings } from "../settings.js";
import { addHistoryEntry } from "../generation-history.js";

const MODULE_ID = "lorebridge";

// ---------------------------------------------------------------------------
// Backend types (mirrors NpcStatBlockResult from packages/backend)
// ---------------------------------------------------------------------------

type NpcStatBlockAction = {
  name: string;
  attackBonus: number | undefined;
  damage: string | undefined;
  damageType: string | undefined;
  range: string | undefined;
  description: string;
};

type NpcStatBlockFeature = {
  name: string;
  description: string;
};

type NpcStatBlockResult = {
  name: string;
  size: string;
  creatureType: string;
  subtype: string;
  alignment: string;
  cr: number;
  ac: number;
  acSource: string;
  hpMax: number;
  hpFormula: string;
  speedWalk: number;
  speedFly: number;
  speedSwim: number;
  speedClimb: number;
  speedBurrow: number;
  str: number;
  dex: number;
  con: number;
  int: number;
  wis: number;
  cha: number;
  savingThrows: string[];
  skills: string[];
  senses: string;
  languages: string;
  damageImmunities: string;
  damageResistances: string;
  damageVulnerabilities: string;
  conditionImmunities: string;
  biography: string;
  traits: NpcStatBlockFeature[];
  actions: NpcStatBlockAction[];
  bonusActions: NpcStatBlockFeature[];
  reactions: NpcStatBlockFeature[];
  legendaryActions: NpcStatBlockFeature[];
  provider: string;
};

// ---------------------------------------------------------------------------
// Backend
// ---------------------------------------------------------------------------

function buildBackendUrl(base: string, path: string): string {
  return base.endsWith("/") ? `${base}${path}` : `${base}/${path}`;
}

async function postBackend<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const settings = getLoreBridgeSettings();
  if (!settings.backendUrl || !settings.clientToken) {
    throw new Error("LoreBridge backend is not configured or paired.");
  }
  const url = buildBackendUrl(settings.backendUrl, path);
  const response = await fetch(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${settings.clientToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({})) as { error?: { message?: string } };
    throw new Error(err?.error?.message ?? `Backend error ${response.status}`);
  }
  return response.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// D&D 5e system data mapper
// ---------------------------------------------------------------------------

// Skill abbreviation → dnd5e system key
const SKILL_KEY_MAP: Record<string, string> = {
  "acrobatics": "acr",
  "animal handling": "ani",
  "arcana": "arc",
  "athletics": "ath",
  "deception": "dec",
  "history": "his",
  "insight": "ins",
  "intimidation": "itm",
  "investigation": "inv",
  "medicine": "med",
  "nature": "nat",
  "perception": "prc",
  "performance": "prf",
  "persuasion": "per",
  "religion": "rel",
  "sleight of hand": "slt",
  "stealth": "ste",
  "survival": "sur",
};

// Saving throw name → dnd5e ability key
const SAVE_KEY_MAP: Record<string, string> = {
  "str": "str", "strength": "str",
  "dex": "dex", "dexterity": "dex",
  "con": "con", "constitution": "con",
  "int": "int", "intelligence": "int",
  "wis": "wis", "wisdom": "wis",
  "cha": "cha", "charisma": "cha",
};

function abilityMod(score: number): number {
  return Math.floor((score - 10) / 2);
}

function crToString(cr: number): string {
  if (cr === 0.125) return "1/8";
  if (cr === 0.25) return "1/4";
  if (cr === 0.5) return "1/2";
  return String(cr);
}

function buildDnd5eActorData(stat: NpcStatBlockResult, edition: RulesEdition): Record<string, unknown> {
  // Build saving throw overrides
  const saves: Record<string, { proficient: number }> = {};
  for (const abbr of stat.savingThrows) {
    const key = SAVE_KEY_MAP[abbr.toLowerCase()];
    if (key) saves[key] = { proficient: 1 };
  }

  // Build skill overrides
  const skillOverrides: Record<string, { value: number }> = {};
  for (const raw of stat.skills) {
    const key = SKILL_KEY_MAP[raw.toLowerCase()];
    if (key) skillOverrides[key] = { value: 1 };
  }

  return {
    name: stat.name,
    type: "npc",
    system: {
      source: makeSource(edition, stat.name.toLowerCase().replace(/\s+/g, "-")),
      abilities: {
        str: { value: stat.str },
        dex: { value: stat.dex },
        con: { value: stat.con },
        int: { value: stat.int },
        wis: { value: stat.wis },
        cha: { value: stat.cha },
        ...Object.fromEntries(
          Object.entries(saves).map(([k, v]) => [k, { value: (stat as unknown as Record<string, number>)[k] ?? 10, proficient: v.proficient }])
        ),
      },
      attributes: {
        ac: {
          flat: stat.ac,
          calc: "flat",
        },
        hp: {
          value: stat.hpMax,
          min: 0,
          max: stat.hpMax,
          formula: stat.hpFormula,
        },
        movement: {
          walk: stat.speedWalk,
          fly: stat.speedFly,
          swim: stat.speedSwim,
          climb: stat.speedClimb,
          burrow: stat.speedBurrow,
          units: "ft",
        },
        prof: 0,
      },
      details: {
        biography: { value: stat.biography ? `<p>${stat.biography}</p>` : "" },
        alignment: stat.alignment,
        type: {
          value: stat.creatureType || "humanoid",
          subtype: stat.subtype || "",
        },
        cr: stat.cr,
      },
      traits: {
        size: stat.size?.toLowerCase().slice(0, 3) || "med",
        languages: { value: [], custom: stat.languages },
        di: { value: [], custom: stat.damageImmunities },
        dr: { value: [], custom: stat.damageResistances },
        dv: { value: [], custom: stat.damageVulnerabilities },
        ci: { value: [], custom: stat.conditionImmunities },
        senses: { special: stat.senses },
      },
      skills: skillOverrides,
    },
  };
}

// ---------------------------------------------------------------------------
// Compendium item lookup
// ---------------------------------------------------------------------------

type RulesEdition = "modern" | "legacy";

/** Return all Item-type packs from the dnd5e system, monster packs first. */
async function getDnd5eItemPacks(edition: RulesEdition): Promise<FoundryCompendiumPack[]> {
  const packs: FoundryCompendiumPack[] = [];
  for (const pack of game.packs) {
    if (pack.metadata.type !== "Item") continue;
    // Only dnd5e system packs
    if (pack.metadata.packageName !== "dnd5e" && pack.metadata.packageType !== "system") continue;
    const id = pack.metadata.id.toLowerCase();
    const is2024 = id.includes("2024") || id.includes("modern");
    if (edition === "modern" && !is2024) continue;
    if (edition === "legacy" && is2024) continue;
    // Ensure the pack index is populated before we try to search it
    if (pack.index.size === 0) {
      try { await pack.getIndex(); } catch { continue; }
    }
    packs.push(pack);
  }
  // Prioritise monster-feature packs, then equipment, then everything else
  packs.sort((a, b) => {
    const score = (p: FoundryCompendiumPack): number => {
      const id = p.metadata.id.toLowerCase();
      if (id.includes("monster")) return 0;
      if (id.includes("equipment") || id.includes("weapon")) return 1;
      return 2;
    };
    return score(a) - score(b);
  });
  return packs;
}

async function findCompendiumItemData(
  name: string,
  edition: RulesEdition,
): Promise<Record<string, unknown> | null> {
  const nameLower = name.toLowerCase().trim();
  const packs = await getDnd5eItemPacks(edition);

  // Two-pass: exact match first, then prefix match (e.g. "Claw" → "Claw (Hybrid Form Only)")
  for (const pass of [0, 1]) {
    for (const pack of packs) {
      for (const entry of pack.index) {
        const entryLower = entry.name.toLowerCase().trim();
        const match = pass === 0
          ? entryLower === nameLower
          : entryLower.startsWith(nameLower) || nameLower.startsWith(entryLower);
        if (!match) continue;
        try {
          const doc = await pack.getDocument(entry._id);
          if (doc) return doc.toObject();
        } catch {
          // skip failed loads
        }
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Synthetic item builders (used when compendium lookup misses)
// ---------------------------------------------------------------------------

function parseDiceFormula(formula: string | undefined): { number: number; denomination: number; bonus: string } {
  if (!formula) return { number: 1, denomination: 6, bonus: "" };
  const m = /^(\d+)d(\d+)([+-]\d+)?/.exec(formula.trim());
  return m
    ? { number: parseInt(m[1] ?? "1"), denomination: parseInt(m[2] ?? "6"), bonus: m[3] ?? "" }
    : { number: 1, denomination: 6, bonus: "" };
}

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

type AttackKind = { value: "melee" | "ranged"; classification: "weapon" | "spell" };

function inferAttackKind(name: string, description: string, range: string | undefined): AttackKind {
  const n = name.toLowerCase();
  const d = description.toLowerCase();
  if (/ranged spell attack/i.test(d) || /ray|bolt|blast|beam|arcane missile/i.test(n)) {
    return { value: "ranged", classification: "spell" };
  }
  if (/melee spell attack/i.test(d)) {
    return { value: "melee", classification: "spell" };
  }
  if (/ranged weapon attack/i.test(d)) {
    return { value: "ranged", classification: "weapon" };
  }
  const rangeNum = parseInt(range ?? "5");
  if (!isNaN(rangeNum) && rangeNum > 5) {
    return { value: "ranged", classification: "weapon" };
  }
  return { value: "melee", classification: "weapon" };
}

/** Base fields shared by all dnd5e 4.x activity types (confirmed from lich pack data). */
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
  kind: AttackKind,
  attackBonus: number | undefined,
  dice: { number: number; denomination: number; bonus: string },
  damageType: string,
): Record<string, unknown> {
  const id = foundry.utils.randomID(16);
  const base = baseActivity(id, "attack", activationType);
  base["attack"] = {
    ability: kind.classification === "spell" ? "spellcasting" : "str",
    bonus: attackBonus != null ? String(attackBonus) : "",
    critical: { threshold: null },
    flat: false,
    type: { value: kind.value, classification: kind.classification },
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
  if (kind.value === "ranged") {
    base["range"] = { value: "60", units: "ft", special: "", override: false };
  }
  return { [id]: base };
}

function makeUtilityActivity(activationType: string): Record<string, unknown> {
  const id = foundry.utils.randomID(16);
  // "Use" in the UI = type "utility" internally (confirmed from dnd5e source)
  return { [id]: baseActivity(id, "utility", activationType) };
}

function makeSaveActivity(activationType: string): Record<string, unknown> {
  const id = foundry.utils.randomID(16);
  const base = baseActivity(id, "save", activationType);
  base["save"] = { ability: ["wis"], dc: { calculation: "", formula: "14" }, visible: true, bonus: "" };
  base["damage"] = { onSave: "half", parts: [] };
  return { [id]: base };
}

function makeHealActivity(activationType: string): Record<string, unknown> {
  const id = foundry.utils.randomID(16);
  const base = baseActivity(id, "heal", activationType);
  base["healing"] = {
    number: 2, denomination: 8, bonus: "", types: [],
    custom: { enabled: false, formula: "" },
    scaling: { mode: "whole", number: null, formula: "" },
  };
  return { [id]: base };
}

function makeSyntheticWeapon(action: NpcStatBlockAction, edition: RulesEdition, activationType = "action"): Record<string, unknown> {
  const damageType = action.damageType ?? "slashing";
  const slug = action.name.toLowerCase().replace(/\s+/g, "-");
  const source = makeSource(edition, slug);
  const kind = inferAttackKind(action.name, action.description, action.range ?? undefined);
  const isSpell = kind.classification === "spell";

  if (edition === "modern") {
    const dice = parseDiceFormula(action.damage ?? undefined);
    return {
      name: action.name,
      type: "feat",
      system: {
        source,
        type: { value: "monster", subtype: "" },
        description: { value: `<p>${action.description}</p>` },
        activities: makeAttackActivity(activationType, kind, action.attackBonus, dice, damageType),
      },
    };
  }

  // Legacy (2014) format — no activities system
  return {
    name: action.name,
    type: isSpell ? "feat" : "weapon",
    system: {
      source,
      description: { value: `<p>${action.description}</p>` },
      equipped: true,
      proficient: true,
      attackBonus: action.attackBonus != null ? String(action.attackBonus) : "",
      damage: { parts: action.damage ? [[action.damage, damageType]] : [] },
      range: { value: action.range?.replace(/\s?ft\.?$/i, "") ?? null, units: "ft" },
      activation: { type: activationType, cost: 1 },
    },
  };
}

/** Infer the dnd5e activation type string from a description (for non-attack feats). */
function inferFeatActivationType(description: string, hint: string): string {
  const d = description.toLowerCase();
  // Active trigger words — override "passive" hint
  if (/\bas an action\b|\baction:/i.test(d)) return "action";
  if (/\bas a bonus action\b|\bbonus action:/i.test(d)) return "bonus";
  if (/\bas a reaction\b|\breaction:/i.test(d)) return "reaction";
  if (/\bonce per turn\b|\beach turn\b|\byou can\b/i.test(d) && hint === "passive") return "action";
  return hint; // keep whatever was passed in
}

/** Infer the best dnd5e activity type for a non-attack feat. */
function inferFeatActivityType(description: string): string {
  const d = description.toLowerCase();
  if (/saving throw|must succeed on a.*save/i.test(d)) return "save";
  if (/heal|regain.*hit point|restore.*hit point/i.test(d)) return "heal";
  if (/summon|conjure/i.test(d)) return "summon";
  if (/cast.*spell|spellcasting/i.test(d)) return "cast";
  return "use"; // generic fallback — always valid in dnd5e 4.x
}

function makeSyntheticFeat(
  name: string,
  description: string,
  activationHint: string,
  edition: RulesEdition,
): Record<string, unknown> {
  const source = makeSource(edition, name.toLowerCase().replace(/\s+/g, "-"));
  const activationType = inferFeatActivationType(description, activationHint);

  let activities: Record<string, unknown> | undefined;
  if (edition === "modern" && activationType !== "passive") {
    const activityType = inferFeatActivityType(description);
    if (activityType === "save") activities = makeSaveActivity(activationType);
    else if (activityType === "heal") activities = makeHealActivity(activationType);
    else activities = makeUtilityActivity(activationType);
  }

  return {
    name,
    type: "feat",
    system: {
      source,
      type: { value: "monster", subtype: "" },
      description: { value: `<p>${description}</p>` },
      activation: { type: activationType, cost: activationType === "passive" ? null : 1 },
      ...(activities ? { activities } : {}),
    },
  };
}

// ---------------------------------------------------------------------------
// Build embedded item list — compendium-first, synthetic fallback
// ---------------------------------------------------------------------------

async function buildEmbeddedItems(stat: NpcStatBlockResult, edition: RulesEdition): Promise<Record<string, unknown>[]> {
  const items: Record<string, unknown>[] = [];

  for (const trait of stat.traits) {
    const comp = await findCompendiumItemData(trait.name, edition);
    items.push(comp ?? makeSyntheticFeat(trait.name, trait.description, "passive", edition));
  }

  for (const action of stat.actions) {
    const comp = await findCompendiumItemData(action.name, edition);
    if (comp) { items.push(comp); continue; }
    const isAttack = action.attackBonus !== undefined;
    items.push(isAttack
      ? makeSyntheticWeapon(action, edition)
      : makeSyntheticFeat(action.name, action.description, "action", edition));
  }

  for (const ba of stat.bonusActions) {
    const comp = await findCompendiumItemData(ba.name, edition);
    items.push(comp ?? makeSyntheticFeat(ba.name, ba.description, "bonus", edition));
  }

  for (const rx of stat.reactions) {
    const comp = await findCompendiumItemData(rx.name, edition);
    items.push(comp ?? makeSyntheticFeat(rx.name, rx.description, "reaction", edition));
  }

  for (const la of stat.legendaryActions) {
    const comp = await findCompendiumItemData(la.name, edition);
    items.push(comp ?? makeSyntheticFeat(la.name, la.description, "legendary", edition));
  }

  return items;
}

// ---------------------------------------------------------------------------
// Stat block preview HTML
// ---------------------------------------------------------------------------

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function buildPreviewHtml(stat: NpcStatBlockResult): string {
  const mod = (n: number): string => {
    const m = abilityMod(n);
    return m >= 0 ? `+${m}` : String(m);
  };

  const row = (label: string, value: string | number | undefined): string =>
    value ? `<tr><td style="color:#aaa;width:120px">${label}</td><td>${esc(String(value))}</td></tr>` : "";

  const features = (list: NpcStatBlockFeature[], label: string): string => {
    if (!list.length) return "";
    return `<p style="margin:6px 0 2px"><strong>${esc(label)}</strong></p>` +
      list.map(f => `<p style="margin:2px 0"><em><strong>${esc(f.name)}.</strong></em> ${esc(f.description)}</p>`).join("");
  };

  const actionsHtml = stat.actions.length
    ? `<p style="margin:6px 0 2px"><strong>Actions</strong></p>` +
      stat.actions.map(a => {
        const attack = a.attackBonus !== undefined
          ? ` <em>+${a.attackBonus} to hit, ${a.range ?? "5 ft."}, ${a.damage ?? ""} ${a.damageType ?? ""}.</em>`
          : "";
        return `<p style="margin:2px 0"><em><strong>${esc(a.name)}.</strong></em>${attack} ${esc(a.description)}</p>`;
      }).join("")
    : "";

  return `
    <div style="font-size:0.85em;max-height:520px;overflow-y:auto;padding:4px 8px">
      <h3 style="margin:0 0 4px">${esc(stat.name)}</h3>
      <p style="color:#aaa;margin:0 0 6px;font-style:italic">
        ${esc(stat.size)} ${esc(stat.creatureType)}${stat.subtype ? ` (${esc(stat.subtype)})` : ""}, ${esc(stat.alignment)}
      </p>
      <hr style="border-color:#555;margin:4px 0">
      <table style="width:100%;border-collapse:collapse;margin-bottom:4px">
        ${row("CR", `${crToString(stat.cr)}`)}
        ${row("AC", `${stat.ac}${stat.acSource ? ` (${stat.acSource})` : ""}`)}
        ${row("HP", `${stat.hpMax} (${stat.hpFormula})`)}
        ${row("Speed", [
          stat.speedWalk ? `${stat.speedWalk} ft.` : "",
          stat.speedFly ? `fly ${stat.speedFly} ft.` : "",
          stat.speedSwim ? `swim ${stat.speedSwim} ft.` : "",
          stat.speedClimb ? `climb ${stat.speedClimb} ft.` : "",
          stat.speedBurrow ? `burrow ${stat.speedBurrow} ft.` : "",
        ].filter(Boolean).join(", "))}
      </table>
      <div style="display:grid;grid-template-columns:repeat(6,1fr);text-align:center;margin:6px 0;gap:2px">
        ${["STR","DEX","CON","INT","WIS","CHA"].map((a, i) => {
          const keys = ["str","dex","con","int","wis","cha"];
          const score = (stat as unknown as Record<string,number>)[keys[i]!]!;
          return `<div><div style="color:#aaa;font-size:0.8em">${a}</div><div>${score} (${mod(score)})</div></div>`;
        }).join("")}
      </div>
      <hr style="border-color:#555;margin:4px 0">
      <table style="width:100%;border-collapse:collapse;margin-bottom:4px">
        ${stat.savingThrows.length ? row("Saves", stat.savingThrows.map(s => `${s.charAt(0).toUpperCase() + s.slice(1)} ${mod((stat as unknown as Record<string,number>)[s]!)}`).join(", ")) : ""}
        ${stat.skills.length ? row("Skills", stat.skills.join(", ")) : ""}
        ${row("Senses", stat.senses)}
        ${row("Languages", stat.languages)}
        ${stat.damageImmunities ? row("Immunities", stat.damageImmunities) : ""}
        ${stat.damageResistances ? row("Resistances", stat.damageResistances) : ""}
        ${stat.conditionImmunities ? row("Cond. Imm.", stat.conditionImmunities) : ""}
      </table>
      ${stat.biography ? `<p style="margin:4px 0;color:#bbb;font-style:italic">${esc(stat.biography)}</p>` : ""}
      <hr style="border-color:#555;margin:4px 0">
      ${features(stat.traits, "Traits")}
      ${actionsHtml}
      ${features(stat.bonusActions, "Bonus Actions")}
      ${features(stat.reactions, "Reactions")}
      ${features(stat.legendaryActions, "Legendary Actions")}
    </div>`;
}

// ---------------------------------------------------------------------------
// Main flow
// ---------------------------------------------------------------------------

async function showNpcStatBlockDialog(): Promise<void> {
  const world = game.world;
  const worldName = world?.title ?? "Unknown World";

  const content = `
    <form class="lorebridge-config-form" style="padding:0.5rem">
      <div class="form-group">
        <label>NPC Description <span style="color:#f66">*</span></label>
        <input name="description" type="text" placeholder="e.g. A veteran dwarven guard who lost an eye in battle" style="width:100%">
        <p class="hint" style="font-size:0.8em;color:#888">Describe the NPC's role, personality, and background.</p>
      </div>
      <div class="form-group" style="margin-top:0.5rem">
        <label>Target CR (optional)</label>
        <select name="cr">
          <option value="">Auto</option>
          <option value="0">0</option>
          <option value="0.125">1/8</option>
          <option value="0.25">1/4</option>
          <option value="0.5">1/2</option>
          ${[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20].map(n => `<option value="${n}">${n}</option>`).join("")}
        </select>
      </div>
      <div class="form-group" style="margin-top:0.5rem">
        <label>Tone</label>
        <select name="tone">
          <option value="neutral">Neutral</option>
          <option value="gothic">Gothic</option>
          <option value="heroic">Heroic</option>
          <option value="mysterious">Mysterious</option>
          <option value="gritty">Gritty</option>
        </select>
      </div>
      <div class="form-group" style="margin-top:0.5rem">
        <label>Rules Edition</label>
        <select name="edition">
          <option value="modern">Modern Rules (2024)</option>
          <option value="legacy">Legacy Rules (2014)</option>
        </select>
      </div>
    </form>
  `;

  new foundry.applications.api.DialogV2({
    window: { title: "LoreBridge — Generate NPC Stat Block", resizable: false },
    position: { width: 440 },
    content,
    buttons: [
      {
        action: "generate",
        label: "Generate",
        icon: "fas fa-magic",
        callback: (_event: Event, _button: HTMLElement, dialog: unknown) => {
          const form = (dialog as { element?: HTMLElement }).element?.querySelector("form");
          if (!form) return;
          const data = new FormData(form);
          const description = (data.get("description") as string ?? "").trim();
          const crRaw = data.get("cr") as string;
          const cr = crRaw ? parseFloat(crRaw) : undefined;
          const tone = data.get("tone") as string;
          const edition = (data.get("edition") as string) === "legacy" ? "legacy" : "modern";

          if (!description) {
            ui.notifications.warn("LoreBridge: Please enter an NPC description.");
            return;
          }

          void runNpcStatBlock({ description, cr, tone, worldName, edition });
        },
      },
      {
        action: "cancel",
        label: "Cancel",
        icon: "fas fa-times",
        default: true,
      },
    ],
  }).render({ force: true });
}

type StatBlockInput = { description: string; cr: number | undefined; tone: string; worldName: string; edition: RulesEdition };

async function runNpcStatBlock(input: StatBlockInput): Promise<void> {
  ui.notifications.info("LoreBridge: Generating NPC stat block…");

  let stat: NpcStatBlockResult;
  try {
    stat = await postBackend<NpcStatBlockResult>("v1/generate/npc-statblock", {
      description: input.description,
      cr: input.cr,
      tone: input.tone,
      worldName: input.worldName,
    });
  } catch (err) {
    ui.notifications.error(`LoreBridge: ${err instanceof Error ? err.message : "Stat block generation failed."}`);
    return;
  }

  void addHistoryEntry({
    type: "npc-statblock",
    label: `NPC Stat Block — ${stat.name}`,
    prompt: `${input.description}${input.cr != null ? ` | CR ${crToString(input.cr)}` : ""} | ${input.tone} | ${input.edition}`,
    content: JSON.stringify(stat, null, 2),
  });

  showStatBlockPreview(stat, input.edition);
}

function showStatBlockPreview(stat: NpcStatBlockResult, edition: RulesEdition): void {
  new foundry.applications.api.DialogV2({
    window: { title: `${stat.name} — Stat Block Preview`, resizable: true },
    position: { width: 560, height: "auto" },
    content: buildPreviewHtml(stat),
    buttons: [
      {
        action: "create",
        label: "Create Actor",
        icon: "fas fa-user-plus",
        callback: () => { void createNpcActor(stat, edition); },
      },
      {
        action: "close",
        label: "Close",
        icon: "fas fa-times",
        default: true,
      },
    ],
  }).render({ force: true });
}

async function createNpcActor(stat: NpcStatBlockResult, edition: RulesEdition): Promise<void> {
  ui.notifications.info(`LoreBridge: Creating actor "${stat.name}"…`);

  try {
    // Ensure an "LoreBridge NPCs" folder exists (or reuse it)
    let folder: FoundryFolderDocument | undefined;
    for (const f of game.folders) {
      if (f.type === "Actor" && f.name === "LoreBridge NPCs") {
        folder = f;
        break;
      }
    }
    if (!folder) {
      folder = await Folder.create({ name: "LoreBridge NPCs", type: "Actor" });
    }

    const actorData: Record<string, unknown> = {
      ...buildDnd5eActorData(stat, edition),
      folder: folder?.id ?? null,
      items: await buildEmbeddedItems(stat, edition),
    };

    const actor = await Actor.create(actorData);
    if (!actor) {
      ui.notifications.error("LoreBridge: Actor creation returned no document.");
      return;
    }

    ui.notifications.info(`LoreBridge: Created NPC actor "${actor.name}".`);
  } catch (err) {
    ui.notifications.error(`LoreBridge: ${err instanceof Error ? err.message : "Actor creation failed."}`);
  }
}

// ---------------------------------------------------------------------------
// Actors sidebar button
// ---------------------------------------------------------------------------

export function injectActorsSidebarButton(frame: HTMLElement, app?: unknown): void {
  if (frame.querySelector("[data-lb-btn='generate-npc']")) return;

  // Detect the Create Actor dialog by its window title — reliable and specific.
  // The activity type picker, item dialogs, etc. all have different titles.
  const windowTitle = (
    frame.querySelector(".window-title, header .title, .app-title")?.textContent ?? ""
  ).trim().toLowerCase();
  if (!windowTitle.includes("create actor") && !windowTitle.includes("new actor")) return;

  // Find the footer row (Folder selector + Create Actor button) to insert before it
  const footer = frame.querySelector<HTMLElement>(".form-footer, .dialog-buttons");
  const insertTarget = footer ?? frame.querySelector<HTMLElement>(".window-content");
  if (!insertTarget) return;

  const btn = document.createElement("button");
  btn.type = "button";
  btn.dataset["lbBtn"] = "generate-npc";
  btn.style.cssText = "width:100%;margin-bottom:6px;";
  btn.innerHTML = '<i class="fas fa-dragon"></i> Generate Full Stat Block with AI';
  btn.addEventListener("click", () => {
    void (app as { close?: () => Promise<unknown> })?.close?.();
    void showNpcStatBlockDialog();
  });

  // Insert above the footer (Folder / Create Actor row)
  if (footer) {
    footer.insertAdjacentElement("beforebegin", btn);
  } else {
    insertTarget.appendChild(btn);
  }
}
