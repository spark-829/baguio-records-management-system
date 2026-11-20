"use client";

export function PrintButton({ label = "Print slip" }: { label?: string }) {
  return <button onClick={() => window.print()} className="btn-primary">{label}</button>;
}
