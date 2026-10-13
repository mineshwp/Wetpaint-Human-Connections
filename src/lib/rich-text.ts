// Light rich text for KPI descriptions and comments: bold, italic, underline
// and bullet/numbered lists, stored as a tiny HTML subset in the existing text
// columns. Older plain-text values still work (see `richToHtml`). Server and
// client safe — no DOM needed. Always sanitise on write AND before rendering.

const ALLOWED = new Set(["b", "strong", "i", "em", "u", "ul", "ol", "li", "br", "p", "div"])
const HAS_TAGS = /<\/?(b|strong|i|em|u|ul|ol|li|br|p|div)\b/i

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

/** Keep only the allowed tags (attributes removed); everything else is dropped. */
export function sanitizeRichText(html: string | null | undefined): string {
  if (!html) return ""
  const out = html.replace(/<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g, (_m, slash: string, name: string) => {
    const n = name.toLowerCase()
    if (!ALLOWED.has(n)) return ""
    return n === "br" ? "<br>" : `<${slash}${n}>`
  })
  // Any "<" still left is not part of a tag we kept — make it inert.
  return out.replace(/<(?!\/?(?:b|strong|i|em|u|ul|ol|li|br|p|div)>)/g, "&lt;")
}

/** True when a value is the HTML form (otherwise it is legacy plain text). */
export function isRichHtml(value: string): boolean {
  return HAS_TAGS.test(value)
}

/** Safe HTML for display or for loading into the editor. */
export function richToHtml(value: string | null | undefined): string {
  if (!value) return ""
  if (isRichHtml(value)) return sanitizeRichText(value)
  return escapeHtml(value).replace(/\r?\n/g, "<br>")
}

/** Plain text (bullets as "• "), for AI prompts and emails. */
export function richToPlain(value: string | null | undefined): string {
  if (!value) return ""
  if (!isRichHtml(value)) return value
  return sanitizeRichText(value)
    .replace(/<li>/gi, "• ")
    .replace(/<\/(li|p|div)>|<br>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

/** True when there is no visible text (e.g. "<br>" or "<div></div>"). */
export function isRichEmpty(value: string | null | undefined): boolean {
  return !value || richToPlain(value).replace(/\s/g, "") === ""
}
