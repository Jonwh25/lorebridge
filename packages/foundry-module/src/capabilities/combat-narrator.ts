import { getLoreBridgeSettings } from "../settings.js";

const MODULE_ID = "lorebridge";

async function callCombatFlavor(ctx: {
  attackerName: string;
  targetName: string;
  damage: number;
  isCrit: boolean;
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

async function playTts(actor: FoundryActor, text: string): Promise<void> {
  const settings = getLoreBridgeSettings();
  const actorVoiceId = (actor.getFlag(MODULE_ID, "voiceId") as string | undefined) ?? "";
  const voiceId = actorVoiceId || settings.ttsDefaultVoiceId;
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

async function handleActorUpdate(
  targetActor: FoundryActor,
  changes: Record<string, unknown>,
  _options: Record<string, unknown>,
): Promise<void> {
  if (!game.user?.isGM) return;

  // Only fire during active combat
  const combat = game.combats?.active;
  if (!combat?.active) return;

  const settings = getLoreBridgeSettings();
  const mode = settings.combatNarratorMode;
  if (mode === "off") return;

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

  if (mode === "npcs-only") {
    const ownership = attacker?.ownership ?? {};
    const isPlayerOwned = Object.entries(ownership).some(
      ([userId, level]) => userId !== "default" && level === 3,
    );
    if (!attacker || isPlayerOwned) return;
  }

  const attackerName = attacker?.name ?? "Unknown";
  const targetName = (targetActor as { name?: string }).name ?? "Unknown";
  const style = settings.combatNarratorStyle;

  try {
    const flavor = await callCombatFlavor({ attackerName, targetName, damage, isCrit: false, style });

    await ChatMessage.create({
      content: `<div class="lb-combat-narrator"><em>${flavor}</em></div>`,
      speaker: { alias: "Narrator" },
      flags: { [MODULE_ID]: { type: "combat-narrator", attackerName, targetName } },
    });

    if (attacker) {
      void playTts(attacker, flavor).catch((err: unknown) => {
        console.warn("LoreBridge | Combat narrator TTS failed:", err);
      });
    }
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
}
