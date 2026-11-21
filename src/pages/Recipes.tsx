import { ViewToggle, useViewMode } from "../components/ViewToggle";
import { BookOpen, Beer, Leaf } from "lucide-react";
import { CapDot, useCapColors } from "../components/CapColor";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase, errMsg, num, date, accentAt, type Row } from "../lib";
import { useAuth } from "../auth";
import { ImportRecipe } from "./ImportRecipe";
import { FilePicker } from "../components/FilePicker";
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
  const [picked, setPicked] = useState<File[] | undefined>();
  useCapColors();
  // colore del tappo dell'ultimo batch imbottigliato della ricetta
  const capOf = (r: Row) => [...((r.batches ?? []) as Row[])].filter((b) => b.cap_color)
    .sort((a, b) => String(b.bottling_date ?? b.brew_date ?? b.created_at ?? "").localeCompare(String(a.bottling_date ?? a.brew_date ?? a.created_at ?? "")))[0]?.cap_color as string | undefined;

  useEffect(() => {
    supabase.from("recipes").select("*, batches(id, brew_date, bottling_date, created_at, status, cap_color)").order("created_at", { ascending: false })
      .then(({ data }) => setRows(data ?? []));
  }, []);

  const create = async () => {
    const name = prompt("Nome della nuova ricetta");
    if (!name) return;
    const { data, error } = await supabase.from("recipes").insert({ name }).select().single();
    if (error) return alert(errMsg(error));
    nav(`/ricette/${data.id}?edit=1`);
  };

  const [view, setView] = useViewMode("pastorizia-ricette-vista");
  const match = (r: Row) => (!style || r.style === style) && (r.name + " " + (r.style ?? "")).toLowerCase().includes(q.toLowerCase());
  // le archiviate, se mostrate, vanno in fondo all'elenco
  const archivedCount = rows.filter((r) => r.archived && match(r)).length;
  // ordine: dalla ricetta con il batch più recente (data di cotta, o di creazione se non ancora cotto);
  // quelle senza batch dopo, dall'ultima inserita
  const lastBatch = (r: Row) => ((r.batches ?? []) as Row[]).map((b) => String(b.brew_date ?? String(b.created_at ?? "").slice(0, 10))).sort().pop() ?? "";
  const byLast = (a: Row, b: Row) => { const x = lastBatch(a), y = lastBatch(b);
    return (x && y ? y.localeCompare(x) : Number(Boolean(y)) - Number(Boolean(x))) || String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")); };
  const list = [...rows.filter((r) => !r.archived && match(r)).sort(byLast), ...(showArchived ? rows.filter((r) => r.archived && match(r)).sort(byLast) : [])];
  const usedStyles = [...new Set(rows.map((r) => r.style).filter(Boolean))] as string[];
  const styleChoices = [...STYLE_OPTIONS.filter((o) => !o.disabled && usedStyles.includes(o.value)).map((o) => o.value), ...usedStyles.filter((s) => !STYLE_OPTIONS.some((o) => o.value === s))];

  return (
    <div>
      <div className="page-head head-with-toggle">
        <h1>Ricette</h1>
        <ViewToggle value={view} onChange={setView} />
      </div>
      {isAdmin && <button className="btn primary btn-wide" onClick={() => setChoosing(true)}><BookOpen size={20} /> Nuova ricetta</button>}
      <div className="toolbar">
        <input placeholder="Cerca…" value={q} onChange={(e) => setQ(e.target.value)} />
        {styleChoices.length > 0 && (
          <select value={style} onChange={(e) => setStyle(e.target.value)}>
            <option value="">Tutti gli stili</option>
            {styleChoices.map((s) => <option key={s}>{s}</option>)}
          </select>
        )}
      </div>
      {importing && <ImportRecipe initialFiles={picked} onClose={() => { setImporting(false); setPicked(undefined); }} />}
      {choosing && (
        <div className="modal-backdrop" onClick={() => setChoosing(false)}>
          <div className="modal choose-modal" onClick={(e) => e.stopPropagation()}>
            <h2>Nuova ricetta</h2>
            {/* tutto in una finestra: importa (incolla, screenshot, file, testo) oppure scrivila a mano */}
            <FilePicker compact allowText accept="image/*,application/pdf,.txt,.md" title="📋 Importa una ricetta"
              hint="incolla, oppure scegli screenshot, file o testo" textPlaceholder="Incolla qui il testo della ricetta"
              onFiles={(f) => { setPicked(f); setChoosing(false); setImporting(true); }} />
            <div className="choose-or"><span>oppure</span></div>
            <button className="choose-btn" onClick={() => { setChoosing(false); create(); }}>
              <span className="choose-ico">✍️</span>
              <span><strong>Inserisci a mano</strong><span className="muted small">parti da una ricetta vuota</span></span>
            </button>
            <button className="btn" onClick={() => setChoosing(false)}>Annulla</button>
          </div>
        </div>
      )}
      <div className={"cards" + (view === "compatta" ? " rc-compact" : "")}>
        {list.map((r) => {
          const last = (r.batches as Row[]).map((b) => b.brew_date).filter(Boolean).sort().pop();
          return (
            <Link key={r.id} to={`/ricette/${r.id}`} className="card rc-card" style={{ ["--rc" as string]: accentAt(rows.indexOf(r)) }}>
              <h3 className="rc-title">{r.name} <CapDot color={capOf(r)} size={22} /> {r.archived && <span className="badge">archiviata</span>}</h3>
              <div className="rc-style">{r.style ?? "stile non indicato"}</div>
              <div className="rc-traits">
                {abvOf(r.target_og, r.target_fg) != null && (
                  <div className="rc-trait"><strong><Beer size={16} className="rc-ico" style={{ color: "var(--gold)" }} />{num(abvOf(r.target_og, r.target_fg), 1)}%</strong><span>alcol</span></div>
                )}
                {r.target_ibu != null && (
                  <div className="rc-trait"><strong><Leaf size={16} className="rc-ico" style={{ color: "var(--cat-luppolo)" }} />{num(r.target_ibu, 0)} IBU</strong><span>{ibuName(Number(r.target_ibu))}</span></div>
                )}
                {r.target_ebc != null && (
                  <div className="rc-trait">
                    <strong><i className="rc-swatch" style={{ background: ebcColor(Number(r.target_ebc)) }} />{num(r.target_ebc, 0)} EBC</strong>
                    <span>{ebcName(Number(r.target_ebc))}</span>
                  </div>
                )}
              </div>
              <div className="muted small">{(r.batches as Row[]).length ? `${(r.batches as Row[]).length} ${(r.batches as Row[]).length === 1 ? "cotta" : "cotte"}` : "nessuna cotta ancora"}</div>
            </Link>
          );
        })}
        {!list.length && <p className="muted">Nessuna ricetta.</p>}
      </div>
      {archivedCount > 0 && (
        <button type="button" className="btn full-w" style={{ marginTop: 16 }} onClick={() => setShowArchived(!showArchived)}>
          {showArchived ? "Nascondi le ricette archiviate" : `Mostra le ricette archiviate (${archivedCount})`}
        </button>
      )}
    </div>
  );
}
