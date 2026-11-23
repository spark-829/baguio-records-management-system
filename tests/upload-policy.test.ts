import { describe, expect, it } from "vitest";
import {
  checkUpload,
  duplicateOf,
  encodePlan,
  formatBytes,
  FULL_QUALITY,
  isSha256Hex,
  isValidThumb,
  jpegName,
  keepEncoded,
  parseOriginalSize,
  thumbPath,
  toHex,
  UPLOAD_MAX_SIDE,
  UPLOAD_QUALITY,
} from "../src/lib/upload-policy";

const A = "a".repeat(64);
const B = "b".repeat(64);

describe("checkUpload", () => {
  it("returns the right message or null", () => {
    expect(checkUpload("application/pdf", 0)).toBe("Choose a file");
    expect(checkUpload("application/pdf", 11 * 1024 * 1024)).toBe("File is larger than 10 MB");
    expect(checkUpload("image/gif", 100)).toBe("Use a PDF, PNG, JPG or WEBP file");
    expect(checkUpload("image/png", 100)).toBeNull();
  });
});

describe("encodePlan", () => {
  const base = { type: "image/jpeg", size: 300_000, width: 1600, height: 1200, keepFull: false };
  it("keeps PDFs", () => expect(encodePlan({ ...base, type: "application/pdf" })).toEqual({ action: "keep" }));
  it("keeps small images", () => expect(encodePlan(base)).toEqual({ action: "keep" }));
  it("encodes huge dimensions", () =>
    expect(encodePlan({ ...base, width: 4000 })).toEqual({ action: "encode", maxSide: UPLOAD_MAX_SIDE, quality: UPLOAD_QUALITY, mustUse: false }));
  it("encodes large files", () =>
    expect(encodePlan({ ...base, size: 3_000_000, width: 2000 })).toEqual({ action: "encode", maxSide: UPLOAD_MAX_SIDE, quality: UPLOAD_QUALITY, mustUse: false }));
  it("keeps JPEG when keepFull", () => expect(encodePlan({ ...base, size: 3_000_000, keepFull: true })).toEqual({ action: "keep" }));
  it("always converts HEIC", () => {
    expect(encodePlan({ ...base, type: "image/heic" })).toEqual({ action: "encode", maxSide: UPLOAD_MAX_SIDE, quality: UPLOAD_QUALITY, mustUse: true });
    expect(encodePlan({ ...base, type: "image/heic", keepFull: true })).toEqual({ action: "encode", maxSide: Infinity, quality: FULL_QUALITY, mustUse: true });
  });
});

describe("keepEncoded", () => {
  it("needs a 10% saving unless forced", () => {
    expect(keepEncoded(1000, 900, false)).toBe(true);
    expect(keepEncoded(1000, 901, false)).toBe(false);
    expect(keepEncoded(1000, 0, false)).toBe(false);
    expect(keepEncoded(1000, 5000, true)).toBe(true);
  });
});

describe("jpegName", () => {
  it("swaps the extension", () => {
    expect(jpegName("scan.png")).toBe("scan.jpg");
    expect(jpegName(".png")).toBe("scan.jpg");
  });
});

describe("hashes", () => {
  it("validates sha256", () => {
    expect(isSha256Hex(A)).toBe(true);
    expect(isSha256Hex("A".repeat(64))).toBe(false);
    expect(isSha256Hex("a".repeat(63))).toBe(false);
    expect(isSha256Hex(123)).toBe(false);
  });
  it("toHex", () => expect(toHex(new Uint8Array([0, 15, 255]).buffer)).toBe("000fff"));
});

describe("parseOriginalSize", () => {
  it("falls back on junk", () => {
    expect(parseOriginalSize("1234", 5)).toBe(1234);
    expect(parseOriginalSize("abc", 5)).toBe(5);
    expect(parseOriginalSize("-4", 5)).toBe(5);
    expect(parseOriginalSize("2000000000", 5)).toBe(5);
    expect(parseOriginalSize(null, 5)).toBe(5);
  });
});

describe("duplicateOf", () => {
  const rows = [{ file_name: "x.pdf", sha256: A, original_sha256: B }, { file_name: "old.pdf", sha256: null, original_sha256: null }];
  it("matches either column", () => {
    expect(duplicateOf(rows, [A, null])).toBe("x.pdf");
    expect(duplicateOf(rows, [null, B])).toBe("x.pdf");
  });
  it("never matches nulls", () => expect(duplicateOf(rows, [null, null])).toBeNull());
  it("returns null with no match", () => expect(duplicateOf(rows, ["c".repeat(64)])).toBeNull());
});

describe("thumbs", () => {
  it("path matches the SQL regex", () => {
    const rec = "11111111-1111-1111-1111-111111111111";
    const u = "22222222-2222-2222-2222-222222222222";
    expect(thumbPath(rec, u)).toMatch(new RegExp(`^${rec}/thumbs/[0-9a-f-]{36}\\.jpg$`));
  });
  it("validates the file", () => {
    const ok = new Uint8Array([0xff, 0xd8, 0xff]);
    expect(isValidThumb("image/jpeg", 1000, ok)).toBe(true);
    expect(isValidThumb("image/png", 1000, ok)).toBe(false);
    expect(isValidThumb("image/jpeg", 300_000, ok)).toBe(false);
    expect(isValidThumb("image/jpeg", 1000, new Uint8Array([1, 2, 3]))).toBe(false);
  });
});

describe("formatBytes", () => {
  it("formats", () => {
    expect(formatBytes(491520)).toBe("480 KB");
    expect(formatBytes(4404019)).toBe("4.2 MB");
  });
});
