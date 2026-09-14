import { getLoreBridgeSettings } from "../settings.js";

const MODULE_ID = "lorebridge";

async function callCombatFlavor(ctx: {
  attackerName: string;
  targetName: string;
  damage: number;
  isCrit: boolean;
  isFumble: boolean;
  isKillingBlow: boolean;
  style: string;
}): Promise<string> {
  const settings = getLoreBridgeSettings();
  if (!settings.backendUrl || !settings.clientToken) {
    throw new Error("LoreBridge backend is not configured or paired.");
  }
  const base = settings.backendUrl.endsWith("/") ? settings.backendUrl : `${settings.backendUrl}/`;
  const response = await fetch(`${base}v1/generate/combat-flavor`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${settings.clientToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(ctx),
  });
  if (!response.ok) {
    const err = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(err?.error?.message ?? `Backend error ${response.status}`);
  }
  const data = (await response.json()) as { flavor: string };
  return data.flavor;
}

type DiceResult = { active?: boolean; discarded?: boolean; rerolled?: boolean; result: number };
type AttackRoll = { dice?: Array<{ faces?: number; results?: DiceResult[] }> };
type PendingCritical = { expiresAt: number };

const pendingCriticals = new Map<string, PendingCritical>();
const CRITICAL_RESULT_TTL_MS = 2_000;

export function getAttackOutcome(rolls: unknown): "critical" | "fumble" | undefined {
  if (!Array.isArray(rolls)) return undefined;
  for (const roll of rolls as AttackRoll[]) {
    for (const die of roll.dice ?? []) {
      if (die.faces !== 20) continue;
      for (const result of die.results ?? []) {
        if (result.active === false || result.discarded || result.rerolled) continue;
        if (result.result === 20) return "critical";
        if (result.result === 1) return "fumble";
      }
    }
  }
  return undefined;
}

function combatActorId(actor: FoundryActor | undefined): string | undefined {
  const id = (actor as { id?: unknown } | undefined)?.id;
  return typeof id === "string" && id.length > 0 ? id : undefined;
}

function isEligibleNarratorAttack(attacker: FoundryActor | undefined): boolean {
  const settings = getLoreBridgeSettings();
  if (settings.combatNarratorMode === "off") return false;
  if (settings.combatNarratorMode !== "npcs-only") return true;
  const ownership = attacker?.ownership ?? {};
  return Boolean(attacker) && !Object.entries(ownership).some(
    ([userId, level]) => userId !== "default" && level === 3,
  );
}

async function postNarration(ctx: {
  attackerName: string;
  targetName: string;
  damage: number;
  isCrit: boolean;
  isFumble: boolean;
  isKillingBlow: boolean;
  style: string;
}): Promise<void> {
  const flavor = await callCombatFlavor(ctx);
  await ChatMessage.create({
    content: `<div class="lb-combat-narrator"><em>${flavor}</em></div>`,
    speaker: { alias: "Narrator" },
    flags: { [MODULE_ID]: { type: "combat-narrator", attackerName: ctx.attackerName, targetName: ctx.targetName } },
  });
  void playTts(flavor).catch((err: unknown) => {
    console.warn("LoreBridge | Combat narrator TTS failed:", err);
  });
}

async function playTts(text: string): Promise<void> {
  const settings = getLoreBridgeSettings();
  const voiceId = settings.combatNarratorVoiceId;
  if (!voiceId || !settings.backendUrl || !settings.clientToken) return;

  const base = settings.backendUrl.endsWith("/") ? settings.backendUrl : `${settings.backendUrl}/`;
  const response = await fetch(`${base}v1/tts/speak`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${settings.clientToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ text, voiceId }),
  });
  if (!response.ok) return;
  const data = (await response.json()) as { audio: string; mimeType: string };
  const audio = new Audio(`data:${data.mimeType};base64,${data.audio}`);
  audio.volume = (game.settings?.get?.("core", "globalAmbientVolume") as number | undefined) ?? 1;
  await audio.play();
}

function narratorName(actor: FoundryActor | undefined, fallbackName: string): string {
  const name = (actor as { name?: string } | undefined)?.name ?? fallbackName;
  const ownership = actor?.ownership ?? {};
  const isPlayerOwned = Object.entries(ownership).some(([userId, level]) => {
    if (userId === "default" || level !== 3) return false;
    const user = (game.users as Iterable<{ id: string; isGM: boolean }> | undefined);
    const found = user ? [...user].find(u => u.id === userId) : undefined;
    return found !== undefined && !found.isGM;
  });
  return isPlayerOwned ? name.split(" ")[0] ?? name : name;
}

async function handleActorUpdate(
  targetActor: FoundryActor,
  changes: Record<string, unknown>,
  _options: Record<string, unknown>,
): Promise<void> {
  if (!game.user?.isGM) return;

  // Only fire during active combat
  const combat = game.combats?.active;
  if (!combat?.active) return;

  if (!isEligibleNarratorAttack(combat.combatant?.actor ?? undefined)) return;

  // Extract HP delta from nested change path: system.attributes.hp.value
  const newHp = (
    (changes as { system?: { attributes?: { hp?: { value?: number } } } })
      ?.system?.attributes?.hp?.value
  );
  if (newHp === undefined) return;

  const currentHp = (
    (targetActor.system as { attributes?: { hp?: { value?: number } } })
      ?.attributes?.hp?.value
  ) ?? newHp;

  const damage = currentHp - newHp;
  if (damage <= 0) return; // healing or no change

  // Attacker = combatant whose turn it currently is
  const attacker = combat.combatant?.actor ?? undefined;

  const isKillingBlow = newHp <= 0;
  const attackerName = narratorName(attacker, "Unknown");
  const targetName = narratorName(targetActor, "Unknown");
  const style = getLoreBridgeSettings().combatNarratorStyle;
  const attackerId = combatActorId(attacker);
  const pendingCritical = attackerId ? pendingCriticals.get(attackerId) : undefined;
  const isCrit = Boolean(pendingCritical && pendingCritical.expiresAt >= Date.now());
  if (attackerId) pendingCriticals.delete(attackerId);

  try {
    await postNarration({ attackerName, targetName, damage, isCrit, isFumble: false, isKillingBlow, style });
  } catch (err) {
    ui.notifications.warn(
      `LoreBridge Combat Narrator: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

async function handleAttackRoll(rolls: unknown, data: unknown): Promise<void> {
  if (!game.user?.isGM) return;
  const combat = game.combats?.active;
  if (!combat?.active) return;

  const subject = (data as { subject?: { actor?: FoundryActor; item?: { actor?: FoundryActor } } } | undefined)?.subject;
  const attacker = subject?.actor ?? subject?.item?.actor;
  if (!attacker || !isEligibleNarratorAttack(attacker)) return;
  const outcome = getAttackOutcome(rolls);
  if (!outcome) return;

  if (outcome === "critical") {
    const attackerId = combatActorId(attacker);
    if (attackerId) pendingCriticals.set(attackerId, { expiresAt: Date.now() + CRITICAL_RESULT_TTL_MS });
    return;
  }

  try {
    await postNarration({
      attackerName: narratorName(attacker, "Unknown"),
      targetName: "",
      damage: 0,
      isCrit: false,
      isFumble: true,
      isKillingBlow: false,
      style: getLoreBridgeSettings().combatNarratorStyle,
    });
  } catch (err) {
    ui.notifications.warn(
      `LoreBridge Combat Narrator: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

export function registerCombatNarratorHook(): void {
  const style = document.createElement("style");
  style.id = "lb-combat-narrator-style";
  if (!document.getElementById("lb-combat-narrator-style")) {
    style.textContent = `
      .lb-combat-narrator {
        padding: 8px 14px;
        background: rgba(139, 32, 32, 0.08);
        border-left: 3px solid #8b2020;
        border-radius: 0 4px 4px 0;
        font-family: Georgia, serif;
        font-style: italic;
        font-size: 0.95em;
        line-height: 1.5;
      }
    `;
    document.head.appendChild(style);
  }

  // preUpdateActor: actor still holds old HP, changes holds the incoming new value
  Hooks.on("preUpdateActor", (actor: unknown, changes: unknown, options: unknown) => {
    void handleActorUpdate(
      actor as FoundryActor,
      changes as Record<string, unknown>,
      options as Record<string, unknown>,
    );
  });
  Hooks.on("dnd5e.postRollAttack", (rolls: unknown, data: unknown) => {
    void handleAttackRoll(rolls, data);
  });
}
