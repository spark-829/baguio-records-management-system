/** Offices that see the city colour theme (baguio.gov.ph palette) for now. Everyone else keeps the pine-green theme. */
export const CITY_THEME_OFFICES = ["CGSO"];

export function themeFor(officeCode?: string | null): "city" | undefined {
  return officeCode && CITY_THEME_OFFICES.includes(officeCode) ? "city" : undefined;
}
