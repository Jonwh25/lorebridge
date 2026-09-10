import { postBackend } from "./backend-client.js";

export async function readLoreJson<T>(folderPath: string, filename: string): Promise<T | null> {
  try {
    const response = await fetch(`${folderPath}/${filename}`);
    if (!response.ok) return null;
    return response.json() as Promise<T>;
  } catch {
    return null;
  }
}

export async function writeLoreJson(folderPath: string, filename: string, data: unknown): Promise<void> {
  const fp = foundry.applications.apps.FilePicker.implementation;
  try { await fp.createDirectory("data", folderPath); } catch { /* already exists */ }
  const content = JSON.stringify(data, null, 2);
  const file = new File([content], filename, { type: "application/json" });
  const result = await fp.upload("data", folderPath, file, {});
  if (!result) throw new Error(`Failed to write ${folderPath}/${filename}`);
}

export async function backupLoreFile(
  folderPath: string,
  filename: string,
  commitMessage: string,
): Promise<void> {
  const data = await readLoreJson<unknown>(folderPath, filename);
  if (data === null) throw new Error(`File ${filename} not found — run Initialize first.`);
  const content = JSON.stringify(data, null, 2);
  await postBackend("v1/backup/github/lore-files", {
    files: [{ path: `campaign/${folderPath}/${filename}`, content }],
    commitMessage,
  });
}
