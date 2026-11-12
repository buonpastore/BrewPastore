import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase, date, sg, eur, errMsg, STATUS_LABELS, type Row } from "../lib";
import { useAuth } from "../auth";
import { deleteBatches } from "../deleteHelpers";

export function Batches() {
  const { isAdmin } = useAuth();
  const remove = async (b: Row) => {
    if (!confirm(`Eliminare il batch «${b.code}» con tutti i suoi dati (log, diario, costi, degustazioni)?`)) return;
    try { await deleteBatches([b.id]); setRows((r) => r.filter((x) => x.id !== b.id)); } catch (e) { alert(errMsg(e)); }
  };
  const [rows, setRows] = useState<Row[]>([]);
  const [costs, setCosts] = useState<Record<string, Row>>({});
  const [status, setStatus] = useState("");

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
        <span className="muted small">Per creare un batch apri una ricetta e premi "Nuovo batch".</span>
      </div>
      <div className="toolbar">
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Tutti gli stati</option>
          {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Batch</th><th>Ricetta</th><th>Stato</th><th>Cotta</th><th>Imbottigliata</th><th>OG → FG</th><th>ABV</th><th>Bottiglie</th><th>€/bottiglia</th>{isAdmin && <th />}</tr></thead>
          <tbody>
            {list.map((b) => {
              const c = costs[b.id];
              const total = c ? c.ingredients_cost + c.extra_cost + c.energy_cost + c.water_cost : null;
              return (
                <tr key={b.id}>
                  <td><Link to={`/batch/${b.id}`}>{b.code}</Link></td>
                  <td>{b.recipes?.name}</td>
                  <td><span className={"badge st-" + b.status}>{STATUS_LABELS[b.status]}</span></td>
                  <td>{date(b.brew_date)}</td>
                  <td>{date(b.bottling_date)}</td>
                  <td>{sg(b.original_gravity)} → {sg(b.final_gravity)}</td>
                  <td>{b.abv != null ? `${b.abv}%` : "—"}</td>
                  <td>{b.bottles_count ?? "—"}</td>
                  <td>{total != null && b.bottles_count ? eur(total / b.bottles_count) : "—"}</td>
                  {isAdmin && <td><button className="icon" title="Elimina batch" onClick={() => remove(b)}>🗑️</button></td>}
                </tr>
              );
            })}
            {!list.length && <tr><td colSpan={9} className="muted">Nessun batch.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
