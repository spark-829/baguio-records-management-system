import { describe, expect, it, vi } from "vitest";
import { PDFDocument } from "pdf-lib";

vi.mock("server-only", () => ({}));
const { watermark } = await import("../src/lib/watermark");

// 1x1 red PNG
const PNG = Uint8Array.from(
  atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg=="),
  (c) => c.charCodeAt(0),
);

describe("download watermark", () => {
  it("stamps every page of a PDF", async () => {
    const src = await PDFDocument.create();
    src.addPage([612, 792]);
    src.addPage([612, 792]);
    const out = await watermark(await src.save(), "application/pdf", "Viewed by Jose Reyes, Nov 20, 2026");
    expect(out).not.toBeNull();
    const doc = await PDFDocument.load(out!);
    expect(doc.getPageCount()).toBe(2);
    expect(Buffer.from(out!).length).toBeGreaterThan(1000);
  });

  it("turns an image into a stamped PDF", async () => {
    const out = await watermark(PNG, "image/png", "Viewed by Jose Reyes, Nov 20, 2026");
    expect(out).not.toBeNull();
    expect(Buffer.from(out!.slice(0, 5)).toString()).toBe("%PDF-");
  });

  it("leaves unsupported types alone", async () => {
    expect(await watermark(new Uint8Array([1, 2, 3]), "image/webp", "x")).toBeNull();
  });
});
