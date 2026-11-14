/* Lettura locale (senza AI) delle righe di un preventivo da testo:
   testo letto con l'OCR da uno screenshot (es. di un foglio Google) o file CSV/testo. */

export interface QuoteLine { code: string; description: string; category: string; quantity: number; unit_price: number; discount_pct: number; vat_pct: number }
export interface ParsedQuote { items: QuoteLine[]; shipping: number; includeVat: boolean; skipped: string[]; grandTotal: number | null }

const NUM = /^[-+]?€?\s?(\d{1,3}(?:[.\s]\d{3})+|\d+)(?:[.,]\d{1,3})?\s?€?$/;
const toN = (s: string) => {
  let t = s.replace(/[€\s]/g, "");
  if (t.includes(",") && t.includes(".")) t = t.lastIndexOf(",") > t.lastIndexOf(".") ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, "");
  else if (/,\d{1,3}$/.test(t)) t = t.replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, "");
  else t = t.replace(",", ".");
  return parseFloat(t);
};
const SUMMARY = /^(tot(ale)?|sub\s?-?tot|imponibile|iva\b|totale iva|total|importo totale|netto a pagare|da pagare|arrotond)/i;
const SHIPPING = /(spedizion|trasport|consegna|imballo|corriere)/i;
const HEADER = /(descrizion|q\.?\s?t[aà]|quantit|prezzo|importo)/i;
const near = (a: number, b: number) => Math.abs(a - b) <= Math.max(0.02, Math.abs(b) * 0.015);

/** Divide una riga in celle: tab, «;», «|» o almeno 2 spazi; altrimenti per parole. */
function cells(line: string): string[] {
  if (/\t|;|\|/.test(line)) return line.split(/\t|;|\|/).map((c) => c.trim()).filter(Boolean);
  return line.split(/\s{2,}/).map((c) => c.trim()).filter(Boolean);
}

export function parseQuoteText(text: string): ParsedQuote {
  const items: QuoteLine[] = [];
  const skipped: string[] = [];
  let shipping = 0;
  let grandTotal: number | null = null;
  let includeVat = /iva\s+(inclusa|compresa)|ivat[oi]\b|prezzi\s+lordi/i.test(text);

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\s+$/, "");
    if (!line.trim()) continue;
    const isPct = (c: string) => /^\d+([.,]\d+)?\s?%$/.test(c);
    const clean = (c: string) => c.replace(/^€\s*/, "").replace(/\s*€$/, "").trim();
    let parts = cells(line);
    const words: string[] = [];
    const nums: number[] = [];
    const pcts: number[] = [];
    let qtyPrefix: number | null = null;
    if (parts.length <= 1) {
      // riga senza colonne: numeri solo in fondo, quantità eventualmente in testa («2 x …», «2 …»)
      const w = line.trim().split(/\s+/).filter((x) => x !== "€" && x !== "|");
      const tail: string[] = [];
      // «€ -» (cella vuota nel formato contabilità) vale 0
      while (w.length > 1 && (NUM.test(clean(w[w.length - 1])) || isPct(w[w.length - 1]) || /^[-–—]$/.test(w[w.length - 1]))) {
        const c = clean(w.pop()!); tail.unshift(/^[-–—]$/.test(c) ? "0" : c);
      }
      // screenshot del foglio: in testa il numero di riga e poi la quantità («12 1 Fasce…»)
      if (/^\d+$/.test(w[0] ?? "") && /^\d+$/.test(w[1] ?? "") && w.length > 2) w.shift();
      const m = /^(\d+)\s?[x×]?$/i.exec(w[0] ?? "");
      if (m && w.length > 1) { w.shift(); if (/^[x×]$/i.test(w[0])) w.shift(); qtyPrefix = Number(m[1]); }
      words.push(...w);
      for (const c of tail) (isPct(c) ? pcts.push(toN(c.replace("%", ""))) : nums.push(toN(c)));
    } else {
      parts = parts.map(clean);
      const m = /^(\d+)\s?[x×]?$/i.exec(parts[0]);
      if (m && parts.length > 2 && !NUM.test(parts[1])) { qtyPrefix = Number(m[1]); parts.shift(); }
      for (const c of parts) {
        if (isPct(c)) pcts.push(toN(c.replace("%", "")));
        else if (NUM.test(c) && words.length > 0) nums.push(toN(c));
        else words.push(c);
      }
    }
    const description = words.join(" ").replace(/^[-•*·\s]+/, "").replace(/\s{2,}/g, " ").trim();
    if (!description || !/[a-zà-ú]{3}/i.test(description)) {
      if (nums.length) { skipped.push(line.trim()); grandTotal = nums[nums.length - 1] || grandTotal; }   // riga col solo totale
      continue;
    }
    if (HEADER.test(description) && !nums.length) continue;
    if (SUMMARY.test(description)) { skipped.push(line.trim()); if (/^tot/i.test(description)) grandTotal = nums[nums.length - 1] ?? grandTotal; continue; }
    if (!nums.length) { skipped.push(line.trim()); continue; }

    let quantity = qtyPrefix ?? 1, unit_price = 0;
    const firstIsQty = qtyPrefix != null;
    const n = nums;
    // quantità nota e più coppie prezzo/totale (es. «Prezzo Prev, Totale Prev, Prezzo Finale, Totale Finale»):
    // vale l'ultima coppia compilata, cioè il prezzo finale se c'è, altrimenti quello del preventivo
    const pairs = firstIsQty ? n.slice(0, -1).map((a, i) => [a, n[i + 1]]).filter(([a, b], i) => i % 2 === 0 && near(a * quantity, b)) : [];
    if (pairs.length && n.length >= 2) {
      const filled = pairs.filter(([a]) => a > 0);
      unit_price = (filled[filled.length - 1] ?? pairs[0])[0];
    } else if (n.length >= 3) {
      // cerca q × prezzo = totale fra gli ultimi numeri
      const [a, b, c] = n.slice(-3);
      if (near(a * b, c)) { quantity = a; unit_price = b; }
      else if (near(b * c, a)) { quantity = b; unit_price = c; }
      else { unit_price = n[n.length - 2]; quantity = firstIsQty ? quantity : (Number.isInteger(n[0]) && n[0] < 1000 ? n[0] : 1); }
    } else if (n.length === 2) {
      const [a, b] = n;
      if (firstIsQty) { unit_price = a; }
      else if (Number.isInteger(a) && a > 0 && a <= 500 && b >= a) { quantity = a; unit_price = b; }
      else if (near(a * quantity, b)) unit_price = a;
      else unit_price = a;
      // «prezzo  totale» con quantità in prefisso
      if (qtyPrefix && near(a * qtyPrefix, b)) { quantity = qtyPrefix; unit_price = a; }
    } else {
      unit_price = qtyPrefix ? n[0] / qtyPrefix : n[0];
      if (qtyPrefix && n[0] < 1) unit_price = n[0];
    }
    let discount_pct = 0, vat_pct = 22;
    for (const p of pcts) { if ([4, 5, 10, 22].includes(p)) vat_pct = p; else if (p > 0 && p < 100) discount_pct = p; }

    if (SHIPPING.test(description) && n.length <= 2 && quantity === 1) { shipping += unit_price; continue; }
    items.push({ code: "", description, category: "", quantity, unit_price: Math.round(unit_price * 100) / 100, discount_pct, vat_pct });
  }
  // se il totale del foglio è la somma semplice delle righe, i prezzi sono già IVA inclusa
  const sum = items.reduce((t, i) => t + i.quantity * i.unit_price * (1 - i.discount_pct / 100), 0);
  if (grandTotal && sum > 0 && (near(sum, grandTotal) || near(sum + shipping, grandTotal))) includeVat = true;
  return { items, shipping: Math.round(shipping * 100) / 100, includeVat, skipped, grandTotal };
}

/** Legge un CSV/TSV (es. foglio Google scaricato come .csv) in una griglia. */
export function parseCsv(text: string): string[][] {
  const first = text.split(/\r?\n/, 1)[0] ?? "";
  const sep = first.includes("\t") ? "\t" : (first.split(";").length > first.split(",").length ? ";" : ",");
  const rows: string[][] = [];
  let row: string[] = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === sep) { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.map((r) => r.map((c) => c.trim()));
}
