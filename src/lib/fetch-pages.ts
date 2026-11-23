/**
 * Reads a table page by page. PostgREST caps one response (1000 rows by default), so a single `.limit(2000)` is cut short.
 * Stops at the first short page, on an error, or after `maxPages`.
 */
export async function fetchPages<T>(
  fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  pageSize = 1000,
  maxPages = 6,
): Promise<{ data: T[]; error: unknown }> {
  const all: T[] = [];
  for (let i = 0; i < maxPages; i++) {
    const { data, error } = await fetchPage(i * pageSize, i * pageSize + pageSize - 1);
    if (error) return { data: all, error };
    const page = data ?? [];
    all.push(...page);
    if (page.length < pageSize) break;
  }
  return { data: all, error: null };
}
