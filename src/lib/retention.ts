import type { Status } from "./types";

export const FINISHED: Status[] = ["completed", "released", "archived"];

export type RetentionState = "keep" | "review_soon" | "review_now";

/** Adds whole years to an ISO date (Feb 29 rolls to Mar 1 in non-leap years, like a paper schedule would). */
export function addYears(iso: string, years: number) {
  const d = new Date(iso);
  d.setUTCFullYear(d.getUTCFullYear() + years);
  return d.toISOString();
}

/**
 * Keep-until date and state for a finished record, counted from the day it was finished,
 * following the retention period of its document type. Ninety days before that date it is flagged for review.
 */
export function retention(finishedAt: string, years: number, today = new Date()) {
  const keepUntil = addYears(finishedAt, years);
  const days = Math.floor((Date.parse(keepUntil) - today.getTime()) / 86_400_000);
  const state: RetentionState = days < 0 ? "review_now" : days <= 90 ? "review_soon" : "keep";
  return { keepUntil, days, state };
}
