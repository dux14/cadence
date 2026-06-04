import { cn } from "@/lib/utils";

/** The C-Forward mark — the Cadence "C" closed by a forward chevron, one continuous stroke, on the Sky & Mint gradient. */
export function Logo({
  size = 32,
  rounded = true,
  className,
}: {
  size?: number;
  rounded?: boolean;
  className?: string;
}) {
  return (
    <span
      style={{ width: size, height: size }}
      className={cn(
        "inline-flex items-center justify-center bg-gradient-to-br from-[#A9C8EE] to-[#9ED9C5]",
        rounded && "rounded-[28%]",
        className,
      )}
    >
      <svg
        width={size * 0.72}
        height={size * 0.72}
        viewBox="0 0 1024 1024"
        fill="none"
        aria-hidden
      >
        <path
          d="M 641 358 A 230 230 0 1 0 641 666 M 641 358 L 768 512 L 641 666"
          stroke="#fff"
          strokeWidth="112"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}
