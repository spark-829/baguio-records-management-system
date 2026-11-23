import { describe, expect, it } from "vitest";
import { fitWithin, imageDimensions, pdfRenderScale } from "../src/lib/image-size";

describe("fitWithin", () => {
  it("shrinks large images to the longest side", () => {
    expect(fitWithin(4000, 3000)).toEqual({ width: 1280, height: 960 });
    expect(fitWithin(3000, 4000)).toEqual({ width: 960, height: 1280 });
  });
  it("leaves small images alone", () => {
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
  });
  it("returns 0x0 for bad sizes", () => {
    expect(fitWithin(0, 100)).toEqual({ width: 0, height: 0 });
    expect(fitWithin(-5, 100)).toEqual({ width: 0, height: 0 });
  });
});

const bytes = (...n: number[]) => new Uint8Array(n);
const str = (t: string) => [...t].map((c) => c.charCodeAt(0));
const be32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];

describe("imageDimensions", () => {
  it("reads a PNG header", () => {
    const b = bytes(0x89, ...str("PNG"), 13, 10, 26, 10, ...be32(13), ...str("IHDR"), ...be32(800), ...be32(600), 8, 6, 0, 0, 0);
    expect(imageDimensions(b)).toEqual({ width: 800, height: 600 });
  });
  it("reads a JPEG start-of-frame, skipping other segments", () => {
    const b = bytes(0xff, 0xd8, 0xff, 0xe0, 0, 4, 1, 2, 0xff, 0xc0, 0, 11, 8, 0x04, 0xb0, 0x06, 0x40, 3, 1, 0x22, 0);
    expect(imageDimensions(b)).toEqual({ width: 1600, height: 1200 });
  });
  it("reads WEBP lossy, lossless and extended headers", () => {
    const riff = [...str("RIFF"), 0, 0, 0, 0, ...str("WEBP")];
    const lossy = bytes(...riff, ...str("VP8 "), 0, 0, 0, 0, 0, 0, 0, 0x9d, 0x01, 0x2a, 0x20, 0x03, 0x58, 0x02);
    expect(imageDimensions(lossy)).toEqual({ width: 800, height: 600 });
    // 800x600 lossless: w-1 = 799, h-1 = 599
    const w = 799, h = 599;
    const lossless = bytes(...riff, ...str("VP8L"), 0, 0, 0, 0, 0x2f, w & 255, ((w >> 8) & 0x3f) | ((h & 3) << 6), (h >> 2) & 255, (h >> 10) & 15, 0, 0, 0, 0, 0);
    expect(imageDimensions(lossless)).toEqual({ width: 800, height: 600 });
    const ext = bytes(...riff, ...str("VP8X"), 10, 0, 0, 0, 0, 0, 0, 0, 0x1f, 0x03, 0, 0x57, 0x02, 0);
    expect(imageDimensions(ext)).toEqual({ width: 800, height: 600 });
  });
  it("returns null when the header cannot be read", () => {
    expect(imageDimensions(bytes())).toBeNull();
    expect(imageDimensions(bytes(1, 2, 3, 4, 5))).toBeNull();
    expect(imageDimensions(bytes(0xff, 0xd8, 0xff, 0xe0, 0, 4, 1, 2))).toBeNull();
  });
});

describe("pdfRenderScale", () => {
  it("enlarges small pages to the longest side", () => {
    expect(pdfRenderScale(612, 792)).toBeCloseTo(1280 / 792);
    expect(pdfRenderScale(792, 612)).toBeCloseTo(1280 / 792);
  });
  it("shrinks big pages", () => {
    expect(pdfRenderScale(2550, 3300)).toBeCloseTo(1280 / 3300);
  });
  it("returns 0 for bad sizes", () => {
    expect(pdfRenderScale(0, 100)).toBe(0);
    expect(pdfRenderScale(-1, 5)).toBe(0);
  });
  it("accepts a custom max", () => {
    expect(pdfRenderScale(100, 50, 200)).toBe(2);
  });
});
