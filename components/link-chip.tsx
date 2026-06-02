import { ExternalLink } from "lucide-react";
import { linkLabel } from "@/lib/links";

export function LinkChip({ url }: { url: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className="inline-flex items-center gap-1 rounded-md bg-border/60 px-1.5 py-0.5 text-[11px] text-muted transition hover:text-foreground"
    >
      <ExternalLink size={11} />
      {linkLabel(url)}
    </a>
  );
}
