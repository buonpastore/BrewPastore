import { ArrowLeft, ArrowRight } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { supabase, errMsg, sg, date, normStatus, statusLabel, type Row } from "../lib";
import { useAuth } from "../auth";
import { QuickEntry } from "./QuickEntry";
import { DeleteDialog } from "../components/DeleteDialog";
import { PreviousBatches } from "../components/PreviousBatches";
import { deleteBatches, deletionSummary } from "../deleteHelpers";


/** I passaggi del batch, in ordine: ognuno ha la sua data. */
const STEPS: { status: string; field: string; label: string; icon: string; color: string }[] = [
  { status: "cotta", field: "brew_date", label: "Cotta", icon: "🔥", color: "var(--gold)" },
  { status: "fermentazione", field: "fermentation_start", label: "Fermentata", icon: "🫧", color: "var(--teal)" },
  { status: "imbottigliato", field: "bottling_date", label: "Imbottigliata", icon: "🍾", color: "var(--magenta)" },
  { status: "degustato", field: "first_tasting_date", label: "Degustata", icon: "🍻", color: "var(--violet)" },
  { status: "esaurito", field: "depleted_date", label: "Esaurita", icon: "🫙", color: "var(--hop)" },
];
/** Quanti passaggi sono fatti (dallo stato o dalle date). */
function stepsDone(b: Row): number {
  const fromStatus = STEPS.findIndex((s) => s.status === normStatus(b.status)) + 1;
  const fromDates = STEPS.reduce((n, s, i) => (b[s.field] ? i + 1 : n), 0);
  return Math.max(fromStatus, fromDates);
}

/** Passaggi del batch: avanzare, cambiare la data, annullare l'ultimo, scegliere di quale vedere i dati. */
function BatchSteps({ batch, canEdit, selected, onSelect, onSaved }: { batch: Row; canEdit: boolean; selected: string; onSelect: (s: string) => void; onSaved: (b: Row) => void }) {
  const done = stepsDone(batch);
  const next = STEPS[done];
  const today = new Date().toISOString().slice(0, 10);
  const update = async (patch: Row) => {
    let { data, error } = await supabase.from("batches").update(patch).eq("id", batch.id).select().single();
    // 0027 non eseguita: niente data di esaurimento
    if (error && /depleted_date/.test(error.message)) { const { depleted_date: _d, ...rest } = patch; void _d; ({ data, error } = await supabase.from("batches").update(rest).eq("id", batch.id).select().single()); }
    if (error) { alert(errMsg(error)); return false; }
    onSaved(data); return true;
  };
  const advance = async () => {
    if (!next) return;
    if (next.status === "esaurito" && !confirm("Segnare la birra come esaurita? Sparisce da cantina, bottiglia da girare e degustazioni, e resta nello storico.")) return;
    if (await update({ status: next.status, [next.field]: today })) onSelect(next.status);
  };
  const undo = async (i: number) => {
    const s = STEPS[i];
    if (!confirm(`Annullare «${s.label}»${batch[s.field] ? ` del ${date(batch[s.field])}` : ""} e tornare a «${i > 0 ? STEPS[i - 1].label : "da cuocere"}»? I dati inseriti restano.`)) return;
    if (await update({ status: i > 0 ? STEPS[i - 1].status : "pianificato", [s.field]: null })) onSelect(i > 0 ? STEPS[i - 1].status : "cotta");
  };
  return (
    <div className="bsteps">
      {STEPS.slice(0, done).map((s, i) => (
        <div key={s.status} className={"bstep" + (selected === s.status ? " sel" : "")} style={{ ["--c" as string]: s.color }}>
          <button type="button" className="bstep-name" onClick={() => onSelect(s.status)}>
            <span className="bstep-ico">{s.icon}</span>{s.label}
          </button>
          {canEdit
            ? <input type="date" className="bstep-date" value={batch[s.field] ?? ""} aria-label={`Data: ${s.label}`} onChange={(e) => update({ [s.field]: e.target.value || null })} />
            : <span className="bstep-date">{batch[s.field] ? date(batch[s.field]) : "—"}</span>}
        </div>
      ))}
      {canEdit && (done > 0 || next) && (
        <div className={"bstep-move" + (done > 0 && next ? " two" : "")}>
          {done > 0 && (
            <button type="button" className="bstep-back" onClick={() => undo(done - 1)} title={`Annulla «${STEPS[done - 1].label}»`}>
              <ArrowLeft size={18} /> Torna a <strong>{done > 1 ? STEPS[done - 2].label : "da cuocere"}</strong>
            </button>
          )}
          {next && (
            <button type="button" className="bstep-next" style={{ ["--c" as string]: next.color }} onClick={advance}>
              <span>Avanza a <strong>{next.label}</strong></span> <ArrowRight size={18} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Primo riquadro di un batch appena creato: nome, data di cotta e stato, subito modificabili. */
function NewBatchCard({ batch, onSaved, onDone }: { batch: Row; onSaved: (b: Row) => void; onDone: () => void }) {
  const [code, setCode] = useState(batch.code ?? "");
  const [msg, setMsg] = useState("");
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
      {batch.recipe_id && <PreviousBatches recipeId={batch.recipe_id} excludeId={batch.id} />}
      <p className="muted small">Ingredienti e acqua sono stati copiati dalla ricetta. Ora inserisci i valori della cotta qui sotto: si salvano da soli.</p>
      <button className="btn small" onClick={onDone}>Fatto, nascondi questo riquadro</button>
    </div>
  );
}

export function BatchDetail() {
  const { id } = useParams();
  const { isAdmin } = useAuth();
  const [batch, setBatch] = useState<Row | null>(null);
  const [recipe, setRecipe] = useState<Row | null>(null);
  // le altre schede (ingredienti, diario, documenti…) stanno in fondo, chiuse
  const [sp, setSp] = useSearchParams();
  const isNew = sp.get("nuovo") === "1";
  const [deleting, setDeleting] = useState(false);
  // passaggio di cui si vedono i dati: di base l'ultimo fatto (o la cotta)
  const [step, setStep] = useState("cotta");
  const nav = useNavigate();

  useEffect(() => {
    supabase.from("batches").select("*").eq("id", id!).single().then(({ data }) => {
      setBatch(data);
      if (data) setStep(STEPS[Math.max(0, stepsDone(data) - 1)].status);
      if (data) supabase.from("recipes").select("*").eq("id", data.recipe_id).single().then(({ data: r }) => setRecipe(r));
    });
  }, [id]);

  if (!batch) return <p>Caricamento…</p>;

  return (
    <div>
      <div className="page-head">
        <div>
          <Link to="/batch" className="muted small">← Batch</Link>
          <h1>{batch.code} <span className={"badge st-" + batch.status}>{statusLabel(batch.status)}</span></h1>
          {recipe && <div className="muted">Ricetta: <Link to={`/ricette/${recipe.id}`}>{recipe.name}</Link> · obiettivo OG {sg(recipe.target_og)} / FG {sg(recipe.target_fg)}</div>}
        </div>
      </div>
      <BatchSteps batch={batch} canEdit={isAdmin} selected={step} onSelect={setStep} onSaved={setBatch} />

      {deleting && (
        <DeleteDialog title="Elimina batch" name={batch.code}
          loadSummary={async () => { const s = await deletionSummary(null, [batch.id]); const { batch: _b, ...rest } = s; void _b; return rest; }}
          onConfirm={async () => { await deleteBatches([batch.id]); nav(recipe ? `/ricette/${recipe.id}` : "/batch"); }}
          onClose={() => setDeleting(false)} />
      )}

      <div className="panel">
        {isNew && isAdmin && <NewBatchCard batch={batch} onSaved={setBatch} onDone={() => setSp({}, { replace: true })} />}
        <QuickEntry key={batch.id} batch={batch} recipe={recipe} canEdit={isAdmin} onSaved={setBatch} onDelete={() => setDeleting(true)} step={step} onAfterSave={() => nav("/batch")} />
      </div>

    </div>
  );
}
