import { toBase, type Row } from "./lib";

/* ------------------------------------------------------------------
   Costi delle birre.
   - Prima dell'imbottigliamento: costo PRESUNTO = materie prime + corrente + acqua (+ altri costi segnati).
   - Dopo l'imbottigliamento: costo REALE, con bottiglie e tappi.
   Il prezzo degli ingredienti si prende dalla materia prima collegata; se manca o non ha acquisti,
   si cerca per nome tra le materie prime acquistate (es. "Saaz" → "Luppolo Saaz pellet 100 g").
   ------------------------------------------------------------------ */

const STOP = new Set(["malto", "malti", "luppolo", "luppoli", "lievito", "lieviti", "pellet", "pellets", "secco", "liquido", "di", "d", "del", "della",
  "in", "da", "per", "e", "con", "the", "gr", "g", "kg", "ml", "l", "pz", "conf", "confezione", "busta", "bustina", "sacco", "x", "fiocchi"]);
const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .replace(/\b([a-z]{1,3})[-\s](\d{2,3})\b/g, "$1$2")   // "US-05" = "US 05" = "US05", "BE-134" = "BE134"
  .replace(/[^a-z0-9]+/g, " ").trim();
// sinonimi tra come si scrive nelle ricette e come si chiama nei listini
const SYN: Record<string, string> = { weizen: "frumento", wheat: "frumento", weiss: "frumento", grano: "frumento", pils: "pilsner", pilsen: "pilsner",
  munich: "monaco", oat: "avena", oats: "avena", vienna: "vienna", crystal: "caramel", cara: "caramel", carapils: "carapils", sugar: "zucchero" };
const tokens = (s: string) => norm(s).split(" ").filter((t) => t && !STOP.has(t)).map((t) => SYN[t] ?? t);
const unitFamily = (u: string) => (["g", "kg", "mg"].includes(u.toLowerCase()) ? "kg" : ["l", "ml", "cl"].includes(u.toLowerCase()) ? "l" : "pz");

export const isKit = (name: string) => /\bkit\b/i.test(name ?? "");
/** Categorie di ingredienti già comprese in un kit all grain. */
export const KIT_COVERS = ["malto", "luppolo", "lievito"];

/** Prezzi ipotizzati quando non c'è un acquisto (€ per kg, l o pezzo). */
const DEFAULT_PRICES: [RegExp, number, string][] = [[/zucchero|saccarosio/i, 1, "kg"]];
export function defaultPrice(ing: Row): number | null {
  const d = DEFAULT_PRICES.find(([rx, , u]) => rx.test(ing.name ?? "") && unitFamily(ing.unit ?? "kg") === u);
  return d ? d[1] : null;
}

/** Materia prima con prezzo che corrisponde all'ingrediente. */
export function matchMaterial(ing: Row, mats: Row[]): Row | null {
  const priced = mats.filter((m) => Number(m.avg_unit_cost) > 0 && !isKit(m.name));
  const byId = ing.material_id ? priced.find((m) => m.material_id === ing.material_id) : null;
  if (byId) return byId;
  const it = tokens(ing.name ?? "");
  if (!it.length) return null;
  let best: Row | null = null, bestScore = 0;
  for (const m of priced) {
    if (ing.category && m.category && ing.category !== m.category && ing.category !== "altro" && m.category !== "altro") continue;
    if (unitFamily(ing.unit ?? "kg") !== m.base_unit && !(m.base_unit === "pz" && ing.category === "lievito")) continue;
    const mt = new Set(tokens(m.name));
    const shared = it.filter((t) => mt.has(t) || [...mt].some((x) => x.length >= 4 && t.length >= 4 && (x.startsWith(t) || t.startsWith(x))));
    const score = shared.length / it.length - (mt.size - shared.length) * 0.01;
    if (shared.length && score > bestScore) { best = m; bestScore = score; }
  }
  return bestScore >= 0.5 ? best : null;
}

/** Costo di un ingrediente (null se non ho un prezzo). guessed = prezzo ipotizzato. */
export function ingredientCost(ing: Row, mats: Row[]): { cost: number | null; mat: Row | null; guessed?: number } {
  if (ing.unit_cost_override != null) return { cost: toBase(Number(ing.quantity), ing.unit) * Number(ing.unit_cost_override), mat: null };
  const mat = matchMaterial(ing, mats);
  if (!mat) {
    const d = defaultPrice(ing);
    return d != null ? { cost: toBase(Number(ing.quantity), ing.unit) * d, mat: null, guessed: d } : { cost: null, mat: null };
  }
  // lievito comprato a bustine ma scritto in grammi nella ricetta: conto 1 bustina
  const qty = mat.base_unit === "pz" && unitFamily(ing.unit) !== "pz" ? 1 : toBase(Number(ing.quantity), ing.unit);
  return { cost: qty * Number(mat.avg_unit_cost), mat };
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

export const isBottled = (b: Row) => Boolean(b.bottles_count) || b.status === "imbottigliato" || b.status === "finito" || Boolean(b.bottling_date);

export interface BatchCost {
  bottled: boolean;
  ingredients: number; missing: string[]; kit: number;
  packaging: number; packagingEstimated: boolean;
  energy: number; energyMissing: boolean; water: number; other: number; total: number;
  liters: number | null; bottles: number | null;
}

export function computeBatchCost(b: Row, recipe: Row | undefined, ings: Row[], extras: Row[], mats: Row[], energyPrice: number, waterPrice: number): BatchCost {
  const bottled = isBottled(b);
  const kitRows = extras.filter((r) => isKit(r.description ?? "") || (r.material_id && isKit(mats.find((m) => m.material_id === r.material_id)?.name ?? "")));
  let ingredients = 0; const missing: string[] = [];
  for (const i of ings) {
    if (kitRows.length && KIT_COVERS.includes(i.category)) continue;   // già pagato nel kit
    const { cost } = ingredientCost(i, mats);
    if (cost == null) missing.push(i.name); else ingredients += cost;
  }
  const avg: Record<string, number> = Object.fromEntries(mats.map((m) => [m.material_id, Number(m.avg_unit_cost ?? 0)]));
  const rowCost = (r: Row) => Number(r.quantity ?? 0) * Number(r.unit_cost ?? (r.material_id ? avg[r.material_id] ?? 0 : 0));
  const kit = kitRows.reduce((t, r) => t + rowCost(r), 0);
  ingredients += kit;
  const pack = extras.filter((r) => r.category === "bottiglie" || r.category === "tappi");
  const other = extras.filter((r) => !(r.category === "bottiglie" || r.category === "tappi") && !kitRows.includes(r)).reduce((t, r) => t + rowCost(r), 0);
  const bottles = b.bottles_count ? Number(b.bottles_count) : null;

  let packaging = 0, packagingEstimated = false;
  if (bottled) {
    if (pack.length) packaging = pack.reduce((t, r) => t + rowCost(r), 0);
    else if (bottles) {
      const bp = bottleUnitPrice(b.bottle_size_l != null ? Number(b.bottle_size_l) : null, mats), cp = capUnitPrice(mats);
      packaging = bottles * ((bp ?? 0) + (cp ?? 0)); packagingEstimated = true;
    }
  }
  const energyMissing = b.energy_kwh == null;
  const energy = Number(b.energy_kwh ?? 0) * energyPrice;
  const water = Number(b.water_used_l ?? 0) * waterPrice;
  const liters = bottled && b.volume_bottled_l ? Number(b.volume_bottled_l)
    : bottled && bottles && b.bottle_size_l ? bottles * Number(b.bottle_size_l)
    : b.volume_fermenter_l ? Number(b.volume_fermenter_l) : recipe?.batch_size_l ? Number(recipe.batch_size_l) : null;
  return {
    bottled, ingredients, missing, kit, packaging, packagingEstimated, energy, energyMissing, water, other,
    total: ingredients + packaging + energy + water + other, liters, bottles: bottled ? bottles : null,
  };
}

/** Somma dei batch di una birra. */
export function sumCosts(list: BatchCost[]) {
  const s = (f: (c: BatchCost) => number) => list.reduce((t, c) => t + f(c), 0);
  const total = s((c) => c.total);
  const liters = s((c) => c.liters ?? 0);
  const realBottles = s((c) => c.bottles ?? 0);
  // bottiglie presunte (da 33 cl) per i batch non ancora imbottigliati
  const guessBottles = list.filter((c) => !c.bottles && c.liters).reduce((t, c) => t + Math.floor((c.liters ?? 0) / 0.33), 0);
  const bottles = realBottles + guessBottles;
  return {
    total, liters, bottles, realBottles, guessBottles,
    ingredients: s((c) => c.ingredients), kit: s((c) => c.kit), kitBatches: list.filter((c) => c.kit > 0).length, packaging: s((c) => c.packaging), energy: s((c) => c.energy), water: s((c) => c.water), other: s((c) => c.other),
    perLiter: liters ? total / liters : null, perBottle: bottles ? total / bottles : null,
    allBottled: list.length > 0 && list.every((c) => c.bottled), someBottled: list.some((c) => c.bottled),
    packagingEstimated: list.some((c) => c.packagingEstimated), energyMissing: list.some((c) => c.energyMissing),
    missing: [...new Set(list.flatMap((c) => c.missing))],
  };
}
