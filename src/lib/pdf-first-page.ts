import { AI_IMAGE_MAX_SIDE, AI_IMAGE_QUALITY, pdfRenderScale } from "./image-size";

/** Client only: draw page 1 of a PDF to a JPEG in memory so the AI can read it. Nothing is saved or downloaded. Returns null if it cannot. */
export async function pdfFirstPageToJpeg(file: File, max = AI_IMAGE_MAX_SIDE, quality = AI_IMAGE_QUALITY): Promise<File | null> {
  let destroy: (() => Promise<void>) | undefined;
  try {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    if (!pdfjs.GlobalWorkerOptions.workerSrc)
      pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs", import.meta.url).toString();
    const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), useWasm: false });
    destroy = () => task.destroy();
    const doc = await task.promise;
    const page = await doc.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const scale = pdfRenderScale(base.width, base.height, max);
    if (!scale) return null;
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    await page.render({ canvas, viewport, background: "#fff" }).promise;
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", quality));
    canvas.width = canvas.height = 0; // free the pixels
    if (!blob) return null;
    const name = (file.name.replace(/\.[^.]+$/, "") || "scan") + "-page1.jpg";
    return new File([blob], name, { type: "image/jpeg" });
  } catch {
    return null;
  } finally {
    await destroy?.().catch(() => {});
  }
}
