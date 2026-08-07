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
// Art styles — RPG-appropriate options
// ---------------------------------------------------------------------------

const STYLE_OPTIONS = [
  { value: "D&D fantasy character portrait, detailed oil painting style, dramatic lighting, high fantasy", label: "D&D Fantasy Portrait" },
  { value: "dark gothic fantasy, moody atmosphere, candlelight, shadows, detailed illustration, gothic horror", label: "Dark Gothic" },
  { value: "heroic fantasy illustration, bold colors, dynamic pose, epic composition, adventure", label: "Heroic Fantasy" },
  { value: "gritty realistic fantasy, weathered, scarred, worn equipment, low fantasy, detailed face", label: "Gritty Realistic" },
  { value: "painterly watercolor fantasy illustration, soft colors, storybook art style", label: "Watercolor Storybook" },
  { value: "classic D&D module art, 1980s pen and ink illustration, black and white crosshatching", label: "Classic D&D Art" },
  { value: "Dungeons and Dragons 5e official art style, vibrant colors, clean lines, dramatic lighting", label: "5e Official Art Style" },
  { value: "villain portrait, menacing expression, dark robes, ominous magical energy, evil fantasy", label: "Villain / Dark Lord" },
  { value: "NPC concept art, character reference sheet style, neutral pose, clear features, RPG game art", label: "Concept / Reference" },
];

// ---------------------------------------------------------------------------
// Dialog
// ---------------------------------------------------------------------------

export async function runImageGeneration(actor: { id: string; name: string; system: Record<string, unknown>; img?: string }): Promise<void> {
  const name = actor.name;
  const system = actor.system;

  const bio = (system["details"] as Record<string, unknown> | undefined)?.["biography"] as Record<string, unknown> | undefined;
  const bioText = typeof bio?.["value"] === "string"
    ? bio["value"].replace(/<[^>]+>/g, "").trim().slice(0, 400)
    : "";

  const creatureType = (system["details"] as Record<string, unknown> | undefined)?.["type"] as Record<string, unknown> | undefined;
  const typeLabel = typeof creatureType?.["value"] === "string" ? creatureType["value"] : "";

  const styleSelect = STYLE_OPTIONS.map(o => `<option value="${o.value}">${o.label}</option>`).join("");

  const content = `
    <form class="lorebridge-config-form" style="padding:0.75rem;display:flex;flex-direction:column;gap:0.6rem">
      <div class="form-group">
        <label style="font-weight:bold">Subject / Description</label>
        <input name="subject" type="text" value="${name.replace(/"/g, "&quot;")}" style="width:100%">
        <p class="hint" style="font-size:0.8em;color:#888;margin:2px 0 0">Edit the name or add physical details (race, hair, build, age…).</p>
      </div>
      <div class="form-group">
        <label style="font-weight:bold">Additional Context</label>
        <textarea name="context" rows="6" style="width:100%;resize:vertical">${bioText.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</textarea>
        <p class="hint" style="font-size:0.8em;color:#888;margin:2px 0 0">Clothing, expression, background setting, notable features.</p>
      </div>
      <div class="form-group">
        <label style="font-weight:bold">Art Style</label>
        <select name="style" style="width:100%">${styleSelect}</select>
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
        void runImageGeneration(actor as unknown as { id: string; name: string; system: Record<string, unknown>; img?: string });
      },
    });
  });
}
