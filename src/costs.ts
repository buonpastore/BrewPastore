import type { Row } from "./lib";

/** Costo di un batch, voce per voce. */
export interface BatchCost {
  ingredients: number; packaging: number | null; packagingEstimated: boolean;
  energy: number | null; water: number; other: number; total: number;
  liters: number | null; bottles: number | null; perLiter: number | null; perBottle: number | null; missingPrices: boolean;
}

const avgOf = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/** Prezzo medio di una bottiglia della misura giusta (dagli acquisti). */
export function bottleUnitPrice(sizeL: number | null, mats: Row[]): number | null {
  const all = mats.filter((m) => m.category === "bottiglie" && Number(m.avg_unit_cost) > 0);
  if (!all.length) return null;
  const rx = sizeL != null && sizeL < 0.45 ? /\b33\b|0[,.]33|33\s*cl/i : /\b(66|75|50)\b|0[,.](66|75|5)/i;
  const match = all.filter((m) => rx.test(m.name));
  return avgOf((match.length ? match : all).map((m) => Number(m.avg_unit_cost)));
}
export function capUnitPrice(mats: Row[]): number | null {
  return avgOf(mats.filter((m) => m.category === "tappi" && Number(m.avg_unit_cost) > 0).map((m) => Number(m.avg_unit_cost)));
}

export function batchLiters(b: Row): number | null {
  if (b.volume_bottled_l) return Number(b.volume_bottled_l);
  if (b.bottles_count && b.bottle_size_l) return Number(b.bottles_count) * Number(b.bottle_size_l);
  return b.volume_fermenter_l ? Number(b.volume_fermenter_l) : null;
}

export function computeBatchCost(b: Row, summary: Row | undefined, extras: Row[], mats: Row[], energyPrice: number, waterPrice: number): BatchCost {
  const avg: Record<string, number> = Object.fromEntries(mats.map((m) => [m.material_id, Number(m.avg_unit_cost ?? 0)]));
  const rowCost = (r: Row) => Number(r.quantity ?? 0) * Number(r.unit_cost ?? (r.material_id ? avg[r.material_id] ?? 0 : 0));
  const pack = extras.filter((r) => r.category === "bottiglie" || r.category === "tappi");
  const other = extras.filter((r) => !(r.category === "bottiglie" || r.category === "tappi")).reduce((t, r) => t + rowCost(r), 0);
  const bottles = b.bottles_count ? Number(b.bottles_count) : null;
  let packaging: number | null = null, packagingEstimated = false;
  if (pack.length) packaging = pack.reduce((t, r) => t + rowCost(r), 0);
  else if (bottles) {
    const bp = bottleUnitPrice(b.bottle_size_l != null ? Number(b.bottle_size_l) : null, mats), cp = capUnitPrice(mats);
    if (bp != null || cp != null) { packaging = bottles * ((bp ?? 0) + (cp ?? 0)); packagingEstimated = true; }
  }
  const ingredients = Number(summary?.ingredients_cost ?? 0);
  const energy = b.energy_kwh != null ? Number(b.energy_kwh) * energyPrice : null;
  const water = Number(b.water_used_l ?? 0) * waterPrice;
  const total = ingredients + (packaging ?? 0) + (energy ?? 0) + water + other;
  const liters = batchLiters(b);
  return {
    ingredients, packaging, packagingEstimated, energy, water, other, total, liters, bottles,
    perLiter: liters && total ? total / liters : null, perBottle: bottles && total ? total / bottles : null,
    missingPrices: Boolean(summary?.missing_prices),
  };
}
