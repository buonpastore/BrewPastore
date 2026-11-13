import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  supabase, errMsg, sg, eur, num, date, STATUS_LABELS, MATERIAL_CATEGORIES, UNITS, loadMaterials,
  primingGrams, residualCo2, PRIMING_FACTORS, fmtUnitPrice, type Row,
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
import { BrewDay } from "./BrewDay";
import { QuickEntry } from "./QuickEntry";
import { CleanNamesButton } from "../components/CleanNames";
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
  { title: "pH", fields: [
    { key: "water_ph_initial", label: "pH acqua iniziale", type: "number", step: "0.01" },
    { key: "water_ph_adjusted", label: "pH acqua dopo correzioni", type: "number", step: "0.01" },
    { key: "mash_ph", label: "pH del mash", type: "number", step: "0.01" },
  ]},
  { title: "Gravity", fields: [
    sgField("pre_sparge_gravity", "1 · Pre-sparge"),
    sgField("post_sparge_gravity", "2 · Post-sparge"),
    sgField("original_gravity", "3 · Post-bollitura (OG)"),
    sgField("final_gravity", "4 · Post-fermentazione (FG)"),
  ]},
  { title: "Acqua", fields: [
    { key: "mash_water_l", label: "Acqua mash (L)", type: "number" },
    { key: "sparge_water_l", label: "Acqua sparge (L)", type: "number" },
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

const QUICK: { status: string; field: string; label: string; color: string }[] = [
  { status: "cotta", field: "brew_date", label: "🔥 Cotta oggi", color: "var(--gold)" },
  { status: "fermentazione", field: "fermentation_start", label: "🫧 Fermentata oggi", color: "var(--teal)" },
  { status: "imbottigliato", field: "bottling_date", label: "🍾 Imbottigliata oggi", color: "var(--magenta)" },
  { status: "finito", field: "first_tasting_date", label: "🍻 Bevuta oggi", color: "var(--gold)" },
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
                  <td>{unit != null ? fmtUnitPrice(unit, a?.category ?? i.category, a?.base_unit ?? (["l", "ml"].includes(i.unit) ? "l" : i.unit === "pz" ? "pz" : "kg")) : <span className="warn">nessun prezzo</span>}</td>
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

/** Primo riquadro di un batch appena creato: nome, data di cotta e stato, subito modificabili. */
function NewBatchCard({ batch, onSaved, onDone }: { batch: Row; onSaved: (b: Row) => void; onDone: () => void }) {
  const [code, setCode] = useState(batch.code ?? "");
  const [msg, setMsg] = useState("");
  const today = new Date().toISOString().slice(0, 10);
  const save = async (patch: Row) => {
    const { data, error } = await supabase.from("batches").update(patch).eq("id", batch.id).select().single();
    if (error) return setMsg(errMsg(error));
    onSaved(data); setMsg("✓ salvato");
    window.setTimeout(() => setMsg(""), 1500);
  };
  return (
    <div className="new-batch">
      <div className="nb-head">
        <strong>🍺 Nuovo batch creato</strong>
        <span className="ok small">{msg}</span>
      </div>
      <label className="block"><span>Nome del batch</span>
        <input className="nb-name" value={code} onChange={(e) => setCode(e.target.value)} onBlur={() => code.trim() && code !== batch.code && save({ code: code.trim() })} />
      </label>
      <label className="block"><span>Data di cotta</span>
        <div className="nb-date">
          <input type="date" value={batch.brew_date ?? ""} onChange={(e) => save({ brew_date: e.target.value || null })} />
          <button className="btn" onClick={() => save({ brew_date: today, status: batch.status === "pianificato" ? "cotta" : batch.status })}>Oggi</button>
        </div>
      </label>
      <div className="block"><span className="nb-label">Stato</span>
        <div className="nb-status">
          {Object.entries(STATUS_LABELS).map(([k, v]) => (
            <button key={k} className={"nb-chip st-" + k + (batch.status === k ? " on" : "")} onClick={() => save({ status: k })}>{v}</button>
          ))}
        </div>
      </div>
      <p className="muted small">Ingredienti e acqua sono stati copiati dalla ricetta. Ora inserisci i valori della cotta qui sotto: si salvano da soli.</p>
      <button className="btn small" onClick={onDone}>Fatto, nascondi questo riquadro</button>
    </div>
  );
}

function BatchBrewDay({ batch, recipe }: { batch: Row; recipe: Row | null }) {
  const [ings, setIngs] = useState<Row[]>([]);
  const [water, setWater] = useState<Row[]>([]);
  useEffect(() => {
    supabase.from("batch_ingredients").select("*").eq("batch_id", batch.id).then(({ data }) => setIngs(data ?? []));
    supabase.from("water_adjustments").select("*").eq("batch_id", batch.id).then(({ data }) => setWater(data ?? []));
  }, [batch.id]);
  return (
    <BrewDay ingredients={ings} waterAdjustments={water} mashTemp={recipe?.mash_temp_c} mashTime={recipe?.mash_time_min}
      boilTime={recipe?.boil_time_min} mashWater={batch.mash_water_l ?? recipe?.mash_water_l} spargeWater={batch.sparge_water_l ?? recipe?.sparge_water_l}
      volume={batch.volume_fermenter_l ?? recipe?.batch_size_l} procedure={recipe?.procedure} />
  );
}

/** Le 4 gravity in fila, con le variazioni tra un passaggio e l'altro. */
function GravityStrip({ batch, recipe }: { batch: Row; recipe: Row | null }) {
  const steps: [string, number | null, string][] = [
    ["Pre-sparge", batch.pre_sparge_gravity, ""],
    ["Post-sparge", batch.post_sparge_gravity, ""],
    ["Post-bollitura (OG)", batch.original_gravity, recipe?.target_og ? `obiettivo ${sg(recipe.target_og)}` : ""],
    ["Post-fermentazione (FG)", batch.final_gravity, recipe?.target_fg ? `obiettivo ${sg(recipe.target_fg)}` : ""],
  ];
  const ph: [string, number | null][] = [["Acqua iniziale", batch.water_ph_initial], ["Acqua corretta", batch.water_ph_adjusted], ["Mash", batch.mash_ph]];
  return (
    <div className="chem">
      <h3 style={{ marginTop: 0 }}>pH</h3>
      <div className="chem-row">
        {ph.map(([l, v], i) => (
          <div key={l} className="chem-cell">
            {i > 0 && <span className="chem-arrow">→</span>}
            <span className="muted small">{l}</span>
            <strong className={l === "Mash" && v != null ? (Number(v) >= 5.2 && Number(v) <= 5.6 ? "ok" : "warn") : ""}>{v != null ? num(v, 2) : "—"}</strong>
            {l === "Mash" && <span className="muted small">ideale 5,2–5,6</span>}
          </div>
        ))}
      </div>
      <h3>Gravity</h3>
      <div className="chem-row">
        {steps.map(([l, v, sub], i) => {
          const prev = i > 0 ? steps[i - 1][1] : null;
          const d = v != null && prev != null ? Math.round((Number(v) - Number(prev)) * 1000) : null;
          return (
            <div key={l} className="chem-cell">
              {i > 0 && <span className="chem-arrow">→</span>}
              <span className="muted small">{i + 1} · {l}</span>
              <strong>{sg(v)}</strong>
              <span className="muted small">{d != null ? `${d > 0 ? "+" : ""}${d} punti` : sub}</span>
            </div>
          );
        })}
      </div>
      {batch.abv != null && <p className="small">Grado alcolico: <strong>{num(batch.abv, 1)}% vol</strong></p>}
    </div>
  );
}

export function BatchDetail() {
  const { id } = useParams();
  const { isAdmin } = useAuth();
  const [batch, setBatch] = useState<Row | null>(null);
  const [recipe, setRecipe] = useState<Row | null>(null);
  const [materials, setMaterials] = useState<Row[]>([]);
  const [tab, setTab] = useState("dati");
  const [sp, setSp] = useSearchParams();
  const isNew = sp.get("nuovo") === "1";
  const [deleting, setDeleting] = useState(false);
  const [reloadIng, setReloadIng] = useState(0);
  const [focusKey, setFocusKey] = useState(0);
  const [focusStatus, setFocusStatus] = useState<string | null>(null);
  const nav = useNavigate();

  useEffect(() => {
    supabase.from("batches").select("*").eq("id", id!).single().then(({ data }) => {
      setBatch(data);
      if (data) supabase.from("recipes").select("*").eq("id", data.recipe_id).single().then(({ data: r }) => setRecipe(r));
    });
    loadMaterials().then(setMaterials);
  }, [id]);

  const quick = async (q: (typeof QUICK)[number]) => {
    const today = new Date().toISOString().slice(0, 10);
    if (batch![q.field] && batch![q.field] !== today && !confirm(`${q.label.replace(/^\S+\s/, "")}: era già segnata il ${date(batch![q.field])}. Cambiare la data in oggi?`)) return;
    const { data, error } = await supabase.from("batches").update({ status: q.status, [q.field]: today }).eq("id", batch!.id).select().single();
    if (error) return alert(errMsg(error));
    setBatch(data);
    setTab("dati"); setFocusStatus(q.status); setFocusKey((k) => k + 1);   // apri solo la fase interessante
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
        {isAdmin && <button className="mini-btn" onClick={() => setDeleting(true)}>🗑️ <span>Elimina batch</span></button>}
      </div>
      {isAdmin && (
        <div className="quick-status">
          {QUICK.map((q) => {
            const done = batch[q.field];
            return (
              <button key={q.status} className={"qs-btn" + (done ? " done" : "")} style={{ ["--c" as string]: q.color }} onClick={() => quick(q)}>
                <span className="qs-label">{q.label}</span>
                {done && <span className="qs-date">✓ {date(done)}</span>}
              </button>
            );
          })}
        </div>
      )}

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

      <Tabs grid wide active={tab} onChange={setTab} tabs={[
        ["dati", "✍️ Inserisci"], ["log", "Log cotta"], ["cottura", "Cottura"],
        ["chimici", "Valori chimici"], ["ingredienti", "Ingredienti"], ["diario", "Diario"],
        ["carbonazione", "Carbonazione"], ["valutazioni", "Valutazioni"], ["costi", "Costi"],
        ["documenti", "Documenti"], ["chat", "Chat"], ["storico", "Storico"],
      ]} />

      <div className="panel">
        {tab === "dati" && isNew && isAdmin && <NewBatchCard batch={batch} onSaved={setBatch} onDone={() => setSp({}, { replace: true })} />}
        {tab === "dati" && <QuickEntry key={batch.id} batch={batch} canEdit={isAdmin} onSaved={setBatch} onDelete={() => setDeleting(true)} focusKey={focusKey} focusStatus={focusStatus} onAfterSave={() => nav("/batch")} />}
        {tab === "log" && <RecordForm table="batches" row={batch} sections={SECTIONS.filter((s) => !["Carbonazione", "pH", "Gravity"].includes(s.title ?? ""))} canEdit={isAdmin} onSaved={setBatch} />}
        {tab === "cottura" && <BatchBrewDay batch={batch} recipe={recipe} />}
        {tab === "chimici" && (
          <>
            <GravityStrip batch={batch} recipe={recipe} />
            <RecordForm table="batches" row={batch} sections={SECTIONS.filter((s) => s.title === "pH" || s.title === "Gravity")} canEdit={isAdmin} onSaved={setBatch} hideView editLabel="Modifica pH e gravity" />
            <h3 style={{ marginTop: 22 }}>Correzioni dell'acqua</h3>
          <RowsEditor table="water_adjustments" parentKey="batch_id" parentId={batch.id} canEdit={isAdmin}
            defaults={{ unit: "g", target: "mash" }} emptyText="Nessuna correzione registrata"
            fields={[
              { key: "additive", label: "Additivo", required: true, placeholder: "es. Acido lattico 80%, CaSO4, CaCl2" },
              { key: "amount", label: "Quantità", type: "number", required: true },
              { key: "unit", label: "Unità", type: "select", options: ["g", "ml", "gocce"], required: true },
              { key: "target", label: "Dove", type: "select", options: ["mash", "sparge", "bollitura", "totale"], required: true },
              { key: "notes", label: "Note" },
            ]} />
          </>
        )}
        {tab === "ingredienti" && (
          <>
            <p className="muted small">Copiati dalla ricetta alla creazione del batch: correggi le quantità realmente usate. Il costo usa la materia prima collegata.</p>
            {isAdmin && <div className="row-actions" style={{ margin: "0 0 10px" }}><CleanNamesButton table="batch_ingredients" parentKey="batch_id" parentId={batch.id} onDone={() => setReloadIng((x) => x + 1)} /></div>}
            <RowsEditor table="batch_ingredients" parentKey="batch_id" parentId={batch.id} canEdit={isAdmin} reloadKey={reloadIng}
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
