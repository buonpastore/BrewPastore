import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Star } from "lucide-react";
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
    supabase.from("batches").select("id, code, status, recipes(name)").order("brew_date", { ascending: false, nullsFirst: false })
      .then(({ data }) => setBatches(data ?? []));
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
      <div className="toolbar">
        {!batchId && (
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="">Tutti i batch</option>
            {batches.map((b) => <option key={b.id} value={b.id}>{b.code} — {b.recipes?.name}</option>)}
          </select>
        )}
        <button className="btn primary" onClick={() => setEditing({ batch_id: filter || batches[0]?.id || "", rating: 0, tasted_on: new Date().toISOString().slice(0, 10) })}>
          🍺 Nuova degustazione
        </button>
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

function TastingForm({ initial, batches, lockBatch, onClose, onSaved }: { initial: Row; batches: Row[]; lockBatch: boolean; onClose: () => void; onSaved: () => void }) {
  const [t, setT] = useState<Row>(initial);
  const [error, setError] = useState("");
  const set = (k: string, v: unknown) => setT((x) => ({ ...x, [k]: v }));

  const save = async (e: React.FormEvent) => {
    e.preventDefault(); setError("");
    if (!t.batch_id) return setError("Scegli il batch");
    if (!t.rating) return setError("Dai un voto da 1 a 5 stelle");
    const rec = {
      batch_id: t.batch_id, tasted_on: t.tasted_on, rating: t.rating, serving_temp_c: t.serving_temp_c === "" || t.serving_temp_c == null ? null : Number(t.serving_temp_c),
      would_brew_again: t.would_brew_again ?? null,
      ...Object.fromEntries(FIELDS.map(([k]) => [k, t[k] || null])),
    };
    const res = t.id ? await supabase.from("tastings").update(rec).eq("id", t.id) : await supabase.from("tastings").insert(rec);
    if (res.error) return setError(errMsg(res.error));
    onSaved(); onClose();
  };

  return (
    <div className="modal-backdrop">
      <form className="modal" onSubmit={save}>
        <h2>{t.id ? "Modifica degustazione" : "Nuova degustazione"}</h2>
        <div className="form-grid">
          <label className="wide"><span>Batch</span>
            <select value={t.batch_id} disabled={lockBatch} onChange={(e) => set("batch_id", e.target.value)}>
              {batches.map((b) => <option key={b.id} value={b.id}>{b.code} — {b.recipes?.name}</option>)}
            </select>
          </label>
          <label><span>Data</span><input type="date" value={t.tasted_on ?? ""} onChange={(e) => set("tasted_on", e.target.value)} /></label>
          <label><span>Temperatura di servizio °C</span><input type="number" step="0.5" value={t.serving_temp_c ?? ""} onChange={(e) => set("serving_temp_c", e.target.value)} /></label>
        </div>
        <div className="rating-row">
          <span>Voto complessivo</span>
          <Stars value={t.rating ?? 0} onChange={(v) => set("rating", v)} size={30} />
        </div>
        {FIELDS.map(([k, label, ph]) => (
          <label key={k} className="block"><span>{label}</span>
            <textarea rows={k === "notes" ? 3 : 2} placeholder={ph} value={t[k] ?? ""} onChange={(e) => set(k, e.target.value)} />
          </label>
        ))}
        <div className="row-actions">
          <span className="muted small">La rifaresti?</span>
          <button type="button" className={"btn small" + (t.would_brew_again === true ? " primary" : "")} onClick={() => set("would_brew_again", t.would_brew_again === true ? null : true)}>👍 Sì</button>
          <button type="button" className={"btn small" + (t.would_brew_again === false ? " primary" : "")} onClick={() => set("would_brew_again", t.would_brew_again === false ? null : false)}>👎 Cambierei qualcosa</button>
        </div>
        {error && <p className="error">{error}</p>}
        <div className="row-actions">
          <button className="btn primary">Salva</button>
          <button type="button" className="btn" onClick={onClose}>Annulla</button>
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
