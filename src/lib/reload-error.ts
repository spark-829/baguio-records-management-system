/**
 * Errors that a plain page reload fixes: the site was updated while the tab was open (old code
 * files are gone), or the connection dropped while a page was streaming in.
 * Pattern: GitHub and Gmail show "Something went wrong. Reload" and reload once on their own.
 */
const RELOADABLE = [
  /ChunkLoadError/i,
  /Loading (CSS )?chunk [\w-]+ failed/i,
  /Failed to fetch dynamically imported module/i,
  /Importing a module script failed/i,
  /Connection closed/i,
  /network ?error/i,
  /Failed to fetch/i,
  /\bLoad failed/i,
  /Failed to find Server Action/i,
  /UnrecognizedActionError/,
  /Server Action .* was not found on the server/i,
];

export function isReloadableError(e: { name?: string; message?: string } | null | undefined): boolean {
  if (!e) return false;
  const text = `${e.name ?? ""} ${e.message ?? ""}`;
  return RELOADABLE.some((r) => r.test(text));
}

/** Reload at most once per 30 seconds per tab, so a real bug never turns into a reload loop. */
export const RELOAD_KEY = "rms-auto-reload-at";
export function shouldAutoReload(lastAt: string | null, now = Date.now()): boolean {
  const last = Number(lastAt);
  return !Number.isFinite(last) || last <= 0 || now - last > 30_000;
}
