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
    const mt = new Set(tokens(m.name));
    const shared = it.filter((t) => mt.has(t) || [...mt].some((x) => x.length >= 4 && t.length >= 4 && (x.startsWith(t) || t.startsWith(x))));
    const score = shared.length / it.length - (mt.size - shared.length) * 0.01;
    if (shared.length && score > bestScore) { best = m; bestScore = score; }
  }
  return bestScore >= 0.5 ? best : null;
}

/* ---------- conversione delle unità di misura ----------
   Il prezzo medio è sempre per unità base della materia prima (kg, l o pezzo).
   La quantità dell'ingrediente (g, kg, ml, l, pz…) viene portata in quella unità. */
const SACHET_KG = 0.0115;   // bustina standard di lievito secco: 11,5 g

/** Peso/volume di un pezzo letto dal nome ("… - 100 g", "11,5 g", "5 kg", "ml 946") in kg o l. */
export function sizeFromName(name: string): number | null {
  const t = String(name ?? "");
  let n: string | undefined, u: string | undefined;
  const a = t.match(/(\d+(?:[.,]\d+)?)\s*(kg|gr|g|mg|lt|l|ml|cl)\b/i);        // "100 g", "11,5 g", "5 kg"
  if (a) { n = a[1]; u = a[2]; }
  else { const b = t.match(/\b(kg|gr|g|ml|cl|lt|l)\s*(\d+(?:[.,]\d+)?)\b/i); if (b) { u = b[1]; n = b[2]; } }   // "ml 946", "gr 454"
  if (!n || !u) return null;
  const v = Number(n.replace(",", "."));
  const unit = u.toLowerCase().replace(/^gr$/, "g").replace(/^lt$/, "l");
  return v > 0 ? toBase(v, unit) : null;
}

/** Quantità dell'ingrediente nell'unità base della materia prima (null se non convertibile). */
export function convertQty(q: number, unit: string, mat: Row, ing: Row): number | null {
  const from = unitFamily(unit), to = mat.base_unit as string;
  if (from === to) return toBase(q, unit);
  if ((from === "kg" && to === "l") || (from === "l" && to === "kg")) return toBase(q, unit);   // densità ≈ 1
  const yeast = ing.category === "lievito" || mat.category === "lievito";
  const piece = sizeFromName(ing.name) ?? sizeFromName(mat.name) ?? (mat.piece_size ? Number(mat.piece_size) : null) ?? (yeast ? SACHET_KG : null);   // quanto pesa un pezzo
  if (from === "pz") return piece != null ? q * piece : null;                     // pezzi → kg/l
  if (to === "pz") {                                                              // kg/l → pezzi
    if (piece == null) return null;
    const n = toBase(q, unit) / piece;
    return yeast ? Math.max(1, Math.ceil(n - 0.01)) : n;                          // il lievito si usa a bustine intere
  }
  return null;
}

/** Costo di un ingrediente (null se non ho un prezzo). guessed = prezzo ipotizzato. */
export function ingredientCost(ing: Row, mats: Row[]): { cost: number | null; mat: Row | null; guessed?: number } {
  if (ing.unit_cost_override != null) return { cost: toBase(Number(ing.quantity), ing.unit) * Number(ing.unit_cost_override), mat: null };
  const mat = matchMaterial(ing, mats);
  if (!mat) {
    const d = defaultPrice(ing);
    return d != null ? { cost: toBase(Number(ing.quantity), ing.unit) * d, mat: null, guessed: d } : { cost: null, mat: null };
  }
  const qty = convertQty(Number(ing.quantity ?? 0), ing.unit ?? "kg", mat, ing);
  if (qty == null) return { cost: null, mat };
  return { cost: qty * Number(mat.avg_unit_cost), mat };
}

const avgOf = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/** Prezzi delle bottiglie impostati in Impostazioni (€ a bottiglia). Per ora si usa sempre quello da 66 cl. */
export interface BottlePrices { b66: number | null; b33: number | null }
export function bottlePricesFrom(settings: Row[]): BottlePrices {
  const v = (k: string) => { const x = settings.find((s) => s.key === k); return x ? Number(x.value) : null; };
  const p66 = v("bottle_66_pack_price") ?? 11, q66 = v("bottle_66_pack_qty") ?? 24;   // pacco da 24 a 11 € se non configurato
  const p33 = v("bottle_33_pack_price"), q33 = v("bottle_33_pack_qty") ?? 24;
  return { b66: p66 > 0 && q66 > 0 ? p66 / q66 : null, b33: p33 && p33 > 0 && q33 > 0 ? p33 / q33 : null };
}
/** Prezzo di una bottiglia: impostazioni (66 cl per ora per tutte), altrimenti acquisti. */
export function configuredBottlePrice(_sizeL: number | null, cfg: BottlePrices): number | null {
  return cfg.b66;   // per ora consideriamo sempre la bottiglia da 66 cl
}

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

/** Batch davvero fatto (non uno creato e lasciato vuoto). */
export const isBrewed = (b: Row) => Boolean(b.brew_date || b.fermentation_start || b.bottling_date || b.bottles_count || b.original_gravity || b.volume_bottled_l)
  || (b.status && b.status !== "pianificato");
/** Imbottigliato: da qui il costo è reale. */
export const isBottled = (b: Row) => Boolean(b.bottles_count || b.bottling_date || b.volume_bottled_l || b.first_tasting_date) || b.status === "imbottigliato" || b.status === "finito";

/** Da dove viene un dato: inserito da voi, stimato/calcolato da me, oppure mancante. */
export type Source = "inserito" | "stimato" | "manca";
export interface Fact { label: string; value: string; source: Source }
const fmt = (n: number, d = 1) => n.toLocaleString("it-IT", { maximumFractionDigits: d });

export interface BatchCost {
  code: string; bottled: boolean;
  ingredients: number; missing: string[]; guessed: number; kit: number;
  packaging: number; packagingEstimated: boolean;
  energy: number; energyMissing: boolean; water: number; other: number; total: number;
  liters: number | null; bottles: number | null; bottlesGuessed: boolean;
  facts: Fact[];
}

export function computeBatchCost(b: Row, recipe: Row | undefined, ings: Row[], extras: Row[], mats: Row[], energyPrice: number, waterPrice: number, cfg?: BottlePrices): BatchCost {
  const bottled = isBottled(b);
  const kitRows = extras.filter((r) => isKit(r.description ?? "") || (r.material_id && isKit(mats.find((m) => m.material_id === r.material_id)?.name ?? "")));
  let ingredients = 0, guessed = 0, priced = 0; const missing: string[] = [];
  for (const i of ings) {
    const r = ingredientCost(i, mats);
    if (r.cost == null) missing.push(i.name); else { ingredients += r.cost; if (r.guessed != null) guessed++; else priced++; }
  }
  const avg: Record<string, number> = Object.fromEntries(mats.map((m) => [m.material_id, Number(m.avg_unit_cost ?? 0)]));
  const rowCost = (r: Row) => Number(r.quantity ?? 0) * Number(r.unit_cost ?? (r.material_id ? avg[r.material_id] ?? 0 : 0));
  const kit = 0;   // i costi si fanno sempre senza kit: eventuali righe "Kit" vengono ignorate
  const pack = extras.filter((r) => r.category === "bottiglie" || r.category === "tappi");
  const other = extras.filter((r) => !(r.category === "bottiglie" || r.category === "tappi") && !kitRows.includes(r)).reduce((t, r) => t + rowCost(r), 0);
  const facts: Fact[] = [];

  // litri
  let liters: number | null = null, litSrc: Source = "manca";
  if (bottled && b.volume_bottled_l) { liters = Number(b.volume_bottled_l); litSrc = "inserito"; }
  else if (bottled && b.bottles_count && b.bottle_size_l) { liters = Number(b.bottles_count) * Number(b.bottle_size_l); litSrc = "stimato"; }
  else if (b.volume_fermenter_l) { liters = Number(b.volume_fermenter_l); litSrc = bottled ? "stimato" : "inserito"; }
  else if (recipe?.batch_size_l) { liters = Number(recipe.batch_size_l); litSrc = "stimato"; }
  facts.push({ label: bottled ? "Litri imbottigliati" : "Litri in fermentatore", value: liters != null ? `${fmt(liters)} L` : "—", source: litSrc });

  // bottiglie
  let bottles: number | null = null, bottlesGuessed = false;
  if (b.bottles_count) bottles = Number(b.bottles_count);
  else if (liters) { bottles = Math.floor(liters / 0.66); bottlesGuessed = true; }
  facts.push({ label: "Bottiglie", value: bottles != null ? String(bottles) : "—", source: b.bottles_count ? "inserito" : bottles != null ? "stimato" : "manca" });

  // bottiglie e tappi: solo da imbottigliata
  let packaging = 0, packagingEstimated = false;
  if (bottled) {
    if (pack.length) packaging = pack.reduce((t, r) => t + rowCost(r), 0);
    else if (bottles) {
      const size = b.bottle_size_l != null ? Number(b.bottle_size_l) : null;
      const bp = (cfg ? configuredBottlePrice(size, cfg) : null) ?? bottleUnitPrice(size, mats), cp = capUnitPrice(mats);
      packaging = bottles * ((bp ?? 0) + (cp ?? 0)); packagingEstimated = true;
    }
  }

  // corrente
  const energyMissing = b.energy_kwh == null;
  const energy = Number(b.energy_kwh ?? 0) * energyPrice;
  facts.push({ label: "Corrente", value: energyMissing ? "—" : `${fmt(Number(b.energy_kwh))} kWh`, source: energyMissing ? "manca" : "inserito" });

  // ingredienti
  facts.push({ label: "Prezzi ingredienti", value: `${priced + guessed}/${ings.length}`, source: missing.length ? "manca" : guessed ? "stimato" : "inserito" });

  const water = Number(b.water_used_l ?? 0) * waterPrice;
  return {
    code: b.code ?? "", bottled, ingredients, missing, guessed, kit, packaging, packagingEstimated, energy, energyMissing, water, other,
    total: ingredients + packaging + energy + water + other, liters, bottles, bottlesGuessed, facts,
  };
}

/** Somma dei batch di una birra. */
export function sumCosts(list: BatchCost[]) {
  const s = (f: (c: BatchCost) => number) => list.reduce((t, c) => t + f(c), 0);
  const total = s((c) => c.total);
  const liters = s((c) => c.liters ?? 0);
  const bottles = s((c) => c.bottles ?? 0);
  const allBottled = list.length > 0 && list.every((c) => c.bottled);
  // completo = imbottigliata e tutti i dati inseriti (niente stime né mancanti)
  const complete = allBottled && list.every((c) => c.facts.every((f) => f.source === "inserito"));
  return {
    total, liters, bottles,
    ingredients: s((c) => c.ingredients), kit: s((c) => c.kit), packaging: s((c) => c.packaging), energy: s((c) => c.energy), water: s((c) => c.water), other: s((c) => c.other),
    perLiter: liters ? total / liters : null, perBottle: bottles ? total / bottles : null,
    allBottled, someBottled: list.some((c) => c.bottled), complete,
    packagingEstimated: list.some((c) => c.packagingEstimated), energyMissing: list.some((c) => c.energyMissing),
    bottlesGuessed: list.some((c) => c.bottlesGuessed), guessed: s((c) => c.guessed),
    missing: [...new Set(list.flatMap((c) => c.missing))],
  };
}

/* ---------- prezzi "a unità" per tutto ciò che non è malto, luppolo o lievito ---------- */
export const CORE_CATEGORIES = ["malto", "luppolo", "lievito"];
export const isCore = (category: string) => CORE_CATEGORIES.includes(category);

/** Quanti pezzi (confezioni) ci sono in una riga d'acquisto. */
export function piecesOfLine(l: Row): number {
  const q = Number(l.quantity ?? 0);
  if (unitFamily(l.unit ?? "pz") === "pz") return q || 1;
  const size = sizeFromName(l.description ?? "");
  return size ? Math.max(1, Math.round(toBase(q, l.unit) / size)) : 1;   // senza misura nel nome: 1 confezione per riga
}

/** Peso/volume medio di un pezzo per materia prima (in kg o l), dalle righe d'acquisto. */
export function pieceSizes(lines: Row[]): Record<string, number> {
  const qty: Record<string, number> = {}, pcs: Record<string, number> = {};
  for (const l of lines) {
    if (!l.material_id || unitFamily(l.unit ?? "pz") === "pz") continue;
    qty[l.material_id] = (qty[l.material_id] ?? 0) + toBase(Number(l.quantity ?? 0), l.unit);
    pcs[l.material_id] = (pcs[l.material_id] ?? 0) + piecesOfLine(l);
  }
  return Object.fromEntries(Object.keys(qty).filter((k) => pcs[k] > 0 && qty[k] > 0).map((k) => [k, qty[k] / pcs[k]]));
}

/** Prezzo a pezzo partendo dal costo per unità base (kg/l/pz). */
export function perPiece(costPerBase: number, baseUnit: string, pieceSize: number | null | undefined): number | null {
  if (baseUnit === "pz") return costPerBase;
  return pieceSize ? costPerBase * pieceSize : null;
}
