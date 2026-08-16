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
