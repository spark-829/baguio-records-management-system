import "server-only";
import { PDFDocument, StandardFonts, degrees, rgb } from "pdf-lib";

/**
 * Stamps "Viewed by <name>, <date>" on every page so a leaked copy can be traced.
 * PDFs are stamped in place; PNG and JPG images are placed on a PDF page and stamped.
 * Returns null for file types that cannot be stamped.
 */
export async function watermark(bytes: Uint8Array, mimeType: string, text: string): Promise<Uint8Array | null> {
  let pdf: PDFDocument;
  if (mimeType === "application/pdf") {
    pdf = await PDFDocument.load(bytes, { ignoreEncryption: true });
  } else if (mimeType === "image/png" || mimeType === "image/jpeg") {
    pdf = await PDFDocument.create();
    const img = mimeType === "image/png" ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
    const page = pdf.addPage([img.width, img.height]);
    page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
  } else {
    return null;
  }
  const font = await pdf.embedFont(StandardFonts.HelveticaBold);
  for (const page of pdf.getPages()) {
    const { width, height } = page.getSize();
    // Diagonal stamp sized to fit inside the page (rotated 30 degrees)
    const size = Math.max(8, Math.min(Math.min(width, height) / 28, (0.85 * width) / (font.widthOfTextAtSize(text, 1) * Math.cos(Math.PI / 6))));
    // Footer line, always readable
    page.drawText(text, { x: 24, y: 14, size: Math.min(9, Math.max(6, size * 0.6)), font, color: rgb(0.6, 0.1, 0.1), opacity: 0.85 });
    // Large diagonal stamp across the page
    const w = font.widthOfTextAtSize(text, size);
    page.drawText(text, {
      x: width / 2 - (w / 2) * Math.cos(Math.PI / 6),
      y: height / 2 - (w / 2) * Math.sin(Math.PI / 6),
      size,
      font,
      color: rgb(0.75, 0.1, 0.1),
      opacity: 0.18,
      rotate: degrees(30),
    });
  }
  return pdf.save();
}
