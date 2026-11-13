import { Beer } from "lucide-react";
import { CapDot } from "../components/CapColor";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase, date, sg, eur, errMsg, STATUS_LABELS, type Row } from "../lib";
import { useAuth } from "../auth";
import { deleteBatches } from "../deleteHelpers";
import { createBatchFromRecipe } from "../newBatch";
import { lastStep } from "../components/PreviousBatches";

export function Batches() {
  const { isAdmin } = useAuth();
  const nav = useNavigate();
  const [choose, setChoose] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState(false);
  const startNew = async () => {
    const { data } = await supabase.from("recipes").select("*, batches(id, code, status, brew_date, fermentation_start, bottling_date, first_tasting_date, created_at)").eq("archived", false).order("name");
    const recipes = data ?? [];
    if (!recipes.length) return alert("Prima crea o importa una ricetta: il batch nasce da una ricetta.");
    if (recipes.length === 1) return create(recipes[0]);   // una sola ricetta: la prendo da solo
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
  const [view, setViewState] = useState<"compatta" | "estesa">(() => { try { return localStorage.getItem("bp-batch-vista") === "estesa" ? "estesa" : "compatta"; } catch { return "compatta"; } });
  const setView = (v: "compatta" | "estesa") => { setViewState(v); try { localStorage.setItem("bp-batch-vista", v); } catch { /* niente */ } };
  const full = view === "estesa";

  useEffect(() => {
    supabase.from("batches").select("*, recipes(name)").order("brew_date", { ascending: false, nullsFirst: true })
      .then(({ data }) => setRows(data ?? []));
    supabase.from("batch_cost_summary").select("*").then(({ data }) =>
      setCosts(Object.fromEntries((data ?? []).map((c) => [c.batch_id, c]))));
  }, []);

  const list = rows.filter((r) => !status || r.status === status);
  return (
    <div>
      <div className="page-head">
        <h1>Batch</h1>
      </div>
      {isAdmin && <button className="btn primary btn-wide" disabled={busy} onClick={startNew}>{busy ? "Creo…" : <><Beer size={20} /> Nuovo batch</>}</button>}
      <div className="view-switch" role="group" aria-label="Visualizzazione">
        <button className={"mini-btn" + (!full ? " on" : "")} onClick={() => setView("compatta")}>☰ <span>Compatta</span></button>
        <button className={"mini-btn" + (full ? " on" : "")} onClick={() => setView("estesa")}>▦ <span>Estesa</span></button>
      </div>
      <div className="toolbar">
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Tutti gli stati</option>
          {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
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
                  <td><span className={"badge st-" + b.status}>{STATUS_LABELS[b.status]}</span></td>
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
                  ) : <td className="nowrap small">{date(b.bottling_date ?? b.fermentation_start ?? b.brew_date)}</td>}
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
              {choose.map((r) => (
                <div key={r.id} role="button" tabIndex={0} className={"recipe-pick-btn" + (busy ? " busy" : "")}
                  onClick={() => !busy && create(r)} onKeyDown={(e) => { if (e.key === "Enter" && !busy) create(r); }}>
                  <div className="rp-name">{r.name}</div>
                  <div className="muted small">{[r.style, r.batch_size_l && `${String(r.batch_size_l).replace(".", ",")} L`].filter(Boolean).join(" · ")}</div>
                  {/* solo i batch ancora in corso: quelli finiti non servono */}
                  {((r.batches ?? []) as Row[]).filter((b) => b.status !== "finito").map((b) => (
                    <div key={b.id} className="rp-batch">
                      <span className={"badge st-" + b.status}>{STATUS_LABELS[b.status] ?? b.status}</span>
                      <span className="small">{b.code}</span>
                      <span className="muted small">{lastStep(b)}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
            <button className="btn" style={{ width: "100%", marginTop: 10 }} onClick={() => setChoose(null)}>Annulla</button>
          </div>
        </div>
      )}
    </div>
  );
}
