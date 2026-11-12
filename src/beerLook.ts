/** Caratteristiche "da bevitore" di una birra: colore, amaro, gradazione. */

// colori di riferimento della scala SRM (EBC ≈ SRM × 1,97)
const SRM_HEX = ["#FFE699", "#FFD878", "#FFCA5A", "#FFBF42", "#FBB123", "#F8A600", "#F39C00", "#EA8F00", "#E58500", "#DE7C00",
  "#D77200", "#CF6900", "#CB6200", "#C35900", "#BB5100", "#B54C00", "#B04500", "#A63E00", "#A13700", "#9B3200",
  "#952D00", "#8E2900", "#882300", "#821E00", "#7B1A00", "#771900", "#701400", "#6A0E00", "#660D00", "#5E0B00",
  "#5A0A02", "#600903", "#520907", "#4C0505", "#470606", "#440607", "#3F0708", "#3B0607", "#3A070B", "#36080A"];

export function ebcColor(ebc: number): string {
  const srm = Math.max(1, Math.min(40, Math.round(ebc / 1.97)));
  return SRM_HEX[srm - 1];
}
export function ebcName(ebc: number): string {
  if (ebc < 6) return "paglierino";
  if (ebc < 10) return "dorato chiaro";
  if (ebc < 16) return "dorato";
  if (ebc < 24) return "ambrato chiaro";
  if (ebc < 34) return "ambrato";
  if (ebc < 50) return "ramato";
  if (ebc < 70) return "bruno";
  return "scura";
}
export function ibuName(ibu: number): string {
  if (ibu < 12) return "poco amara";
  if (ibu < 25) return "delicata";
  if (ibu < 40) return "equilibrata";
  if (ibu < 60) return "amara";
  return "molto amara";
}
export function abvOf(og?: number | null, fg?: number | null): number | null {
  return og && fg ? (Number(og) - Number(fg)) * 131.25 : null;
}
