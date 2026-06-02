import { cn } from "@/lib/utils";

/** The Momentum mark — forward chevrons on the Sky & Mint gradient. */
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
        width={size * 0.56}
        height={size * 0.52}
        viewBox="0 0 72 68"
        fill="none"
        aria-hidden
      >
        <path
          d="M16 18l18 16-18 16"
          stroke="#fff"
          strokeWidth="8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M38 18l18 16-18 16"
          stroke="#fff"
          strokeWidth="8"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.55"
        />
      </svg>
    </span>
  );
}
