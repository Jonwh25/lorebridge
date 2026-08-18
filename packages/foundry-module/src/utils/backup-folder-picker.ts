import { escHtml } from "./html.js";

export type FolderOption = { id: string | null; name: string };

/**
 * Shows a DialogV2 letting the user pick which folders to include in a backup.
 * All folders are selected by default. Returns selected folder IDs (null = no-folder
 * items), or null if the user cancels.
 */
export function promptFolderSelection(
  title: string,
  folders: FolderOption[],
): Promise<Array<string | null> | null> {
  return new Promise((resolve) => {
    const folderRows = folders
      .map(
        (f) =>
          `<label style="display:flex;align-items:center;gap:6px;margin:4px 0;cursor:pointer;">
            <input type="checkbox" class="lb-folder-cb" data-folder-id="${escHtml(f.id ?? "__none__")}" checked>
            ${escHtml(f.name)}
          </label>`,
      )
      .join("");

    const content = `<div style="padding:0.5rem 0.75rem;">
      <div style="display:flex;gap:12px;margin-bottom:8px;font-size:0.85em;">
        <button type="button" class="lb-select-all" style="background:none;border:none;padding:0;cursor:pointer;color:var(--color-text-hyperlink,#4a90d9);">Select All</button>
        <button type="button" class="lb-select-none" style="background:none;border:none;padding:0;cursor:pointer;color:var(--color-text-hyperlink,#4a90d9);">Select None</button>
      </div>
      <hr style="margin:0 0 8px;border:none;border-top:1px solid #666;">
      <div style="max-height:260px;overflow-y:auto;padding-right:4px;">
        ${folderRows}
      </div>
    </div>`;

    const dlg = new foundry.applications.api.DialogV2({
      window: { title },
      position: { width: 380 },
      content,
      buttons: [
        {
          action: "backup",
          label: "Backup",
          icon: "fas fa-cloud-upload-alt",
          default: true,
          callback: (_event, button) => {
            const el: HTMLElement =
              button.closest("dialog") ?? button.closest(".app") ?? button.ownerDocument.body;
            const selected = Array.from(
              el.querySelectorAll<HTMLInputElement>(".lb-folder-cb:checked"),
            ).map((i) => (i.dataset.folderId === "__none__" ? null : (i.dataset.folderId ?? null)));
            resolve(selected.length > 0 ? selected : null);
          },
        },
        {
          action: "cancel",
          label: "Cancel",
          icon: "fas fa-times",
          callback: () => { resolve(null); },
        },
      ],
    });

    dlg.render({ force: true }).then(() => {
      const el = dlg.element;
      el.querySelector(".lb-select-all")?.addEventListener("click", () => {
        el.querySelectorAll<HTMLInputElement>(".lb-folder-cb").forEach((cb) => { cb.checked = true; });
      });
      el.querySelector(".lb-select-none")?.addEventListener("click", () => {
        el.querySelectorAll<HTMLInputElement>(".lb-folder-cb").forEach((cb) => { cb.checked = false; });
      });
    });
  });
}
