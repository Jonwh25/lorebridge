// Foundry ownership levels: NONE=0, LIMITED=1, OBSERVER=2, OWNER=3
const OBSERVER = 2;

export function isPlayerVisible(ownership: Record<string, number> | undefined): boolean {
  return (ownership?.default ?? 0) >= OBSERVER;
}
