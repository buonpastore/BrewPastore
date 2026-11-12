import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  supabase, errMsg, sg, eur, num, date, STATUS_LABELS, MATERIAL_CATEGORIES, UNITS, loadMaterials,
  primingGrams, residualCo2, PRIMING_FACTORS, type Row,
} from "../lib";
import { useAuth } from "../auth";
import { RecordForm } from "../components/RecordForm";
import { RowsEditor } from "../components/RowsEditor";
import { DocumentsPanel } from "../components/DocumentsPanel";
import { ChatPanel } from "../components/ChatPanel";
import { HistoryList } from "../components/HistoryList";
import { Tabs } from "../components/Layout";
import type { FieldDef } from "../components/fields";
import { BatchEvaluation } from "./Evaluation";
import { DeleteDialog } from "../components/DeleteDialog";
import { deleteBatches, deletionSummary } from "../deleteHelpers";

const sgField = (key: string, label: string): FieldDef => ({ key, label, type: "number", step: "0.001", render: (v) => sg(v as number) });

const SECTIONS: { title?: string; fields: FieldDef[] }[] = [
  { title: "Date", fields: [
    { key: "code", label: "Nome batch", required: true },
    { key: "status", label: "Stato", type: "select", required: true, options: Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label })) },
    { key: "brew_date", label: "Data cotta", type: "date" },
    { key: "fermentation_start", label: "Inizio fermentazione", type: "date" },
    { key: "bottling_date", label: "Imbottigliamento", type: "date" },
    { key: "first_tasting_date", label: "Prima bevuta", type: "date" },
  ]},
  { title: "Acqua e mash", fields: [
    { key: "water_ph_initial", label: "pH acqua iniziale", type: "number", step: "0.01" },
    { key: "water_ph_adjusted", label: "pH acqua dopo correzioni", type: "number", step: "0.01" },
    { key: "mash_ph", label: "pH del mash", type: "number", step: "0.01" },
    { key: "mash_water_l", label: "Acqua mash (L)", type: "number" },
    { key: "sparge_water_l", label: "Acqua sparge (L)", type: "number" },
  ]},
  { title: "Densità", fields: [
    sgField("pre_sparge_gravity", "Gravity pre-sparge"),
    sgField("post_sparge_gravity", "Gravity post-sparge (pre-boil)"),
    sgField("original_gravity", "OG (pre-fermentazione)"),
    sgField("final_gravity", "FG"),
    { key: "abv", label: "ABV calcolato", render: (v) => (v != null ? `${v}%` : "—") },
  ]},
  { title: "Volumi e imbottigliamento", fields: [
    { key: "volume_fermenter_l", label: "Volume in fermentatore (L)", type: "number" },
    { key: "volume_bottled_l", label: "Volume imbottigliato (L)", type: "number" },
    { key: "bottles_count", label: "N° bottiglie", type: "number", step: "1" },
    { key: "bottle_size_l", label: "Formato bottiglia (L)", type: "number", step: "0.001" },
  ]},
  { title: "Carbonazione", fields: [
    { key: "carbonation_method", label: "Metodo", type: "select", options: [
      { value: "priming", label: "Priming in bottiglia" }, { value: "fusto_forzata", label: "Fusto (forzata)" },
      { value: "spunding", label: "Spunding" }, { value: "naturale", label: "Naturale / krausening" }, { value: "altro", label: "Altro" }] },
    { key: "priming_sugar_type", label: "Zucchero", type: "select", options: ["saccarosio", "destrosio", "miele", "dme", "altro"] },
    { key: "priming_sugar_g", label: "Zucchero totale (g)", type: "number" },
    { key: "target_co2_vol", label: "CO₂ obiettivo (volumi)", type: "number", step: "0.1" },
    { key: "beer_temp_c", label: "Temp. max fermentazione (°C)", type: "number" },
    { key: "carbonation_notes", label: "Note carbonazione", type: "textarea" },
  ]},
  { title: "Consumi", fields: [
    { key: "energy_kwh", label: "Energia elettrica (kWh)", type: "number" },
    { key: "water_used_l", label: "Acqua totale usata (L)", type: "number" },
    { key: "notes", label: "Note", type: "textarea" },
  ]},
];

const QUICK: { status: string; field: string; label: string }[] = [
  { status: "cotta", field: "brew_date", label: "🔥 Cotta oggi" },
  { status: "fermentazione", field: "fermentation_start", label: "🫧 In fermentazione da oggi" },
  { status: "imbottigliato", field: "bottling_date", label: "🍾 Imbottigliata oggi" },
  { status: "finito", field: "first_tasting_date", label: "🍻 Bevuta oggi!" },
];

function PrimingCalc({ batch }: { batch: Row }) {
  const [vol, setVol] = useState<number>(batch.volume_bottled_l ?? batch.volume_fermenter_l ?? 20);
  const [co2, setCo2] = useState<number>(batch.target_co2_vol ?? 2.4);
  const [temp, setTemp] = useState<number>(batch.beer_temp_c ?? 20);
  const [sugar, setSugar] = useState<string>(batch.priming_sugar_type && PRIMING_FACTORS[batch.priming_sugar_type] ? batch.priming_sugar_type : "saccarosio");
  const g = primingGrams(vol, co2, temp, sugar);
  return (
    <div className="calc">
      <h3>🧮 Calcolatore priming (stima)</h3>
      <div className="form-grid">
        <label><span>Volume birra (L)</span><input type="number" step="any" value={vol} onChange={(e) => setVol(Number(e.target.value))} /></label>
        <label><span>CO₂ obiettivo (vol)</span><input type="number" step="0.1" value={co2} onChange={(e) => setCo2(Number(e.target.value))} /></label>
        <label><span>Temp. max fermentazione (°C)</span><input type="number" step="any" value={temp} onChange={(e) => setTemp(Number(e.target.value))} /></label>
        <label><span>Zucchero</span>
          <select value={sugar} onChange={(e) => setSugar(e.target.value)}>{Object.keys(PRIMING_FACTORS).map((k) => <option key={k}>{k}</option>)}</select>
        </label>
      </div>
      <p>
        CO₂ residua ≈ <strong>{num(residualCo2(temp), 2)}</strong> vol → zucchero da aggiungere ≈ <strong>{num(g, 0)} g</strong> totali
        ({num(vol ? g / vol : 0, 1)} g/L{batch.bottle_size_l ? `, ${num((g / vol) * batch.bottle_size_l, 1)} g per bottiglia da ${batch.bottle_size_l} L` : ""}).
      </p>
      <p className="muted small">Riferimenti: 1,8–2,2 vol stout/ale inglesi · 2,3–2,6 lager e APA/IPA · 2,7–3,3 weizen e belghe. Usa la temperatura più alta raggiunta a fine fermentazione.</p>
    </div>
  );
}

function CostsTab({ batch, canEdit, materials }: { batch: Row; canEdit: boolean; materials: Row[] }) {
  const [summary, setSummary] = useState<Row | null>(null);
  const [ings, setIngs] = useState<Row[]>([]);
  const [avg, setAvg] = useState<Record<string, Row>>({});
  const [reload, setReload] = useState(0);

  useEffect(() => {
    supabase.from("batch_cost_summary").select("*").eq("batch_id", batch.id).single().then(({ data }) => setSummary(data));
    supabase.from("batch_ingredients").select("*").eq("batch_id", batch.id).then(({ data }) => setIngs(data ?? []));
    supabase.from("material_costs").select("*").then(({ data }) => setAvg(Object.fromEntries((data ?? []).map((m) => [m.material_id, m]))));
  }, [batch.id, reload]);

  const toBase = (q: number, u: string) => (["g", "ml"].includes(u) ? q / 1000 : q);
  const total = summary ? summary.ingredients_cost + summary.extra_cost + summary.energy_cost + summary.water_cost : 0;
  const liters = batch.volume_bottled_l ?? (batch.bottles_count && batch.bottle_size_l ? batch.bottles_count * batch.bottle_size_l : null);
  const matOptions = materials.map((m) => ({ value: m.id, label: m.name }));

  return (
    <div>
      {summary && (
        <div className="kpis">
          <div className="kpi"><span>Materie prime</span><strong>{eur(summary.ingredients_cost)}</strong></div>
          <div className="kpi"><span>Bottiglie, tappi, extra</span><strong>{eur(summary.extra_cost)}</strong></div>
          <div className="kpi"><span>Energia + acqua</span><strong>{eur(summary.energy_cost + summary.water_cost)}</strong></div>
          <div className="kpi main"><span>Totale batch</span><strong>{eur(total)}</strong></div>
          <div className="kpi main"><span>Per bottiglia</span><strong>{batch.bottles_count ? eur(total / batch.bottles_count) : "—"}</strong></div>
          <div className="kpi"><span>Per litro</span><strong>{liters ? eur(total / liters) : "—"}</strong></div>
        </div>
      )}
      {summary?.missing_prices && <p className="warn">⚠️ Alcuni ingredienti non hanno un prezzo: collega la materia prima o carica la fattura d'acquisto.</p>}

      <h3>Dettaglio materie prime (costo medio ponderato degli acquisti)</h3>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Ingrediente</th><th>Q.tà</th><th>Costo medio</th><th>Costo</th></tr></thead>
          <tbody>
            {ings.map((i) => {
              const a = i.material_id ? avg[i.material_id] : null;
              const unit = i.unit_cost_override ?? a?.avg_unit_cost;
              return (
                <tr key={i.id}>
                  <td>{i.name}</td>
                  <td>{num(i.quantity, 3)} {i.unit}</td>
                  <td>{unit != null ? `${eur(unit)}/${a?.base_unit ?? (["l", "ml"].includes(i.unit) ? "l" : i.unit === "pz" ? "pz" : "kg")}` : <span className="warn">nessun prezzo</span>}</td>
                  <td>{unit != null ? eur(toBase(i.quantity, i.unit) * unit) : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <h3>Altri costi (bottiglie, tappi, etichette, CO₂…)</h3>
      <p className="muted small">Se scegli una materia prima e lasci vuoto il costo unitario, viene usato il costo medio degli acquisti.</p>
      <RowsEditor table="batch_costs" parentKey="batch_id" parentId={batch.id} canEdit={canEdit}
        onChange={() => setReload((x) => x + 1)}
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
          return u != null ? eur(u * r.quantity) : "—";
        } }]}
      />
      <p className="muted small">Energia e acqua sono calcolate dai consumi del log × prezzi in Impostazioni.</p>
    </div>
  );
}

export function BatchDetail() {
  const { id } = useParams();
  const { isAdmin } = useAuth();
  const [batch, setBatch] = useState<Row | null>(null);
  const [recipe, setRecipe] = useState<Row | null>(null);
  const [materials, setMaterials] = useState<Row[]>([]);
  const [tab, setTab] = useState("log");
  const [deleting, setDeleting] = useState(false);
  const nav = useNavigate();

  useEffect(() => {
    supabase.from("batches").select("*").eq("id", id!).single().then(({ data }) => {
      setBatch(data);
      if (data) supabase.from("recipes").select("id, name, target_og, target_fg, efficiency_pct, batch_size_l").eq("id", data.recipe_id).single().then(({ data: r }) => setRecipe(r));
    });
    loadMaterials().then(setMaterials);
  }, [id]);

  const quick = async (q: (typeof QUICK)[number]) => {
    const today = new Date().toISOString().slice(0, 10);
    const { data, error } = await supabase.from("batches").update({ status: q.status, [q.field]: today }).eq("id", batch!.id).select().single();
    if (error) return alert(errMsg(error));
    setBatch(data);
    await supabase.from("batch_events").insert({ batch_id: batch!.id, kind: "nota", notes: `Stato: ${STATUS_LABELS[q.status]}` });
  };

  if (!batch) return <p>Caricamento…</p>;
  const matOptions = materials.map((m) => ({ value: m.id, label: m.name }));

  return (
    <div>
      <div className="page-head">
        <div>
          <Link to="/batch" className="muted small">← Batch</Link>
          <h1>{batch.code} <span className={"badge st-" + batch.status}>{STATUS_LABELS[batch.status]}</span></h1>
          {recipe && <div className="muted">Ricetta: <Link to={`/ricette/${recipe.id}`}>{recipe.name}</Link> · obiettivo OG {sg(recipe.target_og)} / FG {sg(recipe.target_fg)}</div>}
        </div>
        {isAdmin && (
          <div className="row-actions wrap">
            {QUICK.map((q) => <button key={q.status} className="btn small" onClick={() => quick(q)}>{q.label}</button>)}
            <button className="btn small danger" onClick={() => setDeleting(true)}>🗑️ Elimina batch</button>
          </div>
        )}
      </div>

      {deleting && (
        <DeleteDialog title="Elimina batch" name={batch.code}
          loadSummary={async () => { const s = await deletionSummary(null, [batch.id]); const { batch: _b, ...rest } = s; void _b; return rest; }}
          onConfirm={async () => { await deleteBatches([batch.id]); nav(recipe ? `/ricette/${recipe.id}` : "/batch"); }}
          onClose={() => setDeleting(false)} />
      )}

      <div className="timeline">
        <div className={batch.brew_date ? "done" : ""}><span>Cotta</span>{date(batch.brew_date)}</div>
        <div className={batch.fermentation_start ? "done" : ""}><span>Fermentazione</span>{date(batch.fermentation_start)}</div>
        <div className={batch.bottling_date ? "done" : ""}><span>Imbottigliata</span>{date(batch.bottling_date)}</div>
        <div className={batch.first_tasting_date ? "done" : ""}><span>Bevuta</span>{date(batch.first_tasting_date)}</div>
      </div>

      <Tabs active={tab} onChange={setTab} tabs={[
        ["log", "Log cotta"], ["acqua", "Correzioni acqua"], ["ingredienti", "Ingredienti usati"],
        ["diario", "Diario fermentazione"], ["carbonazione", "Carbonazione"], ["valutazioni", "Valutazioni"], ["costi", "Costi"],
        ["documenti", "Documenti"], ["chat", "Chat"], ["storico", "Storico versioni"],
      ]} />

      <div className="panel">
        {tab === "log" && <RecordForm table="batches" row={batch} sections={SECTIONS.filter((s) => s.title !== "Carbonazione")} canEdit={isAdmin} onSaved={setBatch} />}
        {tab === "acqua" && (
          <RowsEditor table="water_adjustments" parentKey="batch_id" parentId={batch.id} canEdit={isAdmin}
            defaults={{ unit: "g", target: "mash" }} emptyText="Nessuna correzione registrata"
            fields={[
              { key: "additive", label: "Additivo", required: true, placeholder: "es. Acido lattico 80%, CaSO4, CaCl2" },
              { key: "amount", label: "Quantità", type: "number", required: true },
              { key: "unit", label: "Unità", type: "select", options: ["g", "ml", "gocce"], required: true },
              { key: "target", label: "Dove", type: "select", options: ["mash", "sparge", "bollitura", "totale"], required: true },
              { key: "notes", label: "Note" },
            ]} />
        )}
        {tab === "ingredienti" && (
          <>
            <p className="muted small">Copiati dalla ricetta alla creazione del batch: correggi le quantità realmente usate. Il costo usa la materia prima collegata.</p>
            <RowsEditor table="batch_ingredients" parentKey="batch_id" parentId={batch.id} canEdit={isAdmin}
              defaults={{ unit: "kg", category: "malto" }}
              fields={[
                { key: "name", label: "Ingrediente", required: true },
                { key: "category", label: "Categoria", type: "select", options: MATERIAL_CATEGORIES, required: true },
                { key: "quantity", label: "Q.tà", type: "number", required: true },
                { key: "unit", label: "Unità", type: "select", options: UNITS, required: true },
                { key: "step", label: "Quando" },
                { key: "material_id", label: "Materia prima", type: "select", options: matOptions },
                { key: "unit_cost_override", label: "Costo forzato €/unità base", type: "number" },
              ]} />
          </>
        )}
        {tab === "diario" && (
          <RowsEditor table="batch_events" parentKey="batch_id" parentId={batch.id} canEdit={isAdmin}
            orderBy={{ column: "event_at", ascending: false }} emptyText="Diario vuoto"
            defaults={{ kind: "densita", event_at: new Date().toISOString() }}
            fields={[
              { key: "event_at", label: "Quando", type: "datetime", required: true },
              { key: "kind", label: "Tipo", type: "select", required: true, options: ["nota", "densita", "temperatura", "ph", "dry_hop", "travaso", "assaggio", "problema"] },
              { key: "value", label: "Valore", type: "number", step: "0.001" },
              { key: "notes", label: "Note" },
            ]} />
        )}
        {tab === "carbonazione" && (
          <>
            <RecordForm table="batches" row={batch} sections={SECTIONS.filter((s) => s.title === "Carbonazione" || s.title === "Volumi e imbottigliamento")} canEdit={isAdmin} onSaved={setBatch} />
            <PrimingCalc batch={batch} />
          </>
        )}
        {tab === "costi" && <CostsTab batch={batch} canEdit={isAdmin} materials={materials} />}
        {tab === "valutazioni" && <BatchEvaluation batch={batch} recipe={recipe} />}
        {tab === "documenti" && <DocumentsPanel batchId={batch.id} />}
        {tab === "chat" && <ChatPanel batchId={batch.id} />}
        {tab === "storico" && <HistoryList relatedTo={{ id: batch.id, key: "batch_id" }} />}
      </div>
    </div>
  );
}
