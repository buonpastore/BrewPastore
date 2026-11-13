import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ChevronDown, ChevronRight } from "lucide-react";
import { supabase, eur, num, fmtUnitPrice, errMsg, type Row } from "../lib";
import { useAuth } from "../auth";
import { computeBatchCost, sumCosts, ingredientCost, capUnitPrice, bottlePricesFrom, isKit, type BatchCost, type BottlePrices } from "../costs";

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
    ]).then(([r, b, bi, ri, e, m, st]) => {
      const val = (k: string) => Number((st.data ?? []).find((x) => x.key === k)?.value ?? 0);
      setData({ recipes: r.data ?? [], batches: b.data ?? [], bIngs: bi.data ?? [], rIngs: ri.data ?? [], extras: e.data ?? [], mats: m.data ?? [], energy: val("energy_price_kwh"), water: val("water_price_l"), cfg: bottlePricesFrom(st.data ?? []) });
      const want = (b.data ?? []).find((x) => x.id === sp.get("batch"));
      if (want) setOpen(want.recipe_id);
    });
  }, [sp, reload]);

  if (!data) return <div><h1>Costi delle birre</h1><p className="muted">Caricamento…</p></div>;
  const { recipes, batches, bIngs, rIngs, extras, mats } = data;

  // ingredienti di un batch; se il batch non li ha, uso quelli della ricetta
  const ingsOf = (b: Row) => { const own = bIngs.filter((i) => i.batch_id === b.id); return own.length ? own : rIngs.filter((i) => i.recipe_id === b.recipe_id); };

  const beers = recipes.map((r) => {
    const list = batches.filter((b) => b.recipe_id === r.id);
    const costs = list.map((b) => computeBatchCost(b, r, ingsOf(b), extras.filter((x) => x.batch_id === b.id), mats, data.energy, data.water, data.cfg));
    return { recipe: r, list, costs, sum: sumCosts(costs) };
  }).filter((x) => x.list.length || !x.recipe.archived)
    .sort((a, b) => Number(b.list.length > 0) - Number(a.list.length > 0) || a.recipe.name.localeCompare(b.recipe.name, "it"));

  const cp = capUnitPrice(mats);

  return (
    <div>
      <h1>Costi delle birre</h1>
      {!beers.length && <p className="muted">Nessuna ricetta. Crea una ricetta e un batch per vedere i costi.</p>}

      <div className="bc-list">
        {beers.map(({ recipe, list, costs, sum }) => {
          const isOpen = open === recipe.id;
          const kind = !list.length ? null : sum.allBottled ? "reale" : sum.someBottled ? "in parte presunto" : "presunto";
          return (
            <section key={recipe.id} className={"bc-recipe" + (isOpen ? " open" : "")}>
              <button className="bc-head" onClick={() => setOpen(isOpen ? null : recipe.id)}>
                <span className="bc-title">
                  {isOpen ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                  <strong>{recipe.name}</strong>
                  {kind && <span className={"bc-kind " + (kind === "reale" ? "real" : "guess")}>costo {kind}</span>}
                  <span className="muted small bc-sub">
                    {list.length ? `${list.length} batch · ${sum.liters ? `${num(sum.liters, 1)} L` : "litri ?"}${sum.realBottles ? ` · ${sum.realBottles} bottiglie` : ""}` : "nessun batch ancora"}
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
              {isOpen && list.length > 0 && <BeerDetail recipe={recipe} batches={list} extras={extras} sum={sum} costs={costs} ings={list.flatMap(ingsOf)} mats={mats} onChange={() => setReload((x) => x + 1)} />}
            </section>
          );
        })}
      </div>

      <div className="bc-help">
        <h3>Come li calcolo</h3>
        <ul>
          <li><strong>Costo presunto</strong> (dopo la cotta, prima di imbottigliare): materie prime + corrente + acqua, sui litri in fermentatore. A bottiglia è stimato su bottiglie da 66 cl, vetro escluso.</li>
          <li><strong>Costo reale</strong> (dopo l'imbottigliamento): si aggiungono bottiglie e tappi; al litro sui litri imbottigliati, a bottiglia sulle bottiglie riempite.</li>
          <li><strong>Materie prime</strong>: ingredienti di tutti i batch × costo medio degli acquisti (spedizione compresa). Se l'ingrediente non è collegato, lo cerco per nome tra le materie prime acquistate.</li>
          <li><strong>Bottiglie e tappi</strong>: bottiglie × prezzo della bottiglia da 66 cl impostato in Impostazioni
            ({data.cfg.b66 != null ? `${eur(data.cfg.b66)} a bottiglia` : "non impostato"}; per ora vale per tutte le bottiglie) + tappo {cp != null ? `${eur(cp)} (da acquisti)` : "— (nessun acquisto di tappi)"}.</li>
          <li><strong>Corrente</strong>: kWh inseriti nei batch × {eur(data.energy)}/kWh.</li>
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
  const notBottled = costs.filter((c) => !c.bottled).length;
  return (
    <div className="bc-detail">
      <div className="bc-lines">
        <Line label="Materie prime" value={eur(sum.ingredients)} warn={sum.missing.length > 0}
          note={sum.missing.length ? `(senza prezzo: ${sum.missing.slice(0, 3).join(", ")}${sum.missing.length > 3 ? "…" : ""})` : undefined} />
        <Line label="Bottiglie e tappi" value={sum.someBottled ? eur(sum.packaging) : "—"}
          note={!sum.someBottled ? "(dopo l'imbottigliamento)" : sum.packagingEstimated ? "(bottiglia da 66 cl dalle Impostazioni)" : undefined} />
        <Line label="Corrente" value={eur(sum.energy)} warn={sum.energyMissing} note={sum.energyMissing ? "(mancano i kWh in qualche batch)" : undefined} />
        {sum.water > 0 && <Line label="Acqua" value={eur(sum.water)} />}
        {sum.other > 0 && <Line label="Altri costi" value={eur(sum.other)} />}
        <div className="bc-line total"><span>Totale</span><strong>{eur(sum.total)}</strong></div>
        <div className="bc-per">
          <div><small>al litro</small><strong>{sum.perLiter != null ? eur(sum.perLiter) : "—"}</strong><span className="muted small">{sum.liters ? `${num(sum.liters, 1)} L` : "litri mancanti"}</span></div>
          <div><small>a bottiglia</small><strong>{sum.perBottle != null ? eur(sum.perBottle) : "—"}</strong>
            <span className="muted small">{sum.realBottles ? `${sum.realBottles} bottiglie` : ""}{sum.guessBottles ? `${sum.realBottles ? " + " : ""}~${sum.guessBottles} da 66 cl presunte` : ""}{!sum.bottles ? "bottiglie mancanti" : ""}</span></div>
        </div>
        {notBottled > 0 && <p className="muted small bc-note">{notBottled === costs.length ? "Non ancora imbottigliata: è un costo presunto, diventa reale quando inserisci le bottiglie." : `${notBottled} batch su ${costs.length} non ancora imbottigliati: per quelli il costo è presunto.`}</p>}
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
                    <td className="nowrap">{g.cost != null ? eur(g.cost) : "—"}</td>
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
