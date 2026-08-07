import { getLoreBridgeSettings } from "../settings.js";
import { addHistoryEntry } from "../generation-history.js";
import { searchCampaign } from "./search-campaign.js";
import type { CampaignSearchMatch } from "@lorebridge/shared/capabilities";

const MODULE_ID = "lorebridge";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------


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

function showShareDialog(title: string, markdown: string, hiddenCount: number, filename: string): void {
  const safeFilename = filename.replace(/[^a-z0-9_\- ]/gi, "").trim().replace(/\s+/g, "-") || "party-recap";
  const hiddenNote = hiddenCount > 0
    ? `<p style="color:#e07b39;margin:0;flex-shrink:0"><em>${hiddenCount} world entr${hiddenCount !== 1 ? "ies" : "y"} omitted — GM only</em></p>`
    : "";
  const escaped = markdown.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  // Use ApplicationV2 directly (same pattern as SessionCleanupPanel) so we
  // own the full layout — DialogV2's footer breaks flex-fill sizing.
  const _AppV2Base = (foundry as { applications: { api: { ApplicationV2: typeof FoundryApplicationV2 } } }).applications.api.ApplicationV2;

  class SharePanel extends _AppV2Base {
    static override DEFAULT_OPTIONS = {
      id: "lorebridge-share",
      classes: ["lorebridge-share"],
      window: { title, resizable: true },
      position: { width: 620, height: 500 },
    };

    override async _renderHTML(_context: Record<string, unknown>, _options: unknown): Promise<HTMLElement> {
      const container = document.createElement("div");
      container.innerHTML = `
        <style>
          .lorebridge-share .window-content { display: flex; flex-direction: column; overflow: hidden; padding: 0; }
          .lb-share { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 6px; padding: 8px; box-sizing: border-box; }
          .lb-share__toolbar { flex-shrink: 0; display: flex; gap: 6px; }
          .lb-share__textarea { flex: 1; min-height: 0; width: 100%; font-family: monospace; font-size: 0.82em; resize: none; box-sizing: border-box; }
        </style>
        <div class="lb-share">
          ${hiddenNote}
          <div class="lb-share__toolbar">
            <button type="button" data-action="copy">📋 Copy to Clipboard</button>
            <button type="button" data-action="download">⬇ Download .md</button>
          </div>
          <textarea class="lb-share__textarea" readonly>${escaped}</textarea>
        </div>`;
      return container;
    }

    override _replaceHTML(result: HTMLElement, content: HTMLElement, _options: unknown): void {
      content.replaceChildren(...Array.from(result.childNodes));
    }

    override _onClickAction(_event: PointerEvent, target: HTMLElement): void | Promise<void> {
      if (target.dataset["action"] === "copy") {
        void navigator.clipboard.writeText(markdown).then(() => {
          ui.notifications.info("LoreBridge: Recap copied to clipboard.");
        });
      } else if (target.dataset["action"] === "download") {
        const blob = new Blob([markdown], { type: "text/markdown" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${safeFilename}.md`;
        a.click();
        URL.revokeObjectURL(url);
      }
    }
  }

  void new SharePanel().render({ force: true });
}

function showPreviewDialog(title: string, preview: string, onPropose: () => void): void {
  const clean = preview.replace(/\|/g, "").replace(/^\s*[-#]+\s*/gm, "").trim();
  const content = `<div style="padding:0.5rem;max-height:400px;overflow-y:auto;font-size:0.9em"><p>${clean.replace(/\n/g, "<br>")}</p></div>`;

  new foundry.applications.api.DialogV2({
    window: { title, resizable: true },
    position: { width: 540, height: "auto" },
    content,
    buttons: [
      {
        action: "propose",
        label: "Save to Journal",
        icon: "fas fa-save",
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
// NPC Profile
// ---------------------------------------------------------------------------

function runNpcQuickGen(doc: AppDoc): void {
  const biography = (() => {
    const raw = (doc.system as { details?: { biography?: { value?: string } } })?.details?.biography?.value ?? "";
    return raw.replace(/<[^>]+>/g, "").slice(0, 2000);
  })();

  showConfigDialog("NPC Profile", (config) => {
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

        void addHistoryEntry({
          type: "npc-profile",
          label: `NPC Profile — ${doc.name}`,
          prompt: `Tone: ${config.tone}`,
          content: preview,
        });

        showPreviewDialog(`NPC Profile — ${doc.name}`, preview, () => {
          const actor = (game.actors as { get(id: string): { update(d: Record<string, unknown>): Promise<void> } | undefined }).get(doc.id);
          if (!actor) return;
          const existing = (doc.system as { details?: { biography?: { value?: string } } })?.details?.biography?.value ?? "";
          const html = [
            `<h3>LoreBridge Profile</h3>`,
            `<p><strong>Personality:</strong> ${result.personality}</p>`,
            `<p><strong>Mannerism:</strong> ${result.mannerism}</p>`,
            `<section class="secret"><p><strong>Secret (GM only):</strong> ${result.secret}</p></section>`,
          ].join("\n");
          void actor.update({ "system.details.biography.value": `${existing}\n${html}` });
        });
      } catch (error) {
        ui.notifications.error(`LoreBridge NPC Profile failed: ${error instanceof Error ? error.message : String(error)}`);
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
        void addHistoryEntry({
          type: "room-description",
          label: `Room Description — ${pageName}`,
          prompt: `Tone: ${config.tone}, Length: ${config.length}`,
          content: result.preview,
        });

        showPreviewDialog(`Description — ${pageName}`, result.preview, () => {
          const lines = result.preview.split("\n");
          const titleMatch = lines[0]?.match(/^#+\s+(.+)/);
          const title = titleMatch?.[1]?.trim() ?? null;
          const body = (title ? lines.slice(1).join("\n") : result.preview).trim();
          const html = `${title ? `<h3>${title}</h3>` : ""}<p><strong><em>Read-Aloud:</em></strong></p><blockquote><em>${body.replace(/\n/g, "<br>")}</em></blockquote>`;
          if (page) {
            void page.update({ "text.content": `${rawHtml}\n${html}` });
          } else if (journalEntry) {
            void journalEntry.createEmbeddedDocuments("JournalEntryPage", [
              { name: doc.name, type: "text", text: { content: html } },
            ]);
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
        void addHistoryEntry({
          type: "session-recap",
          label: `Session Recap — ${pageName}`,
          prompt: `Tone: ${config.tone}, Length: ${config.length}`,
          content: result.recap,
        });

        showPreviewDialog(`Session Recap — ${pageName}`, result.recap, () => {
          const html = `<h3>Session Recap</h3><p>${result.recap.replace(/\n/g, "<br>")}</p>`;
          if (page) {
            void page.update({ "text.content": `${rawHtml}\n${html}` });
          } else if (journalEntry) {
            void journalEntry.createEmbeddedDocuments("JournalEntryPage", [
              { name: pageName, type: "text", text: { content: html } },
            ]);
          }
        });
      } catch (error) {
        ui.notifications.error(`LoreBridge Session Recap failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    })();
  });
}

// ---------------------------------------------------------------------------
// Party Recap — player-safe export (#145)
// ---------------------------------------------------------------------------

function runPartyRecap(doc: AppDoc, frame: HTMLElement): void {
  const pageId = getActivePageId(frame);
  const journalEntry = (game.journal as { get(id: string): FoundryJournalEntry | undefined }).get(doc.id);
  const page = pageId ? journalEntry?.pages.get(pageId) : undefined;
  const rawHtml = page?.text?.content ?? "";
  const plainText = rawHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 4000);
  const pageName = page?.name ?? doc.name;

  showConfigDialog("Party Recap", (config) => {
    void (async () => {
      ui.notifications.info("LoreBridge: Generating player-safe recap…");
      try {
        // Count entries hidden from players to surface in the share dialog.
        let hiddenCount = 0;
        try {
          const gmResults = searchCampaign({ query: pageName, mode: "gm" });
          const playerResults = searchCampaign({ query: pageName, mode: "player" });
          hiddenCount = Math.max(0, gmResults.hiddenCount - playerResults.hiddenCount);
        } catch { /* best-effort */ }

        const result = await postBackend<{ recap: string }>("v1/generate/party-recap", {
          sessionContent: plainText || `Session: ${pageName}`,
          sessionName: pageName,
          tone: config.tone,
          length: config.length,
          hiddenCount,
        });

        void addHistoryEntry({
          type: "party-recap",
          label: `Party Recap — ${pageName}`,
          prompt: `Tone: ${config.tone}, Length: ${config.length}`,
          content: result.recap,
        });

        showShareDialog(`Party Recap — ${pageName}`, result.recap, hiddenCount, pageName);
      } catch (error) {
        ui.notifications.error(`LoreBridge Party Recap failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    })();
  });
}

// ---------------------------------------------------------------------------
// Lazy DM Session Prep (#108)
// ---------------------------------------------------------------------------

function runLazyDmPrep(doc: AppDoc, frame: HTMLElement): void {
  const journalEntry = (game.journal as { get(id: string): FoundryJournalEntry | undefined }).get(doc.id);
  const pageId = getActivePageId(frame);
  const page = pageId ? journalEntry?.pages.get(pageId) : undefined;
  const rawHtml = page?.text?.content ?? "";
  const sessionContent = rawHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 5000);
  const pageName = page?.name ?? doc.name;
  const worldName = game.world?.title ?? "Unknown World";

  showConfigDialog("Lazy DM Session Prep", (config) => {
    void (async () => {
      ui.notifications.info("LoreBridge: Generating session prep… (this may take a moment)");
      try {
        // Gather campaign context grounded in the session content
        let context: Array<{ type: string; name: string; excerpt: string }> = [];
        try {
          const results = await searchCampaign({ query: pageName, mode: "gm" });
          context = results.results.slice(0, 8).map((r: CampaignSearchMatch) => {
            if (r.documentType === "journal") {
              return { type: "journal", name: r.journalName, excerpt: r.excerpt ?? "" };
            } else if (r.documentType === "actor") {
              return { type: "actor", name: r.actorName, excerpt: r.excerpt ?? "" };
            } else {
              return { type: "scene", name: r.sceneName, excerpt: "" };
            }
          });
        } catch {
          // context gathering is best-effort
        }

        const result = await postBackend<{ prep: string }>("v1/generate/session-prep", {
          sessionName: pageName,
          sessionContent: sessionContent || `Session: ${pageName}`,
          worldName,
          tone: config.tone,
          context,
        });

        // Render prep as structured HTML
        const html = result.prep
          .split("\n")
          .map((line) => {
            if (/^##\s+/.test(line)) return `<h3>${line.replace(/^##\s+/, "")}</h3>`;
            if (/^-\s+/.test(line)) return `<li>${line.replace(/^-\s+/, "")}</li>`;
            if (/^\d+\.\s+/.test(line)) return `<li>${line.replace(/^\d+\.\s+/, "")}</li>`;
            if (line.trim() === "") return "";
            return `<p>${line}</p>`;
          })
          .join("\n");

        void addHistoryEntry({
          type: "session-prep",
          label: `Lazy DM Prep — ${pageName}`,
          prompt: `Tone: ${config.tone}`,
          content: result.prep,
        });

        const previewContent = `<div style="padding:0.5rem;max-height:500px;overflow-y:auto;font-size:0.88em">${html}</div>`;

        // Determine next session number from the current page name
        const sessionNumMatch = pageName.match(/\d+/);
        const sessionNum = sessionNumMatch ? parseInt(sessionNumMatch[0], 10) : null;
        const nextPageName = sessionNum !== null ? `Prep Session ${sessionNum + 1}` : `Prep — ${pageName}`;

        new foundry.applications.api.DialogV2({
          window: { title: `Lazy DM Prep — ${pageName}`, resizable: true },
          position: { width: 600, height: "auto" },
          content: previewContent,
          buttons: [
            {
              action: "save",
              label: `Save as "${nextPageName}"`,
              icon: "fas fa-save",
              callback: () => {
                void (async () => {
                  const saveHtml = `<h3>${nextPageName}</h3>\n${html}`;
                  let prepJournal = Array.from(game.journal as Iterable<FoundryJournalEntry>).find((j) => j.name === "Lazy DM Prep");
                  if (!prepJournal) {
                    // GM-only ownership: 3 = OWNER
                    prepJournal = await JournalEntry.create({ name: "Lazy DM Prep", ownership: { default: 0 } });
                  }
                  if (!prepJournal) {
                    ui.notifications.error("LoreBridge: Could not find or create the 'Lazy DM Prep' journal.");
                    return;
                  }
                  await prepJournal.createEmbeddedDocuments("JournalEntryPage", [
                    { name: nextPageName, type: "text", text: { content: saveHtml } },
                  ]);
                  prepJournal.sheet?.render(true);
                })();
              },
            },
            {
              action: "dismiss",
              label: "Dismiss",
              icon: "fas fa-times",
              default: true,
            },
          ],
        }).render({ force: true });
      } catch (error) {
        ui.notifications.error(`LoreBridge Lazy DM Prep failed: ${error instanceof Error ? error.message : String(error)}`);
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
// Scene Encounter Suggester (#95)
// ---------------------------------------------------------------------------

function runEncounterSuggester(doc: AppDoc): void {
  const scene = (game.scenes as { get(id: string): FoundryScene | undefined }).get(doc.id);
  const tokens = scene ? Array.from(scene.tokens).map((t) => t.name).filter(Boolean) : [];
  const linkedJournal = scene?.journal?.name;

  showConfigDialog("Encounter Suggestions", (config) => {
    void (async () => {
      ui.notifications.info("LoreBridge: Generating encounter suggestions…");
      try {
        const result = await postBackend<{ suggestions: string[] }>("v1/generate/encounter-suggestions", {
          sceneName: doc.name,
          linkedJournal,
          tokens,
          tone: config.tone,
        });

        void addHistoryEntry({
          type: "encounter-suggestions",
          label: `Encounter Hooks — ${doc.name}`,
          prompt: `Tone: ${config.tone}`,
          content: result.suggestions.map((s, i) => `${i + 1}. ${s}`).join("\n"),
        });

        const listItems = result.suggestions.map((s, i) => `<p><strong>${i + 1}.</strong> ${s}</p>`).join("\n");
        const content = `<div style="padding:0.5rem;font-size:0.9em">${listItems}</div>`;

        new foundry.applications.api.DialogV2({
          window: { title: `Encounter Hooks — ${doc.name}`, resizable: true },
          position: { width: 480, height: "auto", zIndex: 110 },
          content,
          buttons: [
            {
              action: "close",
              label: "Close",
              icon: "fas fa-times",
              default: true,
            },
          ],
        }).render({ force: true });
      } catch (error) {
        ui.notifications.error(`LoreBridge Encounter Suggestions failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    })();
  });
}

// ---------------------------------------------------------------------------
// Journal Q&A panel (#96)
// ---------------------------------------------------------------------------

function injectQAPanel(doc: AppDoc, frame: HTMLElement): void {
  const panelId = "lb-qa-panel";
  if (frame.querySelector(`#${panelId}`)) return;

  const journalEntry = (game.journal as { get(id: string): FoundryJournalEntry | undefined }).get(doc.id);

  const panel = document.createElement("div");
  panel.id = panelId;
  panel.dataset["lbFeatureCategory"] = "journal-qa";
  panel.style.cssText = "display:flex;gap:4px;padding:4px 8px;border-top:1px solid var(--color-border-dark,#ccc);background:var(--color-bg-secondary,#f5f5f5);";

  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = "Ask about this journal…";
  input.style.cssText = "flex:1;font-size:0.85em;padding:2px 6px;border:1px solid #aaa;border-radius:3px;background:#f5f0e8;color:#191813;";

  const btn = document.createElement("button");
  btn.type = "button";
  btn.title = "Ask LoreBridge";
  btn.style.cssText = "background:none;border:1px solid #aaa;cursor:pointer;padding:2px 8px;border-radius:3px;font-size:0.85em;color:#191813;";
  btn.innerHTML = `<i class="fas fa-question-circle"></i>`;

  const ask = async () => {
    const question = input.value.trim();
    if (!question) return;

    const pageId = getActivePageId(frame);
    const page = pageId ? journalEntry?.pages.get(pageId) : undefined;
    const rawHtml = page?.text?.content ?? "";
    const pageContent = rawHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 4000);
    const pageName = page?.name ?? doc.name;

    btn.disabled = true;
    input.disabled = true;
    try {
      const result = await postBackend<{ answer: string }>("v1/generate/journal-qa", {
        question,
        pageContent,
        pageName,
        journalName: doc.name,
      });

      void addHistoryEntry({
        type: "journal-qa",
        label: `Journal Q&A — ${pageName}`,
        prompt: question,
        content: result.answer,
      });

      const content = `
        <div style="padding:0.5rem;font-size:0.9em">
          <p><strong>Q:</strong> ${question}</p>
          <hr>
          <p>${result.answer.replace(/\n/g, "<br>")}</p>
        </div>`;

      new foundry.applications.api.DialogV2({
        window: { title: `LoreBridge — ${pageName}`, resizable: true },
        position: { width: 480, height: "auto" },
        content,
        buttons: [
          { action: "close", label: "Close", icon: "fas fa-times", default: true },
        ],
      }).render({ force: true });

      input.value = "";
    } catch (error) {
      ui.notifications.error(`LoreBridge Q&A failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      btn.disabled = false;
      input.disabled = false;
    }
  };

  btn.addEventListener("click", () => { void ask(); });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void ask(); }
  });

  panel.appendChild(input);
  panel.appendChild(btn);

  const content = frame.querySelector(".window-content");
  if (content) {
    content.after(panel);
  } else {
    frame.appendChild(panel);
  }
}

// ---------------------------------------------------------------------------
// Hook registration
// ---------------------------------------------------------------------------

function injectHeaderButton(
  frame: HTMLElement,
  id: string,
  icon: string,
  label: string,
  category: string,
  handler: () => void,
): void {
  if (frame.querySelector(`[data-lb-btn="${id}"]`)) return; // already injected

  const header = frame.querySelector<HTMLElement>(".window-header");
  if (!header) return;

  const btn = document.createElement("button");
  btn.type = "button";
  btn.dataset["lbBtn"] = id;
  btn.dataset["lbFeatureCategory"] = category;
  btn.title = label;
  btn.style.cssText = "background:none;border:none;cursor:pointer;padding:0 4px;font-size:var(--font-size-14,14px);color:inherit;";
  btn.innerHTML = `<i class="${icon}"></i>`;
  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    handler();
  });

  // Insert before the close button so it appears in the header controls area
  const close = header.querySelector<HTMLElement>(".close, [data-action='close']");
  if (close) {
    header.insertBefore(btn, close);
  } else {
    header.appendChild(btn);
  }
}

export function registerSheetButtons(): void {
  Hooks.on("renderApplicationV2", (app: unknown) => {
    const appAny = app as AppWithDoc & { object?: AppDoc };
    // DocumentSheetV2 stores the document at app.document; some subclasses use app.object
    const doc = appAny.document ?? appAny.object;
    const frame = appAny.element;
    if (!doc?.documentName || !frame) return;

    const settings = getLoreBridgeSettings();

    if (settings.uiButtonsEnabled && doc.documentName === "Actor" && doc.type === "npc") {
      injectHeaderButton(frame, "npc-gen", "fas fa-robot", "NPC Profile", "ui-buttons", () => runNpcQuickGen(doc));
    }

    if (doc.documentName === "JournalEntry") {
      if (settings.uiButtonsEnabled) {
      injectHeaderButton(frame, "gen-desc", "fas fa-feather-alt", "Generate Description", "ui-buttons", () => runGenerateDescription(doc, frame));
      if (doc.name.toLowerCase().includes("session")) {
        injectHeaderButton(frame, "session-recap", "fas fa-scroll", "Session Recap", "ui-buttons", () => runSessionRecap(doc, frame));
        injectHeaderButton(frame, "party-recap", "fas fa-users", "Party Recap", "ui-buttons", () => runPartyRecap(doc, frame));
        injectHeaderButton(frame, "lazy-dm-prep", "fas fa-hat-wizard", "Lazy DM Prep", "ui-buttons", () => runLazyDmPrep(doc, frame));
      }
      }
      if (settings.journalQaEnabled) injectQAPanel(doc, frame);
    }

    if (settings.uiButtonsEnabled && doc.documentName === "Scene") {
      injectHeaderButton(frame, "encounter", "fas fa-dice-d20", "Encounter Suggestions", "ui-buttons", () => runEncounterSuggester(doc));
    }
  });

  // Fallback: SceneConfig may use v1 Application in some Foundry/system versions
  // and fires renderSceneConfig with (app, jQuery|HTMLElement, data)
  Hooks.on("renderSceneConfig", (app: unknown, html: unknown) => {
    const appAny = app as { object?: AppDoc; document?: AppDoc; element?: HTMLElement };
    const doc = (appAny.object ?? appAny.document) as AppDoc | undefined;
    if (!doc) return;
    // v2: frame is on app.element; v1: html is a jQuery object, html[0] is the root element
    const frame = appAny.element
      ?? (html as { length?: number; 0?: HTMLElement })?.[0]
      ?? (html as HTMLElement);
    if (!frame) return;
    if (getLoreBridgeSettings().uiButtonsEnabled) {
      injectHeaderButton(frame, "encounter", "fas fa-dice-d20", "Encounter Suggestions", "ui-buttons", () => runEncounterSuggester(doc));
    }
  });
}
