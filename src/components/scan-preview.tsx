"use client";

import { useEffect, useRef } from "react";

/**
 * Draws a picked image onto a canvas in memory. No URL is made from the file, so nothing the
 * user picked is ever used as an element source.
 */
export function ScanPreview({ image, label }: { image: Blob; label: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let done = false;
    let bitmap: ImageBitmap | null = null;
    createImageBitmap(image, { imageOrientation: "from-image" })
      .then((b) => {
        bitmap = b;
        const canvas = ref.current;
        if (done || !canvas) return;
        const s = Math.min(1, 1200 / Math.max(b.width, b.height));
        canvas.width = Math.max(1, Math.round(b.width * s));
        canvas.height = Math.max(1, Math.round(b.height * s));
        canvas.getContext("2d")?.drawImage(b, 0, 0, canvas.width, canvas.height);
      })
      .catch(() => {})
      .finally(() => {
        if (done) bitmap?.close?.();
      });
    return () => {
      done = true;
      bitmap?.close?.();
    };
  }, [image]);
  return <canvas ref={ref} role="img" aria-label={label} className="max-h-64 w-full rounded-lg border border-slate-200 object-contain" />;
}
