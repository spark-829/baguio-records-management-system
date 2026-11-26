"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Screen reader announcement after the list changes (a saved view, a search, a filter).
 * The page is rendered again on the server, so focus would otherwise drop to the page body and nothing is said.
 * `token` is the current query: the message is read whenever it changes, even when the text is the same as before
 * (two searches that both fill a page say "50+ records found"). Opening the page stays quiet.
 */
export function ListAnnouncer({ message, token }: { message: string; token: string }) {
  const [said, setSaid] = useState("");
  const prev = useRef(token);
  useEffect(() => {
    if (prev.current === token) return;
    prev.current = token;
    setSaid("");
    const id = setTimeout(() => setSaid(message), 50);
    return () => clearTimeout(id);
  }, [token, message]);
  return <p role="status" aria-live="polite" aria-atomic="true" className="sr-only">{said}</p>;
}
