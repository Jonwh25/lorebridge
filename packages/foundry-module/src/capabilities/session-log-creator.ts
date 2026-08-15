/**
 * Session Log Creator — issue #288
 *
 * Creates a new journal page in the Session Logs journal, pre-named with
 * the session number and date, and pre-populated with the standard template.
 */

import { getLoreBridgeSettings } from "../settings.js";
import { requireFoundryGm } from "./errors.js";
import { readLatest } from "./session-log-reader.js";
import { escHtml } from "./tracker-shared.js";

// ---------------------------------------------------------------------------
// Template
// ---------------------------------------------------------------------------

const SESSION_LOG_TEMPLATE = `<h1>[Session Title]</h1>
<p><strong>Region:</strong> [Primary Region]<br>
<strong>Locations:</strong> [Location 1], [Location 2], [Location 3]<br>
<strong>NPCs:</strong> [NPC 1], [NPC 2], [NPC 3]<br>
<strong>Quests:</strong> [Quest 1], [Quest 2]<br>
<strong>Quest Updates:</strong> [Completed / Advanced / New — short description]</p>
<hr>
<h2>[Story Section]</h2>
<p>Write the session recap normally.</p>
<h2>[Story Section]</h2>
<p>Continue the story.</p>
<h2>[Story Section]</h2>
<p>Continue as needed.</p>
<hr>
<h2>End of Session</h2>
<p><strong>Current Location:</strong> [Where the party ended]<br>
<strong>Next Objective:</strong> [What the party currently intends to do]</p>`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function todayFormatted(): string {
  const d = new Date();
  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
}

type FoundryJournalDoc = {
  name: string;
  pages: unknown;
  createEmbeddedDocument(
    type: string,
    data: Record<string, unknown>,
  ): Promise<{ id: string; name: string }>;
  sheet?: { render(opts?: Record<string, unknown>): void };
};

function getJournalByName(name: string): FoundryJournalDoc | undefined {
  const nameLower = name.trim().toLocaleLowerCase();
  let best: FoundryJournalDoc | undefined;
  let bestSize = -1;
  for (const j of game.journal as Iterable<FoundryJournalDoc>) {
    if ((j.name ?? "").trim().toLocaleLowerCase() === nameLower) {
      const size = (j.pages as unknown as { size?: number }).size ?? 0;
      if (size > bestSize) { bestSize = size; best = j; }
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export async function runCreateSessionLog(): Promise<void> {
  requireFoundryGm("runCreateSessionLog");

  const latestPage = (() => {
    try { return readLatest(); } catch { return null; }
  })();
  const nextSession = latestPage ? latestPage.sessionNumber + 1 : 1;
  const today = todayFormatted();

  // Setup dialog
  const config = await new Promise<{ sessionNumber: number; date: string } | null>((resolve) => {
    let resolved = false;

    const dialog = new foundry.applications.api.DialogV2({
      window: { title: "Create Session Log", resizable: false },
      position: { width: 360, height: "auto" },
      content: `<div style="padding:0.5rem;font-size:0.9em">
        <div style="display:flex;gap:1rem;align-items:flex-end">
          <div style="flex:0 0 auto">
            <label style="display:block;margin-bottom:0.3rem;font-weight:bold">Session #</label>
            <input type="number" id="lb-new-session-num" value="${nextSession}" min="1"
              style="width:80px;padding:3px 6px;border:1px solid #555;background:#222;color:#eee;border-radius:3px">
          </div>
          <div style="flex:1">
            <label style="display:block;margin-bottom:0.3rem;font-weight:bold">Date</label>
            <input type="text" id="lb-new-session-date" value="${escHtml(today)}"
              style="width:100%;padding:3px 6px;border:1px solid #555;background:#222;color:#eee;border-radius:3px">
          </div>
        </div>
        <p style="margin:0.5rem 0 0;color:#888;font-size:0.8em">
          Creates <em>Session ${nextSession} - ${escHtml(today)}</em> in the Session Logs journal.
        </p>
      </div>`,
      buttons: [
        {
          action: "create",
          label: "Create Session",
          icon: "fas fa-plus",
          default: true,
          callback: () => {
            if (resolved) return;
            resolved = true;
            const num = parseInt(
              (document.getElementById("lb-new-session-num") as HTMLInputElement | null)?.value ?? "",
              10,
            );
            const date = (document.getElementById("lb-new-session-date") as HTMLInputElement | null)?.value?.trim() ?? today;
            resolve({
              sessionNumber: Number.isFinite(num) && num > 0 ? num : nextSession,
              date: date || today,
            });
          },
        },
        {
          action: "cancel",
          label: "Cancel",
          icon: "fas fa-times",
          callback: () => {
            if (!resolved) { resolved = true; resolve(null); }
          },
        },
      ],
    });

    void dialog.render({ force: true });
    const dialogWithId = dialog as unknown as { id: string };
    const onClose = (app: unknown) => {
      if ((app as { id?: string }).id === dialogWithId.id) {
        if (!resolved) { resolved = true; resolve(null); }
        Hooks.off("closeApplication", onClose);
      }
    };
    Hooks.on("closeApplication", onClose);
  });

  if (!config) return;

  const pageName = `Session ${config.sessionNumber} - ${config.date}`;
  const journalName = getLoreBridgeSettings().sessionLogFolder;
  const journal = getJournalByName(journalName);

  if (!journal) {
    ui.notifications.error(
      `LoreBridge: Session Logs journal "${escHtml(journalName)}" not found. Check the Session Log Journal Name in LoreBridge settings.`,
    );
    return;
  }

  ui.notifications.info(`LoreBridge: Creating "${pageName}"…`);

  const page = await journal.createEmbeddedDocument("JournalEntryPage", {
    name: pageName,
    type: "text",
    text: {
      content: SESSION_LOG_TEMPLATE,
      format: 1, // CONST.JOURNAL_ENTRY_PAGE_FORMATS.HTML
    },
  });

  // Open the journal and navigate to the new page
  journal.sheet?.render({ force: true, pageId: page.id });
}
