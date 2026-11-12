import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase, errMsg, sg, num, date, type Row } from "../lib";
import { useAuth } from "../auth";
import { ImportRecipe } from "./ImportRecipe";
import { STYLE_OPTIONS } from "../styles-list";

export function Recipes() {
  const { isAdmin } = useAuth();
  const nav = useNavigate();
  const [rows, setRows] = useState<Row[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [q, setQ] = useState("");
  const [style, setStyle] = useState("");
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    supabase.from("recipes").select("*, batches(id, brew_date, status)").order("name")
      .then(({ data }) => setRows(data ?? []));
  }, []);

  const create = async () => {
    const name = prompt("Nome della nuova ricetta");
    if (!name) return;
    const { data, error } = await supabase.from("recipes").insert({ name }).select().single();
    if (error) return alert(errMsg(error));
    nav(`/ricette/${data.id}?edit=1`);
  };

  const list = rows.filter((r) => (showArchived || !r.archived) && (!style || r.style === style) && (r.name + " " + (r.style ?? "")).toLowerCase().includes(q.toLowerCase()));
  const usedStyles = [...new Set(rows.map((r) => r.style).filter(Boolean))] as string[];
  const styleChoices = [...STYLE_OPTIONS.filter((o) => !o.disabled && usedStyles.includes(o.value)).map((o) => o.value), ...usedStyles.filter((s) => !STYLE_OPTIONS.some((o) => o.value === s))];

  return (
    <div>
      <div className="page-head">
        <h1>Ricette</h1>
        {isAdmin && (
          <div className="row-actions">
            <button className="btn" onClick={() => setImporting(true)}>📸 Importa da screenshot</button>
            <button className="btn primary" onClick={create}>+ Nuova ricetta</button>
          </div>
        )}
      </div>
      <div className="toolbar">
        <input placeholder="Cerca…" value={q} onChange={(e) => setQ(e.target.value)} />
        {styleChoices.length > 0 && (
          <select value={style} onChange={(e) => setStyle(e.target.value)}>
            <option value="">Tutti gli stili</option>
            {styleChoices.map((s) => <option key={s}>{s}</option>)}
          </select>
        )}
        <label className="check"><input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> mostra archiviate</label>
      </div>
      {importing && <ImportRecipe onClose={() => setImporting(false)} />}
      <div className="cards">
        {list.map((r) => {
          const last = (r.batches as Row[]).map((b) => b.brew_date).filter(Boolean).sort().pop();
          return (
            <Link key={r.id} to={`/ricette/${r.id}`} className="card">
              <h3>{r.name} {r.archived && <span className="badge">archiviata</span>}</h3>
              <div className="muted">{r.style ?? "—"}</div>
              <div className="stats">
                <span>OG {sg(r.target_og)}</span><span>FG {sg(r.target_fg)}</span>
                <span>IBU {num(r.target_ibu, 0)}</span><span>{num(r.batch_size_l, 1)} L</span>
              </div>
              <div className="muted small">{(r.batches as Row[]).length} batch · ultima cotta {date(last)}</div>
            </Link>
          );
        })}
        {!list.length && <p className="muted">Nessuna ricetta.</p>}
      </div>
    </div>
  );
}
