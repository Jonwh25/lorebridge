import { getLoreBridgeSettings } from "../settings.js";

const MODULE_ID = "lorebridge";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type HeaderControl = { icon: string; label: string; action: string; visible?: boolean };

type AppDoc = {
  id: string;
  name: string;
  documentName: string;
  type?: string;
  system?: Record<string, unknown>;
};

type AppWithDoc = {
  document?: AppDoc;
  element?: HTMLElement;
  tabGroups?: Record<string, string | null>;
};

// ---------------------------------------------------------------------------
// Backend helpers
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
// Config dialog (tone + length)
// ---------------------------------------------------------------------------

type GenerationConfig = { tone: string; length: string };

function showConfigDialog(title: string, onSubmit: (config: GenerationConfig) => void): void {
  const content = `
    <form class="lorebridge-config-form" style="padding:0.5rem">
      <div class="form-group">
        <label>Tone</label>
        <select name="tone">
          <option value="neutral">Neutral</option>
          <option value="gothic">Gothic</option>
          <option value="heroic">Heroic</option>
          <option value="mysterious">Mysterious</option>
        </select>
      </div>
      <div class="form-group" style="margin-top:0.5rem">
        <label>Length</label>
        <select name="length">
          <option value="short">Short</option>
          <option value="medium" selected>Medium</option>
          <option value="long">Long</option>
        </select>
      </div>
    </form>
  `;

  new foundry.applications.api.DialogV2({
    window: { title, resizable: false },
    position: { width: 360 },
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
          onSubmit({
            tone: (data.get("tone") as string) ?? "neutral",
            length: (data.get("length") as string) ?? "medium",
          });
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

// ---------------------------------------------------------------------------
// Preview dialog
// ---------------------------------------------------------------------------

function showPreviewDialog(title: string, preview: string, onPropose: () => void): void {
  const escaped = preview.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const content = `<div style="padding:0.5rem;max-height:400px;overflow-y:auto;white-space:pre-wrap;font-size:0.9em">${escaped}</div>`;

  new foundry.applications.api.DialogV2({
    window: { title, resizable: true },
    position: { width: 540, height: "auto" },
    content,
    buttons: [
      {
        action: "propose",
        label: "Propose Update",
        icon: "fas fa-paper-plane",
        callback: () => { onPropose(); },
      },
      {
        action: "dismiss",
        label: "Dismiss",
        icon: "fas fa-times",
        default: true,
      },
    ],
  }).render({ force: true });
}

// ---------------------------------------------------------------------------
// NPC Quick-Gen
// ---------------------------------------------------------------------------

function runNpcQuickGen(doc: AppDoc): void {
  const biography = (() => {
    const raw = (doc.system as { details?: { biography?: { value?: string } } })?.details?.biography?.value ?? "";
    return raw.replace(/<[^>]+>/g, "").slice(0, 2000);
  })();

  showConfigDialog("NPC Quick-Gen", (config) => {
    void (async () => {
      ui.notifications.info("LoreBridge: Generating NPC profile…");
      try {
        const result = await postBackend<{ personality: string; mannerism: string; secret: string }>(
          "v1/generate/npc-profile",
          { name: doc.name, type: doc.type ?? "npc", biography, tone: config.tone },
        );
        const preview = [
          `Personality: ${result.personality}`,
          ``,
          `Mannerism: ${result.mannerism}`,
          ``,
          `Secret (GM only): ${result.secret}`,
        ].join("\n");

        showPreviewDialog(`NPC Profile — ${doc.name}`, preview, () => {
          const actor = (game.actors as { get(id: string): { update(d: Record<string, unknown>): Promise<void> } | undefined }).get(doc.id);
          if (!actor) return;
          const existing = (doc.system as { details?: { biography?: { value?: string } } })?.details?.biography?.value ?? "";
          const appended = `${existing}\n<h3>LoreBridge Profile</h3><p>${preview.replace(/\n/g, "<br>")}</p>`;
          void actor.update({ "system.details.biography.value": appended });
        });
      } catch (error) {
        ui.notifications.error(`LoreBridge NPC Quick-Gen failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    })();
  });
}

// ---------------------------------------------------------------------------
// Generate Description (journal page)
// ---------------------------------------------------------------------------

function runGenerateDescription(doc: AppDoc, frame: HTMLElement): void {
  const pageId = getActivePageId(frame);
  const journalEntry = (game.journal as { get(id: string): FoundryJournalEntry | undefined }).get(doc.id);
  const page = pageId ? journalEntry?.pages.get(pageId) : undefined;
  const rawHtml = page?.text?.content ?? "";
  const plainText = rawHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 3000);
  const pageName = page?.name ?? doc.name;

  showConfigDialog("Generate Description", (config) => {
    void (async () => {
      ui.notifications.info("LoreBridge: Generating description…");
      try {
        const result = await postBackend<{ preview: string }>("v1/generate/boxed-text", {
          documentName: pageName,
          documentType: "journalPage",
          sourceId: `foundry:${game.world?.id ?? "unknown"}`,
          sourceName: doc.name,
          content: plainText || `Journal: ${doc.name}`,
          tone: config.tone,
          length: config.length,
          audience: "players",
        });
        showPreviewDialog(`Description — ${pageName}`, result.preview, () => {
          if (page) {
            const appended = `${rawHtml}\n<blockquote><em>${result.preview.replace(/\n/g, "<br>")}</em></blockquote>`;
            void page.update({ "text.content": appended });
          }
        });
      } catch (error) {
        ui.notifications.error(`LoreBridge Generate Description failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    })();
  });
}

// ---------------------------------------------------------------------------
// Session Recap
// ---------------------------------------------------------------------------

function runSessionRecap(doc: AppDoc, frame: HTMLElement): void {
  const pageId = getActivePageId(frame);
  const journalEntry = (game.journal as { get(id: string): FoundryJournalEntry | undefined }).get(doc.id);
  const page = pageId ? journalEntry?.pages.get(pageId) : undefined;
  const rawHtml = page?.text?.content ?? "";
  const plainText = rawHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 4000);
  const pageName = page?.name ?? doc.name;

  showConfigDialog("Session Recap", (config) => {
    void (async () => {
      ui.notifications.info("LoreBridge: Generating session recap…");
      try {
        const result = await postBackend<{ recap: string }>("v1/generate/session-recap", {
          sessionContent: plainText || `Session: ${pageName}`,
          sessionName: pageName,
          tone: config.tone,
          length: config.length,
        });
        showPreviewDialog(`Session Recap — ${pageName}`, result.recap, () => {
          if (page) {
            const appended = `${rawHtml}\n<h3>Session Recap</h3><p>${result.recap.replace(/\n/g, "<br>")}</p>`;
            void page.update({ "text.content": appended });
          }
        });
      } catch (error) {
        ui.notifications.error(`LoreBridge Session Recap failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    })();
  });
}

// ---------------------------------------------------------------------------
// Active journal page detection
// ---------------------------------------------------------------------------

function getActivePageId(frame: HTMLElement): string | undefined {
  // v14 journal sheets render the page list in a sidebar; the active page has
  // a data-page-id attribute on the active/selected list item.
  const selectors = [
    ".pages-list .page.active[data-page-id]",
    ".pages-list [data-page-id].active",
    ".journal-sidebar [data-page-id].active",
    "[data-page-id].active",
    "[data-entry-id].active",
  ];
  for (const sel of selectors) {
    const el = frame.querySelector<HTMLElement>(sel);
    if (el) return el.dataset["pageId"] ?? el.dataset["entryId"];
  }
  // Fallback: first page in the list
  const first = frame.querySelector<HTMLElement>("[data-page-id]");
  return first?.dataset["pageId"];
}

// ---------------------------------------------------------------------------
// Wire a button by data-action — idempotent
// ---------------------------------------------------------------------------

function wireButton(frame: HTMLElement, action: string, handler: (e: Event) => void): void {
  const btn = frame.querySelector<HTMLElement>(`[data-action="${action}"]`);
  if (!btn || btn.dataset["lbWired"]) return;
  btn.dataset["lbWired"] = "1";
  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    handler(e);
  });
}

// ---------------------------------------------------------------------------
// Hook registration
// ---------------------------------------------------------------------------

export function registerSheetButtons(): void {
  // Step 1: add controls to the header via the official v14 hook.
  // These appear as icon buttons in the window title bar.
  Hooks.on("getHeaderControlsApplicationV2", (app: unknown, controls: unknown) => {
    const doc = (app as AppWithDoc).document;
    if (!doc?.documentName) return;

    const ctls = controls as HeaderControl[];

    if (doc.documentName === "Actor" && doc.type === "npc") {
      ctls.push({ icon: "fas fa-robot", label: "NPC Quick-Gen", action: "lorebridge-npc-gen" });
    }

    if (doc.documentName === "JournalEntry") {
      ctls.push({ icon: "fas fa-feather-alt", label: "Generate Description", action: "lorebridge-gen-desc" });
      if (doc.name.toLowerCase().includes("session")) {
        ctls.push({ icon: "fas fa-scroll", label: "Session Recap", action: "lorebridge-session-recap" });
      }
    }
  });

  // Step 2: attach click handlers in renderApplicationV2.
  // At this point app.element is the full frame already in the DOM, so we
  // can query [data-action] buttons that were injected by getHeaderControlsApplicationV2.
  Hooks.on("renderApplicationV2", (app: unknown) => {
    const appAny = app as AppWithDoc;
    const doc = appAny.document;
    const frame = appAny.element;
    if (!doc?.documentName || !frame) return;

    if (doc.documentName === "Actor" && doc.type === "npc") {
      wireButton(frame, "lorebridge-npc-gen", () => runNpcQuickGen(doc));
    }

    if (doc.documentName === "JournalEntry") {
      wireButton(frame, "lorebridge-gen-desc", () => runGenerateDescription(doc, frame));
      if (doc.name.toLowerCase().includes("session")) {
        wireButton(frame, "lorebridge-session-recap", () => runSessionRecap(doc, frame));
      }
    }
  });
}
