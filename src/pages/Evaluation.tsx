import { useEffect, useState } from "react";
import { supabase, num, sg, type Row } from "../lib";
import { TastingsPanel } from "./Tastings";

/** Rendimento teorico in punti di densità · litro per kg (100% di estrazione), stimato dal nome. */
function potentialOf(name: string, category: string): { pkl: number; tipo: string } | null {
  const n = name.toLowerCase();
  if (/zucchero|destrosio|saccarosio|sugar|glucosio/.test(n)) return { pkl: 384, tipo: "zucchero" };
  if (/miele|honey/.test(n)) return { pkl: 290, tipo: "miele" };
  if (/\bdme\b|estratto secco|dry malt/.test(n)) return { pkl: 360, tipo: "estratto secco" };
  if (/\blme\b|estratto liquido/.test(n)) return { pkl: 300, tipo: "estratto liquido" };
  // l'avena sta in "altro" ma porta comunque estratto
  if (/avena|\boat/.test(n)) return { pkl: /fiocch|flake/.test(n) ? 270 : 260, tipo: "avena" };
  if (category !== "malto") return null;
  if (/black|choc|cioccol|roast|tostat|carafa|nero/.test(n)) return { pkl: 245, tipo: "malto tostato" };
  if (/crystal|cara|caramel/.test(n)) return { pkl: 270, tipo: "malto caramello" };
  if (/frument|wheat|weizen/.test(n)) return { pkl: 315, tipo: "frumento" };
  if (/acidul|acid/.test(n)) return { pkl: 270, tipo: "acidulato" };
  return { pkl: 300, tipo: "malto base" };
}
const kg = (q: number, u: string) => (u === "g" ? q / 1000 : u === "kg" ? q : 0);
const plato = (g: number) => 259 - 259 / g;

type Level = "ok" | "warn" | "bad" | "info";
function Metric({ label, value, sub, level = "info", hint }: { label: string; value: string; sub?: string; level?: Level; hint?: string }) {
  return (
    <div className={"metric " + level} title={hint}>
      <span>{label}</span>
      <strong>{value}</strong>
      {sub && <small>{sub}</small>}
    </div>
  );
}

export function BatchEvaluation({ batch, recipe }: { batch: Row; recipe: Row | null }) {
  const [ings, setIngs] = useState<Row[]>([]);
  useEffect(() => {
    supabase.from("batch_ingredients").select("*").eq("batch_id", batch.id).then(({ data }) => setIngs(data ?? []));
  }, [batch.id]);

  const og = batch.original_gravity ? Number(batch.original_gravity) : null;
  const fg = batch.final_gravity ? Number(batch.final_gravity) : null;
  const vol = batch.volume_fermenter_l ? Number(batch.volume_fermenter_l) : null;

  // grado alcolico e attenuazione
  const abv = og && fg ? (og - fg) * 131.25 : null;
  const att = og && fg ? ((og - fg) / (og - 1)) * 100 : null;

  // calorie (formula ASBC): kcal/100 ml = (6,9·ABW + 4·(RE − 0,1)) · FG
  let kcal100: number | null = null;
  if (og && fg && abv != null) {
    const abw = (0.79 * abv) / fg;
    const re = 0.1808 * plato(og) + 0.8192 * plato(fg);
    kcal100 = (6.9 * abw + 4 * (re - 0.1)) * fg;
  }

  // efficienza dagli ingredienti
  const fermentables = ings
    .map((i) => ({ i, p: potentialOf(i.name, i.category), kg: kg(Number(i.quantity), i.unit) }))
    .filter((x) => x.p && x.kg > 0);
  const maxPoints = fermentables.reduce((s, x) => s + x.kg * x.p!.pkl, 0);
  const eff = og && vol && maxPoints ? (((og - 1) * 1000 * vol) / maxPoints) * 100 : null;
  const targetEff = recipe?.efficiency_pct ? Number(recipe.efficiency_pct) : null;

  // confronto con gli obiettivi della ricetta
  const tOg = recipe?.target_og ? Number(recipe.target_og) : null;
  const tFg = recipe?.target_fg ? Number(recipe.target_fg) : null;
  const dOg = og && tOg ? Math.round((og - tOg) * 1000) : null;
  const dFg = fg && tFg ? Math.round((fg - tFg) * 1000) : null;
  const pts = (d: number) => `${d > 0 ? "+" : ""}${d} punti`;
  const lvlDiff = (d: number | null) => (d == null ? "info" : Math.abs(d) <= 3 ? "ok" : Math.abs(d) <= 7 ? "warn" : "bad");

  // resa e tempi
  const loss = vol && batch.volume_bottled_l ? (1 - Number(batch.volume_bottled_l) / vol) * 100 : null;
  const days = (a?: string, b?: string) => (a && b ? Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000) : null);
  const dFerm = days(batch.fermentation_start, batch.bottling_date);
  const dCond = days(batch.bottling_date, batch.first_tasting_date);
  const ph = batch.mash_ph ? Number(batch.mash_ph) : null;
  const preBoil = batch.post_sparge_gravity ? Number(batch.post_sparge_gravity) : null;

  const missing = [!og && "OG", !fg && "FG", !vol && "volume in fermentatore", !fermentables.length && "ingredienti (malti) del batch"].filter(Boolean);

  return (
    <div>
      <h2>Risultato della cotta</h2>
      {missing.length > 0 && <p className="note">Per completare i calcoli inserisci nel log: {missing.join(", ")}.</p>}
      <div className="metrics">
        <Metric label="Grado alcolico" value={abv != null ? `${num(abv, 1)}% vol` : "—"} sub={og && fg ? `da OG ${sg(og)} e FG ${sg(fg)}` : "serve OG e FG"} level="info"
          hint="ABV = (OG − FG) × 131,25" />
        <Metric label="Efficienza impianto" value={eff != null ? `${num(eff, 0)}%` : "—"}
          sub={targetEff ? `prevista ${num(targetEff, 0)}%` : "punti in fermentatore ÷ massimo teorico dei malti"}
          level={eff == null ? "info" : eff >= 70 ? "ok" : eff >= 60 ? "warn" : "bad"}
          hint="Efficienza = (OG − 1) × 1000 × litri in fermentatore ÷ Σ (kg × rendimento del malto)" />
        <Metric label="Attenuazione apparente" value={att != null ? `${num(att, 0)}%` : "—"} sub="quanto zucchero ha mangiato il lievito"
          level={att == null ? "info" : att >= 70 && att <= 85 ? "ok" : "warn"} hint="(OG − FG) ÷ (OG − 1)" />
        <Metric label="Calorie" value={kcal100 != null ? `${num(kcal100, 0)} kcal` : "—"}
          sub={kcal100 != null ? `per 100 ml · ${num(kcal100 * (Number(batch.bottle_size_l) || 0.33) * 10, 0)} kcal a bottiglia` : "per 100 ml"} />
        <Metric label="OG rispetto alla ricetta" value={dOg != null ? pts(dOg) : "—"} sub={tOg ? `obiettivo ${sg(tOg)}` : "nessun obiettivo in ricetta"} level={lvlDiff(dOg)} />
        <Metric label="FG rispetto alla ricetta" value={dFg != null ? pts(dFg) : "—"} sub={tFg ? `obiettivo ${sg(tFg)}` : "nessun obiettivo in ricetta"} level={lvlDiff(dFg)} />
        <Metric label="pH del mash" value={ph != null ? num(ph, 2) : "—"} sub="ideale 5,2 – 5,6"
          level={ph == null ? "info" : ph >= 5.2 && ph <= 5.6 ? "ok" : ph >= 5.0 && ph <= 5.8 ? "warn" : "bad"} />
        <Metric label="Perdite fermentatore → bottiglie" value={loss != null ? `${num(loss, 0)}%` : "—"}
          sub={vol && batch.volume_bottled_l ? `${num(vol, 1)} L → ${num(batch.volume_bottled_l, 1)} L` : "serve volume imbottigliato"}
          level={loss == null ? "info" : loss <= 10 ? "ok" : loss <= 20 ? "warn" : "bad"} />
        <Metric label="Giorni di fermentazione" value={dFerm != null ? `${dFerm} gg` : "—"} sub={dCond != null ? `poi ${dCond} gg in bottiglia prima di berla` : "servono le date di imbottigliamento e prima bevuta"} />
        {preBoil && <Metric label="Densità pre-bollitura" value={sg(preBoil)} sub={og ? `+${Math.round((og - preBoil) * 1000)} punti con la bollitura` : ""} />}
      </div>

      {fermentables.length > 0 && (
        <details className="calc-details">
          <summary>Come ho calcolato l'efficienza</summary>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Ingrediente</th><th>Tipo stimato</th><th>kg</th><th>Rendimento</th><th>Punti max</th></tr></thead>
              <tbody>
                {fermentables.map(({ i, p, kg: k }) => (
                  <tr key={i.id}><td>{i.name}</td><td>{p!.tipo}</td><td>{num(k, 3)}</td><td>{p!.pkl} pt·L/kg</td><td>{num(k * p!.pkl, 0)}</td></tr>
                ))}
                <tr><td colSpan={4}><strong>Totale teorico</strong></td><td><strong>{num(maxPoints, 0)}</strong></td></tr>
              </tbody>
            </table>
          </div>
          <p className="muted small">
            Punti ottenuti: ({og ? sg(og) : "OG"} − 1) × 1000 × {vol ? num(vol, 1) : "litri"} L = {og && vol ? num((og - 1) * 1000 * vol, 0) : "—"}.
            Il rendimento dei malti è stimato dal nome (malto base ≈ 300, caramello ≈ 270, tostati ≈ 245 punti·litro/kg); è l'efficienza
            "in fermentatore", quindi include le perdite di trub e travasi.
          </p>
        </details>
      )}

      <h2>Valutazioni di assaggio</h2>
      <TastingsPanel batchId={batch.id} />
    </div>
  );
}
