import { Fragment, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ChevronDown, ChevronRight } from "lucide-react";
import { supabase, eur, num, date, fmtUnitPrice, toBase, loadMaterials, STATUS_LABELS, type Row } from "../lib";
import { useAuth } from "../auth";
import { RowsEditor } from "../components/RowsEditor";
import { computeBatchCost, bottleUnitPrice, capUnitPrice, type BatchCost } from "../costs";

/** Conti → Costi birre: quanto è costata ogni ricetta e ogni batch, in totale, al litro e a bottiglia. */
export function BeerCosts() {
  const [sp] = useSearchParams();
  const [recipes, setRecipes] = useState<Row[]>([]);
  const [batches, setBatches] = useState<Row[]>([]);
  const [summary, setSummary] = useState<Record<string, Row>>({});
  const [extras, setExtras] = useState<Row[]>([]);
  const [mats, setMats] = useState<Row[]>([]);
  const [prices, setPrices] = useState({ energy: 0, water: 0 });
  const [openRecipe, setOpenRecipe] = useState<string | null>(null);
  const [openBatch, setOpenBatch] = useState<string | null>(sp.get("batch"));
  const [reload, setReload] = useState(0);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    Promise.all([
      supabase.from("recipes").select("id, name, style, archived").order("name"),
      supabase.from("batches").select("*").order("brew_date", { ascending: false }),
      supabase.from("batch_cost_summary").select("*"),
      supabase.from("batch_costs").select("*"),
      supabase.from("material_costs").select("*"),
      supabase.from("settings").select("*"),
    ]).then(([r, b, s, e, m, st]) => {
      setRecipes(r.data ?? []);
      setBatches(b.data ?? []);
      setSummary(Object.fromEntries((s.data ?? []).map((x) => [x.batch_id, x])));
      setExtras(e.data ?? []);
      setMats(m.data ?? []);
      const val = (k: string) => Number((st.data ?? []).find((x) => x.key === k)?.value ?? 0);
      setPrices({ energy: val("energy_price_kwh"), water: val("water_price_l") });
      setLoaded(true);
    });
  }, [reload]);

  // apro direttamente la ricetta del batch richiesto (?batch=…)
  useEffect(() => {
    const want = sp.get("batch");
    const b = batches.find((x) => x.id === want);
    if (b) setOpenRecipe(b.recipe_id);
  }, [batches, sp]);

  const costOf = (b: Row) => computeBatchCost(b, summary[b.id], extras.filter((x) => x.batch_id === b.id), mats, prices.energy, prices.water);
  const groups = recipes
    .map((r) => ({ recipe: r, list: batches.filter((b) => b.recipe_id === r.id).map((b) => ({ batch: b, cost: costOf(b) })) }))
    .filter((g) => g.list.length || !g.recipe.archived);

  const bp = bottleUnitPrice(0.33, mats), bp66 = bottleUnitPrice(0.66, mats), cp = capUnitPrice(mats);

  return (
    <div>
      <h1>Costi delle birre</h1>
      {!loaded && <p className="muted">Caricamento…</p>}
      {loaded && !groups.length && <p className="muted">Nessuna ricetta. Crea una ricetta e un batch per vedere i costi.</p>}

      <div className="bc-list">
        {groups.map(({ recipe, list }) => {
          const withCost = list.filter((x) => x.cost.total > 0);
          const tot = withCost.reduce((t, x) => t + x.cost.total, 0);
          const lit = withCost.reduce((t, x) => t + (x.cost.liters ?? 0), 0);
          const bot = withCost.reduce((t, x) => t + (x.cost.bottles ?? 0), 0);
          const totL = withCost.filter((x) => x.cost.liters).reduce((t, x) => t + x.cost.total, 0);
          const totB = withCost.filter((x) => x.cost.bottles).reduce((t, x) => t + x.cost.total, 0);
          const open = openRecipe === recipe.id;
          return (
            <section key={recipe.id} className={"bc-recipe" + (open ? " open" : "")}>
              <button className="bc-head" onClick={() => setOpenRecipe(open ? null : recipe.id)}>
                <span className="bc-title">
                  {open ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                  <strong>{recipe.name}</strong>
                  <span className="muted small">{[recipe.style, `${list.length} ${list.length === 1 ? "batch" : "batch"}`].filter(Boolean).join(" · ")}</span>
                </span>
                <span className="bc-kpis">
                  <span><small>al litro</small><strong>{lit ? eur(totL / lit) : "—"}</strong></span>
                  <span><small>a bottiglia</small><strong>{bot ? eur(totB / bot) : "—"}</strong></span>
                  <span><small>totale</small><strong>{tot ? eur(tot) : "—"}</strong></span>
                </span>
              </button>
              {open && (
                <div className="bc-batches">
                  {!list.length && <p className="muted small">Nessun batch per questa ricetta.</p>}
                  {list.map(({ batch, cost }) => {
                    const bo = openBatch === batch.id;
                    return (
                      <Fragment key={batch.id}>
                        <button className={"bc-batch" + (bo ? " on" : "")} onClick={() => setOpenBatch(bo ? null : batch.id)}>
                          <span className="bc-b-name">
                            <strong>{batch.code}</strong>
                            <span className={"badge st-" + batch.status}>{STATUS_LABELS[batch.status]}</span>
                            <span className="muted small">{batch.brew_date ? `cotta ${date(batch.brew_date)}` : "non cotta"}</span>
                          </span>
                          <span className="bc-kpis small-kpis">
                            <span><small>al litro</small><strong>{cost.perLiter != null ? eur(cost.perLiter) : "—"}</strong></span>
                            <span><small>a bottiglia</small><strong>{cost.perBottle != null ? eur(cost.perBottle) : "—"}</strong></span>
                            <span><small>totale</small><strong>{cost.total ? eur(cost.total) : "—"}</strong></span>
                          </span>
                        </button>
                        {bo && <BatchCostDetail batch={batch} cost={cost} onChange={() => setReload((x) => x + 1)} />}
                      </Fragment>
                    );
                  })}
                </div>
              )}
            </section>
          );
        })}
      </div>

      <div className="bc-help">
        <h3>Come li calcolo</h3>
        <ul>
          <li><strong>Materie prime</strong>: ingredienti del batch × costo medio degli acquisti (spedizione compresa).</li>
          <li><strong>Bottiglie e tappi</strong>: se nel batch non li hai segnati a mano, li stimo dal numero di bottiglie × prezzo medio d'acquisto
            {bp != null || bp66 != null || cp != null ? <> (oggi: 33 cl {bp != null ? eur(bp) : "—"}, 66 cl {bp66 != null ? eur(bp66) : "—"}, tappo {cp != null ? eur(cp) : "—"})</> : " (carica un acquisto di bottiglie e tappi)"}.</li>
          <li><strong>Corrente</strong>: kWh inseriti nel batch × {eur(prices.energy)}/kWh. <strong>Acqua</strong>: litri usati × prezzo in Impostazioni.</li>
          <li><strong>Al litro</strong> sui litri imbottigliati, <strong>a bottiglia</strong> sul numero di bottiglie.</li>
        </ul>
      </div>
    </div>
  );
}

function Line({ label, value, note, warn }: { label: string; value: string; note?: string; warn?: boolean }) {
  return (
    <div className={"bc-line" + (warn ? " warn" : "")}>
      <span>{label}{note && <small> {note}</small>}</span>
      <strong>{value}</strong>
    </div>
  );
}

/** Dettaglio di un batch: voci di costo, ingredienti e altri costi modificabili. */
function BatchCostDetail({ batch, cost, onChange }: { batch: Row; cost: BatchCost; onChange: () => void }) {
  const { isAdmin } = useAuth();
  const [ings, setIngs] = useState<Row[]>([]);
  const [avg, setAvg] = useState<Record<string, Row>>({});
  const [materials, setMaterials] = useState<Row[]>([]);
  useEffect(() => {
    supabase.from("batch_ingredients").select("*").eq("batch_id", batch.id).then(({ data }) => setIngs(data ?? []));
    supabase.from("material_costs").select("*").then(({ data }) => setAvg(Object.fromEntries((data ?? []).map((m) => [m.material_id, m]))));
    loadMaterials().then(setMaterials);
  }, [batch.id]);
  const matOptions = materials.map((m) => ({ value: m.id, label: m.name }));

  return (
    <div className="bc-detail">
      <div className="bc-lines">
        <Line label="Materie prime" value={eur(cost.ingredients)} warn={cost.missingPrices} note={cost.missingPrices ? "(alcuni senza prezzo)" : undefined} />
        <Line label="Bottiglie e tappi" value={cost.packaging != null ? eur(cost.packaging) : "—"}
          note={cost.packaging == null ? (cost.bottles ? "(nessun prezzo d'acquisto)" : "(manca il numero di bottiglie)") : cost.packagingEstimated ? `(stima per ${cost.bottles} bottiglie)` : undefined} />
        <Line label="Corrente" value={cost.energy != null ? eur(cost.energy) : "—"} note={cost.energy == null ? "(inserisci i kWh nel batch)" : `(${num(batch.energy_kwh, 1)} kWh)`} />
        {cost.water > 0 && <Line label="Acqua" value={eur(cost.water)} />}
        {cost.other > 0 && <Line label="Altri costi" value={eur(cost.other)} />}
        <div className="bc-line total"><span>Totale</span><strong>{eur(cost.total)}</strong></div>
        <div className="bc-per">
          <div><small>al litro</small><strong>{cost.perLiter != null ? eur(cost.perLiter) : "—"}</strong><span className="muted small">{cost.liters ? `${num(cost.liters, 1)} L` : "litri mancanti"}</span></div>
          <div><small>a bottiglia</small><strong>{cost.perBottle != null ? eur(cost.perBottle) : "—"}</strong><span className="muted small">{cost.bottles ? `${cost.bottles} bottiglie` : "bottiglie mancanti"}</span></div>
        </div>
        <Link className="btn small" to={`/batch/${batch.id}`}>Apri il batch</Link>
      </div>

      <h3>Materie prime usate</h3>
      <div className="table-wrap">
        <table className="bc-ing">
          <thead><tr><th>Ingrediente</th><th>Q.tà</th><th>Costo medio</th><th>Costo</th></tr></thead>
          <tbody>
            {ings.map((i) => {
              const a = i.material_id ? avg[i.material_id] : null;
              const unit = i.unit_cost_override ?? a?.avg_unit_cost;
              return (
                <tr key={i.id}>
                  <td>{i.name}</td>
                  <td className="nowrap">{num(i.quantity, 3)} {i.unit}</td>
                  <td className="nowrap">{unit != null ? fmtUnitPrice(unit, a?.category ?? i.category, a?.base_unit ?? (["l", "ml"].includes(i.unit) ? "l" : i.unit === "pz" ? "pz" : "kg")) : <span className="warn">nessun prezzo</span>}</td>
                  <td className="nowrap">{unit != null ? eur((toBase(Number(i.quantity), i.unit) ?? 0) * Number(unit)) : "—"}</td>
                </tr>
              );
            })}
            {!ings.length && <tr><td colSpan={4} className="muted">Nessun ingrediente nel batch.</td></tr>}
          </tbody>
        </table>
      </div>

      <h3>Bottiglie, tappi e altri costi</h3>
      <p className="muted small">Se li segni qui (es. bottiglie già in casa = costo 0), sostituiscono la stima di bottiglie e tappi.</p>
      <RowsEditor table="batch_costs" parentKey="batch_id" parentId={batch.id} canEdit={isAdmin}
        onChange={onChange}
        defaults={{ category: "bottiglie", quantity: batch.bottles_count ?? 1 }}
        fields={[
          { key: "category", label: "Categoria", type: "select", options: ["bottiglie", "tappi", "etichette", "co2", "detergenti", "attrezzatura", "altro"], required: true },
          { key: "description", label: "Descrizione", required: true },
          { key: "material_id", label: "Da magazzino", type: "select", options: matOptions },
          { key: "quantity", label: "Q.tà", type: "number", required: true },
          { key: "unit_cost", label: "Costo unitario €", type: "number", step: "0.0001" },
        ]}
        extraColumns={[{ label: "Totale", render: (r) => {
          const u = r.unit_cost ?? (r.material_id ? avg[r.material_id]?.avg_unit_cost : null);
          return u != null ? eur(Number(u) * Number(r.quantity)) : "—";
        } }]}
      />
    </div>
  );
}
