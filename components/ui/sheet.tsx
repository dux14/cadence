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
 */
function trackKeyboardInset(el: HTMLElement): (() => void) | undefined {
  const vv = window.visualViewport;
  if (!vv) return;
  const update = () => {
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
          "fixed inset-x-0 bottom-0 z-50 mx-auto max-h-[85dvh] max-w-md overflow-y-auto rounded-t-3xl border-t border-border bg-surface p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl focus:outline-none",
          className,
        )}
      >
        <Dialog.Title className="sr-only">{title}</Dialog.Title>
        <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-border" />
        {children}
      </Dialog.Content>
    </Dialog.Portal>
  );
}
