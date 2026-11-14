/* Analisi del confronto fra due preventivi (senza AI): abbina gli oggetti e ne ricava una valutazione scritta. */

export interface CmpItem { description: string; model?: string | null; brand?: string | null; category?: string | null; quantity: number | string; unit_price: number | string }
export interface Side { items: CmpItem[]; qty: number; total: number }
export interface Pair { name: string; category: string; a: Side; b: Side; kind: "uguale" | "modello" | "soloA" | "soloB"; modelA?: string; modelB?: string }
export interface Analysis {
  totA: number; totB: number; diff: number;           // diff = B − A
  pairs: Pair[];
  same: Pair[];        // stesso oggetto in tutti e due
  modelChanged: Pair[]; // stesso nome, modello diverso
  onlyA: Pair[]; onlyB: Pair[];
  zeroA: string[]; zeroB: string[];                   // oggetti senza prezzo
  fullA: number; fullB: number;                       // a parità di oggetti (aggiungendo quelli che mancano, al prezzo dell'altro)
  bestMix: number;                                    // prendendo da ciascuno il prezzo più basso
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9à-ú]+/g, " ").trim();
const keyFull = (i: CmpItem) => norm([i.description, i.model].filter(Boolean).join(" "));
const keyName = (i: CmpItem) => norm(i.description);
const line = (i: CmpItem) => Number(i.quantity) * Number(i.unit_price);
const side = (items: CmpItem[]): Side => ({ items, qty: items.reduce((t, i) => t + Number(i.quantity), 0), total: items.reduce((t, i) => t + line(i), 0) });
const label = (i: CmpItem) => i.description + (i.model ? ` ${i.model}` : "");
const catOf = (i: CmpItem) => (i.category ?? "").trim() || "Senza categoria";

function group(items: CmpItem[], key: (i: CmpItem) => string) {
  const m = new Map<string, CmpItem[]>();
  for (const i of items) m.set(key(i), [...(m.get(key(i)) ?? []), i]);
  return m;
}

export function analyze(A: CmpItem[], B: CmpItem[]): Analysis {
  const pairs: Pair[] = [];
  const ga = group(A, keyFull), gb = group(B, keyFull);
  const restA: CmpItem[] = [], restB: CmpItem[] = [];
  for (const [k, ia] of ga) {
    const ib = gb.get(k);
    if (ib) pairs.push({ name: label(ia[0]), category: catOf(ia[0]), a: side(ia), b: side(ib), kind: "uguale" });
    else restA.push(...ia);
  }
  for (const [k, ib] of gb) if (!ga.has(k)) restB.push(...ib);
  // secondo giro: stesso nome ma modello diverso
  const na = group(restA, keyName), nb = group(restB, keyName);
  for (const [k, ia] of na) {
    const ib = nb.get(k);
    if (ib) pairs.push({ name: ia[0].description, category: catOf(ia[0]), a: side(ia), b: side(ib), kind: "modello",
      modelA: [...new Set(ia.map((i) => [i.brand, i.model].filter(Boolean).join(" ")))].join(", ") || "—",
      modelB: [...new Set(ib.map((i) => [i.brand, i.model].filter(Boolean).join(" ")))].join(", ") || "—" });
    else for (const g of group(ia, keyFull).values()) pairs.push({ name: label(g[0]), category: catOf(g[0]), a: side(g), b: side([]), kind: "soloA" });
  }
  for (const [k, ib] of nb) if (!na.has(k)) for (const g of group(ib, keyFull).values()) pairs.push({ name: label(g[0]), category: catOf(g[0]), a: side([]), b: side(g), kind: "soloB" });

  const totA = side(A).total, totB = side(B).total;
  const onlyA = pairs.filter((p) => p.kind === "soloA").sort((x, y) => y.a.total - x.a.total);
  const onlyB = pairs.filter((p) => p.kind === "soloB").sort((x, y) => y.b.total - x.b.total);
  const both = pairs.filter((p) => p.kind === "uguale" || p.kind === "modello");
  return {
    totA, totB, diff: totB - totA, pairs,
    same: pairs.filter((p) => p.kind === "uguale"),
    modelChanged: pairs.filter((p) => p.kind === "modello"),
    onlyA, onlyB,
    zeroA: A.filter((i) => !Number(i.unit_price)).map((i) => i.description),
    zeroB: B.filter((i) => !Number(i.unit_price)).map((i) => i.description),
    fullA: totA + onlyB.reduce((t, p) => t + p.b.total, 0),
    fullB: totB + onlyA.reduce((t, p) => t + p.a.total, 0),
    bestMix: both.reduce((t, p) => t + (p.a.total && p.b.total ? Math.min(p.a.total, p.b.total) : Math.max(p.a.total, p.b.total)), 0)
      + onlyA.reduce((t, p) => t + p.a.total, 0) + onlyB.reduce((t, p) => t + p.b.total, 0),
  };
}

const eu = (n: number) => n.toLocaleString("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: n % 1 ? 2 : 0 });
const list = (xs: string[]) => (xs.length <= 1 ? xs.join("") : xs.slice(0, -1).join(", ") + " e " + xs[xs.length - 1]);
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export interface Insight { tone: "good" | "bad" | "info" | "warn"; text: string }

/** Frasi di valutazione, dalla più importante. */
export function insights(r: Analysis, nameA: string, nameB: string, soci: number): { verdict: string; points: Insight[]; advice: string } {
  const cheap = r.diff < 0 ? nameB : nameA, dear = r.diff < 0 ? nameA : nameB;
  const d = Math.abs(r.diff);
  const pct = Math.round((d / Math.max(r.totA, r.totB, 1)) * 100);
  const verdict = d < 0.5
    ? `${nameA} e ${nameB} costano uguale: ${eu(r.totA)}.`
    : `«${cheap}» costa ${eu(d)} in meno di «${dear}» (−${pct}%), cioè ${eu(d / soci)} in meno a testa.`;

  const points: Insight[] = [];
  const cheapIsB = r.diff < 0;
  // cosa manca a quello che costa meno
  const missingInCheap = cheapIsB ? r.onlyA : r.onlyB;
  const missingInDear = cheapIsB ? r.onlyB : r.onlyA;
  const tot = (p: Pair) => (p.a.total || p.b.total);
  const missCheapVal = missingInCheap.reduce((t, p) => t + tot(p), 0);
  if (missingInCheap.length) {
    points.push({ tone: "bad", text: `«${cheap}» non ha ${plural(missingInCheap.length, "oggetto", "oggetti")} che invece ci sono in «${dear}»: ${list(missingInCheap.slice(0, 5).map((p) => `${p.name} (${eu(tot(p))})`))}${missingInCheap.length > 5 ? "…" : ""}. In tutto valgono ${eu(missCheapVal)}${d > 0.5 ? `, cioè ${Math.round((missCheapVal / d) * 100)}% della differenza di prezzo` : ""}.` });
  }
  if (missingInDear.length) {
    points.push({ tone: "info", text: `«${dear}» non ha invece ${list(missingInDear.slice(0, 5).map((p) => `${p.name} (${eu(tot(p))})`))}${missingInDear.length > 5 ? "…" : ""}.` });
  }
  // a parità di oggetti
  if (r.onlyA.length || r.onlyB.length) {
    const fa = r.fullA, fb = r.fullB;
    const fd = Math.abs(fb - fa);
    points.push({ tone: "warn", text: fd < 0.5
      ? `A parità di oggetti (aggiungendo a ciascuno quelli che gli mancano, al prezzo dell'altro) i due preventivi si equivalgono: ${eu(fa)}.`
      : `A parità di oggetti (aggiungendo a ciascuno quelli che gli mancano, al prezzo dell'altro) «${fb < fa ? nameB : nameA}» costerebbe ${eu(Math.min(fa, fb))} contro ${eu(Math.max(fa, fb))}: ${eu(fd)} in meno${(fb < fa) !== cheapIsB ? ", quindi il risparmio vero si ribalta" : ""}.` });
  }
  // stessi oggetti, prezzi diversi
  const diffPrice = [...r.same, ...r.modelChanged].map((p) => ({ p, dd: p.b.total - p.a.total })).filter((x) => Math.abs(x.dd) >= 0.5);
  const cheaperInB = diffPrice.filter((x) => x.dd < 0), cheaperInA = diffPrice.filter((x) => x.dd > 0);
  const equal = r.same.filter((p) => Math.abs(p.b.total - p.a.total) < 0.5);
  if (diffPrice.length) {
    const top = [...diffPrice].sort((x, y) => Math.abs(y.dd) - Math.abs(x.dd)).slice(0, 3);
    points.push({ tone: "info", text: `Sugli oggetti presenti in tutti e due: ${cheaperInB.length ? `${plural(cheaperInB.length, "costa", "costano")} meno in «${nameB}» (${eu(-cheaperInB.reduce((t, x) => t + x.dd, 0))} in tutto)` : ""}${cheaperInB.length && cheaperInA.length ? ", " : ""}${cheaperInA.length ? `${plural(cheaperInA.length, "costa", "costano")} meno in «${nameA}» (${eu(cheaperInA.reduce((t, x) => t + x.dd, 0))} in tutto)` : ""}. Le differenze più grosse: ${list(top.map((x) => `${x.p.name} ${x.dd < 0 ? "−" : "+"}${eu(Math.abs(x.dd))} in «${nameB}»`))}.` });
  }
  if (equal.length) points.push({ tone: "good", text: `${plural(equal.length, "oggetto costa", "oggetti costano")} uguale nei due preventivi${equal.length <= 4 ? `: ${list(equal.map((p) => p.name))}` : ""}.` });
  // modelli diversi
  for (const p of r.modelChanged.slice(0, 4)) {
    const dd = p.b.total - p.a.total;
    points.push({ tone: "warn", text: `${p.name}: in «${nameA}» è ${p.modelA}, in «${nameB}» è ${p.modelB}${Math.abs(dd) >= 0.5 ? ` (${dd < 0 ? "−" : "+"}${eu(Math.abs(dd))})` : ""}. Non è lo stesso oggetto: valuta se va bene lo stesso.` });
  }
  // quantità diverse
  const qtyDiff = [...r.same, ...r.modelChanged].filter((p) => p.a.qty !== p.b.qty);
  if (qtyDiff.length) points.push({ tone: "warn", text: `Quantità diverse per ${list(qtyDiff.slice(0, 4).map((p) => `${p.name} (${p.a.qty} contro ${p.b.qty})`))}: controlla che non sia un errore.` });
  // prezzi mancanti
  if (r.zeroA.length || r.zeroB.length) {
    const z = [r.zeroA.length ? `in «${nameA}» ${list(r.zeroA.slice(0, 4))}` : "", r.zeroB.length ? `in «${nameB}» ${list(r.zeroB.slice(0, 4))}` : ""].filter(Boolean).join("; ");
    points.push({ tone: "warn", text: `Senza prezzo (contati 0 €): ${z}. Il confronto non è completo finché non hanno un prezzo.` });
  }
  // il meglio dei due
  if (r.bestMix + 0.5 < Math.min(r.totA, r.totB) && (r.onlyA.length + r.onlyB.length === 0)) {
    points.push({ tone: "good", text: `Prendendo ogni oggetto dal preventivo dove costa meno si spenderebbero ${eu(r.bestMix)} (${eu(r.bestMix / soci)} a testa).` });
  }

  // consiglio finale
  let advice: string;
  if (d < 0.5 && !missingInCheap.length) advice = "Si equivalgono: scegliete in base a marche, modelli e fornitori.";
  else if (!missingInCheap.length) advice = `«${cheap}» conviene: ha tutto quello che c'è in «${dear}» e risparmiate ${eu(d)} (${eu(d / soci)} a testa).`;
  else if (missCheapVal >= d) advice = `Il risparmio di «${cheap}» viene tutto dagli oggetti che non ha: se vi servono comunque, a parità di oggetti conviene «${r.fullB < r.fullA ? nameB : nameA}».`;
  else advice = `«${cheap}» conviene anche aggiungendo gli oggetti che gli mancano: a parità di oggetti risparmiate comunque ${eu(Math.abs(r.fullB - r.fullA))}. Decidete se quegli oggetti servono davvero.`;
  return { verdict, points, advice };
}
