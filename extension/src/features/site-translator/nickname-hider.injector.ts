const LOGOUT_SELECTOR = '.PageHeader .right > p > a[href*="/oauth/logout"]';

export class NicknameHider {
  private textNode: Text | null = null;
  private originalText: string | null = null;
  private isApplied = false;

  apply(label: string): void {
    const node = this.resolveTextNode();
    if (!node) return;
    if (!this.isApplied) {
      this.originalText = node.nodeValue;
    }
    node.nodeValue = label;
    this.isApplied = true;
  }

  restore(): void {
    if (!this.isApplied || !this.textNode) return;
    if (this.originalText !== null) {
      this.textNode.nodeValue = this.originalText;
    }
    this.isApplied = false;
  }

  dispose(): void {
    this.restore();
    this.textNode = null;
    this.originalText = null;
  }

  private resolveTextNode(): Text | null {
    if (this.textNode?.isConnected) return this.textNode;
    this.textNode = null;
    const logoutLink = document.querySelector<HTMLAnchorElement>(LOGOUT_SELECTOR);
    if (!logoutLink) return null;
    const paragraph = logoutLink.parentElement;
    if (!paragraph) return null;
    for (const child of paragraph.childNodes) {
      if (child.nodeType === Node.TEXT_NODE && child.nodeValue?.trim()) {
        this.textNode = child as Text;
        return this.textNode;
      }
    }
    return null;
  }
}
