import { buildProcedure } from "./procedure";
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
  if (/malt|pils|pilsner|munich|monaco|vienna|crystal|\bcara(?!ff)|frumento|wheat|avena|\boat|fiocch|chocolate|roast|carafa|biscuit|melanoid|acidulat/.test(n)) return "malto";
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
  // attrezzatura e kit a pezzi; lieviti a unità (bustine), non a grammi
  const size = EQUIPMENT.test(description) || category === "lievito" || (category === "altro" && /\bkit\b/i.test(description)) ? null : sizeIn(description);
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

// =====================================================================
// Ricette da testo (es. copiate da una chat con un'AI), senza AI
// =====================================================================
export interface TextRecipe {
  name: string | null;
  style: string | null;
  description: string | null;
  batch_size_l: number | null;
  boil_time_min: number | null;
  mash_temp_c: number | null;
  mash_time_min: number | null;
  target_og: number | null;
  target_fg: number | null;
  target_ibu: number | null;
  target_ebc: number | null;
  efficiency_pct: number | null;
  mash_water_l: number | null;
  sparge_water_l: number | null;
  procedure: string | null;
  notes: string | null;
  ingredients: { name: string; category: string; quantity: number; unit: string; step: string | null }[];
}

const UNIT_RX = "kg|chili|chilogrammi|g|gr|grammi|ml|cl|l|lt|litri|bustin[ae]|buste?|pz|pezzi|confezion[ei]|pacchett[oi]|cucchiain[oi]|compress[ae]|pastigli[ae]";
const QTY = new RegExp(`(\\d+(?:[.,]\\d+)?)\\s*(${UNIT_RX})\\b\\.?`, "i");

function normUnit(u: string): string {
  const x = u.toLowerCase();
  if (/^(kg|chili|chilogrammi)$/.test(x)) return "kg";
  if (/^(g|gr|grammi)$/.test(x)) return "g";
  if (x === "ml") return "ml";
  if (x === "cl") return "cl";
  if (/^(l|lt|litri)$/.test(x)) return "l";
  return "pz";
}

const num = (s: string) => Number(s.replace(",", "."));
const SKIP_LINE = /^(volume|batch|lotto|litri|acqua\b|og\b|fg\b|ibu\b|ebc\b|srm\b|abv\b|efficien|mash\b.*°|ammostamento\b.*°|bollitura\b|temperatura|ph\b|densit|gravity|resa|colore|amaro\b|totale)/i;

/** Ricava lo step di aggiunta (mash, 60 min, whirlpool, dry hop…) dal testo della riga. */
function stepOf(line: string, category: string): string | null {
  const l = line.toLowerCase();
  if (/dry[\s-]?hop|a freddo|in fermentazione|in fermentatore/.test(l)) {
    const d = l.match(/giorno\s*(\d+)|(\d+)\s*(?:°|º)?\s*giorno|day\s*(\d+)/);
    return d ? `dry hop giorno ${d[1] ?? d[2] ?? d[3]}` : "dry hop";
  }
  if (/whirlpool|flame\s?out|fine bollitura|a fuoco spento|hop stand/.test(l)) {
    const t = l.match(/(\d{2})\s*°\s*c/);
    return t ? `whirlpool ${t[1]}°C` : "whirlpool";
  }
  if (/first wort|fwh/.test(l)) return "first wort";
  const m = l.match(/(\d{1,3})\s*(?:min\b|minuti|'|’)/) ?? l.match(/@\s*(\d{1,3})\b/);
  if (m && category !== "malto") return `${m[1]} min`;
  if (category === "lievito") return "inoculo";
  if (category === "malto" || /mash|ammostament|avena|\boat|fiocch/.test(l)) return "mash";
  return null;
}

function cleanIngredientName(line: string): string {
  return line
    .replace(QTY, " ")
    .replace(/\(?\s*(?:a|@|per|dopo|circa)?\s*\d{1,3}(?:\s*[–—-]\s*\d{1,3})?\s*(?:min\b|minuti|'|’)\s*\)?/gi, " ")
    .replace(/\b(?:dalla|alla|prima della|a)\s+fine(?:\s+(?:della\s+)?bollitura)?\b/gi, " ")
    .replace(/\bda\s+\d+(?:[.,]\d+)?\s*(?:g|gr|ml)\b\.?/gi, " ")
    .replace(/\b(?:in\s+|a\s+)?\d{2}\s*°\s*c\b/gi, " ")
    .replace(/\b(?:in\s+|nel\s+|al\s+|a\s+)?(?:dry[\s-]?hop(?:ping)?|whirlpool|hop\s?stand|flame\s?out|first wort|fine bollitura|a fuoco spento|mash|ammostamento|inoculo|bollitura|fermentatore|fermentazione|giorno\s*\d+|day\s*\d+)\b/gi, " ")
    .replace(/^\s*(?:di|del|della|dei)\s+/i, "")
    .replace(/[|•*=→]+/g, " ")
    .replace(/\(\s*\)/g, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+(?:in|a|al|nel|per|e)\s*$/i, "")
    .replace(/^[\s,.-]+|[\s,.-]+$/g, "")
    .trim();
}

/** Toglie le descrizioni aggiunte dalle chat: "Saaz (note speziate, per l'aroma)" → "Saaz". */
function tidyName(name: string, category: string): string {
  let n = name
    // parentesi: tieni solo gli alfa acidi, es. "(3,5% AA)"
    .replace(/\(([^)]*)\)/g, (_m, inner: string) => (/\d\s*%|\baa\b|alfa/i.test(inner) ? ` (${inner.trim()})` : " "))
    .replace(/\[[^\]]*\]/g, " ");
  // descrizione dopo trattino, due punti o virgola: "Saaz – luppolo nobile ceco" → "Saaz"
  const parts = n.split(/\s*[–—]\s*|\s-\s|:\s*|,\s|;\s*|\s\/\s/).map((x) => x.trim()).filter(Boolean);
  const GENERIC = /^(lievit[oi]|luppol[oi]|malt[oi]|sali|acqua|ingredient[ei]|aggiunt[ae])$/i;
  const pick = parts.length > 1 && GENERIC.test(parts[0]) ? parts[1] : parts[0];
  if (pick && pick.length >= 2) n = pick;
  if (category === "luppolo") {
    n = n
      .replace(/\b(?:per|da|come|in)\s+(?:l['’]\s*)?(?:amaro|amaricante|amaricare|aroma|aromatizzazione|aromatico|aromatica|profumo|gusto|sapore|amaricatura)\b.*$/i, "")
      .replace(/\b(?:amaro|amaricante|aroma|aromatico|aromatica|aromatizzazione|bittering)\s*$/i, "")
      .replace(/\b(?:luppolo|luppoli)\b\s*(?=\S)/i, "");
  }
  n = n
    .replace(/^(?:quando mancano|dopo|aggiunger[ei]|aggiungi|inserire)\b\s*/gi, "")
    .replace(/^(?:aggiunger[ei]|aggiungi)\s+/i, "")
    .replace(/^(?:di|del|della)\s+/i, "")
    .replace(/\s+per\s+\d+(?:\s*[–—-]\s*\d+)?\s*$/i, "")
    .replace(/\s+(?:dalla|alla)\s+fine\s*$/i, "")
    .replace(/\s+da\s+\d+(?:[.,]\d+)?\s*(?:g|gr|ml)?\s*$/i, "")
    .replace(/\s+(?:da|di|a|per|in)\s*$/i, "");
  return n.replace(/\s{2,}/g, " ").replace(/^[\s,.-]+|[\s,.-]+$/g, "").trim();
}

export function parseRecipeText(text: string, knownStyles: string[] = []): TextRecipe {
  const raw = text.replace(/\*\*|__|`/g, "");
  const lines = raw.split(/\r?\n/).map((l) => l.replace(/^\s*(?:[-*•+]|\d+[.)])\s+/, "").replace(/^#+\s*/, "").trim()).filter(Boolean);
  const find = (rx: RegExp) => { const m = raw.match(rx); return m ? m : null; };

  const RANGE = "(?:\\s*[–—-]\\s*(1[.,]\\d{3}))?";
  const og = find(new RegExp(`\\b(?:OG|O\\.G\\.|densit[aà] iniziale|gravity iniziale)\\b[^\\d\\n]{0,30}(1[.,]\\d{3})${RANGE}`, "i"));
  const fg = find(new RegExp(`\\b(?:FG|F\\.G\\.|densit[aà] finale|gravity finale)\\b[^\\d\\n]{0,30}(1[.,]\\d{3})${RANGE}`, "i"));
  const ibu = find(/\bIBU\b[^\d\n]{0,15}(\d{1,3}(?:[.,]\d)?)(?:\s*[–—-]\s*(\d{1,3}(?:[.,]\d)?))?|(\d{1,3}(?:[.,]\d)?)\s*IBU\b/i);
  const ebc = find(/\bEBC\b[^\d\n]{0,15}(\d{1,3}(?:[.,]\d)?)(?:\s*[–—-]\s*(\d{1,3}(?:[.,]\d)?))?|(\d{1,3}(?:[.,]\d)?)\s*EBC\b/i);
  const srm = find(/\bSRM\b[^\d\n]{0,15}(\d{1,3}(?:[.,]\d)?)|(\d{1,3}(?:[.,]\d)?)\s*SRM\b/i);
  const vol = find(/(?:volume|batch|lotto|litri finali|in fermentatore|per)\b[^\d\n]{0,25}(\d{1,3}(?:[.,]\d)?)\s*(?:l|lt|litri)\b/i) ?? find(/\b(\d{1,3}(?:[.,]\d)?)\s*(?:l|litri)\s*(?:di birra|finali|batch)/i);
  const eff = find(/efficien[a-z]*\b[^\d\n]{0,15}(\d{2}(?:[.,]\d)?)\s*%/i);
  const mash = find(/(?:mash(?!\s*out)|ammostamento|infusione|single infusion|saccarificazione)[^\n]{0,60}?(\d{2}(?:[.,]\d)?)\s*°\s*C?[^\n]{0,30}?(\d{2,3})\s*(?:min|minuti|')/i)
    ?? find(/(\d{2}(?:[.,]\d)?)\s*°\s*C?\s*(?:per|x|×)?\s*(\d{1,3})\s*(?:min|minuti|')/i);
  // tabella delle fasi di mash: "Prima fase  63 °C  60 minuti"
  const mashSteps = lines
    .map((l) => l.match(/^([A-Za-zÀ-ú' ]{3,30}?)\s+(\d{2}(?:[.,]\d)?)\s*°\s*C\s+(\d{1,3})\s*(?:min|minuti|')/i))
    .filter((m): m is RegExpMatchArray => !!m && !/fermentaz|inizio|intermedia|finale|whirlpool|raffredd/i.test(m[1]))
    .map((m) => `${m[1].trim()} ${m[2]} °C × ${m[3]} min`);
  const mashW = find(/(?:acqua\s*(?:di|del|per(?: il| lo)?)?\s*)(?:mash|ammostamento|infusione|impasto)\b[^\n\d]{0,25}(\d{1,3}(?:[.,]\d+)?)\s*(?:l|lt|litri)\b/i)
    ?? find(/(?:mash|ammostamento)\s*(?:water|acqua)?\s*[:=]\s*(\d{1,3}(?:[.,]\d+)?)\s*(?:l|lt|litri)\b/i);
  const spargeW = find(/sparge\b[^\n\d]{0,25}(\d{1,3}(?:[.,]\d+)?)\s*(?:l|lt|litri)\b/i);
  const boil = find(/bollitura[^\n\d]{0,20}(\d{2,3})\s*(?:min|minuti|')/i) ?? find(/(\d{2,3})\s*(?:min|minuti)\s*(?:di\s*)?bollitura/i);

  const ingredients: TextRecipe["ingredients"] = [];
  const INSTRUCTION = /^(?:quando|dopo|inizio|fine|durante|al termine|terminata)\b|\b(?:aggiunger[ei]|aggiungi|inserire|preparare|raffreddare|trasferire|mantenere|portare|riscaldare|misurare|prelevare|lasciare|avvio|spegnere|mescolare|controllare|ossigenare|inoculare|registrare|calcolare|utilizzare|attendere|verificare|sollevare|abbassare|procedere)\b/i;
  const boilMin = (() => { const b = raw.match(/bollitura[^\n\d]{0,25}(\d{2,3})\s*(?:min|minuti|')/i) ?? raw.match(/(\d{2,3})\s*(?:min|minuti)\s*(?:di\s*)?bollitura/i); return b ? Number(b[1]) : null; })();
  const keyOf = (n: string) => n.toLowerCase().replace(/^(?:luppolo|malto|lievito)\s+/, "").replace(/[^a-z0-9]/g, "");
  for (const l of lines) {
    if (SKIP_LINE.test(l)) continue;
    if (INSTRUCTION.test(l)) {
      // es. "Quando mancano 10 minuti  Aggiungere 300 g zucchero": completa il momento dell'ingrediente già trovato
      const q2 = l.match(QTY);
      if (!q2) continue;
      const nm = tidyName(cleanIngredientName(l.replace(INSTRUCTION, " ").replace(/\b(?:mancano|aggiungere|aggiungi|di)\b/gi, " ")), "altro");
      const hit = ingredients.find((i) => keyOf(i.name).includes(keyOf(nm)) || keyOf(nm).includes(keyOf(i.name)));
      if (hit && !hit.step && nm.length > 1) {
        const after = l.match(/dopo\s*(\d{1,3})\s*(?:min|minuti)/i);
        const st = after && boilMin ? `${boilMin - Number(after[1])} min` : stepOf(l, hit.category);
        if (st && st !== "mash" && st !== "inoculo") hit.step = st;
      }
      continue;
    }
    // tabelle markdown: | Malto Pils | 5 kg | mash |
    const line = l.includes("|") ? l.split("|").map((c) => c.trim()).filter(Boolean).join(" ") : l;
    if (/^[-:\s|]+$/.test(line)) continue;
    const q = line.match(QTY);
    if (!q) continue;
    if (/^(ecco|ricetta|per\b|questa|una\b|un\b|ti\b|di seguito)/i.test(line)) continue;
    let name = cleanIngredientName(line);
    if (!name || name.length < 2 || /^(ingredienti|malti|luppoli|lievito|acqua|sali)$/i.test(name)) continue;
    let category = guessCategory(name);
    if (category === "altro" && /\b(us-?05|s-?04|s-?33|w-?34|t-?58|be-?256|k-?97|wb-?06|nottingham|verdant|bry-?97|london|belle saison|m\d{2})\b/i.test(name)) category = "lievito";
    if (category === "detergenti") continue;
    if (/^acqua\b/i.test(name)) continue;
    if (category === "altro" && /^(l|lt|litri)$/i.test(q[2])) continue; // "20 litri" è un volume, non un ingrediente
    let unit = normUnit(q[2]);
    let quantity = num(q[1]);
    if (unit === "cl") { unit = "l"; quantity = quantity / 100; }
    if (category === "lievito" && (unit === "g" || unit === "ml")) {
      // "11,5 g" di lievito secco = 1 bustina
      name = `${name} (${q[1]} ${q[2]})`; quantity = 1; unit = "pz";
    }
    name = tidyName(name, category);
    if (!name) continue;
    ingredients.push({ name: name.charAt(0).toUpperCase() + name.slice(1), category, quantity, unit, step: stepOf(line, category) });
  }

  // nome e stile: prima riga "titolo" senza quantità
  const SECTION = /^(ingredienti|parametri|dati|malti|cereali|fermentabili|luppoli|lievit[oi]|acqua(?: e sali)?|sali|procedimento|processo|istruzioni|note|mash|bollitura|fermentazione|imbottigliamento|profilo|ricetta|recipe)\s*:?$/i;
  const title = lines.slice(0, 3).find((l) => !QTY.test(l) && !/^[^:]{1,30}:\s*\S/.test(l) && !/%|°/.test(l) && l.length <= 70 && !SECTION.test(l) && !/^[|:\-\s]+$/.test(l) && !/\b(OG|FG|IBU|EBC)\b/.test(l));
  let name: string | null = title ? title.replace(/^(?:ricetta|recipe)\s*[:\-–]?\s*/i, "").replace(/[🍺🍻]/g, "").trim() : null;
  const intro = raw.match(/ricetta (?:per|di) (?:una|un|la|il)?\s*([^\n,.:]{3,40}?)\s+(?:da|per|di)\s+\d/i);
  if (!name || /^(ecco|certo|ok|perfetto|ottimo|ciao)\b/i.test(name)) name = intro ? intro[1].trim() : null;
  // stile: prima nel titolo, poi la prima menzione nel testo (non quella nei nomi dei malti)
  const esc = (x: string) => x.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const styleIn = (t: string) => {
    let best: { s: string; i: number } | null = null;
    for (const st of knownStyles) {
      const m = new RegExp(`\\b${esc(st)}\\b`).exec(t.toLowerCase());
      if (m && (!best || m.index < best.i || (m.index === best.i && st.length > best.s.length))) best = { s: st, i: m.index };
    }
    return best?.s ?? null;
  };
  const prose = lines.filter((l) => !QTY.test(l) || /^(ecco|ricetta|per\b)/i.test(l)).join("\n");
  const style = styleIn(name ?? "") ?? styleIn(intro?.[0] ?? "") ?? styleIn(prose);

  const g = (m: RegExpMatchArray | null, i = 1) => (m ? num(m[i] ?? m[i + 1]) : null);
  // valore singolo o medio di un intervallo (OG/FG: gruppo 1-2 · IBU/EBC: 1-2 oppure 3)
  const mid = (m: RegExpMatchArray | null, dec: number) => {
    if (!m) return null;
    const a = m[1] ?? m[3]; if (a == null) return null;
    const v = m[2] != null && m[1] != null ? (num(m[1]) + num(m[2])) / 2 : num(a);
    const f = 10 ** dec; return Math.round(v * f) / f;
  };
  // dati per il riassunto del procedimento
  const fermProfile = lines
    .map((l) => l.match(/^((?:inizio|fase|fine|prima|seconda|terza|ultima)[A-Za-zÀ-ú ]{0,25}?)\s+(\d{2}(?:\s*[–—-]\s*\d{2})?)\s*°\s*C\s*$/i))
    .filter((m): m is RegExpMatchArray => !!m && !/mash|ammost|bollit/i.test(m[1]))
    .map((m) => `${m[1].trim().toLowerCase()} ${m[2].replace(/\s*[–—-]\s*/, "–")} °C`);
  const cool = raw.match(/raffredda[a-z]*[^\n\d]{0,40}?(\d{2})\s*°\s*C/i);
  const spT = raw.match(/sparge[^\n]{0,60}?(\d{2})\s*°\s*C/i) ?? raw.match(/(\d{2})\s*°\s*C[^\n]{0,30}sparge/i);
  const carb = raw.match(/carbonazione[^\n\d]{0,30}(\d[,.]?\d?\s*(?:[–—-]\s*\d[,.]?\d?)?\s*vol[a-z]*(?:\s*(?:di\s*)?CO[2₂])?)/i);
  // descrizione della birra dal profilo organolettico (Colore, Corpo, Aroma, Finale…)
  const PROFILE = /^(colore|schiuma|corpo|aroma|gusto|luppolo|amaro|finale|aspetto|carbonazione percepita)\s*[:\t ]\s*(.+)$/i;
  const profile = lines.map((l) => l.match(PROFILE)).filter((m): m is RegExpMatchArray => !!m && !/\d/.test(m[2]) && m[2].length < 80 && !/quantit|momento|valore|descrizione|operazione/i.test(m[2]))
    .map((m) => `${m[1].charAt(0).toUpperCase() + m[1].slice(1).toLowerCase()}: ${m[2].trim().replace(/\.$/, "")}`);
  const procedure = ingredients.length ? buildProcedure({
    mashTemp: mash ? num(mash[1]) : null, mashTime: mash ? num(mash[2]) : null, mashSteps,
    boil: g(boil), mashWater: g(mashW), spargeWater: g(spargeW), spargeTemp: spT ? num(spT[1]) : null,
    coolTemp: cool ? num(cool[1]) : null, fermProfile, carbonation: carb ? carb[1].replace(/\s+/g, " ").replace(/vol[a-z]*/i, "volumi").replace(/CO2/, "CO₂") : null,
    ingredients,
  }) : null;

  return {
    name, style, description: profile.length ? profile.join(" · ") : null,
    batch_size_l: g(vol),
    boil_time_min: g(boil),
    mash_temp_c: mash ? num(mash[1]) : null,
    mash_time_min: mash ? num(mash[2]) : null,
    target_og: mid(og, 3), target_fg: mid(fg, 3), target_ibu: mid(ibu, 0),
    target_ebc: ebc ? mid(ebc, 0) : srm ? Math.round(g(srm)! * 1.97) : null,
    efficiency_pct: g(eff),
    mash_water_l: g(mashW), sparge_water_l: g(spargeW),
    procedure,
    notes: ingredients.length ? "Letta direttamente dal testo (senza AI): controlla quantità e momenti di aggiunta." : null,
    ingredients,
  };
}

/** Pulisce il nome di un ingrediente già salvato (stesse regole dell'import). */
export function cleanSavedName(name: string, category: string): string {
  const n = tidyName(cleanIngredientName(name), category);
  return n ? n.charAt(0).toUpperCase() + n.slice(1) : name;
}
