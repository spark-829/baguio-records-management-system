/** Pure rules for attachment uploads (no DOM). Shared by the browser and the server. */

export const ATTACHMENT_TYPES = ["application/pdf", "image/png", "image/jpeg", "image/webp"];
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const UPLOAD_MAX_SIDE = 2400;
export const UPLOAD_QUALITY = 0.82;
export const FULL_QUALITY = 0.92;
export const SKIP_BELOW_BYTES = 500_000;
export const MIN_SAVING = 0.9;
export const THUMB_MAX_SIDE = 320;
export const THUMB_QUALITY = 0.7;
export const THUMB_MAX_BYTES = 200_000;

export function checkUpload(type: string, size: number): string | null {
  if (!(size > 0)) return "Choose a file";
  if (size > MAX_UPLOAD_BYTES) return "File is larger than 10 MB";
  if (!ATTACHMENT_TYPES.includes(type)) return "Use a PDF, PNG, JPG or WEBP file";
  return null;
}

export type EncodePlan = { action: "keep" } | { action: "encode"; maxSide: number; quality: number; mustUse: boolean };

export function encodePlan(i: { type: string; size: number; width: number; height: number; keepFull: boolean }): EncodePlan {
  if (!i.type.startsWith("image/")) return { action: "keep" };
  if (!ATTACHMENT_TYPES.includes(i.type)) {
    return i.keepFull
      ? { action: "encode", maxSide: Infinity, quality: FULL_QUALITY, mustUse: true }
      : { action: "encode", maxSide: UPLOAD_MAX_SIDE, quality: UPLOAD_QUALITY, mustUse: true };
  }
  if (i.keepFull) return { action: "keep" };
  if (i.size < SKIP_BELOW_BYTES && Math.max(i.width, i.height) <= UPLOAD_MAX_SIDE) return { action: "keep" };
  return { action: "encode", maxSide: UPLOAD_MAX_SIDE, quality: UPLOAD_QUALITY, mustUse: false };
}

export function keepEncoded(originalSize: number, newSize: number, mustUse: boolean): boolean {
  return mustUse || (newSize > 0 && newSize <= originalSize * MIN_SAVING);
}

export function jpegName(name: string): string {
  const base = name.replace(/\.[^.]+$/, "") || "scan";
  return `${base}.jpg`;
}

export function isSha256Hex(s: unknown): s is string {
  return typeof s === "string" && /^[0-9a-f]{64}$/.test(s);
}

export function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function parseOriginalSize(v: unknown, fallback: number): number {
  const n = typeof v === "string" && /^\d+$/.test(v) ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isSafeInteger(n) && n > 0 && n <= 1e9 ? n : fallback;
}

export function duplicateOf(
  rows: { file_name: string; sha256: string | null; original_sha256: string | null }[],
  hashes: (string | null)[],
): string | null {
  const wanted = hashes.filter((h): h is string => Boolean(h));
  if (!wanted.length) return null;
  const hit = rows.find((r) => (r.sha256 && wanted.includes(r.sha256)) || (r.original_sha256 && wanted.includes(r.original_sha256)));
  return hit ? hit.file_name : null;
}

export function thumbPath(recordId: string, uuid: string): string {
  return `${recordId}/thumbs/${uuid}.jpg`;
}

/**
 * The file's first bytes must match the type the browser claimed (QA-093), so a page or script renamed
 * to .pdf or .png is refused. Needs at least the first 12 bytes.
 */
export function matchesMagic(type: string, head: Uint8Array): boolean {
  const at = (i: number, bytes: number[]) => bytes.every((b, k) => head[i + k] === b);
  switch (type) {
    case "application/pdf":
      return at(0, [0x25, 0x50, 0x44, 0x46, 0x2d]); // %PDF-
    case "image/png":
      return at(0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case "image/jpeg":
      return at(0, [0xff, 0xd8, 0xff]);
    case "image/webp":
      return at(0, [0x52, 0x49, 0x46, 0x46]) && at(8, [0x57, 0x45, 0x42, 0x50]); // RIFF....WEBP
    default:
      return false;
  }
}

export function isValidThumb(type: string, size: number, head: Uint8Array): boolean {
  return type === "image/jpeg" && size > 0 && size <= THUMB_MAX_BYTES && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
}

export function formatBytes(n: number): string {
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
