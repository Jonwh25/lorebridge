/**
 * Session provisioning tools (Milestone 25, issues #230, #231, #232).
 *
 * All three operations are pure Foundry-module work — no backend dependency.
 *
 * #232  removeNonGmUsers   — delete all Player / Trusted Player accounts
 * #230  bulkCreateUsers    — create Users + blank Actors with random passwords
 * #231  distributeHotbar   — broadcast GM hotbar pages to connected players
 */

// ---------------------------------------------------------------------------
// Foundry type aliases (narrow usage only)
// ---------------------------------------------------------------------------

type AnyRecord = Record<string, unknown>;

type FoundryUserDocument = {
  id: string;
  name: string;
  role: number;
  character?: { id: string } | null;
  update(data: AnyRecord): Promise<void>;
};

type FoundryUserCollection = Iterable<FoundryUserDocument> & {
  get(id: string): FoundryUserDocument | undefined;
};

type HotbarSlot = {
  slot: number;
  macro?: { id: string; name: string; img?: string; type?: string; command?: string } | null;
};

type FoundryHotbar = {
  /** Array of slot entries for the current page */
  slots: HotbarSlot[];
  /** Currently active page (1-based) */
  page: number;
};

type FoundrySocket = {
  on(event: string, handler: (data: AnyRecord) => void): void;
  emit(event: string, data: AnyRecord): void;
};

// ---------------------------------------------------------------------------
// Foundry static APIs (not in foundry-globals.d.ts yet)
// ---------------------------------------------------------------------------

declare const User: {
  create(data: AnyRecord): Promise<FoundryUserDocument | undefined>;
  deleteDocuments(ids: string[]): Promise<void>;
};

declare const Folder: {
  create(data: AnyRecord): Promise<{ id: string } | undefined>;
};

declare const ChatMessage: {
  create(data: AnyRecord): Promise<void>;
};

// ---------------------------------------------------------------------------
// Role constants (Foundry USER_ROLES)
// ---------------------------------------------------------------------------

const ROLE_PLAYER = 1;
const ROLE_TRUSTED = 2;
// GM = 4; ASSISTANT = 3 — never deleted

// ---------------------------------------------------------------------------
// DialogV2 helper
// ---------------------------------------------------------------------------

type DialogV2Api = {
  prompt(cfg: AnyRecord): Promise<unknown>;
};

function getDialogV2(): DialogV2Api | undefined {
  return (
    (globalThis as unknown as { foundry?: { applications?: { api?: { DialogV2?: DialogV2Api } } } })
      .foundry?.applications?.api?.DialogV2
  );
}

// ---------------------------------------------------------------------------
// Socket
// ---------------------------------------------------------------------------

function getSocket(): FoundrySocket {
  return ((game as unknown) as { socket: FoundrySocket }).socket;
}

const SOCKET_CHANNEL = "module.lorebridge";
const MSG_HOTBAR_DISTRIBUTE = "lb-hotbar-distribute";

// ---------------------------------------------------------------------------
// #232 — Remove all non-GM users
// ---------------------------------------------------------------------------

export interface RemoveUsersResult {
  removed: number;
  names: string[];
}

export async function removeNonGmUsers(): Promise<RemoveUsersResult | null> {
  if (!game.user?.isGM) throw new Error("GM only.");

  const users = Array.from(game.users as unknown as FoundryUserCollection);
  const targets = users.filter(
    (u) => u.role === ROLE_PLAYER || u.role === ROLE_TRUSTED,
  );

  if (targets.length === 0) {
    ui.notifications.info("LoreBridge: No player accounts found.");
    return null;
  }

  const names = targets.map((u) => u.name);
  const listHtml = names.map((n) => `<li>${n.replace(/&/g,"&amp;").replace(/</g,"&lt;")}</li>`).join("");

  const DialogV2 = getDialogV2();
  if (!DialogV2) throw new Error("DialogV2 unavailable.");

  let confirmed = false;
  await DialogV2.prompt({
    window: { title: "Remove All Players — Confirm" },
    content: `
      <p>The following ${targets.length} player account(s) will be permanently deleted:</p>
      <ul style="max-height:160px;overflow-y:auto;margin:8px 0">${listHtml}</ul>
      <p><strong>This cannot be undone.</strong> GM and Assistant GM accounts are not affected.</p>`,
    ok: {
      label: "Delete All",
      icon: "fas fa-trash",
      callback: () => { confirmed = true; },
    },
    rejectClose: false,
  });

  if (!confirmed) return null;

  await User.deleteDocuments(targets.map((u) => u.id));
  ui.notifications.info(`LoreBridge: Removed ${targets.length} player account(s).`);
  return { removed: targets.length, names };
}

// ---------------------------------------------------------------------------
// #230 — Bulk user and actor creation
// ---------------------------------------------------------------------------

export type PasswordStrength = "simple" | "strong";

export interface BulkCreateEntry {
  name: string;
  extraActors: number;
}

export interface BulkCreateResult {
  entries: Array<{ username: string; password: string; actorCount: number }>;
}

// Pronounceable syllables for simple passwords
const CONSONANTS = "bcdfghjklmnprstvwx";
const VOWELS = "aeiou";

function generateSimplePassword(): string {
  const len = 3; // 3 syllables → ~6 chars
  let pw = "";
  for (let i = 0; i < len; i++) {
    pw += CONSONANTS[Math.floor(Math.random() * CONSONANTS.length)];
    pw += VOWELS[Math.floor(Math.random() * VOWELS.length)];
  }
  // Append 2 digits for minimal complexity
  pw += Math.floor(Math.random() * 90 + 10).toString();
  return pw;
}

function generateStrongPassword(length = 12): string {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$";
  return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

function generatePassword(strength: PasswordStrength): string {
  return strength === "simple" ? generateSimplePassword() : generateStrongPassword();
}

/**
 * Parse a name list from the textarea. Accepts:
 *   Alice
 *   Bob+2       → Bob plus 2 extra actors (3 total)
 */
function parseNames(raw: string): BulkCreateEntry[] {
  return raw
    .split(/[\n,]+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = /^(.+?)\+(\d+)$/.exec(line);
      if (match && match[1] !== undefined && match[2] !== undefined) {
        return { name: match[1].trim(), extraActors: Math.min(parseInt(match[2], 10), 10) };
      }
      return { name: line, extraActors: 0 };
    });
}

export async function bulkCreateUsers(
  rawNames: string,
  strength: PasswordStrength,
  folderName: string,
): Promise<BulkCreateResult | null> {
  if (!game.user?.isGM) throw new Error("GM only.");

  const entries = parseNames(rawNames);
  if (entries.length === 0) {
    ui.notifications.warn("LoreBridge: No names provided.");
    return null;
  }

  // Find or create the target folder
  const targetFolderName = folderName.trim() || "Heroes";
  const existingFolder = Array.from(game.folders as unknown as Iterable<{ name: string; type: string; id: string }>)
    .find((f) => f.name === targetFolderName && f.type === "Actor");
  const folderId: string | null = existingFolder?.id ??
    (await Folder.create({ name: targetFolderName, type: "Actor" }))?.id ?? null;

  const results: BulkCreateResult["entries"] = [];

  for (const entry of entries) {
    const password = generatePassword(strength);
    const totalActors = 1 + entry.extraActors;

    const primaryActor = await Actor.create({
      name: entry.name,
      type: "character",
      folder: folderId,
    });

    for (let i = 1; i < totalActors; i++) {
      await Actor.create({
        name: `${entry.name} (${i})`,
        type: "character",
        folder: folderId,
      });
    }

    await User.create({
      name: entry.name,
      password,
      role: ROLE_PLAYER,
      character: primaryActor?.id ?? null,
    });

    results.push({ username: entry.name, password, actorCount: totalActors });
  }

  return { entries: results };
}

/**
 * Open the GM dialog to enter names and start bulk creation.
 */
export async function openBulkCreateDialog(): Promise<void> {
  if (!game.user?.isGM) throw new Error("GM only.");

  const DialogV2 = getDialogV2();
  if (!DialogV2) throw new Error("DialogV2 unavailable.");

  let submitted = false;
  let rawNames = "";
  let rawFolder = "Heroes";
  let strength: PasswordStrength = "simple";

  await DialogV2.prompt({
    window: { title: "Bulk Create Player Characters", resizable: true },
    content: `
      <div style="padding:8px;font-size:0.9em">
        <div style="margin-bottom:10px">
          <label style="font-weight:bold;font-size:0.85em;display:block;margin-bottom:4px">Folder</label>
          <input type="text" name="folder" value="Heroes"
            style="width:100%;padding:5px 8px;border:1px solid #555;border-radius:4px;background:#2a2a2a;color:#ddd"
            placeholder="Heroes">
          <p style="margin:3px 0 0;font-size:0.78em;color:#888">Actors are created in this folder (created if it doesn't exist).</p>
        </div>
        <div style="margin-bottom:10px">
          <label style="font-weight:bold;font-size:0.85em;display:block;margin-bottom:4px">Player Names</label>
          <textarea name="names" rows="6"
            style="width:100%;padding:6px;border:1px solid #555;border-radius:4px;background:#2a2a2a;color:#ddd;resize:vertical"
            placeholder="Valeros,Seoni,Kyra&#10;or one per line — use +N for extra actors (e.g. Valeros+2)"></textarea>
          <p style="margin:3px 0 0;font-size:0.78em;color:#888">Comma- or newline-separated. <code>Valeros+2</code> creates Valeros plus 2 extra actors.</p>
        </div>
        <div>
          <label style="font-weight:bold;font-size:0.85em">Password strength</label><br>
          <label style="cursor:pointer;margin-right:16px">
            <input type="radio" name="strength" value="simple" checked> Simple (pronounceable)
          </label>
          <label style="cursor:pointer">
            <input type="radio" name="strength" value="strong"> Strong (random)
          </label>
        </div>
      </div>`,
    ok: {
      label: "Create",
      icon: "fas fa-users",
      callback: (_event: Event, button: HTMLButtonElement) => {
        const form = button.closest("form") ?? button.form ?? button.closest(".dialog-content");
        rawFolder = (form?.querySelector<HTMLInputElement>("input[name='folder']"))?.value ?? "Heroes";
        rawNames = (form?.querySelector<HTMLTextAreaElement>("textarea[name='names']"))?.value ?? "";
        strength = (form?.querySelector<HTMLInputElement>("input[name='strength']:checked"))?.value === "strong" ? "strong" : "simple";
        submitted = true;
      },
    },
    rejectClose: false,
  });

  if (!submitted || !rawNames.trim()) return;

  let result: BulkCreateResult | null;
  try {
    result = await bulkCreateUsers(rawNames, strength, rawFolder);
  } catch (err) {
    ui.notifications.error(`LoreBridge: ${err instanceof Error ? err.message : "Creation failed."}`);
    return;
  }
  if (!result) return;

  // Post a GM-only chat message with the credential table
  const rows = result.entries.map((e) => `
    <tr>
      <td style="padding:3px 8px;border-bottom:1px solid rgba(0,0,0,.12)">${e.username.replace(/&/g,"&amp;").replace(/</g,"&lt;")}</td>
      <td style="padding:3px 8px;border-bottom:1px solid rgba(0,0,0,.12);font-family:monospace">${e.password}</td>
      <td style="padding:3px 8px;border-bottom:1px solid rgba(0,0,0,.12);text-align:center">${e.actorCount}</td>
    </tr>`).join("");

  const messageHtml = `
    <strong>LoreBridge — Bulk Create Results</strong>
    <table style="width:100%;border-collapse:collapse;font-size:0.85em;margin-top:6px">
      <thead>
        <tr style="border-bottom:2px solid rgba(0,0,0,.2);text-align:left">
          <th style="padding:3px 8px">Username</th>
          <th style="padding:3px 8px">Password</th>
          <th style="padding:3px 8px;text-align:center">Actors</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <p style="margin:6px 0 0;font-size:0.78em;color:#666">Folder: <em>${(rawFolder.trim() || "Heroes").replace(/&/g,"&amp;").replace(/</g,"&lt;")}</em> — GM-only whisper</p>`;

  const gmIds = Array.from(game.users as unknown as FoundryUserCollection)
    .filter((u) => u.role === 4)
    .map((u) => u.id);
  await ChatMessage.create({
    content: messageHtml,
    whisper: gmIds,
    speaker: { alias: "LoreBridge" },
  });

  ui.notifications.info(`LoreBridge: Created ${result.entries.length} user(s) — see GM chat for credentials.`);
}

// ---------------------------------------------------------------------------
// #231 — Copy GM hotbar to connected players
// ---------------------------------------------------------------------------

type MacroSlotData = {
  slot: number;
  macroId: string | null;
  name: string | null;
};

type HotbarDistributeMessage = {
  type: typeof MSG_HOTBAR_DISTRIBUTE;
  pages: number[];
  slots: MacroSlotData[];
};

function serializeHotbarPages(pages: number[]): MacroSlotData[] {
  const hotbar = (ui as unknown as { hotbar?: FoundryHotbar }).hotbar;
  if (!hotbar) return [];

  const slots: MacroSlotData[] = [];
  // Collect all 50 slots (pages 1-5, 10 slots each)
  for (let page = 1; page <= 5; page++) {
    if (!pages.includes(page)) continue;
    const startSlot = (page - 1) * 10 + 1;
    for (let s = startSlot; s < startSlot + 10; s++) {
      const slotEntry = hotbar.slots?.find?.((x: HotbarSlot) => x.slot === s);
      slots.push({
        slot: s,
        macroId: slotEntry?.macro?.id ?? null,
        name: slotEntry?.macro?.name ?? null,
      });
    }
  }
  return slots;
}

/**
 * Apply received hotbar slot data to the current user's hotbar.
 * Called on each client when the socket message arrives.
 */
async function applyHotbarSlots(slots: MacroSlotData[]): Promise<void> {
  const user = game.user as unknown as FoundryUserDocument | undefined;
  if (!user || user.role === undefined) return;
  // GM users receive the broadcast but should not overwrite their own hotbar
  if ((game.user as unknown as { isGM?: boolean })?.isGM) return;

  const hotbarData: Record<string, string | null> = {};
  for (const slot of slots) {
    hotbarData[`hotbar.${slot.slot}`] = slot.macroId;
  }
  await user.update({ hotbar: hotbarData as unknown });
  ui.notifications.info("LoreBridge: Hotbar updated by GM.");
}

/**
 * Register the socket listener for hotbar distribution.
 * Must be called for ALL users (not GM-only) so players receive the message.
 */
export function registerHotbarDistributeListener(): void {
  getSocket().on(SOCKET_CHANNEL, (data: AnyRecord) => {
    if (data.type !== MSG_HOTBAR_DISTRIBUTE) return;
    const msg = data as unknown as HotbarDistributeMessage;
    void applyHotbarSlots(msg.slots);
  });
}

export async function openHotbarDistributeDialog(): Promise<void> {
  if (!game.user?.isGM) throw new Error("GM only.");

  const DialogV2 = getDialogV2();
  if (!DialogV2) throw new Error("DialogV2 unavailable.");

  const connectedPlayers = Array.from(game.users as unknown as FoundryUserCollection)
    .filter((u) => u.role !== undefined && u.role < 4); // non-GM roles

  if (connectedPlayers.length === 0) {
    ui.notifications.info("LoreBridge: No connected players to distribute to.");
    return;
  }

  let submitted = false;
  let selectedPages: number[] = [1];

  await DialogV2.prompt({
    window: { title: "Distribute Hotbar to Players" },
    content: `
      <div style="padding:8px;font-size:0.9em">
        <p style="margin:0 0 8px;color:#aaa">
          Select which hotbar page(s) to copy to all currently connected players.
          Each player's matching page will be overwritten.
        </p>
        <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:10px">
          ${[1,2,3,4,5].map((p) => `
            <label style="cursor:pointer;display:flex;align-items:center;gap:4px">
              <input type="checkbox" name="page${p}" value="${p}" ${p === 1 ? "checked" : ""}> Page ${p}
            </label>`).join("")}
        </div>
        <p style="margin:4px 0 0;font-size:0.82em;color:#888">
          Affects ${connectedPlayers.length} player account(s). Disconnected players are not changed.
        </p>
      </div>`,
    ok: {
      label: "Distribute",
      icon: "fas fa-share",
      callback: (_event: Event, button: HTMLButtonElement) => {
        const form = button.closest("form") ?? button.form ?? button.closest(".dialog-content");
        selectedPages = [1,2,3,4,5].filter((p) => {
          return form?.querySelector<HTMLInputElement>(`input[name='page${p}']`)?.checked;
        });
        submitted = true;
      },
    },
    rejectClose: false,
  });

  if (!submitted || selectedPages.length === 0) return;

  const slots = serializeHotbarPages(selectedPages);
  getSocket().emit(SOCKET_CHANNEL, {
    type: MSG_HOTBAR_DISTRIBUTE,
    pages: selectedPages,
    slots,
  } satisfies HotbarDistributeMessage);

  ui.notifications.info(`LoreBridge: Hotbar page(s) ${selectedPages.join(", ")} sent to ${connectedPlayers.length} player(s).`);
}

// ---------------------------------------------------------------------------
// Sidebar injection helpers
// ---------------------------------------------------------------------------

function _getSidebarRoot(args: unknown[]): HTMLElement | null {
  // Foundry passes (app, html, data) where html may be HTMLElement or jQuery.
  const html = args[1];
  if (html instanceof HTMLElement) return html;
  // jQuery-wrapped (.get(0) pattern used by character-vault)
  if (html && typeof (html as { get?: (i: number) => HTMLElement }).get === "function") {
    return (html as { get(i: number): HTMLElement }).get(0) ?? null;
  }
  // Fallback: ApplicationV2 app.element
  return (args[0] as { element?: HTMLElement }).element ?? null;
}

function _injectSidebarButton(
  args: unknown[],
  guardClass: string,
  html: string,
  handler: () => void,
): void {
  const root = _getSidebarRoot(args);
  if (!root || root.querySelector(`.${guardClass}`)) return;

  // Use the same target selector pattern as character-vault.
  const footer = (
    root.querySelector(".directory-footer") ??
    root.querySelector("footer") ??
    root.querySelector("section footer") ??
    (root.lastElementChild as HTMLElement | null) ??
    root
  ) as HTMLElement;

  const wrapper = document.createElement("div");
  wrapper.classList.add("action-buttons", "flexcol", guardClass);

  const btn = document.createElement("button");
  btn.type = "button";
  btn.innerHTML = html;
  btn.addEventListener("click", handler);

  wrapper.appendChild(btn);
  footer.appendChild(wrapper);
}

/**
 * Inject a "Bulk Create Player Characters" item into the Create Actor dialog.
 * Called from the renderApplicationV2 hook in main.ts alongside injectActorsSidebarButton.
 */
export function injectBulkCreateIntoCreateDialog(frame: HTMLElement): void {
  if (!game.user?.isGM) return;
  if (frame.querySelector("[data-lb-bulk-create]")) return;

  const windowTitle = (
    frame.querySelector(".window-title, header .title, .app-title")?.textContent ?? ""
  ).trim().toLowerCase();
  if (!windowTitle.includes("create actor") && !windowTitle.includes("new actor")) return;

  // Try to find the type-picker list used by the Create Actor dialog.
  const typeList = frame.querySelector<HTMLElement>(
    "ol.pick-an-option, ol.document-types, ol[class*='type'], .window-content form > ol, .window-content > ol",
  );

  if (typeList) {
    // Append as a list item matching the existing type rows.
    const li = document.createElement("li");
    li.dataset["lbBulkCreate"] = "1";
    li.style.cssText = "border-top:1px solid rgba(0,0,0,.15);padding-top:6px;margin-top:4px;list-style:none";
    li.innerHTML = `
      <label style="cursor:pointer;display:flex;align-items:center;gap:8px;padding:4px 8px;border-radius:4px">
        <i class="fas fa-users" style="width:22px;text-align:center;font-size:1em;color:#7ab"></i>
        <span>Bulk Create Player Characters</span>
      </label>`;
    li.querySelector("label")?.addEventListener("click", (e) => {
      e.preventDefault();
      void openBulkCreateDialog();
    });
    typeList.appendChild(li);
  } else {
    // Fallback: button above the form footer (same location as Generate Stat Block).
    const footer = frame.querySelector<HTMLElement>(".form-footer, .dialog-buttons");
    if (!footer) return;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.dataset["lbBulkCreate"] = "1";
    btn.style.cssText = "width:100%;margin-bottom:6px";
    btn.innerHTML = '<i class="fas fa-users"></i> Bulk Create Player Characters';
    btn.addEventListener("click", () => { void openBulkCreateDialog(); });
    footer.insertAdjacentElement("beforebegin", btn);
  }
}

/**
 * Register hooks that inject GM-only action buttons into Foundry sidebar panels.
 * #231: Macro Directory footer → Distribute Hotbar to Players
 */
export function registerSidebarHooks(): void {
  // Foundry v14: macro sidebar renders as "Macros" class → hook is "renderMacros".
  // Register both names so either v14 or older builds fire correctly.
  const _injectHotbarBtn = (...args: unknown[]) => {
    if (!game.user?.isGM) return;
    _injectSidebarButton(
      args,
      "lb-hotbar-distribute-btn",
      '<i class="fas fa-share"></i> Distribute Hotbar to Players',
      () => { void openHotbarDistributeDialog(); },
    );
  };
  Hooks.on("renderMacroDirectory", _injectHotbarBtn);
  Hooks.on("renderMacros", _injectHotbarBtn);
}
