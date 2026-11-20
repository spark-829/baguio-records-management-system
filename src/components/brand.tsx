/*
 * Original wordmark for the demo: a simple hand-drawn pine glyph in a rounded
 * square plus the product name. Not the City seal or any official emblem.
 */
export function PineMark({ className = "h-10 w-10" }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden="true" focusable="false">
      <rect width="40" height="40" rx="9" fill="#f8edcf" />
      <path d="M20 6 12.5 16h4L11 24h5.5L10 32h20l-6.5-8H29l-5.5-8h4z" fill="#1b5136" />
      <rect x="18.25" y="31" width="3.5" height="4" rx="1" fill="#6b4c0e" />
    </svg>
  );
}

export function SiteFooter({ className = "mt-10" }: { className?: string }) {
  return (
    <footer className={`no-print ${className} border-t-4 border-gold-500 bg-brand-900 text-brand-100`}>
      <div className="on-dark mx-auto flex max-w-7xl flex-col gap-3 px-4 py-6 text-sm sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-3">
          <PineMark className="h-9 w-9" />
          <div className="leading-snug">
            <div className="font-semibold text-white">Baguio RMS</div>
            <div>Records Management System</div>
          </div>
        </div>
        <p className="max-w-xl leading-relaxed sm:text-right">
          <strong className="font-semibold text-white">Demo system — not an official City Government of Baguio service.</strong>{" "}
          All names and records shown are fictional.
        </p>
      </div>
    </footer>
  );
}
