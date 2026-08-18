/**
 * Lightweight ApplicationV2 progress dialog for GitHub backup operations.
 * Uses direct DOM updates between chunks to avoid full re-render overhead.
 */

const _TestSafeBase = class {
  static DEFAULT_OPTIONS = {};
  readonly rendered = false;
  readonly element: HTMLElement = document.createElement("div");
  render(_o?: boolean | { force?: boolean }): Promise<unknown> { return Promise.resolve(undefined); }
  close(_o?: { force?: boolean }): Promise<unknown> { return Promise.resolve(undefined); }
  _renderHTML(_c: Record<string, unknown>, _o: unknown): Promise<HTMLElement> { return Promise.resolve(document.createElement("div")); }
  _replaceHTML(_r: HTMLElement, _c: HTMLElement, _o: unknown): void { return; }
} as unknown as typeof FoundryApplicationV2;

const _AppBase: typeof FoundryApplicationV2 = (
  globalThis as unknown as {
    foundry?: { applications?: { api?: { ApplicationV2?: typeof FoundryApplicationV2 } } };
  }
).foundry?.applications?.api?.ApplicationV2 ?? _TestSafeBase;

export class BackupProgressDialog extends _AppBase {
  private _label: string;
  private _done: number;
  private _total: number;

  static DEFAULT_OPTIONS = {
    ..._AppBase.DEFAULT_OPTIONS,
    window: { title: "LoreBridge: GitHub Backup", resizable: false },
    position: { width: 380, height: "auto" },
  };

  constructor(label: string, total: number) {
    super({});
    this._label = label;
    this._done = 0;
    this._total = total;
  }

  async _renderHTML(
    _context: Record<string, unknown>,
    _options: unknown,
  ): Promise<HTMLElement> {
    const pct = this._total > 0 ? Math.round((this._done / this._total) * 100) : 0;
    const wrap = document.createElement("div");
    wrap.classList.add("lb-backup-progress");
    wrap.style.cssText = "padding: 1rem 1.25rem;";
    wrap.innerHTML = `
      <p class="lb-bp__label" style="margin:0 0 0.5rem;font-weight:600;">${this._label}</p>
      <progress class="lb-bp__bar" value="${this._done}" max="${this._total}" style="width:100%;height:18px;"></progress>
      <p class="lb-bp__count" style="text-align:center;margin:0.4rem 0 0;font-size:0.85em;">${this._done} / ${this._total} files (${pct}%)</p>
    `;
    return wrap;
  }

  _replaceHTML(result: HTMLElement, content: HTMLElement, _options: unknown): void {
    content.replaceChildren(result);
  }

  setProgress(done: number, status?: string): void {
    this._done = done;
    if (!this.element) return;
    const pct = this._total > 0 ? Math.round((done / this._total) * 100) : 0;
    const bar = this.element.querySelector<HTMLProgressElement>(".lb-bp__bar");
    const count = this.element.querySelector(".lb-bp__count");
    if (bar) { bar.value = done; bar.max = this._total; }
    if (count) {
      count.textContent = status
        ? `${done} / ${this._total} files — ${status}`
        : `${done} / ${this._total} files (${pct}%)`;
    }
  }
}
