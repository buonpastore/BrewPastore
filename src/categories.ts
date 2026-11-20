/** Colori e nomi delle categorie di ingredienti / materie prime (stessi in tutta l'app). */
export const CAT_INFO: Record<string, { label: string; color: string; emoji: string }> = {
  malto:      { label: "Malti",                          color: "var(--cat-malto)",      emoji: "🌾" },
  luppolo:    { label: "Luppoli",                        color: "var(--cat-luppolo)",    emoji: "🌿" },
  lievito:    { label: "Lieviti",                        color: "var(--cat-lievito)",    emoji: "🧫" },
  sali_acqua: { label: "Sali e correzioni dell'acqua",   color: "var(--cat-sali)",       emoji: "💧" },
  additivo:   { label: "Zuccheri e additivi",            color: "var(--cat-additivo)",   emoji: "🍬" },
  bottiglie:  { label: "Bottiglie",                      color: "var(--cat-bottiglie)",  emoji: "🍾" },
  tappi:      { label: "Tappi",                          color: "var(--cat-tappi)",      emoji: "🔩" },
  etichette:  { label: "Etichette",                      color: "var(--cat-etichette)",  emoji: "🏷️" },
  detergenti: { label: "Detergenti",                     color: "var(--cat-detergenti)", emoji: "🧴" },
  altro:      { label: "Altro",                          color: "var(--cat-altro)",      emoji: "📦" },
};
export const catColor = (c?: string | null) => (CAT_INFO[c ?? ""] ?? CAT_INFO.altro).color;
export const catLabel = (c?: string | null) => (CAT_INFO[c ?? ""] ?? CAT_INFO.altro).label;

/** Colore del NOME di un ingrediente: malti giallini, luppoli verdini, lieviti rossini; il resto marrone-grigio. */
export const nameColor = (c?: string | null) =>
  c === "malto" || c === "luppolo" || c === "lievito" ? catColor(c) : "var(--cat-other-name)";

/** Ordine fisso in tutta l'app: malti, luppoli, lieviti, poi il resto. */
export const CAT_ORDER = ["malto", "luppolo", "lievito", "sali_acqua", "additivo", "bottiglie", "tappi", "etichette", "detergenti", "altro"];
export const catRank = (c?: string | null) => { const i = CAT_ORDER.indexOf(c ?? ""); return i < 0 ? CAT_ORDER.length : i; };
/** Quantità confrontabile tra unità diverse (g → kg, ml → l); null se non c'è. */
export function qtyOf(r: unknown): number | null {
  const o = r as { quantity?: unknown; qty?: unknown; unit?: string | null };
  const raw = o.quantity ?? o.qty;
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  const u = (o.unit ?? "").toLowerCase();
  return u === "g" || u === "ml" ? n / 1000 : u === "mg" ? n / 1e6 : n;
}
/** Ordina per categoria (malti, luppoli, lieviti, poi il resto); dentro ogni categoria prima le quantità maggiori,
    a parità resta l'ordine originale. */
export function sortByCat<T>(rows: T[], cat: (r: T) => string | null | undefined = (r) => (r as { category?: string }).category,
  qty: (r: T) => number | null = qtyOf): T[] {
  return rows.map((r, i) => ({ r, i, q: qty(r) })).sort((a, b) => catRank(cat(a.r)) - catRank(cat(b.r))
    || (a.q == null || b.q == null ? (a.q == null ? 1 : 0) - (b.q == null ? 1 : 0) : b.q - a.q) || a.i - b.i).map((x) => x.r);
}
