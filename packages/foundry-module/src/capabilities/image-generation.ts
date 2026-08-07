import { getLoreBridgeSettings } from "../settings.js";

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

type ImageResult = { base64: string; mimeType: string; prompt: string };

async function saveImageToFoundry(base64: string, mimeType: string, filename: string, uploadDir: string): Promise<string> {
  const ext = mimeType === "image/webp" ? "webp" : mimeType === "image/jpeg" ? "jpg" : "png";
  const fname = `${filename}.${ext}`;

  const bytes = atob(base64);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  const blob = new Blob([arr], { type: mimeType });
  const file = new File([blob], fname, { type: mimeType });

  const fp = foundry.applications.apps.FilePicker.implementation;
  try { await fp.createDirectory("data", uploadDir); } catch { /* already exists */ }

  const result = await fp.upload("data", uploadDir, file, {});
  if (!result || !result.path) throw new Error("File upload failed — no path returned.");
  return result.path;
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "npc";
}

// ---------------------------------------------------------------------------
// Art style presets — each label maps to a full prompt string.
// Add, remove, or tune entries here without changing any other code.
// ---------------------------------------------------------------------------

type StylePreset = { label: string; value: string };

const STYLE_OPTIONS: StylePreset[] = [
  // Default — classic D&D illustrated look
  { label: "D&D 5E",                 value: "official Dungeons and Dragons 5th edition art style, painterly digital illustration, warm rich colors, heroic fantasy portrait, expressive face, detailed costume and equipment, Wizards of the Coast PHB aesthetic, illustrative not photorealistic" },
  // Classic Fantasy
  { label: "Heroic Fantasy",         value: "heroic fantasy illustration, bold vibrant colors, painterly brushwork, dynamic epic composition, triumphant pose, adventure art, not photorealistic" },
  { label: "Fantasy Portrait",       value: "fantasy character portrait, detailed painterly digital illustration, dramatic lighting, high fantasy, vibrant warm colors, illustrative style" },
  { label: "Magic: The Gathering",   value: "Magic the Gathering card art style, dramatic painterly fantasy illustration, rich deep jewel-toned colors, detailed fine brushwork, trading card game art, cinematic composition" },
  { label: "Pathfinder",             value: "Pathfinder RPG official art style, detailed painterly fantasy illustration, dynamic action pose, rich warm colors, Paizo publishing aesthetic, illustrative not photorealistic" },
  { label: "Monster Manual",         value: "D&D Monster Manual illustration style, official tabletop RPG inked and painted art, detailed creature or character portrait, dramatic pose, clean linework with watercolor-style fill" },
  // Painted & Artistic
  { label: "Oil Painting",           value: "classical oil painting portrait, Renaissance style, rich deep colors, dramatic chiaroscuro lighting, museum quality fine art, old master technique" },
  { label: "Digital Painting",       value: "digital painting fantasy portrait, painterly expressive brushwork, vibrant colors, detailed illustration, professional concept art quality" },
  { label: "Watercolor",             value: "watercolor fantasy illustration, soft color washes, delicate linework, storybook quality, gentle atmospheric colors" },
  { label: "Concept Art",            value: "RPG character concept art, professional game art, clear neutral pose, detailed character design reference sheet, high fidelity painterly illustration" },
  // Storybook & Whimsical
  { label: "Storybook",              value: "storybook fantasy illustration, charming fairy tale art style, warm inviting colors, enchanting atmosphere, classic children's book quality" },
  { label: "Character Card",         value: "fantasy RPG character card portrait, framed composition, rich detailed painterly illustration, trading card game art style, heroic pose" },
  // Realism
  { label: "Cinematic Realism",      value: "cinematic realistic fantasy portrait, photorealistic quality, movie lighting, detailed face, dramatic composition, film production art" },
  { label: "Hyper Realistic",        value: "hyperrealistic fantasy portrait, extreme fine detail, photographic quality, studio lighting, realistic skin texture and materials" },
  { label: "Epic Fantasy",           value: "epic fantasy art, grand scale cinematic composition, high detail, dramatic lighting, photorealistic fantasy illustration" },
  // Dark Fantasy
  { label: "Dark Fantasy",           value: "dark fantasy portrait, moody brooding atmosphere, dramatic shadows, gritty details, painterly illustration, atmospheric fog and candlelight" },
  { label: "Gothic Horror",          value: "gothic horror portrait, candlelight, deep dramatic shadows, haunting expression, Victorian gothic aesthetic, horror atmosphere, painterly illustration" },
  { label: "Grimdark",               value: "grimdark fantasy portrait, brutal realism, weathered scarred face, blood-stained armor, dark oppressive atmosphere, Warhammer 40K inspired" },
  { label: "Bloodborne",             value: "Bloodborne game art style, dark gothic Victorian horror, eldritch cosmic nightmare aesthetic, Hunter's nightmare atmosphere, grim ultra-detailed portrait" },
  { label: "Diablo",                 value: "Diablo game art style, dark demonic fantasy portrait, gritty dramatic illustration, infernal lighting, gothic horror action, Blizzard aesthetic" },
];

// ---------------------------------------------------------------------------
// Dialog
// ---------------------------------------------------------------------------

export async function runImageGeneration(actor: { id: string; name: string; system: Record<string, unknown>; img?: string; getFlag?: (scope: string, key: string) => unknown }): Promise<void> {
  const name = actor.name;
  const system = actor.system;

  // Read portrait description: flag first (set by NPC Profile), then
  // fall back to extracting the Appearance line from biography HTML.
  let savedDescription = typeof actor.getFlag?.("lorebridge", "portraitDescription") === "string"
    ? (actor.getFlag("lorebridge", "portraitDescription") as string).trim()
    : "";

  if (!savedDescription) {
    const bio = (system["details"] as Record<string, unknown> | undefined)?.["biography"] as Record<string, unknown> | undefined;
    const bioHtml = typeof bio?.["value"] === "string" ? bio["value"] : "";
    const match = bioHtml.match(/<strong>Appearance:<\/strong>\s*([^<]+)/i);
    if (match?.[1]) savedDescription = match[1].trim();
  }

  const creatureType = (system["details"] as Record<string, unknown> | undefined)?.["type"] as Record<string, unknown> | undefined;
  const typeLabel = typeof creatureType?.["value"] === "string" ? creatureType["value"] : "";

  const styleSelect = STYLE_OPTIONS.map(o => `<option value="${o.value}">${o.label}</option>`).join("");

  const hintText = savedDescription ? "Pre-filled from NPC Profile — edit as needed." : "Clothing, expression, background setting, notable features.";
  const ROW = "flex-shrink:0;display:flex;flex-direction:column;gap:2px;";
  const LBL = "font-weight:bold;display:block;width:100%;margin:0 0 2px;";
  const HINT = "font-size:0.8em;color:#888;margin:2px 0 0;display:block;";
  const INPUT = "width:100%;box-sizing:border-box;display:block;";

  const content = `
    <style>
      .lb-portrait-dialog .window-content { display:flex !important; flex-direction:column !important; overflow:hidden !important; padding:0 !important; }
      .lb-portrait-form { flex:1; min-height:0; display:flex; flex-direction:column; padding:0.75rem; box-sizing:border-box; gap:0.6rem; overflow:hidden; }
    </style>
    <form class="lb-portrait-form">
      <div style="${ROW}">
        <label style="${LBL}">Subject / Description</label>
        <input name="subject" type="text" value="${name.replace(/"/g, "&quot;")}" style="${INPUT}">
        <span style="${HINT}">Edit the name or add physical details (race, hair, build, age…).</span>
      </div>
      <div style="flex:1;min-height:0;display:flex;flex-direction:column;gap:2px;">
        <label style="${LBL}">Additional Context</label>
        <textarea name="context" style="flex:1;min-height:160px;width:100%;box-sizing:border-box;display:block;resize:vertical;">${savedDescription.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</textarea>
        <span style="${HINT}">${hintText}</span>
      </div>
      <div style="${ROW}">
        <label style="${LBL}">Art Style</label>
        <select name="style" style="${INPUT}">${styleSelect}</select>
      </div>
    </form>`;

  new foundry.applications.api.DialogV2({
    classes: ["lb-portrait-dialog"],
    window: { title: `LoreBridge — Generate Portrait: ${name}`, resizable: true },
    position: { width: 520, height: 480 },
    content,
    buttons: [
      {
        action: "generate",
        label: "Generate",
        icon: "fas fa-image",
        callback: (_event: Event, _button: HTMLElement, dialog: unknown) => {
          const form = (dialog as { element?: HTMLElement }).element?.querySelector("form");
          if (!form) return;
          const data = new FormData(form);
          const subject = (data.get("subject") as string ?? "").trim() || name;
          const context = (data.get("context") as string ?? "").trim();
          const style = data.get("style") as string ?? "";
          void generateAndPreview(actor, subject, context, style, typeLabel);
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

async function generateAndPreview(
  actor: { id: string; name: string; img?: string },
  subject: string,
  context: string,
  style: string,
  typeLabel: string,
): Promise<void> {
  ui.notifications.info("LoreBridge: Generating portrait… (this may take up to 30 seconds)");
  let result: ImageResult;
  try {
    result = await postBackend<ImageResult>("v1/generate/image", {
      subject: typeLabel ? `${subject} (${typeLabel})` : subject,
      context,
      style,
    });
  } catch (err) {
    ui.notifications.error(`LoreBridge: ${err instanceof Error ? err.message : "Image generation failed."}`);
    return;
  }

  const dataUrl = `data:${result.mimeType};base64,${result.base64}`;

  const previewContent = `
    <div style="text-align:center;padding:8px">
      <img src="${dataUrl}" style="max-width:100%;max-height:480px;border-radius:4px;border:1px solid #555" alt="Generated portrait">
      <p style="margin:8px 0 0;font-size:0.8em;color:#888;font-style:italic">
        ${result.prompt.replace(/</g, "&lt;").replace(/>/g, "&gt;")}
      </p>
    </div>`;

  new foundry.applications.api.DialogV2({
    window: { title: `${actor.name} — Portrait Preview`, resizable: true },
    position: { width: 560, height: "auto" },
    content: previewContent,
    buttons: [
      {
        action: "apply",
        label: "Apply as Portrait",
        icon: "fas fa-check",
        callback: () => { void applyPortrait(actor, result.base64, result.mimeType); },
      },
      {
        action: "regenerate",
        label: "Regenerate",
        icon: "fas fa-redo",
        callback: () => { void generateAndPreview(actor, subject, context, style, typeLabel); },
      },
      {
        action: "close",
        label: "Discard",
        icon: "fas fa-times",
        default: true,
      },
    ],
  }).render({ force: true });
}

async function applyPortrait(
  actor: { id: string; name: string },
  base64: string,
  mimeType: string,
): Promise<void> {
  ui.notifications.info("LoreBridge: Saving portrait…");
  try {
    const settings = getLoreBridgeSettings();
    const uploadDir = settings.portraitSaveDirectory || "modules/lorebridge/images";
    const slug = slugify(actor.name);
    const filename = `${slug}-${Date.now()}`;
    const path = await saveImageToFoundry(base64, mimeType, filename, uploadDir);

    const foundryActor = game.actors.get(actor.id);
    if (!foundryActor) { ui.notifications.error("LoreBridge: Actor not found."); return; }
    await foundryActor.update({ img: path, "prototypeToken.texture.src": path });
    ui.notifications.info(`LoreBridge: Portrait applied to ${actor.name}.`);
  } catch (err) {
    ui.notifications.error(`LoreBridge: ${err instanceof Error ? err.message : "Failed to save portrait."}`);
  }
}

// ---------------------------------------------------------------------------
// ⋮ menu registration — mirrors registerNpcPreambleSheetHook pattern
// ---------------------------------------------------------------------------

export function registerPortraitMenuHook(): void {
  Hooks.on("getHeaderControlsActorSheetV2", (...args: unknown[]) => {
    const [app, controls] = args as [{ document?: FoundryActor }, unknown[]];
    if (!game.user?.isGM) return;
    const actor = app.document;
    if (!actor) return;
    if ((controls as Array<{ class?: string }>).some(c => c.class === "lorebridge-generate-portrait")) return;
    controls.push({
      label: "Generate Portrait with AI",
      class: "lorebridge-generate-portrait",
      icon: "fas fa-portrait",
      onClick: () => {
        void runImageGeneration(actor as unknown as { id: string; name: string; system: Record<string, unknown>; img?: string; getFlag?: (scope: string, key: string) => unknown });
      },
    });
  });
}
