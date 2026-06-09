"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

// App Router error boundary. Without it, an uncaught render error (e.g. a photo
// blob that failed to materialise) tears down the entire PWA and shows the
// browser's bleak-through "this page couldn't load" chrome. This keeps the
// failure local and recoverable.
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="grid h-12 w-12 place-items-center rounded-full bg-danger/10 text-danger">
        <AlertTriangle size={22} />
      </div>
      <div className="space-y-1">
        <p className="font-display text-[17px] font-semibold text-foreground">
          Something went wrong
        </p>
        <p className="text-[13px] text-muted">
          That view hit a snag. Your data is safe — try again.
        </p>
      </div>
      <button
        type="button"
        onClick={() => reset()}
        className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-[13px] font-medium text-primary-ink transition hover:opacity-90"
      >
        <RotateCcw size={14} /> Try again
      </button>
    </div>
  );
}
