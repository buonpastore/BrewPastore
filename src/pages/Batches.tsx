import { ViewToggle } from "../components/ViewToggle";
import { Beer } from "lucide-react";
import { CapDot } from "../components/CapColor";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase, date, sg, eur, errMsg, STATUS_NOW, isEnded, normStatus, statusLabel, type Row } from "../lib";
import { useAuth } from "../auth";
import { deleteBatches } from "../deleteHelpers";
import { createBatchFromRecipe } from "../newBatch";
import { lastStep } from "../components/PreviousBatches";

export function Batches() {
  const { isAdmin } = useAuth();
  const nav = useNavigate();
  const [choose, setChoose] = useState<Row[] | null>(null);
  const [showDone, setShowDone] = useState(false);
  // ricetta chiusa = tutti i suoi batch sono esauriti: non la propongo, salvo richiesta
  const isDone = (r: Row) => ((r.batches ?? []) as Row[]).length > 0 && ((r.batches ?? []) as Row[]).every((b) => isEnded(b.status));
  const [busy, setBusy] = useState(false);
  const startNew = async () => {
    const { data } = await supabase.from("recipes").select("*, batches(id, code, status, brew_date, fermentation_start, bottling_date, first_tasting_date, created_at)").eq("archived", false).order("created_at", { ascending: false });
    const recipes = data ?? [];
    if (!recipes.length) return alert("Prima crea o importa una ricetta: il batch nasce da una ricetta.");
    const open = recipes.filter((x) => !isDone(x));
    if (open.length === 1 && recipes.length === 1) return create(open[0]);   // una sola ricetta: la prendo da solo
    setShowDone(false);
    setChoose(recipes);
  };
  const create = async (r: Row) => {
    setBusy(true);
    try { const bid = await createBatchFromRecipe(r); nav(`/batch/${bid}?nuovo=1`); }
    catch (e) { alert(errMsg(e)); setBusy(false); }
  };
  const remove = async (b: Row) => {
    if (!confirm(`Eliminare il batch «${b.code}» con tutti i suoi dati (log, diario, costi, degustazioni)?`)) return;
    try { await deleteBatches([b.id]); setRows((r) => r.filter((x) => x.id !== b.id)); } catch (e) { alert(errMsg(e)); }
  };
  const [rows, setRows] = useState<Row[]>([]);
  const [costs, setCosts] = useState<Record<string, Row>>({});
  const [status, setStatus] = useState("");
  const [lastLog, setLastLog] = useState<Record<string, string>>({});
  const [view, setViewState] = useState<"compatta" | "estesa">(() => { try { return localStorage.getItem("bp-batch-vista") === "estesa" ? "estesa" : "compatta"; } catch { return "compatta"; } });
  const setView = (v: "compatta" | "estesa") => { setViewState(v); try { localStorage.setItem("bp-batch-vista", v); } catch { /* niente */ } };
  const full = view === "estesa";

  useEffect(() => {
    supabase.from("batches").select("*, recipes(name)").order("brew_date", { ascending: false, nullsFirst: true }).order("created_at", { ascending: false })
      .then(({ data }) => setRows(data ?? []));
    // ultima voce del log di ogni batch (misure, note…): conta anche quella per la data più recente
    supabase.from("batch_events").select("batch_id, event_at").then(({ data }) => {
      const m: Record<string, string> = {};
      for (const e of data ?? []) { const d = String(e.event_at ?? "").slice(0, 10); if (d && (!m[e.batch_id] || d > m[e.batch_id])) m[e.batch_id] = d; }
      setLastLog(m);
    });
    supabase.from("batch_cost_summary").select("*").then(({ data }) =>
      setCosts(Object.fromEntries((data ?? []).map((c) => [c.batch_id, c]))));
  }, []);

  // data più recente del batch: l'ultima tra cotta, fermentazione, imbottigliamento, degustazione, esaurita e log
  const lastDate = (b: Row): string | null => [b.brew_date, b.fermentation_start, b.bottling_date, b.first_tasting_date, b.depleted_date, lastLog[b.id]]
    .filter(Boolean).map((d) => String(d).slice(0, 10)).sort().pop() ?? null;
  // dalla più recente; quelli senza date (non ancora cotti) in cima
  const list = rows.filter((r) => !status || normStatus(r.status) === status)
    .sort((a, b) => { const x = lastDate(a), y = lastDate(b); return x === y ? 0 : !x ? -1 : !y ? 1 : y.localeCompare(x); });
  return (
    <div>
      <div className="page-head head-with-toggle">
        <h1>Batch</h1>
        <ViewToggle value={full ? "estesa" : "compatta"} onChange={setView} />
      </div>
      {isAdmin && <button className="btn primary btn-wide" disabled={busy} onClick={startNew}>{busy ? "Creo…" : <><Beer size={20} /> Nuovo batch</>}</button>}
      <div className="toolbar">
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Tutti gli stati</option>
          {Object.entries(STATUS_NOW).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>
      <div className="table-wrap">
        <table className={"batch-list" + (full ? "" : " compact")}>
          <thead><tr><th>Batch</th><th>Stato</th>{full ? <><th>Cotta</th><th>Imbottigliata</th><th>OG → FG</th><th>ABV</th><th>Bottiglie</th><th>€/bott.</th>{isAdmin && <th />}</> : <th>Data</th>}</tr></thead>
          <tbody>
            {list.map((b) => {
              const c = costs[b.id];
              const total = c ? c.ingredients_cost + c.extra_cost + c.energy_cost + c.water_cost : null;
              return (
                <tr key={b.id}>
                  <td className="bl-name">
                    <Link to={`/batch/${b.id}`}><strong>{b.code}</strong></Link> <CapDot color={b.cap_color} size={14} />
                    {b.recipes?.name && <div className="muted small">{b.recipes.name}</div>}
                  </td>
                  <td><span className={"badge st-" + normStatus(b.status)}>{statusLabel(b.status)}</span></td>
                  {full ? (
                    <>
                      <td className="nowrap">{date(b.brew_date)}</td>
                      <td className="nowrap">{date(b.bottling_date)}</td>
                      <td className="nowrap">{sg(b.original_gravity)} → {sg(b.final_gravity)}</td>
                      <td className="nowrap">{b.abv != null ? `${b.abv}%` : "—"}</td>
                      <td>{b.bottles_count ?? "—"}</td>
                      <td className="nowrap">{total != null && b.bottles_count ? eur(total / b.bottles_count) : "—"}</td>
                      {isAdmin && <td><button className="icon" title="Elimina batch" onClick={() => remove(b)}>🗑️</button></td>}
                    </>
                  ) : <td className="nowrap small">{date(lastDate(b))}</td>}
                </tr>
              );
            })}
            {!list.length && <tr><td colSpan={10} className="muted">Nessun batch.</td></tr>}
          </tbody>
        </table>
      </div>
      {choose && (
        <div className="modal-backdrop" onClick={() => setChoose(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>🍺 Nuovo batch: quale ricetta?</h2>
            <div className="recipe-pick">
              {choose.filter((x) => showDone || !isDone(x)).length === 0 && <p className="muted">Tutte le birre sono finite: tocca «Mostra anche le birre finite» per rifarne una.</p>}
              {choose.filter((x) => showDone || !isDone(x)).map((r) => (
                <div key={r.id} role="button" tabIndex={0} className={"recipe-pick-btn" + (busy ? " busy" : "")}
                  onClick={() => !busy && create(r)} onKeyDown={(e) => { if (e.key === "Enter" && !busy) create(r); }}>
                  <div className="rp-name">{r.name}</div>
                  <div className="muted small">{[r.style, r.batch_size_l && `${String(r.batch_size_l).replace(".", ",")} L`].filter(Boolean).join(" · ")}</div>
                  {/* solo i batch ancora in corso: quelli finiti non servono */}
                  {((r.batches ?? []) as Row[]).filter((b) => !isEnded(b.status)).map((b) => (
                    <div key={b.id} className="rp-batch">
                      <span className={"badge st-" + normStatus(b.status)}>{statusLabel(b.status)}</span>
                      <span className="small">{b.code}</span>
                      <span className="muted small">{lastStep(b)}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
            {choose.some(isDone) && (
              <button className="btn" style={{ width: "100%", marginTop: 10 }} onClick={() => setShowDone(!showDone)}>
                {showDone ? "Nascondi le birre finite" : `Mostra anche le birre finite (${choose.filter(isDone).length})`}
              </button>
            )}
            <button className="btn" style={{ width: "100%", marginTop: 10 }} onClick={() => setChoose(null)}>Annulla</button>
          </div>
        </div>
      )}
    </div>
  );
}
