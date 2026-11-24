export const TX_TYPES = ["G2C", "G2G", "G2B"] as const;
export type TxType = (typeof TX_TYPES)[number];

export function isTxType(x: unknown): x is TxType {
  return typeof x === "string" && (TX_TYPES as readonly string[]).includes(x);
}

/** English keys: callers wrap them in t(). */
export const TX_FORM_LABEL: Record<TxType, string> = {
  G2C: "Citizen or client (G2C)",
  G2G: "Government office (G2G)",
  G2B: "Business (G2B)",
};

export const TX_CHIP_LABEL: Record<TxType, string> = {
  G2C: "Citizen (G2C)",
  G2G: "Government (G2G)",
  G2B: "Business (G2B)",
};

export function txLabel(k: string | null | undefined): string {
  return isTxType(k) ? TX_FORM_LABEL[k] : "Not set";
}
