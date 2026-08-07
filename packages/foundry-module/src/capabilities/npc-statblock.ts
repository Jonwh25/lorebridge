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

function buildDnd5eActorData(stat: NpcStatBlockResult): Record<string, unknown> {
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

// Build embedded item data for actions, traits, bonus actions, reactions
function buildEmbeddedItems(stat: NpcStatBlockResult): Record<string, unknown>[] {
  const items: Record<string, unknown>[] = [];

  for (const trait of stat.traits) {
    items.push({
      name: trait.name,
      type: "feat",
      system: {
        description: { value: `<p>${trait.description}</p>` },
        activation: { type: "passive" },
      },
    });
  }

  for (const action of stat.actions) {
    const isAttack = action.attackBonus !== undefined;
    items.push({
      name: action.name,
      type: isAttack ? "weapon" : "feat",
      system: {
        description: { value: `<p>${action.description}</p>` },
        activation: { type: "action", cost: 1 },
        ...(isAttack ? {
          equipped: true,
          proficient: true,
          attackBonus: String(action.attackBonus ?? 0),
          damage: {
            parts: action.damage
              ? [[action.damage, action.damageType ?? "slashing"]]
              : [],
          },
          range: {
            value: action.range?.replace(/\s?ft\.?$/i, "") ?? null,
            units: "ft",
          },
        } : {}),
      },
    });
  }

  for (const ba of stat.bonusActions) {
    items.push({
      name: ba.name,
      type: "feat",
      system: {
        description: { value: `<p>${ba.description}</p>` },
        activation: { type: "bonus", cost: 1 },
      },
    });
  }

  for (const rx of stat.reactions) {
    items.push({
      name: rx.name,
      type: "feat",
      system: {
        description: { value: `<p>${rx.description}</p>` },
        activation: { type: "reaction", cost: 1 },
      },
    });
  }

  for (const la of stat.legendaryActions) {
    items.push({
      name: la.name,
      type: "feat",
      system: {
        description: { value: `<p>${la.description}</p>` },
        activation: { type: "legendary", cost: 1 },
      },
    });
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

          if (!description) {
            ui.notifications.warn("LoreBridge: Please enter an NPC description.");
            return;
          }

          void runNpcStatBlock({ description, cr, tone, worldName });
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

type StatBlockInput = { description: string; cr: number | undefined; tone: string; worldName: string };

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
    prompt: `${input.description}${input.cr != null ? ` | CR ${crToString(input.cr)}` : ""} | ${input.tone}`,
    content: JSON.stringify(stat, null, 2),
  });

  showStatBlockPreview(stat);
}

function showStatBlockPreview(stat: NpcStatBlockResult): void {
  new foundry.applications.api.DialogV2({
    window: { title: `${stat.name} — Stat Block Preview`, resizable: true },
    position: { width: 560, height: "auto" },
    content: buildPreviewHtml(stat),
    buttons: [
      {
        action: "create",
        label: "Create Actor",
        icon: "fas fa-user-plus",
        callback: () => { void createNpcActor(stat); },
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

async function createNpcActor(stat: NpcStatBlockResult): Promise<void> {
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
      ...buildDnd5eActorData(stat),
      folder: folder?.id ?? null,
      items: buildEmbeddedItems(stat),
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

  // Detect the Create Actor dialog by the presence of document-type radio options
  // and a create/submit button. Foundry v14 renders this as an ApplicationV2 dialog.
  const hasTypeList = Boolean(
    frame.querySelector(".document-type-select, .type-picker, [data-type], input[name='type']")
  );
  const hasCreateButton = Boolean(
    frame.querySelector("button[data-action='create'], button[data-action='submit'], .create-document")
      ?? Array.from(frame.querySelectorAll("button")).find(b => /create/i.test(b.textContent ?? ""))
  );
  if (!hasTypeList || !hasCreateButton) return;

  // Find the footer / button row to append our button beneath it
  const footer = frame.querySelector<HTMLElement>(".form-footer, .dialog-buttons")
    ?? frame.querySelector<HTMLElement>(".window-content");
  if (!footer) return;

  const btn = document.createElement("button");
  btn.type = "button";
  btn.dataset["lbBtn"] = "generate-npc";
  btn.style.cssText = "margin-top:6px;width:100%;";
  btn.innerHTML = '<i class="fas fa-dragon"></i> Generate Full Stat Block with AI';
  btn.addEventListener("click", () => {
    void (app as { close?: () => Promise<unknown> })?.close?.();
    void showNpcStatBlockDialog();
  });

  footer.appendChild(btn);
}
