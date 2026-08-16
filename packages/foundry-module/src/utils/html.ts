/**
 * Convert HTML to Markdown, preserving headings, paragraphs, lists, and
 * inline formatting. Uses DOMParser in-browser; regex fallback for tests.
 */
export function htmlToMarkdown(html: string): string {
  if (!html) return "";

  if (typeof DOMParser !== "undefined") {
    const doc = new DOMParser().parseFromString(html, "text/html");

    function processNode(node: Node): string {
      if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
      if (node.nodeType !== Node.ELEMENT_NODE) return "";
      const el = node as Element;
      const tag = el.tagName.toLowerCase();
      const inner = () => Array.from(el.childNodes).map(processNode).join("");
      switch (tag) {
        case "h1": return `# ${inner().trim()}\n\n`;
        case "h2": return `## ${inner().trim()}\n\n`;
        case "h3": return `### ${inner().trim()}\n\n`;
        case "h4": return `#### ${inner().trim()}\n\n`;
        case "p": {
          const text = inner().trim();
          return text ? `${text}\n\n` : "";
        }
        case "br": return "\n";
        case "strong":
        case "b": return `**${inner()}**`;
        case "em":
        case "i": return `*${inner()}*`;
        case "ul": return `${inner()}\n`;
        case "ol": return `${inner()}\n`;
        case "li": return `- ${inner().trim()}\n`;
        case "blockquote": return `> ${inner().trim()}\n\n`;
        case "hr": return `---\n\n`;
        case "a": {
          const href = el.getAttribute("href") ?? "";
          const text = inner();
          return href ? `[${text}](${href})` : text;
        }
        default: return inner();
      }
    }

    return processNode(doc.body).replace(/\n{3,}/g, "\n\n").trim();
  }

  // Regex fallback (Node/test environment)
  return html
    .replace(/<h([1-4])[^>]*>([\s\S]*?)<\/h\1>/gi, (_, n, t) => `${"#".repeat(Number(n))} ${t.replace(/<[^>]*>/g, "").trim()}\n\n`)
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<\/li>/gi, "\n")
    .replace(/<strong[^>]*>([\s\S]*?)<\/strong>/gi, "**$1**")
    .replace(/<em[^>]*>([\s\S]*?)<\/em>/gi, "*$1*")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function plainText(html: string): string {
  if (typeof DOMParser !== "undefined") {
    return (
      new DOMParser().parseFromString(html, "text/html").body.textContent
        ?.replace(/\s+/g, " ")
        .trim() ?? ""
    );
  }
  return html.replace(/<[^>]*>/g, " ").replace(/&nbsp;/gi, " ").replace(/\s+/g, " ").trim();
}

export function escHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
