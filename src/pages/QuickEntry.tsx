import { CapPicker, BottleSplit } from "../components/CapColor";
import { useAuth } from "../auth";
import { Link } from "react-router-dom";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { Droplets, Wheat, ShowerHead, Snowflake, FlaskConical, Wine, Zap, Minus, Plus, Check, Save, Trash2, ChevronDown } from "lucide-react";
import type { ReactNode } from "react";
import { supabase, errMsg, num, type Row } from "../lib";
import { BottleCalc } from "./BottleCalc";
import { recipeCo2 } from "../styleGuide";
import { primingGrams } from "../lib";

/** Campo speciale: l'acido lattico sta nelle correzioni dell'acqua (water_adjustments), non nel batch. */
const LACTIC = "__acido_lattico";
const LACTIC_NAME = "Acido lattico 80%";

type Kind = "ph" | "sg" | "l" | "int" | "kwh" | "g" | "co2" | "gd";
interface Field { key: string; label: string; kind: Kind; hint?: string }
interface Phase { title: string; color: string; icon: ReactNode; fields: Field[]; twoCols?: boolean }

const PHASES: Phase[] = [
  { title: "Acqua", color: "var(--teal)", icon: <Droplets size={20} />, fields: [
    { key: "mash_water_l", label: "Acqua di mash", kind: "l" },
    { key: "sparge_water_l", label: "Acqua di sparge", kind: "l" },
  ], twoCols: true },
  // la correzione riguarda l'acqua del mash: il pH dello sparge non serve
  { title: "Correzione acqua del mash", color: "var(--teal)", icon: <FlaskConical size={20} />, fields: [
    { key: "water_ph_initial", label: "pH iniziale", kind: "ph" },
    { key: LACTIC, label: "Acido lattico", kind: "gd", hint: "quanto ne avete messo" },
    { key: "water_ph_adjusted", label: "pH corretto", kind: "ph" },
  ], twoCols: true },
  { title: "Mash", color: "var(--gold)", icon: <Wheat size={20} />, fields: [
    { key: "pre_sparge_gravity", label: "Gravity pre-sparge", kind: "sg" },
  ] },
  { title: "Sparge", color: "var(--teal)", icon: <ShowerHead size={20} />, fields: [
    { key: "post_sparge_gravity", label: "Gravity post-sparge", kind: "sg", hint: "prima della bollitura" },
  ] },
  { title: "Fine bollitura", color: "var(--magenta)", icon: <Snowflake size={20} />, fields: [
    { key: "original_gravity", label: "OG (post-bollitura)", kind: "sg" },
    { key: "volume_fermenter_l", label: "Litri in fermentatore", kind: "l" },
  ] },
  { title: "Consumi della cotta", color: "var(--violet)", icon: <Zap size={20} />, fields: [
    { key: "energy_kwh", label: "Energia elettrica", kind: "kwh" },
    { key: "water_used_l", label: "Acqua totale usata", kind: "l" },
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
];

const STEP: Record<Kind, number> = { ph: 0.05, sg: 0.001, l: 0.5, int: 1, kwh: 0.5, g: 1, co2: 0.1, gd: 0.5 };
const UNIT: Record<Kind, string> = { ph: "", sg: "", l: "L", int: "", kwh: "kWh", g: "g", co2: "vol", gd: "g" };
const DEC: Record<Kind, number> = { ph: 2, sg: 3, l: 1, int: 0, kwh: 1, g: 0, co2: 1, gd: 1 };

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

/** Salva il valore di un campo: nel batch oppure, per l'acido lattico, nelle correzioni dell'acqua del mash. */
async function storeValue(batch: Row, key: string, v: number | null): Promise<{ data?: Row; error?: { message: string } | null }> {
  if (key === LACTIC) {
    const { data: rows } = await supabase.from("water_adjustments").select("id").eq("batch_id", batch.id).ilike("additive", "acido lattico%").eq("target", "mash").limit(1);
    const id = rows?.[0]?.id;
    const r = v == null || v === 0
      ? (id ? await supabase.from("water_adjustments").delete().eq("id", id) : { error: null })
      : id ? await supabase.from("water_adjustments").update({ amount: v, unit: "g" }).eq("id", id)
        : await supabase.from("water_adjustments").insert({ batch_id: batch.id, additive: LACTIC_NAME, amount: v, unit: "g", target: "mash" });
    return { error: r.error };
  }
  const patch: Row = { [key]: v };
  if (key === "water_ph_adjusted" && v != null && (batch.mash_ph == null || batch.mash_ph === "")) patch.mash_ph = v;
  const { data, error } = await supabase.from("batches").update(patch).eq("id", batch.id).select().single();
  return { data: data ?? undefined, error };
}

function BigField({ f, batch, canEdit, onSaved, suggest, accept }: { f: Field; batch: Row; canEdit: boolean; onSaved: (b: Row) => void; suggest?: number | null; accept?: boolean }) {
  const flushers = useContext(FlushCtx);
  const empty = batch[f.key] == null || batch[f.key] === "";
  const proposed = empty && suggest != null;   // valore proposto dall'app: vale se non lo tocchi
  const [text, setText] = useState(show(empty ? suggest : batch[f.key], f.kind));
  const [state, setState] = useState<"" | "saving" | "ok" | "err">("");
  const [err, setErr] = useState("");
  // i − e + cambiano solo il numero sullo schermo (subito): si salva tutto alla fine,
  // con «Salva e chiudi» o uscendo dalla pagina
  const pending = useRef(false);
  const [dirty, setDirtyState] = useState(false);
  const setDirty = (d: boolean) => { pending.current = d; setDirtyState(d); };
  useEffect(() => { if (!pending.current) setText(show(empty ? suggest : batch[f.key], f.kind)); }, [batch[f.key], suggest]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async (v: number | null) => {
    setDirty(false);
    setState("saving");
    const { data, error } = await storeValue(batch, f.key, v);
    if (error) { setState("err"); setErr(errMsg(error)); setDirty(true); return; }
    setState("ok"); if (data) onSaved(data);
    window.setTimeout(() => setState((s) => (s === "ok" ? "" : s)), 1500);
  };
  const schedule = (raw: string) => { setText(raw); setDirty(true); };
  const bump = (dir: 1 | -1) => {
    const cur = parseValue(textRef.current, f.kind) ?? (f.kind === "sg" ? 1.05 : f.kind === "ph" ? 5.4 : 0);
    const next = Math.max(0, Math.round((cur + dir * STEP[f.kind]) * 1000) / 1000);
    const s = show(next, f.kind);
    textRef.current = s; setText(s); setDirty(true);
  };
  const textRef = useRef(text); textRef.current = text;
  useEffect(() => {
    const flush = async () => {
      // «Salva e chiudi»: i valori proposti non toccati vengono salvati (solo per le fasi già fatte)
      if (!pending.current && proposed && accept) { await save(suggest!); return; }
      if (!pending.current) return;
      await save(parseValue(textRef.current, f.kind));
    };
    flushers.add(flush);
    return () => { flushers.delete(flush); };
  }); // eslint-disable-line react-hooks/exhaustive-deps
  // uscendo dalla pagina (indietro, altra scheda) salvo quello che è rimasto in sospeso
  const savedRef = useRef(onSaved); savedRef.current = onSaved;
  useEffect(() => () => {
    if (pending.current) void storeValue(batch, f.key, parseValue(textRef.current, f.kind)).then((r) => { if (r.data) savedRef.current(r.data); });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const v = parseValue(text, f.kind);
  const warn = f.key === "mash_ph" && v != null && (v < 5.2 || v > 5.6);

  return (
    <div className={"big-field" + (state === "ok" ? " saved" : "") + (dirty ? " dirty" : "") + (warn ? " warn" : "") + (proposed && !dirty ? " proposed" : "")}>
      <div className="bf-head">
        <span>{f.label}</span>
        {proposed && state === "" && <span className="bf-prop" title="Valore proposto dall'app: se non lo cambi viene salvato con «Salva e chiudi»">proposto</span>}
        {dirty && state === "" && <span className="bf-dirty">da salvare</span>}
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
              onBlur={() => { if (pending.current) setText(show(parseValue(text, f.kind), f.kind)); }} />
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

/** Fasi (gruppi di dati) di ogni passaggio del batch. */
const STEP_PHASES: Record<string, string[]> = {
  cotta: ["Acqua", "Correzione acqua del mash", "Mash", "Sparge", "Fine bollitura", "Consumi della cotta"],
  fermentazione: ["Fermentazione"],
  imbottigliato: ["Imbottigliamento"],
};
const STEP_TITLE: Record<string, string> = { cotta: "Dati della cotta", fermentazione: "Dati della fermentazione", imbottigliato: "Dati dell'imbottigliamento", degustato: "Degustazione", esaurito: "Esaurita" };

/** Inserimento dei dati del passaggio scelto, pensato per il telefono. */
export function QuickEntry({ batch: rawBatch, recipe, canEdit, onSaved, onDelete, step = "cotta", onAfterSave }: { batch: Row; recipe?: Row | null; canEdit: boolean; onSaved: (b: Row) => void; onDelete?: () => void; step?: string; onAfterSave?: () => void }) {
  // acido lattico del mash (dalle correzioni dell'acqua), mostrato come un campo del batch
  const [lactic, setLactic] = useState<number | null>(null);
  const [lacticKey, setLacticKey] = useState(0);
  useEffect(() => {
    supabase.from("water_adjustments").select("amount").eq("batch_id", rawBatch.id).ilike("additive", "acido lattico%").eq("target", "mash").limit(1)
      .then(({ data }) => setLactic(data?.[0]?.amount != null ? Number(data[0].amount) : null));
  }, [rawBatch.id, lacticKey]);
  const batch: Row = { ...rawBatch, [LACTIC]: lactic };
  const sug = suggestions(batch, recipe ?? undefined);
  const reached = phasesReached(batch);
  const { profiles } = useAuth();
  const phases = PHASES.filter((p) => (STEP_PHASES[step] ?? []).includes(p.title));
  // la cotta ha tante fasi: si aprono una alla volta; le altre sono già aperte
  const [open, setOpen] = useState<Set<string>>(() => new Set(step === "cotta" ? [] : STEP_PHASES[step] ?? []));
  useEffect(() => { setOpen(new Set(step === "cotta" ? [] : STEP_PHASES[step] ?? [])); }, [step]);
  const rootRef = useRef<HTMLDivElement>(null);
  const toggle = (t: string) => setOpen((o) => { const n = new Set(o); if (n.has(t)) n.delete(t); else n.add(t); return n; });
  const flushers = useRef(new Set<() => Promise<void>>()).current;
  const [saveMsg, setSaveMsg] = useState("");
  // app chiusa o messa in secondo piano sul telefono: salvo quello che è in sospeso
  useEffect(() => {
    const onHide = () => { if (document.visibilityState === "hidden") [...flushers].forEach((fn) => void fn()); };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onHide);
    return () => { document.removeEventListener("visibilitychange", onHide); window.removeEventListener("pagehide", onHide); };
  }, [flushers]);
  const saveAll = async () => {
    setSaveMsg("Salvo…");
    (document.activeElement as HTMLElement | null)?.blur?.();
    await Promise.all([...flushers].map((fn) => fn()));
    const { data } = await supabase.from("batches").select("*").eq("id", batch.id).single();
    if (data) onSaved(data);
    setLacticKey((x) => x + 1);
    setSaveMsg("✓ Tutto salvato");
    if (onAfterSave) window.setTimeout(onAfterSave, 600);   // chiudo il batch e torno all'elenco
    else window.setTimeout(() => setSaveMsg(""), 2500);
  };
  return (
    <FlushCtx.Provider value={flushers}>
    <div className="quick-entry" ref={rootRef}>
      <h2 className="qe-step-title">{STEP_TITLE[step] ?? ""}</h2>
      {step === "degustato" && <p className="muted">Le degustazioni si scrivono in <Link to="/degustazioni">Produzione → Degustazioni</Link>.</p>}
      {step === "esaurita" || step === "esaurito" ? <p className="muted">La birra è finita: non c'è più in nessuna cantina.</p> : null}
      {phases.map((p) => {
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
                  {p.fields.map((f) => <BigField key={f.key} f={f} batch={batch} canEdit={canEdit} onSaved={onSaved} suggest={sug[f.key]} accept={reached.has(p.title)} />)}
                </div>
                {p.title === "Fermentazione" && <QuickEvents batch={batch} canEdit={canEdit} />}
                {p.title === "Imbottigliamento" && <BottleSplit bottles={batch.bottles_count} people={profiles} batchId={batch.id} />}
                {p.title === "Imbottigliamento" && <CapPicker batch={batch} canEdit={canEdit} onSaved={onSaved} />}
                {p.title === "Imbottigliamento" && <BottleCalc batch={batch} canEdit={canEdit} onSaved={onSaved} />}
              </>
            )}
          </section>
        );
      })}
      {batch.abv != null && <p className="qe-abv">🍺 Grado alcolico: <strong>{num(batch.abv, 1)}% vol</strong></p>}
      {canEdit && (
        <div className="qe-bottom">
          <button className="big-action primary" onClick={saveAll}><Save size={20} /> {saveMsg || "Salva e chiudi"}</button>
          {onDelete && <button className="big-action danger" onClick={onDelete}><Trash2 size={20} /> Elimina batch</button>}
        </div>
      )}
    </div>
    </FlushCtx.Provider>
  );
}

/** Fasi già fatte in base allo stato: i valori proposti di queste fasi vengono salvati con «Salva e chiudi». */
function phasesReached(b: Row): Set<string> {
  const st = b.status ?? "pianificato";
  const brewed = st !== "pianificato" || Boolean(b.brew_date);
  const fermented = ["maturazione", "imbottigliato", "degustato", "finito", "esaurito"].includes(st) || Boolean(b.bottling_date);   // FG: a fermentazione finita
  const bottled = ["imbottigliato", "degustato", "finito", "esaurito"].includes(st) || Boolean(b.bottling_date);
  const out = new Set<string>();
  if (brewed) ["Acqua", "Mash", "Sparge", "Fine bollitura", "Consumi della cotta"].forEach((x) => out.add(x));   // la correzione non ha valori proposti
  if (fermented) out.add("Fermentazione");
  if (bottled) out.add("Imbottigliamento");
  return out;
}

/** Valori proposti per i campi vuoti del batch (dalla ricetta e da calcoli standard). */
function suggestions(b: Row, r?: Row): Record<string, number | null> {
  const n = (x: unknown) => (x == null || x === "" ? null : Number(x));
  const fermL = n(b.volume_fermenter_l) ?? n(r?.batch_size_l);
  const bottledL = n(b.volume_bottled_l) ?? (fermL != null ? Math.max(0, Math.round((fermL - 1) * 2) / 2) : null);   // ~1 L resta sul fondo
  const style = String(r?.style ?? "").toLowerCase();
  // CO₂: dalla ricetta se c'è, altrimenti la media dello stile, altrimenti 2,5
  const co2 = n(b.target_co2_vol) ?? recipeCo2(r)?.value ?? (/weiss|weizen|blanche|wit|saison|tripel/.test(style) ? 3 : 2.5);
  return {
    mash_water_l: n(r?.mash_water_l), sparge_water_l: n(r?.sparge_water_l),
    water_ph_initial: 7.5, water_ph_adjusted: 5.5, mash_ph: n(b.water_ph_adjusted) ?? 5.5,
    original_gravity: n(r?.target_og), volume_fermenter_l: n(r?.batch_size_l),
    final_gravity: n(r?.target_fg),
    volume_bottled_l: bottledL,
    bottles_count: bottledL != null ? Math.floor(((n(b.volume_bottled_l) ?? bottledL) as number) / 0.66) : null,
    target_co2_vol: co2,
    priming_sugar_g: bottledL != null ? Math.round(primingGrams(n(b.volume_bottled_l) ?? bottledL, co2, 20, "saccarosio")) : null,
    // consumi: niente valori proposti, li scrivete voi (nei costi, se mancano, resta la stima segnata come «stimato»)
  };
}
