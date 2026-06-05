/**
 * First `n` non-empty-trailing lines of a multiline string, with a trailing
 * ellipsis when content was dropped. Used for row previews; the full text
 * lives in the expanded sheet.
 */
export function firstLines(text: string, n: number): string {
  const lines = text.replace(/\s+$/, "").split("\n");
  if (lines.length <= n) return lines.join("\n");
  return lines.slice(0, n).join("\n") + "…";
}
