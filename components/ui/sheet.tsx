"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { cn } from "@/lib/utils";

/**
 * Controlled bottom sheet. While open, an extra history entry makes the
 * hardware/browser Back button close the sheet instead of leaving the page.
 */
export function Sheet({
  open,
  onOpenChange,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}) {
  React.useEffect(() => {
    if (!open) return;
    let closedByPop = false;
    window.history.pushState({ sheet: true }, "");
    const onPop = () => {
      closedByPop = true;
      onOpenChange(false);
    };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      // Closed by tap/escape: drop the entry we pushed so Back stays in sync.
      if (!closedByPop) window.history.back();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-run only on open/close
  }, [open]);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      {children}
    </Dialog.Root>
  );
}

export const SheetClose = Dialog.Close;

/**
 * iOS Safari overlays the keyboard instead of resizing the viewport, so a
 * bottom-0 sheet ends up hidden behind it. While the sheet is mounted, track
 * the visualViewport and lift the sheet by the keyboard's overlap.
 *
 * Gated to mobile (< 768 px) so inline style.bottom never overrides the
 * md:bottom-auto that centres the modal on desktop.
 */
function trackKeyboardInset(el: HTMLElement): (() => void) | undefined {
  // Skip registering listeners entirely when mounting on desktop — the modal
  // is centred and a physical keyboard does not shrink visualViewport.
  // The per-invocation guard inside update() is the authoritative check: if
  // the user resizes to ≥768 px while the sheet is open, we clear the inline
  // style so md:bottom-auto (Tailwind) is never clobbered by an inline value.
  if (window.matchMedia("(min-width: 768px)").matches) return;
  const vv = window.visualViewport;
  if (!vv) return;
  const update = () => {
    if (window.matchMedia("(min-width: 768px)").matches) {
      el.style.bottom = "";
      return;
    }
    const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
    el.style.bottom = `${inset}px`;
  };
  update();
  vv.addEventListener("resize", update);
  vv.addEventListener("scroll", update);
  return () => {
    vv.removeEventListener("resize", update);
    vv.removeEventListener("scroll", update);
  };
}

export function SheetContent({
  children,
  className,
  title,
}: {
  children: React.ReactNode;
  className?: string;
  title: string;
}) {
  return (
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px]" />
      <Dialog.Content
        ref={(el) => (el ? trackKeyboardInset(el) : undefined)}
        className={cn(
          // Móvil: bottom sheet. ≥md: modal centrado (max-w-560).
          "fixed z-50 overflow-y-auto border-border bg-surface shadow-2xl focus:outline-none",
          "inset-x-0 bottom-0 mx-auto max-h-[85dvh] max-w-md rounded-t-3xl border-t p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]",
          "md:inset-x-auto md:bottom-auto md:left-1/2 md:top-1/2 md:max-h-[85vh] md:w-[560px] md:max-w-[calc(100vw-2rem)] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-3xl md:border md:p-6 md:pb-6",
          className,
        )}
      >
        <Dialog.Title className="sr-only">{title}</Dialog.Title>
        <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-border md:hidden" />
        {children}
      </Dialog.Content>
    </Dialog.Portal>
  );
}
