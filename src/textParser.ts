/**
 * Lettura "senza AI" del testo di un ordine (es. copiato dalla pagina ordini di Mr Malt o da un'email).
 * Riconosce sia il formato a blocchi (nome / codice / prezzo / Ordinato N / totale)
 * sia righe singole tipo "Malto Pils 5 kg 12,50 €".
 */
export interface TextItem {
  code: string | null;
  description: string;
  material_name: string;
  category: string;
  quantity: number;
  unit: string;
  total_price: number;
}
export interface TextOrder {
  supplier: string | null;
  date: string | null;
  invoice_number: string | null;
  currency: string;
  shipping_cost: number;
  total_amount: number | null;
  notes: string | null;
  items: TextItem[];
}

const PRICE = /(-?\d{1,3}(?:[.\s]\d{3})*(?:,\d{1,2})|-?\d+(?:[.,]\d{1,2})?)\s*€|€\s*(-?\d{1,3}(?:[.\s]\d{3})*(?:,\d{1,2})|-?\d+(?:[.,]\d{1,2})?)/;
const ONLY_PRICE = new RegExp(`^(?:${PRICE.source})$`);

export function parseEuro(s: string): number {
  let t = s.replace(/[€\s]/g, "");
  if (t.includes(",") && t.includes(".")) t = t.lastIndexOf(",") > t.lastIndexOf(".") ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, "");
  else t = t.replace(",", ".");
  return Number(t);
}
const priceIn = (s: string): number | null => {
  const m = s.match(PRICE);
  return m ? parseEuro(m[1] ?? m[2]) : null;
};

/** Attrezzatura: la misura nel nome è una capacità, non una quantità da consumare. */
const EQUIPMENT = /caraff|sifone|densimetr|termometr|fermentator|pentola|tubo|rubinett|gorgogliator|secchio|cucchiai|imbottigliator|tappatric|bilancia|ph-?metro|rifrattometr/i;

/** marchi da ignorare quando si cerca la categoria (es. "Mr. Malt" non è un malto) */
const BRANDS = /mr\.?\s*malt[®]?|birramia|brewferm/gi;

export function guessCategory(name: string): string {
  const n = name.toLowerCase().replace(BRANDS, "");
  if (/\bkit\b/.test(n) || EQUIPMENT.test(n)) return "altro";
  if (/luppol|\bhop|pellet|cascade|citra|mosaic|simcoe|saaz|hallertau|magnum|centennial|amarillo|galaxy|nelson/.test(n)) return "luppolo";
  if (/lievit|yeast|safale|saflager|safbrew|us-?05|s-?04|w-?34\/70|wlp|wyeast|lallemand|fermentis|nottingham|verdant|bry-?97|kveik/.test(n)) return "lievito";
  if (/star\s?san|pbw|percarbonat|detergen|sanific|igieniz|chemipro|soda caustica/.test(n)) return "detergenti";
  if (/acido|gesso|cloruro|solfato|calcio|magnesio|campden|metabisolf|bicarbonat|sale /.test(n)) return "sali_acqua";
  if (/irish moss|alghe|whirlfloc|gelatin|nutrient|chiarific|protafloc|lattosio|destrosio|zucchero/.test(n)) return "additivo";
  if (/bottigli/.test(n)) return "bottiglie";
  if (/tapp/.test(n)) return "tappi";
  if (/etichett/.test(n)) return "etichette";
  if (/malt|pils|pilsner|munich|monaco|vienna|crystal|\bcara(?!ff)|frumento|wheat|avena|oat|chocolate|roast|carafa|biscuit|melanoid|acidulat/.test(n)) return "malto";
  return "altro";
}


/** "Star San ml 946" → 946 ml · "PBW gr 454" → 454 g · "Irish Moss - 25 g" → 25 g · "Malto 5 kg" → 5 kg */
function sizeIn(name: string): { q: number; u: string } | null {
  const m = name.match(/(?:^|[\s\-(x×])(\d+(?:[.,]\d+)?)\s*(kg|gr|g|ml|cl|lt|l)\b/i) ?? name.match(/\b(kg|gr|g|ml|cl|lt|l)\s*(\d+(?:[.,]\d+)?)\b/i);
  if (!m) return null;
  const [num, unit] = /\d/.test(m[1]) ? [m[1], m[2]] : [m[2], m[1]];
  const u = unit.toLowerCase().replace(/^gr$/, "g").replace(/^lt$/, "l");
  let q = Number(num.replace(",", "."));
  if (u === "cl") return { q: q / 100, u: "l" };
  if (!q) return null;
  return { q, u };
}

function cleanName(s: string) {
  return s.replace(/[®™]/g, "").replace(/\s+/g, " ").replace(/^[\s\-–•*]+|[\s\-–]+$/g, "").trim();
}

function finish(name: string, qty: number, total: number, code: string | null = null): TextItem {
  const description = cleanName(name);
  const category = guessCategory(description);
  const size = EQUIPMENT.test(description) || category === "altro" && /\bkit\b/i.test(description) ? null : sizeIn(description);
  const material_name = cleanName(
    description.replace(BRANDS, "")
      .replace(/(?:^|[\s\-(x×])\d+(?:[.,]\d+)?\s*(?:kg|gr|g|ml|cl|lt|l)\b/gi, " ")
      .replace(/\b(?:kg|gr|g|ml|cl|lt|l)\s*\d+(?:[.,]\d+)?\b/gi, " ")
      .replace(/\(\s*\)/g, ""),
  ) || description;
  return size
    ? { code, description, material_name, category, quantity: size.q * qty, unit: size.u, total_price: total }
    : { code, description, material_name, category, quantity: qty, unit: "pz", total_price: total };
}

export function parseOrderText(text: string): TextOrder {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const items: TextItem[] = [];
  let shipping = 0;
  let totalDoc: number | null = null;

  // ---- formato a blocchi (pagina ordini Mr Malt e simili)
  let cur: { name: string; code?: string; unit?: number; qty?: number; total?: number } | null = null;
  const flush = () => {
    if (cur && cur.name && (cur.total != null || cur.unit != null)) {
      const qty = cur.qty ?? 1;
      const total = cur.total ?? (cur.unit ?? 0) * qty;
      items.push(finish(cur.name, qty, total, cur.code ?? null));
    }
    cur = null;
  };
  for (const l of lines) {
    const low = l.toLowerCase();
    if (/spedizion|trasport|consegna/.test(low) && priceIn(l) != null) { flush(); shipping += priceIn(l)!; continue; }
    if (/^(totale|total|importo totale|totale ordine)\b/.test(low) && priceIn(l) != null) { flush(); totalDoc = priceIn(l); continue; }
    if (/^(subtotale|imponibile|iva|sconto)\b/.test(low)) continue;
    if (/^\d{5,}$/.test(l)) { if (cur && !cur.code) cur.code = l; continue; } // codice articolo
    const codeLbl = l.match(/^(?:cod(?:ice)?\.?|art\.?|sku|rif\.?)\s*:?\s*([A-Z0-9-]{3,})$/i);
    if (codeLbl) { if (cur && !cur.code) cur.code = codeLbl[1]; continue; }
    const ord = l.match(/^(?:ordinat[oi]|q\.?\s?t[aà]|quantit[aà])\s*:?\s*(\d+(?:[.,]\d+)?)/i);
    if (ord) { if (cur) cur.qty = Number(ord[1].replace(",", ".")); continue; }
    if (/^(spedit[oi]|evas[oi]|disponibil)/i.test(l)) continue;
    if (ONLY_PRICE.test(l)) {
      if (cur) { if (cur.unit == null) cur.unit = priceIn(l)!; else cur.total = priceIn(l)!; }
      continue;
    }
    // riga con testo: se contiene anche un prezzo è un articolo su riga singola
    const p = priceIn(l);
    if (p != null && /[a-z]/i.test(l.replace(PRICE, ""))) {
      flush();
      const name = l.replace(PRICE, "").replace(/\s{2,}/g, " ");
      const q = name.match(/^(\d+)\s*[x×]\s+|\s[x×]\s*(\d+)\b/i);
      const qty = q ? Number(q[1] ?? q[2]) : 1;
      items.push(finish(name.replace(/^(\d+)\s*[x×]\s+|\s[x×]\s*\d+\b/i, ""), qty, p));
      continue;
    }
    // altrimenti è il nome di un nuovo articolo
    flush();
    cur = { name: l };
  }
  flush();

  const supplier = /mr\.?\s*malt/i.test(text) || /^\d{7}$/m.test(text) ? "Mr Malt" : /birramia/i.test(text) ? "Birramia" : null;
  const d = text.match(/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})\b/);
  const date = d ? `${d[3]}-${d[2].padStart(2, "0")}-${d[1].padStart(2, "0")}` : null;
  const inv = text.match(/(?:ordine|fattura|n\.?\s*ordine)\s*(?:n\.?|nr\.?|#)?\s*:?\s*([A-Z0-9-]{3,})/i);

  return {
    supplier, date, invoice_number: inv ? inv[1] : null, currency: "EUR",
    shipping_cost: Math.round(shipping * 100) / 100, total_amount: totalDoc,
    notes: items.length ? "Letto direttamente dal testo (senza AI): controlla quantità e categorie." : null,
    items,
  };
}
