import type { ReactNode } from "react";

export function Empty({
  icon,
  title,
  hint,
}: {
  icon: ReactNode;
  title: string;
  hint?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-8 py-16 text-center">
      <div className="mb-3 text-muted">{icon}</div>
      <p className="font-display text-[15px] font-semibold text-foreground">
        {title}
      </p>
      {hint && <p className="mt-1 max-w-[16rem] text-[13px] text-muted">{hint}</p>}
    </div>
  );
}
