const URL_RE = /\bhttps?:\/\/[^\s]+/gi;

/** Pull URLs out of free text, leaving a clean title behind. */
export function extractLinks(input: string): { title: string; links: string[] } {
  const links = input.match(URL_RE) ?? [];
  let title = input;
  for (const l of links) title = title.replace(l, "");
  title = title.replace(/\s{2,}/g, " ").trim();
  return { title: title || (links[0] ?? input.trim()), links };
}

/** A short, human label for a URL chip. */
export function linkLabel(url: string): string {
  try {
    const u = new URL(url);
    if (u.hostname.includes("atlassian")) {
      const m = u.pathname.match(/[A-Z]+-\d+/);
      if (m) return m[0];
      return "Jira";
    }
    if (u.hostname.includes("spotify")) return "Spotify";
    if (u.hostname.includes("github")) return "GitHub";
    if (u.hostname.includes("youtube") || u.hostname.includes("youtu.be"))
      return "YouTube";
    return u.hostname.replace(/^www\./, "");
  } catch {
    return "link";
  }
}
