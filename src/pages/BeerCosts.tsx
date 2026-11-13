import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ChevronDown, ChevronRight, CheckCircle2, Hourglass, CircleAlert, Pencil, Calculator, X } from "lucide-react";
import { supabase, eur, num, fmtUnitPrice, errMsg, type Row } from "../lib";
import { useAuth } from "../auth";
import { sizeFromName, isBrewed, isBottled, computeBatchCost, sumCosts, type Source, ingredientCost, capUnitPrice, bottlePricesFrom, isKit, type BatchCost, type BottlePrices } from "../costs";

/** Conti → Costi birre: quanto costa ogni birra (tutti i suoi batch insieme), in totale, al litro e a bottiglia. */
export function BeerCosts() {
  const [sp] = useSearchParams();
  const [data, setData] = useState<{ recipes: Row[]; batches: Row[]; bIngs: Row[]; rIngs: Row[]; extras: Row[]; mats: Row[]; energy: number; water: number; cfg: BottlePrices } | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    Promise.all([
      supabase.from("recipes").select("id, name, style, archived, batch_size_l").order("name"),
      supabase.from("batches").select("*"),
      supabase.from("batch_ingredients").select("*"),
      supabase.from("recipe_ingredients").select("*"),
      supabase.from("batch_costs").select("*"),
      supabase.from("material_costs").select("*"),
      supabase.from("settings").select("*"),
      supabase.from("purchase_items").select("material_id, description"),
    ]).then(([r, b, bi, ri, e, m, st, pi]) => {
      // peso di un pezzo letto dalle righe d'acquisto (es. "Coriandolo in semi - 100 g")
      const piece: Record<string, number> = {};
      for (const x of pi.data ?? []) { const z = sizeFromName(x.description ?? ""); if (x.material_id && z && !piece[x.material_id]) piece[x.material_id] = z; }
      const matsRows = (m.data ?? []).map((x) => ({ ...x, piece_size: piece[x.material_id] ?? null }));
      const val = (k: string) => Number((st.data ?? []).find((x) => x.key === k)?.value ?? 0);
      setData({ recipes: r.data ?? [], batches: b.data ?? [], bIngs: bi.data ?? [], rIngs: ri.data ?? [], extras: e.data ?? [], mats: matsRows, energy: val("energy_price_kwh"), water: val("water_price_l"), cfg: bottlePricesFrom(st.data ?? []) });
      const want = (b.data ?? []).find((x) => x.id === sp.get("batch"));
      if (want) setOpen(want.recipe_id);
    });
  }, [sp, reload]);

  if (!data) return <div><h1>Costi delle birre</h1><p className="muted">Caricamento…</p></div>;
  const { recipes, batches, bIngs, rIngs, extras, mats } = data;

  // ingredienti di un batch; se il batch non li ha, uso quelli della ricetta
  const ingsOf = (b: Row) => { const own = bIngs.filter((i) => i.batch_id === b.id); return own.length ? own : rIngs.filter((i) => i.recipe_id === b.recipe_id); };

  const beers = recipes.map((r) => {
    // una birra = una ricetta: gli ingredienti si contano UNA volta, dalla ricetta.
    // litri, bottiglie e kWh vengono dal batch di riferimento (l'ultimo imbottigliato, altrimenti l'ultimo fatto)
    const all = batches.filter((b) => b.recipe_id === r.id && isBrewed(b));   // i batch creati e mai fatti non contano
    const key = (b: Row) => String(b.brew_date ?? "") + String(b.created_at ?? "");
    const sorted = [...all].sort((a, b) => key(b).localeCompare(key(a)));
    const ref = sorted.find(isBottled) ?? sorted[0];
    const recipeIngs = rIngs.filter((i) => i.recipe_id === r.id);
    const ings = recipeIngs.length ? recipeIngs : ref ? ingsOf(ref) : [];
    const list = ref ? [ref] : [];
    // corrente: solo quella del batch della cottura (dove avete inserito i kWh), non degli altri batch
    const brewBatch = sorted.find((b) => b.energy_kwh != null && b.brew_date) ?? sorted.find((b) => b.energy_kwh != null);
    const refE: Row | null = ref ? { ...ref, energy_kwh: brewBatch?.energy_kwh ?? null } : null;
    const costs = refE ? [computeBatchCost(refE, r, ings, extras.filter((x) => x.batch_id === refE.id), mats, data.energy, data.water, data.cfg)] : [];
    return { recipe: r, list, all, ings, costs, sum: sumCosts(costs) };
  }).filter((x) => x.list.length || !x.recipe.archived)
    .sort((a, b) => Number(b.list.length > 0) - Number(a.list.length > 0) || a.recipe.name.localeCompare(b.recipe.name, "it"));

  const cp = capUnitPrice(mats);

  return (
    <div>
      <h1>Costi delle birre</h1>
      {!beers.length && <p className="muted">Nessuna ricetta. Crea una ricetta e un batch per vedere i costi.</p>}

      <div className="bc-list">
        {beers.map(({ recipe, list, all, ings, costs, sum }) => {
          const isOpen = open === recipe.id;
          return (
            <section key={recipe.id} className={"bc-recipe" + (isOpen ? " open" : "")}>
              <button className="bc-head" onClick={() => setOpen(isOpen ? null : recipe.id)}>
                <span className="bc-title">
                  {isOpen ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                  <strong>{recipe.name}</strong>
                  {list.length > 0 && <StateIcon sum={sum} />}
                  <span className="muted small bc-sub">
                    {list.length ? `${sum.liters ? `${num(sum.liters, 1)} L` : "litri ?"}${sum.bottles ? ` · ${sum.bottles} bottiglie` : ""}` : "non ancora cotta"}
                  </span>
                </span>
                {list.length > 0 && (
                  <span className="bc-kpis">
                    <span><small>al litro</small><strong>{sum.perLiter != null ? eur(sum.perLiter) : "—"}</strong></span>
                    <span><small>a bottiglia</small><strong>{sum.perBottle != null ? eur(sum.perBottle) : "—"}</strong></span>
                    <span><small>totale</small><strong>{sum.total ? eur(sum.total) : "—"}</strong></span>
                  </span>
                )}
              </button>
              {isOpen && list.length > 0 && <BeerDetail recipe={recipe} batches={all} extras={extras} sum={sum} costs={costs} ings={ings} mats={mats} onChange={() => setReload((x) => x + 1)} />}
            </section>
          );
        })}
      </div>

      <div className="bc-help">
        <h3>Come li calcolo</h3>
        <ul>
          <li><Hourglass size={14} className="ic-guess" /> <strong>Presunto</strong> dalla cotta all'imbottigliamento: materie prime + corrente + acqua.</li>
          <li><CircleAlert size={14} className="ic-warn" /> <strong>Imbottigliata</strong>, costo reale ma con qualche dato stimato o mancante. <CheckCircle2 size={14} className="ic-ok" /> <strong>Completo</strong>: tutti i dati inseriti.</li>
          <li><strong>Materie prime</strong>: ingredienti della ricetta, contati una volta, × costo medio degli acquisti (spedizione compresa). Se l'ingrediente non è collegato, lo cerco per nome tra le materie prime acquistate.</li>
          <li><strong>Bottiglie e tappi</strong>: bottiglie × {data.cfg.b66 != null ? eur(data.cfg.b66) : "—"} (Impostazioni){cp != null ? ` + tappo ${eur(cp)}` : ""}.</li>
          <li><strong>Corrente</strong>: kWh inseriti nei batch × {eur(data.energy)}/kWh.</li>
        </ul>
      </div>
    </div>
  );
}

/** Icona della fonte del dato: ✎ inserito · calcolatrice stimato · ✕ manca. */
export function SrcIcon({ source }: { source: Source }) {
  if (source === "inserito") return <Pencil size={13} className="src src-in" aria-label="inserito" />;
  if (source === "stimato") return <Calculator size={13} className="src src-est" aria-label="stimato" />;
  return <X size={13} className="src src-miss" aria-label="manca" />;
}

/** Stato del costo della birra, solo con un'icona. */
function StateIcon({ sum }: { sum: ReturnType<typeof sumCosts> }) {
  if (sum.complete) return <CheckCircle2 size={18} className="ic-ok" aria-label="costo reale, dati completi" />;
  if (sum.allBottled) return <CircleAlert size={18} className="ic-warn" aria-label="imbottigliata, qualche dato stimato" />;
  return <Hourglass size={18} className="ic-guess" aria-label="costo presunto, non ancora imbottigliata" />;
}

function Line({ label, value, source }: { label: string; value: string; source?: Source }) {
  return (
    <div className="bc-line">
      <span>{label} {source && <SrcIcon source={source} />}</span>
      <strong>{value}</strong>
    </div>
  );
}

/** Dettaglio della birra: voci di costo sommate su tutti i batch e materie prime raggruppate. */
function BeerDetail({ recipe, batches, extras, sum, costs, ings, mats, onChange }: {
  recipe: Row; batches: Row[]; extras: Row[]; sum: ReturnType<typeof sumCosts>; costs: BatchCost[]; ings: Row[]; mats: Row[]; onChange: () => void;
}) {
  const { isAdmin } = useAuth();
  const [busy, setBusy] = useState(false);
  const priced = mats.filter((m) => Number(m.avg_unit_cost) > 0 && !isKit(m.name));

  const link = async (name: string, mid: string) => {
    if (!mid) return;
    setBusy(true);
    try {
      const ids = batches.map((b) => b.id);
      const a = await supabase.from("batch_ingredients").update({ material_id: mid }).in("batch_id", ids).eq("name", name);
      if (a.error) throw a.error;
      const b = await supabase.from("recipe_ingredients").update({ material_id: mid }).eq("recipe_id", recipe.id).eq("name", name);
      if (b.error) throw b.error;
      onChange();
    } catch (e) { alert(errMsg(e)); }
    setBusy(false);
  };

  // materie prime raggruppate per nome e unità
  const groups = new Map<string, { name: string; unit: string; qty: number; cost: number | null; mat: Row | null; category: string; guessed?: number }>();
  for (const i of ings) {
    const { cost, mat, guessed } = ingredientCost(i, mats);
    const k = `${String(i.name).toLowerCase()}|${i.unit}`;
    const g = groups.get(k) ?? { name: i.name, unit: i.unit, qty: 0, cost: 0, mat, category: i.category, guessed };
    g.qty += Number(i.quantity ?? 0);
    g.cost = cost == null || g.cost == null ? null : g.cost + cost;
    groups.set(k, g);
  }
  return (
    <div className="bc-detail">
      <div className="bc-lines">
        <Line label="Materie prime" value={eur(sum.ingredients)} source={sum.missing.length ? "manca" : sum.guessed ? "stimato" : "inserito"} />
        <Line label="Bottiglie e tappi" value={sum.someBottled ? eur(sum.packaging) : "—"} source={sum.someBottled ? (sum.bottlesGuessed ? "stimato" : "inserito") : undefined} />
        <Line label="Corrente" value={eur(sum.energy)} source={sum.energyMissing ? "manca" : "inserito"} />
        {sum.water > 0 && <Line label="Acqua" value={eur(sum.water)} />}
        {sum.other > 0 && <Line label="Altri costi" value={eur(sum.other)} />}
        <div className="bc-line total"><span>Totale</span><strong>{eur(sum.total)}</strong></div>
        <div className="bc-per">
          <div><small>al litro</small><strong>{sum.perLiter != null ? eur(sum.perLiter) : "—"}</strong><span className="muted small">{sum.liters ? `${num(sum.liters, 1)} L` : "—"}</span></div>
          <div><small>a bottiglia</small><strong>{sum.perBottle != null ? eur(sum.perBottle) : "—"}</strong>
            <span className="muted small">{sum.bottles ? `${sum.bottles} bottiglie` : "—"} {sum.bottles > 0 && <SrcIcon source={sum.bottlesGuessed ? "stimato" : "inserito"} />}</span></div>
        </div>
      </div>

      <h3>Dati usati</h3>
      <div className="bc-facts">
        {costs.map((c) => (
          <div key={c.code} className="bc-fact-batch">
            {costs.length > 1 && <span className="bc-fact-code">{c.code} {c.bottled ? null : <Hourglass size={13} className="ic-guess" />}</span>}
            <div className="bc-fact-grid">
              {c.facts.map((f) => (
                <span key={f.label} className={"bc-fact src-" + f.source}>
                  <small>{f.label}</small>
                  <strong>{f.value} <SrcIcon source={f.source} /></strong>
                </span>
              ))}
            </div>
          </div>
        ))}
        <p className="bc-legend"><SrcIcon source="inserito" /> inserito <SrcIcon source="stimato" /> stimato <SrcIcon source="manca" /> manca</p>
      </div>

      <h3>Materie prime usate</h3>
      <div className="table-wrap">
        <table className="bc-ing">
          <thead><tr><th>Ingrediente</th><th>Q.tà</th><th>Prezzo</th><th>Costo</th></tr></thead>
          <tbody>
            {[...groups.values()].map((g) => (
              <tr key={g.name + g.unit}>
                <td>{g.name}{g.mat && g.mat.name.toLowerCase() !== String(g.name).toLowerCase() && <div className="muted small">da «{g.mat.name}»</div>}</td>
                <td className="nowrap">{num(g.qty, 3)} {g.unit}</td>
                {(
                  <>
                    <td className="nowrap">{g.mat ? fmtUnitPrice(g.mat.avg_unit_cost, g.mat.category, g.mat.base_unit)
                      : g.guessed != null ? <>{eur(g.guessed)}/{g.unit === "g" || g.unit === "kg" ? "kg" : g.unit}<div className="muted small">ipotizzato</div></>
                      : isAdmin ? (
                        <select className="bc-link" value="" disabled={busy} onChange={(e) => link(g.name, e.target.value)}>
                          <option value="">⚠️ nessun prezzo: collega a…</option>
                          {[...priced].sort((a, b) => Number(b.category === g.category) - Number(a.category === g.category) || a.name.localeCompare(b.name, "it"))
                            .map((m) => <option key={m.material_id} value={m.material_id}>{m.name}</option>)}
                        </select>
                      ) : <span className="warn">nessun prezzo</span>}</td>
                    <td className="nowrap">{g.cost != null ? eur(g.cost) : g.mat ? <span className="warn small">unità non convertibile</span> : "—"}</td>
                  </>
                )}
              </tr>
            ))}
            {!groups.size && <tr><td colSpan={4} className="muted">Nessun ingrediente.</td></tr>}
          </tbody>
        </table>
      </div>
      {sum.missing.length > 0 && <p className="muted small">Per gli ingredienti senza prezzo scegli a quale materia prima acquistata corrispondono, oppure carica il loro acquisto in Materie prime.</p>}
    </div>
  );
}
