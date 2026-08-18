import { escHtml } from "./html.js";

export type FolderOption = { id: string | null; name: string };

/**
 * Shows a DialogV2 letting the user pick which folders to include in a backup.
 * Returns the selected folder IDs (null = no-folder items), or null if cancelled.
 * "Backup All" is checked by default; unchecking it enables per-folder selection.
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
            <input type="checkbox" class="lb-folder-cb" data-folder-id="${escHtml(f.id ?? "__none__")}" checked disabled>
            ${escHtml(f.name)}
          </label>`,
      )
      .join("");

    const content = `<div style="padding:0.5rem 0.75rem;">
      <label style="display:flex;align-items:center;gap:6px;margin:0 0 8px;cursor:pointer;font-weight:600;">
        <input type="checkbox" id="lb-backup-all" checked
          onchange="var cbs=this.closest('.app, dialog').querySelectorAll('.lb-folder-cb');cbs.forEach(function(cb){cb.disabled=document.getElementById('lb-backup-all').checked;});">
        Backup All
      </label>
      <hr style="margin:0 0 8px;border:none;border-top:1px solid #666;">
      ${folderRows}
    </div>`;

    new foundry.applications.api.DialogV2({
      window: { title },
      position: { width: 380, height: "auto" },
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
            const backupAll = el.querySelector<HTMLInputElement>("#lb-backup-all")?.checked ?? true;
            if (backupAll) {
              resolve(folders.map((f) => f.id));
              return;
            }
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
    }).render({ force: true });
  });
}
