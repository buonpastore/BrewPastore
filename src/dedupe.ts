/** Ingredienti doppi: stesso prodotto, stessa quantità e stesso momento (o momento mancante in uno dei due).
 *  Succede quando il testo importato elenca gli ingredienti due volte (tabella + procedimento). */
export interface IngLike { name: string; category: string; quantity: number | string; unit: string; step?: string | null }

const key = (n: string) => n.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/^(?:luppolo|malto|lievito|fiocchi)\s+/, "").replace(/\b(?:di|d|del|della|in|pellet|pellets)\b/g, "").replace(/\([^)]*\)/g, "").replace(/[^a-z0-9]/g, "");
const sameName = (a: string, b: string) => { const x = key(a), y = key(b); return !!x && !!y && (x === y || x.includes(y) || y.includes(x)); };
const sameStep = (a?: string | null, b?: string | null) => !a || !b || a.trim().toLowerCase() === b.trim().toLowerCase();

export function isDuplicate(a: IngLike, b: IngLike): boolean {
  return a.unit === b.unit && Math.abs(Number(a.quantity) - Number(b.quantity)) < 1e-9 && sameName(a.name, b.name) && sameStep(a.step, b.step)
    && (a.category === b.category || a.category === "altro" || b.category === "altro");
}

/** Toglie i doppioni tenendo il primo (e il suo «quando», o quello dell'altro se il primo non ce l'ha). */
export function dedupeIngredients<T extends IngLike>(list: T[]): { kept: T[]; removed: T[] } {
  const kept: T[] = [], removed: T[] = [];
  for (const i of list) {
    const d = kept.find((k) => isDuplicate(k, i));
    if (d) { if (!d.step && i.step) d.step = i.step; removed.push(i); } else kept.push(i);
  }
  return { kept, removed };
}
