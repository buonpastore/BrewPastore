import { CapDot, useCapColors } from "../components/CapColor";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase, errMsg, num, date, type Row } from "../lib";
import { useAuth } from "../auth";
import { ImportRecipe } from "./ImportRecipe";
import { STYLE_OPTIONS } from "../styles-list";
import { abvOf, ebcColor, ebcName, ibuName, cleanDescription } from "../beerLook";

export function Recipes() {
  const { isAdmin } = useAuth();
  const nav = useNavigate();
  const [rows, setRows] = useState<Row[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [q, setQ] = useState("");
  const [style, setStyle] = useState("");
  const [importing, setImporting] = useState(false);
  const [choosing, setChoosing] = useState(false);
  useCapColors();
  // colore del tappo dell'ultimo batch imbottigliato della ricetta
  const capOf = (r: Row) => [...((r.batches ?? []) as Row[])].filter((b) => b.cap_color)
    .sort((a, b) => String(b.bottling_date ?? b.brew_date ?? b.created_at ?? "").localeCompare(String(a.bottling_date ?? a.brew_date ?? a.created_at ?? "")))[0]?.cap_color as string | undefined;

  useEffect(() => {
    supabase.from("recipes").select("*, batches(id, brew_date, bottling_date, created_at, status, cap_color)").order("name")
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
            <button className="btn primary" onClick={() => setChoosing(true)}>+ Nuova ricetta</button>
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
      {choosing && (
        <div className="modal-backdrop" onClick={() => setChoosing(false)}>
          <div className="modal choose-modal" onClick={(e) => e.stopPropagation()}>
            <h2>Nuova ricetta</h2>
            <button className="choose-btn" onClick={() => { setChoosing(false); setImporting(true); }}>
              <span className="choose-ico">📸</span>
              <span><strong>Importa</strong><span className="muted small">da screenshot, file o testo copiato</span></span>
            </button>
            <button className="choose-btn" onClick={() => { setChoosing(false); create(); }}>
              <span className="choose-ico">✍️</span>
              <span><strong>Inserisci a mano</strong><span className="muted small">parti da una ricetta vuota</span></span>
            </button>
            <button className="btn" onClick={() => setChoosing(false)}>Annulla</button>
          </div>
        </div>
      )}
      <div className="cards">
        {list.map((r) => {
          const last = (r.batches as Row[]).map((b) => b.brew_date).filter(Boolean).sort().pop();
          return (
            <Link key={r.id} to={`/ricette/${r.id}`} className="card">
              <h3 className="rc-title">{r.name} <CapDot color={capOf(r)} size={22} /> {r.archived && <span className="badge">archiviata</span>}</h3>
              <div className="rc-style">{r.style ?? "stile non indicato"}</div>
              <div className="rc-traits">
                {abvOf(r.target_og, r.target_fg) != null && (
                  <div className="rc-trait"><strong>{num(abvOf(r.target_og, r.target_fg), 1)}%</strong><span>alcol</span></div>
                )}
                {r.target_ibu != null && (
                  <div className="rc-trait"><strong>{num(r.target_ibu, 0)} IBU</strong><span>{ibuName(Number(r.target_ibu))}</span></div>
                )}
                {r.target_ebc != null && (
                  <div className="rc-trait">
                    <strong><i className="rc-swatch" style={{ background: ebcColor(Number(r.target_ebc)) }} />{num(r.target_ebc, 0)} EBC</strong>
                    <span>{ebcName(Number(r.target_ebc))}</span>
                  </div>
                )}
              </div>
              {r.description && (() => { const d = cleanDescription(r.description).join(", "); return <p className="rc-desc">{d.slice(0, 110)}{d.length > 110 ? "…" : ""}</p>; })()}
              <div className="muted small">{(r.batches as Row[]).length ? `${(r.batches as Row[]).length} ${(r.batches as Row[]).length === 1 ? "cotta" : "cotte"} · ultima il ${date(last)}` : "nessuna cotta ancora"}</div>
            </Link>
          );
        })}
        {!list.length && <p className="muted">Nessuna ricetta.</p>}
      </div>
    </div>
  );
}
