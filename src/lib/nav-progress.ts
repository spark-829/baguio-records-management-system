// Decides whether a click on a link starts a page change inside this app,
// so the top progress bar (src/components/nav-progress.tsx) only shows for real navigations.

type LinkLike = { href: string; target?: string; hasAttribute(name: string): boolean };
type ClickLike = { button: number; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean };

export function isNavigationClick(link: LinkLike, click: ClickLike, currentHref: string): boolean {
  // New tab or window, downloads and modified clicks leave this page alone.
  if (click.button !== 0 || click.metaKey || click.ctrlKey || click.shiftKey || click.altKey) return false;
  if ((link.target && link.target !== "_self") || link.hasAttribute("download")) return false;
  let to: URL, from: URL;
  try {
    from = new URL(currentHref);
    to = new URL(link.href, from);
  } catch {
    return false;
  }
  if (to.origin !== from.origin) return false;
  // File downloads and sign-out go to /api and never swap the page.
  if (to.pathname.startsWith("/api/")) return false;
  // Same page (or only a #section on it): nothing loads.
  return to.pathname !== from.pathname || to.search !== from.search;
}

/** Where a GET form will go (its action plus its fields as the query), or null when it stays on this page. */
export function formTarget(action: string, fields: Iterable<[string, FormDataEntryValue]>, currentHref: string): string | null {
  let to: URL;
  const from = new URL(currentHref);
  try {
    to = new URL(action || from.pathname, from);
  } catch {
    return null;
  }
  const q = new URLSearchParams();
  for (const [k, v] of fields) if (typeof v === "string") q.append(k, v);
  to.search = q.toString();
  if (to.origin !== from.origin || (to.pathname === from.pathname && to.search === from.search)) return null;
  return to.href;
}
