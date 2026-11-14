import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Star, Minus, Plus } from "lucide-react";
import { CapDot } from "../components/CapColor";
import { supabase, errMsg, date, type Row } from "../lib";
import { useAuth } from "../auth";

export function Stars({ value, onChange, size = 20 }: { value: number; onChange?: (v: number) => void; size?: number }) {
  return (
    <span className="stars" role={onChange ? "radiogroup" : undefined} aria-label={`${value} su 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" disabled={!onChange} onClick={() => onChange?.(n)} aria-label={`${n} stelle`}
          className={n <= value ? "on" : ""}>
          <Star size={size} fill={n <= value ? "currentColor" : "none"} />
        </button>
      ))}
    </span>
  );
}

const FIELDS: [string, string, string][] = [
  ["appearance", "Aspetto", "colore, limpidezza, schiuma"],
  ["aroma", "Aroma", "luppolo, malto, frutta, difetti…"],
  ["flavor", "Gusto", "dolce/amaro, retrogusto"],
  ["mouthfeel", "Corpo e bollicine", "leggera/piena, carbonazione"],
  ["notes", "Note generali", "abbinamenti, cosa cambiare…"],
];

/** Elenco e inserimento degustazioni. Con batchId mostra solo quel batch (scheda nel batch). */
export function TastingsPanel({ batchId }: { batchId?: string }) {
  const { session, nameOf, isAdmin } = useAuth();
  const me = session!.user.id;
  const [rows, setRows] = useState<Row[]>([]);
  const [batches, setBatches] = useState<Row[]>([]);
  const [summary, setSummary] = useState<Row[]>([]);
  const [filter, setFilter] = useState(batchId ?? "");
  const [editing, setEditing] = useState<Row | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let q = supabase.from("tastings").select("*, batches(code, recipes(name))").order("tasted_on", { ascending: false }).order("created_at", { ascending: false });
    if (filter) q = q.eq("batch_id", filter);
    q.then(({ data }) => setRows(data ?? []));
    supabase.from("tasting_summary").select("*").then(({ data }) => setSummary(data ?? []));
  }, [filter, reload]);
  useEffect(() => {
    // si degustano solo le birre imbottigliate
    supabase.from("batches").select("id, code, status, bottling_date, bottles_count, cap_color, recipes(name, style)").order("brew_date", { ascending: false, nullsFirst: false })
      .then(({ data }) => setBatches((data ?? []).filter((b) => b.bottling_date || b.bottles_count || b.status === "imbottigliato" || b.status === "finito")));
  }, []);

  const remove = async (t: Row) => {
    if (!confirm("Eliminare questa degustazione?")) return;
    const { error } = await supabase.from("tastings").delete().eq("id", t.id);
    if (error) return alert(errMsg(error));
    setReload((x) => x + 1);
  };

  const sum = filter ? summary.find((s) => s.batch_id === filter) : null;
  const ranked = summary.filter((s) => s.tastings_count > 0).sort((a, b) => b.avg_rating - a.avg_rating);

  return (
    <div>
      {(() => {
        const ok = batchId ? batches.some((b) => b.id === batchId) : batches.length > 0;
        return ok ? (
          <button className="btn primary btn-wide" onClick={() => setEditing({ batch_id: (filter && batches.some((b) => b.id === filter) ? filter : batches[0]?.id) || "", rating: 0, serving_temp_c: 4, tasted_on: new Date().toISOString().slice(0, 10) })}>
            <Star size={20} /> Nuova degustazione
          </button>
        ) : (
          <p className="muted tasting-wait">🍾 {batchId ? "Questa birra non è ancora imbottigliata: la degustazione si potrà fare dopo l'imbottigliamento." : "Nessuna birra imbottigliata da degustare: si degustano solo le birre già in bottiglia."}</p>
        );
      })()}
      <div className="toolbar">
        {!batchId && (
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="">Tutti i batch</option>
            {batches.map((b) => <option key={b.id} value={b.id}>{b.code} — {b.recipes?.name}</option>)}
          </select>
        )}
        {sum && sum.tastings_count > 0 && (
          <span className="tasting-avg"><Stars value={Math.round(sum.avg_rating)} size={18} /> <strong>{Number(sum.avg_rating).toLocaleString("it-IT")}</strong> <span className="muted">media di {sum.tastings_count}</span></span>
        )}
      </div>

      {!batchId && !filter && ranked.length > 0 && (
        <div className="panel">
          <h2>🏆 Classifica dei batch</h2>
          <ul className="plain">
            {ranked.slice(0, 5).map((s, i) => (
              <li key={s.batch_id}>
                <span className="rank">{i + 1}</span>
                <button className="link" onClick={() => setFilter(s.batch_id)}>{s.code}</button>
                <Stars value={Math.round(s.avg_rating)} size={16} />
                <strong>{Number(s.avg_rating).toLocaleString("it-IT")}</strong>
                <span className="muted small">({s.tastings_count} {s.tastings_count === 1 ? "voto" : "voti"})</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="tasting-list">
        {rows.map((t) => (
          <article key={t.id} className="tasting">
            <header>
              <div>
                <strong>{nameOf(t.user_id)}</strong>
                {!batchId && <> · <Link to={`/batch/${t.batch_id}`}>{t.batches?.code}</Link> <span className="muted small">{t.batches?.recipes?.name}</span></>}
                <div className="muted small">{date(t.tasted_on)}{t.serving_temp_c != null && ` · servita a ${t.serving_temp_c} °C`}</div>
              </div>
              <Stars value={t.rating} size={18} />
            </header>
            <dl>
              {FIELDS.filter(([k]) => t[k]).map(([k, label]) => (
                <div key={k}><dt>{label}</dt><dd className="pre">{t[k]}</dd></div>
              ))}
            </dl>
            {t.would_brew_again != null && <p className="small">{t.would_brew_again ? "👍 La rifarei" : "👎 Non la rifarei così"}</p>}
            {(t.user_id === me || isAdmin) && (
              <div className="row-actions">
                {t.user_id === me && <button className="btn small" onClick={() => setEditing(t)}>Modifica</button>}
                <button className="btn small danger" onClick={() => remove(t)}>Elimina</button>
              </div>
            )}
          </article>
        ))}
        {!rows.length && <p className="muted">Nessuna degustazione ancora. Apri una bottiglia e lascia il tuo voto! 🍻</p>}
      </div>

      {editing && <TastingForm initial={editing} batches={batches} lockBatch={Boolean(batchId)} onClose={() => setEditing(null)} onSaved={() => setReload((x) => x + 1)} />}
    </div>
  );
}

/** Caratteristiche a scelta rapida (3–4 opzioni, oppure «Altro» da scrivere). */
const CHOICES: { key: string; label: string; options: string[] }[] = [
  { key: "appearance", label: "Aspetto", options: ["Limpida", "Velata", "Torbida"] },
  { key: "aroma", label: "Aroma", options: ["Luppolato", "Maltato", "Fruttato", "Speziato"] },
  { key: "flavor", label: "Gusto", options: ["Secco", "Equilibrato", "Dolce", "Amaro"] },
  { key: "body", label: "Corpo", options: ["Leggero", "Medio", "Pieno"] },
  { key: "fizz", label: "Bollicine", options: ["Poche", "Giuste", "Tante"] },
];

function Choice({ label, options, value, onChange }: { label: string; options: string[]; value: string; onChange: (v: string) => void }) {
  const other = value !== "" && !options.includes(value);
  const [otherOn, setOtherOn] = useState(other);
  return (
    <div className="tc-choice">
      <span className="nb-label">{label}</span>
      <div className="tc-opts grid" style={{ ["--n" as string]: options.length }}>
        {options.map((o) => <button key={o} type="button" className={"tc-opt" + (value === o ? " on" : "")} onClick={() => { setOtherOn(false); onChange(value === o ? "" : o); }}>{o}</button>)}
      </div>
      <button type="button" className={"tc-other-btn" + (otherOn || other ? " on" : "")} onClick={() => { setOtherOn(!otherOn); if (otherOn) onChange(""); }}>✎ altro…</button>
      {(otherOn || other) && <input className="tc-other" autoFocus={otherOn && !other} value={other ? value : ""} placeholder="scrivi tu" onChange={(e) => onChange(e.target.value)} />}
    </div>
  );
}

function TastingForm({ initial, batches, lockBatch, onClose, onSaved }: { initial: Row; batches: Row[]; lockBatch: boolean; onClose: () => void; onSaved: () => void }) {
  // corpo e bollicine sono salvati insieme in «mouthfeel» («Corpo medio · bollicine giuste»)
  const mf = String(initial.mouthfeel ?? "");
  const mBody = mf.match(/Corpo (\w+)/i)?.[1], mFizz = mf.match(/bollicine (\w+)/i)?.[1];
  const cap = (x?: string) => (x ? x.charAt(0).toUpperCase() + x.slice(1) : "");
  const [t, setT] = useState<Row>({ serving_temp_c: 4, ...initial, body: cap(mBody) || (mf && !mBody ? mf : ""), fizz: cap(mFizz) });
  const [error, setError] = useState("");
  const set = (k: string, v: unknown) => setT((x) => ({ ...x, [k]: v }));
  const temp = Number(t.serving_temp_c ?? 4);

  const save = async (e: React.FormEvent) => {
    e.preventDefault(); setError("");
    if (!t.batch_id) return setError("Scegli la birra");
    if (!t.rating) return setError("Dai un voto da 1 a 5 stelle");
    const mouthfeel = [t.body && (CHOICES[3].options.includes(t.body) ? `Corpo ${t.body.toLowerCase()}` : t.body), t.fizz && (CHOICES[4].options.includes(t.fizz) ? `bollicine ${t.fizz.toLowerCase()}` : t.fizz)].filter(Boolean).join(" · ");
    const rec = {
      batch_id: t.batch_id, tasted_on: t.tasted_on || new Date().toISOString().slice(0, 10), rating: t.rating, serving_temp_c: temp,
      would_brew_again: t.would_brew_again ?? null,
      appearance: t.appearance || null, aroma: t.aroma || null, flavor: t.flavor || null, mouthfeel: mouthfeel || null, notes: t.notes || null,
    };
    const res = t.id ? await supabase.from("tastings").update(rec).eq("id", t.id) : await supabase.from("tastings").insert(rec);
    if (res.error) return setError(errMsg(res.error));
    onSaved(); onClose();
  };

  return (
    <div className="modal-backdrop">
      <form className="modal tc-form" onSubmit={save}>
        <h2>{t.id ? "Modifica degustazione" : "⭐ Nuova degustazione"}</h2>

        <span className="nb-label">Quale birra</span>
        <div className="tc-beers">
          {batches.filter((b) => !lockBatch || b.id === t.batch_id).map((b) => (
            <button key={b.id} type="button" className={"tc-beer" + (t.batch_id === b.id ? " on" : "")} onClick={() => set("batch_id", b.id)}>
              <CapDot color={b.cap_color} size={20} />
              <span className="tc-beer-txt"><strong>{b.recipes?.name ?? b.code}</strong><span className="muted small">{[b.recipes?.style, b.code].filter(Boolean).join(" · ")}</span></span>
              {t.batch_id === b.id && <span className="tc-check">✓</span>}
            </button>
          ))}
        </div>

        <div className="tc-two">
          <div className="big-field">
            <div className="bf-head"><span>Temperatura</span></div>
            <div className="bf-row">
              <button type="button" className="bf-btn" onClick={() => set("serving_temp_c", Math.max(0, temp - 1))}><Minus size={22} /></button>
              <div className="bf-input"><input inputMode="decimal" value={String(temp).replace(".", ",")} onChange={(e) => set("serving_temp_c", Number(e.target.value.replace(",", ".")) || 0)} /><span className="bf-unit">°C</span></div>
              <button type="button" className="bf-btn" onClick={() => set("serving_temp_c", temp + 1)}><Plus size={22} /></button>
            </div>
          </div>
          <label className="tc-date"><span className="nb-label">Data</span><input type="date" value={t.tasted_on ?? ""} onChange={(e) => set("tasted_on", e.target.value)} /></label>
        </div>

        {CHOICES.map((c) => <Choice key={c.key} label={c.label} options={c.options} value={t[c.key] ?? ""} onChange={(v) => set(c.key, v)} />)}

        <label className="block"><span className="nb-label">Note (facoltative)</span>
          <textarea rows={2} placeholder="abbinamenti, cosa cambiare…" value={t.notes ?? ""} onChange={(e) => set("notes", e.target.value)} /></label>

        <div className="tc-final">
          <span className="nb-label">Valutazione</span>
          <Stars value={t.rating ?? 0} onChange={(v) => set("rating", v)} size={36} />
          <div className="tc-opts">
            <button type="button" className={"tc-opt" + (t.would_brew_again === true ? " on" : "")} onClick={() => set("would_brew_again", t.would_brew_again === true ? null : true)}>👍 La rifarei così</button>
            <button type="button" className={"tc-opt" + (t.would_brew_again === false ? " on" : "")} onClick={() => set("would_brew_again", t.would_brew_again === false ? null : false)}>✏️ Cambierei qualcosa</button>
          </div>
        </div>
        {error && <p className="error">{error}</p>}
        <div className="qe-sheet-btns">
          <button type="button" className="btn" onClick={onClose}>Annulla</button>
          <button className="btn primary">Salva</button>
        </div>
      </form>
    </div>
  );
}

export function Tastings() {
  return (
    <div>
      <div className="page-head"><h1>Degustazioni</h1></div>
      <p className="muted">Ognuno lascia il proprio voto e le proprie note sui batch: qui trovate tutte le degustazioni e la classifica.</p>
      <TastingsPanel />
    </div>
  );
}
