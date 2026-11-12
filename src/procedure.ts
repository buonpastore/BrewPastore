/** Riassunto testuale del procedimento di cotta, a partire dai dati della ricetta. */
export interface ProcInput {
  mashTemp?: number | null;
  mashTime?: number | null;
  mashSteps?: string[];             // es. "Prima fase 63 °C × 60 min"
  boil?: number | null;
  mashWater?: number | null;
  spargeWater?: number | null;
  spargeTemp?: number | null;
  coolTemp?: number | null;
  fermProfile?: string[];           // es. "Inizio fermentazione 20 °C"
  carbonation?: string | null;      // es. "2,5–3,0 volumi di CO₂"
  ingredients: { name: string; category: string; quantity: number; unit: string; step: string | null }[];
}

const n = (x: number) => x.toLocaleString("it-IT", { maximumFractionDigits: 2 });
const q = (i: { quantity: number; unit: string }) => (i.unit === "pz" ? `${n(i.quantity)} ${i.quantity === 1 ? "bustina" : "bustine"}` : `${n(i.quantity)} ${i.unit}`);
const minOf = (s: string | null) => { const m = (s ?? "").match(/(\d{1,3})\s*(?:min|'|’)/i); return m ? Number(m[1]) : null; };

export function buildProcedure(p: ProcInput): string {
  const out: string[] = [];
  const ing = p.ingredients;
  const malts = ing.filter((i) => i.category === "malto");
  const salts = ing.filter((i) => i.category === "sali_acqua");
  const boilAdd = ing.filter((i) => minOf(i.step) != null && !/whirlpool|dry/i.test(i.step ?? "")).sort((a, b) => (minOf(b.step) ?? 0) - (minOf(a.step) ?? 0));
  const whirl = ing.filter((i) => /whirlpool|hop\s?stand|flame/i.test(i.step ?? ""));
  const dry = ing.filter((i) => /dry/i.test(i.step ?? ""));
  const yeast = ing.filter((i) => i.category === "lievito");

  const water = [p.mashWater && `${n(p.mashWater)} L per il mash`, p.spargeWater && `${n(p.spargeWater)} L per lo sparge`].filter(Boolean);
  if (water.length || salts.length) out.push(`Acqua: ${[...water, ...salts.map((s) => `${s.name} ${q(s)}`)].join(", ")}.`);

  const mashTxt = p.mashSteps && p.mashSteps.length > 1 ? p.mashSteps.join(" → ") : p.mashTemp ? `${n(p.mashTemp)} °C per ${p.mashTime ?? "?"} min` : null;
  if (mashTxt || malts.length) out.push(`Mash${mashTxt ? `: ${mashTxt}` : ""}${malts.length ? ` con ${malts.map((m) => `${m.name} ${q(m)}`).join(", ")}` : ""}.`);

  if (p.spargeWater || p.spargeTemp) out.push(`Sparge${p.spargeWater ? ` con ${n(p.spargeWater)} L` : ""} a ${p.spargeTemp ? n(p.spargeTemp) : "76–78"} °C.`);

  if (p.boil || boilAdd.length) {
    const adds = boilAdd.map((i) => `${i.name} ${q(i)} a ${minOf(i.step)}'`);
    out.push(`Bollitura${p.boil ? ` ${p.boil} min` : ""}${adds.length ? `: ${adds.join(", ")}` : ""}.`);
  }
  if (whirl.length) {
    const t = (whirl[0].step ?? "").match(/(\d{2})\s*°/);
    out.push(`Whirlpool${t ? ` a ${t[1]} °C` : ""}: ${whirl.map((i) => `${i.name} ${q(i)}`).join(", ")}.`);
  }
  out.push(`Raffreddare${p.coolTemp ? ` a circa ${n(p.coolTemp)} °C` : ""}${yeast.length ? ` e inoculare ${yeast.map((y) => `${y.name} (${q(y)})`).join(", ")}` : ""}.`);
  if (p.fermProfile?.length) out.push(`Fermentazione: ${p.fermProfile.join(" → ")}.`);
  if (dry.length) out.push(`Dry hop: ${dry.map((i) => `${i.name} ${q(i)}${/giorno\s*\d+/i.test(i.step ?? "") ? ` (${(i.step ?? "").match(/giorno\s*\d+/i)![0]})` : ""}`).join(", ")}.`);
  if (p.carbonation) out.push(`Carbonazione: ${p.carbonation}.`);
  return out.map((l, i) => `${i + 1}. ${l}`).join("\n");
}
