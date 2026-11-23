"use client";

import { ErrorScreen } from "@/components/error-screen";
import { useT } from "@/lib/i18n/client";

/** Errors inside a signed-in page: keep the header and menu, show a friendly message. */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useT();
  return <ErrorScreen error={error} reset={reset} t={t} />;
}
