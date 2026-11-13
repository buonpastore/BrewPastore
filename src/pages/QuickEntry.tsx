import { createContext, useContext, useEffect, useRef, useState } from "react";
import { Droplets, Wheat, ShowerHead, Snowflake, FlaskConical, Wine, Zap, Minus, Plus, Check, Save, Trash2, ChevronDown } from "lucide-react";
import type { ReactNode } from "react";
import { supabase, errMsg, num, type Row } from "../lib";
import { BottleCalc } from "./BottleCalc";

type Kind = "ph" | "sg" | "l" | "int" | "kwh" | "g" | "co2";
interface Field { key: string; label: string; kind: Kind; hint?: string }
interface Phase { title: string; color: string; icon: ReactNode; fields: Field[]; twoCols?: boolean }

const PHASES: Phase[] = [
  { title: "Acqua", color: "var(--teal)", icon: <Droplets size={20} />, fields: [
    { key: "mash_water_l", label: "Acqua di mash", kind: "l" },
    { key: "sparge_water_l", label: "Acqua di sparge", kind: "l" },
    { key: "water_ph_initial", label: "pH iniziale", kind: "ph" },
    { key: "water_ph_adjusted", label: "pH corretto", kind: "ph", hint: "viene copiato nel pH del mash" },
  ], twoCols: true },
  { title: "Mash", color: "var(--gold)", icon: <Wheat size={20} />, fields: [
    { key: "mash_ph", label: "pH del mash", kind: "ph", hint: "ideale 5,2–5,6 · parte dal pH corretto" },
    { key: "pre_sparge_gravity", label: "Gravity pre-sparge", kind: "sg" },
  ] },
  { title: "Sparge", color: "var(--teal)", icon: <ShowerHead size={20} />, fields: [
    { key: "post_sparge_gravity", label: "Gravity post-sparge", kind: "sg", hint: "prima della bollitura" },
  ] },
  { title: "Fine bollitura", color: "var(--magenta)", icon: <Snowflake size={20} />, fields: [
    { key: "original_gravity", label: "OG (post-bollitura)", kind: "sg" },
    { key: "volume_fermenter_l", label: "Litri in fermentatore", kind: "l" },
  ] },
  { title: "Fermentazione", color: "var(--gold)", icon: <FlaskConical size={20} />, fields: [
    { key: "final_gravity", label: "FG (post-fermentazione)", kind: "sg" },
  ] },
  { title: "Imbottigliamento", color: "var(--magenta)", icon: <Wine size={20} />, fields: [
    { key: "volume_bottled_l", label: "Litri imbottigliati", kind: "l" },
    { key: "bottles_count", label: "Numero di bottiglie", kind: "int" },
    { key: "priming_sugar_g", label: "Zucchero di priming", kind: "g" },
    { key: "target_co2_vol", label: "CO₂ obiettivo", kind: "co2" },
  ] },
  { title: "Consumi", color: "var(--teal)", icon: <Zap size={20} />, fields: [
    { key: "energy_kwh", label: "Energia elettrica", kind: "kwh" },
    { key: "water_used_l", label: "Acqua totale usata", kind: "l" },
  ] },
];

const STEP: Record<Kind, number> = { ph: 0.05, sg: 0.001, l: 0.5, int: 1, kwh: 0.5, g: 1, co2: 0.1 };
const UNIT: Record<Kind, string> = { ph: "", sg: "", l: "L", int: "", kwh: "kWh", g: "g", co2: "vol" };
const DEC: Record<Kind, number> = { ph: 2, sg: 3, l: 1, int: 0, kwh: 1, g: 0, co2: 1 };

/** "1052" → 1.052 · "52" → 1.052 · "1,052" → 1.052 */
function parseValue(raw: string, kind: Kind): number | null {
  const t = raw.trim().replace(",", ".");
  if (!t) return null;
  let v = Number(t);
  if (isNaN(v)) return null;
  if (kind === "sg") {
    if (v >= 1000 && v < 1200) v = v / 1000;          // 1052
    else if (v >= 2 && v < 200) v = 1 + v / 1000;     // 52 → 1.052
  }
  if (kind === "int") v = Math.round(v);
  return v;
}
const show = (v: unknown, kind: Kind) => (v == null || v === "" ? "" : Number(v).toFixed(DEC[kind]).replace(".", ","));

/** Ogni casella registra qui il suo "salva subito", usato dal pulsante Salva. */
const FlushCtx = createContext<Set<() => Promise<void>>>(new Set());

function BigField({ f, batch, canEdit, onSaved }: { f: Field; batch: Row; canEdit: boolean; onSaved: (b: Row) => void }) {
  const flushers = useContext(FlushCtx);
  const [text, setText] = useState(show(batch[f.key], f.kind));
  const [state, setState] = useState<"" | "saving" | "ok" | "err">("");
  const [err, setErr] = useState("");
  const timer = useRef<number>();
  useEffect(() => { setText(show(batch[f.key], f.kind)); }, [batch[f.key]]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async (v: number | null) => {
    pending.current = false;
    setState("saving");
    const patch: Row = { [f.key]: v };
    if (f.key === "water_ph_adjusted" && v != null && (batch.mash_ph == null || batch.mash_ph === "")) patch.mash_ph = v;
    const { data, error } = await supabase.from("batches").update(patch).eq("id", batch.id).select().single();
    if (error) { setState("err"); setErr(errMsg(error)); return; }
    setState("ok"); onSaved(data);
    window.setTimeout(() => setState((s) => (s === "ok" ? "" : s)), 1500);
  };
  const schedule = (raw: string) => {
    setText(raw); pending.current = true;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => save(parseValue(raw, f.kind)), 900);
  };
  const bump = (dir: 1 | -1) => {
    const cur = parseValue(text, f.kind) ?? (f.kind === "sg" ? 1.05 : f.kind === "ph" ? 5.4 : 0);
    const next = Math.max(0, Math.round((cur + dir * STEP[f.kind]) * 1000) / 1000);
    setText(show(next, f.kind)); pending.current = true;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => save(next), 700);
  };
  // salva subito se c'è un valore in attesa
  const textRef = useRef(text); textRef.current = text;
  const pending = useRef(false);
  useEffect(() => {
    const flush = async () => {
      if (!pending.current) return;
      window.clearTimeout(timer.current); pending.current = false;
      await save(parseValue(textRef.current, f.kind));
    };
    flushers.add(flush);
    return () => { flushers.delete(flush); };
  }); // eslint-disable-line react-hooks/exhaustive-deps
  const v = parseValue(text, f.kind);
  const warn = f.key === "mash_ph" && v != null && (v < 5.2 || v > 5.6);

  return (
    <div className={"big-field" + (state === "ok" ? " saved" : "") + (warn ? " warn" : "")}>
      <div className="bf-head">
        <span>{f.label}</span>
        {state === "saving" && <span className="muted small">salvo…</span>}
        {state === "ok" && <span className="ok small"><Check size={14} /> salvato</span>}
        {state === "err" && <span className="error small" title={err}>errore</span>}
      </div>
      {canEdit ? (
        <div className="bf-row">
          <button type="button" className="bf-btn" onClick={() => bump(-1)} aria-label="Diminuisci"><Minus size={22} /></button>
          <div className="bf-input">
            <input inputMode="decimal" value={text} placeholder={f.kind === "sg" ? "1,050" : "—"}
              onChange={(e) => schedule(e.target.value)}
              onBlur={() => { window.clearTimeout(timer.current); const p = parseValue(text, f.kind); if (p !== (batch[f.key] == null ? null : Number(batch[f.key]))) save(p); setText(show(p, f.kind)); }} />
            {UNIT[f.kind] && <span className="bf-unit">{UNIT[f.kind]}</span>}
          </div>
          <button type="button" className="bf-btn" onClick={() => bump(1)} aria-label="Aumenta"><Plus size={22} /></button>
        </div>
      ) : (
        <div className="bf-value">{text || "—"} {text && UNIT[f.kind]}</div>
      )}
      {(f.hint || warn) && <div className={warn ? "warn small" : "muted small"}>{warn ? "fuori dall'intervallo ideale 5,2–5,6" : f.hint}</div>}
      {f.kind === "sg" && canEdit && <div className="muted small">puoi scrivere anche 1052 o 52</div>}
    </div>
  );
}

const EVENT_KINDS = [
  { kind: "densita", label: "Densità", icon: "🌡️", kindNum: "sg" as Kind, ph: "es. 1020" },
  { kind: "temperatura", label: "Temperatura", icon: "🔥", kindNum: "l" as Kind, ph: "°C" },
  { kind: "nota", label: "Nota", icon: "📝", kindNum: null, ph: "cosa è successo?" },
];

function QuickEvents({ batch, canEdit }: { batch: Row; canEdit: boolean }) {
  const [open, setOpen] = useState<(typeof EVENT_KINDS)[number] | null>(null);
  const [val, setVal] = useState("");
  const [note, setNote] = useState("");
  const [last, setLast] = useState<Row[]>([]);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    supabase.from("batch_events").select("*").eq("batch_id", batch.id).order("event_at", { ascending: false }).limit(4).then(({ data }) => setLast(data ?? []));
  }, [batch.id, reload]);

  const add = async () => {
    if (!open) return;
    let value: number | null = null;
    if (open.kindNum) {
      value = open.kindNum === "sg" ? parseValue(val, "sg") : parseValue(val, "l");
      if (value == null) return alert("Inserisci un valore");
    }
    const { error } = await supabase.from("batch_events").insert({ batch_id: batch.id, kind: open.kind, value, notes: note || null });
    if (error) return alert(errMsg(error));
    setOpen(null); setVal(""); setNote(""); setReload((x) => x + 1);
  };

  return (
    <div className="qe-events">
      <h3>Diario di fermentazione</h3>
      {canEdit && (
        <div className="qe-ev-btns">
          {EVENT_KINDS.map((k) => (
            <button key={k.kind} className="qe-ev-btn" onClick={() => { setOpen(k); setVal(""); setNote(""); }}>
              <span>{k.icon}</span> ➕ {k.label}
            </button>
          ))}
        </div>
      )}
      {last.length > 0 && (
        <ul className="qe-last">
          {last.map((e) => (
            <li key={e.id}>
              <span className="muted small">{new Date(e.event_at).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
              <strong>{e.kind === "densita" ? `densità ${num(e.value, 3)}` : e.kind === "temperatura" ? `${num(e.value, 1)} °C` : e.kind}</strong>
              {e.notes && <span className="small">{e.notes}</span>}
            </li>
          ))}
        </ul>
      )}
      {open && (
        <div className="modal-backdrop" onClick={() => setOpen(null)}>
          <div className="modal qe-sheet" onClick={(e) => e.stopPropagation()}>
            <h2>{open.icon} {open.label}</h2>
            {open.kindNum && (
              <div className="bf-input big">
                <input autoFocus inputMode="decimal" value={val} placeholder={open.ph} onChange={(e) => setVal(e.target.value)} />
                {open.kind === "temperatura" && <span className="bf-unit">°C</span>}
              </div>
            )}
            <textarea rows={open.kindNum ? 2 : 4} autoFocus={!open.kindNum} placeholder={open.kindNum ? "nota (facoltativa)" : open.ph} value={note} onChange={(e) => setNote(e.target.value)} />
            <div className="qe-sheet-btns">
              <button className="btn" onClick={() => setOpen(null)}>Annulla</button>
              <button className="btn primary" onClick={add}>Salva</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Inserimento rapido dei dati del batch, pensato per il telefono durante la cotta. */
/** Fasi da tenere aperte in base allo stato del batch. */
export function phasesFor(status?: string | null): string[] {
  switch (status) {
    case "fermentazione": case "maturazione": return ["Fermentazione"];
    case "imbottigliato": return ["Imbottigliamento"];
    case "finito": return ["Consumi"];
    default: return ["Acqua", "Mash", "Sparge", "Fine bollitura"];
  }
}

export function QuickEntry({ batch, canEdit, onSaved, onDelete, focusKey = 0, focusStatus }: { batch: Row; canEdit: boolean; onSaved: (b: Row) => void; onDelete?: () => void; focusKey?: number; focusStatus?: string | null }) {
  const [open, setOpen] = useState<Set<string>>(() => new Set(phasesFor(batch.status)));
  const rootRef = useRef<HTMLDivElement>(null);
  // dopo un pulsante di stato: apri solo le fasi interessanti e portale in vista
  useEffect(() => {
    if (!focusKey) return;
    setOpen(new Set(phasesFor(focusStatus ?? batch.status)));
    window.setTimeout(() => rootRef.current?.querySelector(".qe-phase.open")?.scrollIntoView({ behavior: "smooth", block: "start" }), 120);
  }, [focusKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const toggle = (t: string) => setOpen((o) => { const n = new Set(o); if (n.has(t)) n.delete(t); else n.add(t); return n; });
  const flushers = useRef(new Set<() => Promise<void>>()).current;
  const [saveMsg, setSaveMsg] = useState("");
  const saveAll = async () => {
    setSaveMsg("Salvo…");
    (document.activeElement as HTMLElement | null)?.blur?.();
    await Promise.all([...flushers].map((fn) => fn()));
    const { data } = await supabase.from("batches").select("*").eq("id", batch.id).single();
    if (data) onSaved(data);
    setSaveMsg("✓ Tutto salvato");
    window.setTimeout(() => setSaveMsg(""), 2500);
  };
  return (
    <FlushCtx.Provider value={flushers}>
    <div className="quick-entry" ref={rootRef}>
      {PHASES.map((p) => {
        const done = p.fields.filter((f) => batch[f.key] != null && batch[f.key] !== "").length;
        return (
          <section key={p.title} className={"qe-phase" + (open.has(p.title) ? " open" : "")} style={{ ["--c" as string]: p.color }}>
            <button type="button" className="qe-title" onClick={() => toggle(p.title)} aria-expanded={open.has(p.title)}>
              <span className="qe-ico">{p.icon}</span>{p.title}
              <span className={"qe-count" + (done === p.fields.length ? " full" : "")}>{done}/{p.fields.length}</span>
              <ChevronDown size={20} className="qe-chev" />
            </button>
            {open.has(p.title) && (
              <>
                <div className={"qe-fields" + (p.twoCols ? " two" : "")}>
                  {p.fields.map((f) => <BigField key={f.key} f={f} batch={batch} canEdit={canEdit} onSaved={onSaved} />)}
                </div>
                {p.title === "Fermentazione" && <QuickEvents batch={batch} canEdit={canEdit} />}
                {p.title === "Imbottigliamento" && <BottleCalc batch={batch} canEdit={canEdit} onSaved={onSaved} />}
              </>
            )}
          </section>
        );
      })}
      {batch.abv != null && <p className="qe-abv">🍺 Grado alcolico: <strong>{num(batch.abv, 1)}% vol</strong></p>}
      {canEdit && (
        <div className="qe-bottom">
          <button className="big-action primary" onClick={saveAll}><Save size={20} /> {saveMsg || "Salva"}</button>
          {onDelete && <button className="big-action danger" onClick={onDelete}><Trash2 size={20} /> Elimina batch</button>}
        </div>
      )}
    </div>
    </FlushCtx.Provider>
  );
}
