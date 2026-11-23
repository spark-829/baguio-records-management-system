import { fitWithin } from "./image-size";
import { pdfFirstPageToJpeg } from "./pdf-first-page";
import { encodePlan, jpegName, keepEncoded, THUMB_MAX_BYTES, THUMB_MAX_SIDE, THUMB_QUALITY, toHex } from "./upload-policy";

/** Client only. SHA-256 of a file as lowercase hex. Empty string when the browser cannot hash. */
export async function sha256Hex(blob: Blob): Promise<string> {
  try {
    if (typeof crypto === "undefined" || !crypto.subtle) return "";
    return toHex(await crypto.subtle.digest("SHA-256", await blob.arrayBuffer()));
  } catch {
    return "";
  }
}

async function drawJpeg(bitmap: ImageBitmap, maxSide: number, quality: number): Promise<Blob | null> {
  const { width, height } = fitWithin(bitmap.width, bitmap.height, maxSide);
  if (!width || !height) return null;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  try {
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(bitmap, 0, 0, width, height);
    return await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
  } finally {
    canvas.width = canvas.height = 0; // free the pixels
  }
}

/** Client only: shrink a big photo or scan to a JPEG before upload. Never throws; failures return the original. */
export async function compressForUpload(file: File, keepFull: boolean): Promise<{ file: File; compressed: boolean }> {
  const original = { file, compressed: false };
  if (!file.type.startsWith("image/")) return original;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    try {
      const plan = encodePlan({ type: file.type, size: file.size, width: bitmap.width, height: bitmap.height, keepFull });
      if (plan.action === "keep") return original;
      const blob = await drawJpeg(bitmap, plan.maxSide, plan.quality);
      if (!blob || !keepEncoded(file.size, blob.size, plan.mustUse)) return original;
      return { file: new File([blob], jpegName(file.name), { type: "image/jpeg" }), compressed: true };
    } finally {
      bitmap.close?.();
    }
  } catch {
    return original;
  }
}

async function buildThumb(file: File): Promise<File | null> {
  let out: Blob | null = null;
  if (file.type.startsWith("image/")) {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    try {
      out = await drawJpeg(bitmap, THUMB_MAX_SIDE, THUMB_QUALITY);
    } finally {
      bitmap.close?.();
    }
  } else if (file.type === "application/pdf") {
    out = await pdfFirstPageToJpeg(file, THUMB_MAX_SIDE, THUMB_QUALITY);
  }
  if (!out || out.size === 0 || out.size > THUMB_MAX_BYTES) return null;
  return new File([out], "thumb.jpg", { type: "image/jpeg" });
}

/** Client only: a small JPEG preview (page 1 for a PDF). Null when it cannot be made within 8 seconds. */
export async function makeThumb(file: File): Promise<File | null> {
  try {
    return await Promise.race([buildThumb(file), new Promise<null>((r) => setTimeout(() => r(null), 8000))]);
  } catch {
    return null;
  }
}
