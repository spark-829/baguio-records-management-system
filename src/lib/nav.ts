/** Which main-menu link is the current page. "/" matches only itself; "/records" skips "/records/new", which has its own link. */
export function isActive(path: string, href: string) {
  if (href === "/") return path === "/";
  if (href === "/records") return path.startsWith("/records") && !path.startsWith("/records/new");
  return path === href || path.startsWith(href + "/");
}

/** Most links that fit in the header row at 1280px. More than this and the links live in the Menu sheet at every width. */
export const INLINE_NAV_MAX = 6;

/** True when the main links can sit inline in the header (a list of 0 also counts: nothing to fold away). */
export function inlineNav(count: number): boolean {
  return count <= INLINE_NAV_MAX;
}
