/** Keys whose new value differs from the stored one. Missing stored keys count as changed. */
export function changedSettings(
  current: Record<string, unknown>,
  next: Record<string, number | boolean>,
): string[] {
  return Object.keys(next).filter((key) => {
    if (!(key in current)) return true;
    const stored = current[key];
    const want = next[key];
    if (typeof want === "boolean") return (stored === true || stored === "true") !== want;
    return Number(stored) !== want;
  });
}
