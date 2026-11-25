"use client";

import { useFormStatus } from "react-dom";

/** Submit button that is disabled while the form is being sent (no double records). */
export function SendButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return <button className="btn-primary" disabled={pending}>{pending ? pendingLabel : label}</button>;
}
