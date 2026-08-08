const AppBase = foundry.applications.api.ApplicationV2;

export function replaceApprovalQueueHtml(result: HTMLElement, content: HTMLElement): void {
  content.replaceChildren(result);
}

/**
 * Shared resizable, internally scrolling shell for GM approval queues.
 * Feature-specific panels retain ownership of their payloads and actions.
 */
export abstract class ApprovalQueuePanel extends AppBase {
  protected abstract renderApprovalQueueHtml(): string;

  override async _renderHTML(): Promise<HTMLElement> {
    const root = document.createElement("div");
    root.className = "lb-approval-queue";
    root.innerHTML = this.renderApprovalQueueHtml();
    return root;
  }

  override _replaceHTML(result: HTMLElement, content: HTMLElement): void {
    replaceApprovalQueueHtml(result, content);
  }
}
