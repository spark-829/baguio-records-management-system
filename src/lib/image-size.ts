export const AI_IMAGE_MAX_SIDE = 1280;
export const AI_IMAGE_QUALITY = 0.7;
export const AI_IMAGE_MAX_BYTES = 1_500_000;

export function fitWithin(w: number, h: number, max = AI_IMAGE_MAX_SIDE) {
  if (!(w > 0 && h > 0)) return { width: 0, height: 0 };
  const s = Math.min(1, max / Math.max(w, h));
  return { width: Math.max(1, Math.round(w * s)), height: Math.max(1, Math.round(h * s)) };
}

/** Largest width or height the intake route accepts (client photos are shrunk to AI_IMAGE_MAX_SIDE first). */
export const AI_IMAGE_MAX_DIMENSION = 1600;

/** Reads width and height from a PNG, JPEG or WEBP header. Returns null when it cannot tell. */
export function imageDimensions(b: Uint8Array): { width: number; height: number } | null {
  const u16 = (i: number) => (b[i] << 8) | b[i + 1];
  const u32 = (i: number) => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
  const ascii = (i: number, s: string) => b.length >= i + s.length && [...s].every((c, k) => b[i + k] === c.charCodeAt(0));
  const ok = (width: number, height: number) => (width > 0 && height > 0 ? { width, height } : null);

  if (b.length >= 24 && b[0] === 0x89 && ascii(1, "PNG") && ascii(12, "IHDR")) return ok(u32(16), u32(20));

  if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 4 <= b.length) {
      if (b[i] !== 0xff) return null;
      const m = b[i + 1];
      if (m === 0xff) {
        i += 1;
        continue;
      }
      if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) {
        i += 2;
        continue;
      }
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
        return i + 9 <= b.length ? ok(u16(i + 7), u16(i + 5)) : null;
      }
      i += 2 + u16(i + 2);
    }
    return null;
  }

  if (b.length >= 30 && ascii(0, "RIFF") && ascii(8, "WEBP")) {
    if (ascii(12, "VP8X")) return ok(1 + (b[24] | (b[25] << 8) | (b[26] << 16)), 1 + (b[27] | (b[28] << 8) | (b[29] << 16)));
    if (ascii(12, "VP8L") && b[20] === 0x2f) {
      return ok(1 + (b[21] | ((b[22] & 0x3f) << 8)), 1 + ((b[22] >> 6) | (b[23] << 2) | ((b[24] & 0x0f) << 10)));
    }
    if (ascii(12, "VP8 ") && b[23] === 0x9d && b[24] === 0x01 && b[25] === 0x2a) {
      return ok((b[26] | (b[27] << 8)) & 0x3fff, (b[28] | (b[29] << 8)) & 0x3fff);
    }
  }
  return null;
}
