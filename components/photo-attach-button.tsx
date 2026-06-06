"use client";

import { useRef } from "react";
import { Camera, ImagePlus } from "lucide-react";
import { compressImage, type CompressedImage } from "@/lib/image/compress";

export function PhotoAttachButton({
  onAttach,
  onError,
  disabled,
}: {
  onAttach: (img: CompressedImage) => void | Promise<void>;
  onError?: (message: string) => void;
  disabled?: boolean;
}) {
  const pickerRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  async function handleFiles(files: FileList | null) {
    if (!files) return;
    for (const file of Array.from(files)) {
      if (!file.type.startsWith("image/")) continue;
      try {
        const img = await compressImage(file);
        await onAttach(img);
      } catch {
        onError?.("Couldn't add that image.");
      }
    }
  }

  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        disabled={disabled}
        onClick={() => pickerRef.current?.click()}
        aria-label="Add photo"
        className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-[12px] text-muted transition hover:text-foreground disabled:opacity-50"
      >
        <ImagePlus size={14} /> Photo
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() => cameraRef.current?.click()}
        aria-label="Take photo"
        className="grid h-7 w-7 place-items-center rounded-full border border-border text-muted transition hover:text-foreground disabled:opacity-50 md:hidden"
      >
        <Camera size={14} />
      </button>
      <input
        ref={pickerRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          void handleFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => {
          void handleFiles(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}
