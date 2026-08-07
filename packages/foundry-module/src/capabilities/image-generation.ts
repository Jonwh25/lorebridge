import { getLoreBridgeSettings } from "../settings.js";

const UPLOAD_DIR = "modules/lorebridge/images";

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

async function saveImageToFoundry(base64: string, mimeType: string, filename: string): Promise<string> {
  const ext = mimeType === "image/webp" ? "webp" : mimeType === "image/jpeg" ? "jpg" : "png";
  const fname = `${filename}.${ext}`;

  const bytes = atob(base64);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  const blob = new Blob([arr], { type: mimeType });
  const file = new File([blob], fname, { type: mimeType });

  try { await FilePicker.browse("data", UPLOAD_DIR); } catch { /* created on upload */ }

  const result = await FilePicker.upload("data", UPLOAD_DIR, file, {});
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
  // Classic Fantasy
  { label: "Fantasy Portrait",       value: "fantasy character portrait, detailed digital illustration, dramatic lighting, high fantasy, D&D official art style, vibrant colors" },
  { label: "Heroic Fantasy",         value: "heroic fantasy illustration, bold vibrant colors, dynamic epic composition, triumphant pose, adventure art" },
  { label: "Epic Fantasy",           value: "epic fantasy art, grand scale cinematic composition, high detail, dramatic lighting, fantasy illustration" },
  { label: "D&D 5E",                 value: "Dungeons and Dragons 5th edition official art style, vibrant fantasy illustration, clean lines, heroic composition, Wizards of the Coast aesthetic" },
  { label: "Magic: The Gathering",   value: "Magic the Gathering card art style, fantasy illustration, dramatic lighting, rich deep colors, detailed painterly style, trading card game art" },
  { label: "Pathfinder",             value: "Pathfinder RPG art style, detailed fantasy illustration, dynamic pose, rich warm colors, Paizo publishing aesthetic" },
  // Realism
  { label: "Cinematic Realism",      value: "cinematic realistic fantasy portrait, photorealistic quality, movie lighting, detailed face, dramatic composition, film production art" },
  { label: "Hyper Realistic",        value: "hyperrealistic fantasy portrait, extreme fine detail, photographic quality, studio lighting, realistic skin texture and materials" },
  { label: "Oil Painting",           value: "classical oil painting portrait, Renaissance style, rich deep colors, dramatic chiaroscuro lighting, museum quality fine art, old master technique" },
  // Dark Fantasy
  { label: "Dark Fantasy",           value: "dark fantasy portrait, moody brooding atmosphere, dramatic shadows, gritty details, atmospheric fog and candlelight" },
  { label: "Gothic Horror",          value: "gothic horror portrait, candlelight, deep dramatic shadows, haunting expression, Victorian gothic aesthetic, horror atmosphere" },
  { label: "Grimdark",               value: "grimdark fantasy portrait, brutal realism, weathered scarred face, blood-stained armor, dark oppressive atmosphere, Warhammer 40K inspired" },
  { label: "Bloodborne",             value: "Bloodborne game art style, dark gothic Victorian horror, eldritch cosmic nightmare aesthetic, Hunter's nightmare atmosphere, grim ultra-detailed portrait" },
  { label: "Diablo",                 value: "Diablo game art style, dark demonic fantasy portrait, gritty dramatic illustration, infernal lighting, gothic horror action, Blizzard aesthetic" },
  // Stylized & Illustrated
  { label: "Digital Painting",       value: "digital painting fantasy portrait, painterly expressive brushwork, vibrant colors, detailed illustration, professional concept art quality" },
  { label: "Concept Art",           value: "RPG character concept art, professional game art, clear neutral pose, detailed character design reference sheet, high fidelity illustration" },
  { label: "Watercolor",             value: "watercolor fantasy illustration, soft color washes, delicate linework, storybook quality, gentle atmospheric colors" },
  { label: "Storybook",              value: "storybook fantasy illustration, charming fairy tale art style, warm inviting colors, enchanting atmosphere, classic children's book quality" },
  // Tabletop Inspired
  { label: "Monster Manual",         value: "D&D Monster Manual illustration style, official tabletop RPG art, detailed creature or character portrait, dramatic pose, inked fantasy illustration" },
  { label: "Character Card",         value: "fantasy RPG character card portrait, framed composition, rich detailed illustration, trading card game art style, heroic pose" },
];

// ---------------------------------------------------------------------------
// Dialog
// ---------------------------------------------------------------------------

export async function runImageGeneration(actor: { id: string; name: string; system: Record<string, unknown>; img?: string; getFlag?: (scope: string, key: string) => unknown }): Promise<void> {
  const name = actor.name;
  const system = actor.system;

  // Read the portrait description flag saved by NPC Profile generation.
  // Falls back to empty — the DM can fill in the context field manually.
  const savedDescription = typeof actor.getFlag?.("lorebridge", "portraitDescription") === "string"
    ? (actor.getFlag("lorebridge", "portraitDescription") as string).trim()
    : "";

  const creatureType = (system["details"] as Record<string, unknown> | undefined)?.["type"] as Record<string, unknown> | undefined;
  const typeLabel = typeof creatureType?.["value"] === "string" ? creatureType["value"] : "";

  const styleSelect = STYLE_OPTIONS.map(o => `<option value="${o.value}">${o.label}</option>`).join("");

  const content = `
    <style>
      .lb-portrait-form { display:flex; flex-direction:column; height:100%; padding:0.75rem; box-sizing:border-box; gap:0.5rem; overflow:hidden; }
      .lb-portrait-form .lb-field-fixed { flex-shrink:0; display:flex; flex-direction:column; gap:2px; }
      .lb-portrait-form .lb-field-grow { flex:1; min-height:0; display:flex; flex-direction:column; gap:2px; }
      .lb-portrait-form .lb-field-grow textarea { flex:1; min-height:60px; width:100%; box-sizing:border-box; resize:none; }
      .lb-portrait-form .lb-hint { font-size:0.8em; color:#888; margin:0; }
      .lb-portrait-form label { font-weight:bold; }
      .lb-portrait-form input, .lb-portrait-form select { width:100%; box-sizing:border-box; }
    </style>
    <form class="lb-portrait-form">
      <div class="lb-field-fixed">
        <label>Subject / Description</label>
        <input name="subject" type="text" value="${name.replace(/"/g, "&quot;")}">
        <p class="lb-hint">Edit the name or add physical details (race, hair, build, age…).</p>
      </div>
      <div class="lb-field-grow">
        <label>Additional Context</label>
        <textarea name="context">${savedDescription.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</textarea>
        <p class="lb-hint">${savedDescription ? "Pre-filled from NPC Profile — edit as needed." : "Clothing, expression, background setting, notable features."}</p>
      </div>
      <div class="lb-field-fixed">
        <label>Art Style</label>
        <select name="style">${styleSelect}</select>
      </div>
    </form>`;

  new foundry.applications.api.DialogV2({
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
    const slug = slugify(actor.name);
    const filename = `${slug}-${Date.now()}`;
    const path = await saveImageToFoundry(base64, mimeType, filename);

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
