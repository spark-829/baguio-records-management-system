import { AI_IMAGE_QUALITY, fitWithin } from "./image-size";

/** Client only: shrink a scanned image to a small JPEG before sending it to AI. Non-images and failures return the original. */
export async function shrinkForAi(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const { width, height } = fitWithin(bitmap.width, bitmap.height);
    if (!width || !height) return file;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", AI_IMAGE_QUALITY));
    if (!blob) return file;
    const base = file.name.replace(/\.[^.]+$/, "") || "scan";
    return new File([blob], `${base}.jpg`, { type: "image/jpeg" });
  } catch {
    return file;
  }
}
