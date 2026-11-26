"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Screen reader announcement after the list changes (a saved view, a search, a filter).
 * The page is rendered again on the server, so focus would otherwise drop to the page body and nothing is said.
 * Empty on first load, so opening the page stays quiet; filled only when the message changes afterwards.
 */
export function ListAnnouncer({ message }: { message: string }) {
  const [said, setSaid] = useState("");
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setSaid(message);
  }, [message]);
  return <p role="status" aria-live="polite" aria-atomic="true" className="sr-only">{said}</p>;
}
