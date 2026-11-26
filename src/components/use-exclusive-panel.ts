"use client";

import { useEffect } from "react";

const EVENT = "rms:panel-open";

/** Header panels (alerts, account, menu sheet): when one opens, the others close, also when opened from the keyboard. */
export function useExclusivePanel(id: string, open: boolean, close: () => void) {
  useEffect(() => {
    if (open) window.dispatchEvent(new CustomEvent(EVENT, { detail: id }));
  }, [id, open]);

  useEffect(() => {
    const onOther = (e: Event) => {
      if ((e as CustomEvent<string>).detail !== id) close();
    };
    window.addEventListener(EVENT, onOther);
    return () => window.removeEventListener(EVENT, onOther);
  }, [id, close]);
}
