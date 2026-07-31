import { getLoreBridgeSettings } from "../settings.js";

const MODULE_ID = "lorebridge";

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
// Config dialog
// ---------------------------------------------------------------------------

type GenerationConfig = {
  tone: string;
  length: string;
};

function showConfigDialog(title: string, onSubmit: (config: GenerationConfig) => void): void {
  const content = `
    <form class="lorebridge-config-form">
      <div class="form-group">
        <label>Tone</label>
        <select name="tone">
          <option value="neutral">Neutral</option>
          <option value="gothic">Gothic</option>
          <option value="heroic">Heroic</option>
          <option value="mysterious">Mysterious</option>
        </select>
      </div>
      <div class="form-group">
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
// Preview dialog — shown after AI generates content
// ---------------------------------------------------------------------------

function showPreviewDialog(
  title: string,
  preview: string,
  onPropose: (preview: string) => void,
): void {
  const escaped = preview.replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const content = `
    <div class="lorebridge-preview">
      <p class="lorebridge-preview-text">${escaped.replace(/\n/g, "<br>")}</p>
    </div>
  `;

  new foundry.applications.api.DialogV2({
    window: { title, resizable: true },
    position: { width: 540, height: "auto" },
    content,
    buttons: [
      {
        action: "propose",
        label: "Propose Update",
        icon: "fas fa-paper-plane",
        callback: () => { onPropose(preview); },
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
// NPC Quick-Gen  (actor sheets)
// ---------------------------------------------------------------------------

async function runNpcQuickGen(actor: { id: string; name: string; type: string; system: Record<string, unknown> }): Promise<void> {
  const biography = (() => {
    const bio = (actor.system as { details?: { biography?: { value?: string } } })?.details?.biography?.value ?? "";
    return bio.replace(/<[^>]+>/g, "").slice(0, 2000);
  })();

  showConfigDialog("NPC Quick-Gen", (config) => {
    void (async () => {
      ui.notifications.info("LoreBridge: Generating NPC profile…");
      try {
        const result = await postBackend<{ personality: string; mannerism: string; secret: string }>(
          "v1/generate/npc-profile",
          { name: actor.name, type: actor.type, biography, tone: config.tone },
        );
        const preview = [
          `**Personality:** ${result.personality}`,
          `**Mannerism:** ${result.mannerism}`,
          `**Secret (GM only):** ${result.secret}`,
        ].join("\n\n");
        showPreviewDialog(`NPC Profile — ${actor.name}`, preview, (text) => {
          const existing = (actor.system as { details?: { biography?: { value?: string } } })?.details?.biography?.value ?? "";
          const appended = `${existing}\n<h3>LoreBridge Profile</h3><p>${text.replace(/\n/g, "<br>")}</p>`;
          void (game.actors as { get(id: string): { update(data: Record<string, unknown>): Promise<void> } | undefined })
            .get(actor.id)
            ?.update({ "system.details.biography.value": appended });
        });
      } catch (error) {
        ui.notifications.error(`LoreBridge NPC Quick-Gen failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    })();
  });
}

// ---------------------------------------------------------------------------
// Generate Description  (journal pages and scenes)
// ---------------------------------------------------------------------------

type BoxedTextResult = { preview: string };

async function runGenerateDescription(
  documentName: string,
  sourceName: string,
  content: string,
  onPropose: (preview: string) => void,
): Promise<void> {
  showConfigDialog("Generate Description", (config) => {
    void (async () => {
      ui.notifications.info("LoreBridge: Generating description…");
      try {
        const result = await postBackend<BoxedTextResult>("v1/generate/boxed-text", {
          documentName,
          documentType: "journalPage",
          sourceId: `foundry:${game.world?.id ?? "unknown"}`,
          sourceName,
          content: content.slice(0, 3000),
          tone: config.tone,
          length: config.length,
          audience: "players",
        });
        showPreviewDialog(`Description — ${documentName}`, result.preview, onPropose);
      } catch (error) {
        ui.notifications.error(`LoreBridge Generate Description failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    })();
  });
}

// ---------------------------------------------------------------------------
// Session Recap  (journal sheets whose name includes "session")
// ---------------------------------------------------------------------------

async function runSessionRecap(
  journalId: string,
  pageId: string,
  pageName: string,
  content: string,
): Promise<void> {
  showConfigDialog("Session Recap", (config) => {
    void (async () => {
      ui.notifications.info("LoreBridge: Generating session recap…");
      try {
        const result = await postBackend<{ recap: string }>("v1/generate/session-recap", {
          sessionContent: content.slice(0, 4000),
          sessionName: pageName,
          tone: config.tone,
          length: config.length,
        });
        showPreviewDialog(`Session Recap — ${pageName}`, result.recap, () => {
          const journalEntry = (game.journal as { get(id: string): { pages: { get(id: string): { update(data: Record<string, unknown>): Promise<void> } | undefined } } | undefined }).get(journalId);
          const page = journalEntry?.pages?.get(pageId);
          if (!page) {
            ui.notifications.error("LoreBridge: Journal page not found.");
            return;
          }
          const appended = `${content}\n<h3>Session Recap</h3><p>${result.recap.replace(/\n/g, "<br>")}</p>`;
          void page.update({ "text.content": appended });
        });
      } catch (error) {
        ui.notifications.error(`LoreBridge Session Recap failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    })();
  });
}

// ---------------------------------------------------------------------------
// Plain text extractor
// ---------------------------------------------------------------------------

function htmlToText(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

// ---------------------------------------------------------------------------
// Hook registration
// ---------------------------------------------------------------------------

export function registerSheetButtons(): void {
  // Actor sheet — NPC Quick-Gen button
  Hooks.on("renderApplicationV2", (app: unknown, html: unknown) => {
    const appAny = app as { document?: { id?: string; name?: string; type?: string; system?: Record<string, unknown> }; options?: { classes?: string[] } };
    const doc = appAny.document;
    if (!doc?.id || !doc.name) return;

    // Only inject on actor sheets for NPC-type actors
    const classes = appAny.options?.classes ?? [];
    if (!classes.includes("actor-sheet") && !classes.includes("ActorSheet")) return;
    if (doc.type !== "npc") return;

    const htmlEl = html as HTMLElement;
    const header = htmlEl.querySelector(".window-header");
    if (!header) return;

    if (header.querySelector(".lorebridge-npc-gen")) return; // idempotent

    const btn = document.createElement("button");
    btn.className = "lorebridge-npc-gen header-control";
    btn.title = "LoreBridge: NPC Quick-Gen";
    btn.innerHTML = '<i class="fas fa-robot"></i>';
    btn.type = "button";
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      void runNpcQuickGen(doc as { id: string; name: string; type: string; system: Record<string, unknown> });
    });
    header.appendChild(btn);
  });

  // Journal sheet — Generate Description and Session Recap buttons
  Hooks.on("renderApplicationV2", (app: unknown, html: unknown) => {
    const appAny = app as { document?: { id?: string; name?: string; pages?: unknown }; options?: { classes?: string[] } };
    const doc = appAny.document;
    if (!doc?.id || !doc.name) return;

    const classes = appAny.options?.classes ?? [];
    if (!classes.includes("journal-sheet") && !classes.includes("JournalSheet")) return;

    const htmlEl = html as HTMLElement;

    // Find active/visible page content to determine which page is showing
    const pageEl = htmlEl.querySelector(".journal-entry-page.active, .journal-entry-content");
    if (!pageEl) return;

    const pageId = (pageEl as HTMLElement).dataset["pageId"] ?? (pageEl as HTMLElement).dataset["entryId"];
    if (!pageId) return;

    const journalEntry = (game.journal as { get(id: string): FoundryJournalEntry | undefined }).get(doc.id);
    if (!journalEntry) return;

    const page = journalEntry.pages.get(pageId);
    if (!page) return;

    const rawHtml = page.text?.content ?? "";
    const plainText = htmlToText(rawHtml);
    const isSessionLog = doc.name.toLowerCase().includes("session") || page.name.toLowerCase().includes("session");

    const header = htmlEl.querySelector(".window-header");
    if (!header) return;

    // Generate Description button
    if (!header.querySelector(".lorebridge-gen-desc")) {
      const btn = document.createElement("button");
      btn.className = "lorebridge-gen-desc header-control";
      btn.title = "LoreBridge: Generate Description";
      btn.innerHTML = '<i class="fas fa-feather-alt"></i>';
      btn.type = "button";
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        void runGenerateDescription(page.name, journalEntry.name, plainText, (preview) => {
          void page.update({ "text.content": `${rawHtml}\n<blockquote class="lorebridge-boxed-text"><em>${preview.replace(/\n/g, "<br>")}</em></blockquote>` });
        });
      });
      header.appendChild(btn);
    }

    // Session Recap button — only on session journals
    if (isSessionLog && !header.querySelector(".lorebridge-session-recap")) {
      const btn = document.createElement("button");
      btn.className = "lorebridge-session-recap header-control";
      btn.title = "LoreBridge: Session Recap";
      btn.innerHTML = '<i class="fas fa-scroll"></i>';
      btn.type = "button";
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        void runSessionRecap(doc.id!, pageId, page.name, plainText);
      });
      header.appendChild(btn);
    }
  });

  // Scene sheet — Generate Description button
  Hooks.on("renderApplicationV2", (app: unknown, html: unknown) => {
    const appAny = app as { document?: { id?: string; name?: string }; options?: { classes?: string[] } };
    const doc = appAny.document;
    if (!doc?.id || !doc.name) return;

    const classes = appAny.options?.classes ?? [];
    if (!classes.includes("scene-config") && !classes.includes("SceneConfig")) return;

    const htmlEl = html as HTMLElement;
    const header = htmlEl.querySelector(".window-header");
    if (!header) return;

    if (header.querySelector(".lorebridge-scene-desc")) return;

    const btn = document.createElement("button");
    btn.className = "lorebridge-scene-desc header-control";
    btn.title = "LoreBridge: Generate Description";
    btn.innerHTML = '<i class="fas fa-feather-alt"></i>';
    btn.type = "button";
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const scene = (game.scenes as { get(id: string): FoundryScene | undefined }).get(doc.id!);
      const navName = scene?.navName ?? doc.name ?? "";
      void runGenerateDescription(doc.name!, navName, `Scene: ${doc.name}`, (preview) => {
        void (game.journal as { get(id: string): { pages: { get(id: string): { update(d: Record<string, unknown>): Promise<void> } | undefined } } | undefined });
        ui.notifications.info(`LoreBridge: Scene description generated. Copy and paste into your journal:\n\n${preview}`);
      });
    });
    header.appendChild(btn);
  });
}
