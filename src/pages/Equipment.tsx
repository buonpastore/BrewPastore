import { Fragment, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ChevronRight, Circle, CircleCheck, ShoppingCart } from "lucide-react";
import readXlsxFile, { readSheetNames } from "read-excel-file";
import { supabase, uploadFile, parseQuote, openFile, errMsg, eur, date, num, type Row } from "../lib";
import { useAuth } from "../auth";
import { RecordForm } from "../components/RecordForm";
import { HistoryList } from "../components/HistoryList";
import { FilePicker } from "../components/FilePicker";
import { PickedList } from "./ImportRecipe";
import { textOf } from "../ocr";
import { parseQuoteText, parseCsv } from "../quoteParser";

const PROJECT_STATUS: Record<string, string> = { in_valutazione: "In valutazione", approvato: "Approvato", acquistato: "Acquistato", scartato: "Scartato" };
/** Stati del preventivo: i primi tre sono quelli che si scelgono. */
const STATES: [string, string][] = [["inserito", "Inserito"], ["in_valutazione", "In valutazione"], ["confermato", "Confermato"]];
const QUOTE_STATUS: Record<string, string> = { ...Object.fromEntries(STATES), scartato: "Scartato", superato: "Superato",
  ricevuto: "Inserito", in_trattativa: "In valutazione", scelto: "Confermato" };   // vecchi nomi, prima di 0017
const NEED_0017 = "Per gli stati e la conferma degli oggetti esegui prima 0017_preventivi_stati_conferma.sql su Supabase";

/** I prezzi dei preventivi sono sempre IVA inclusa, senza sconti: riga = quantità × prezzo. */
const lineTotal = (i: Row) => Number(i.quantity) * Number(i.unit_price);

/** Totali dei preventivi calcolati qui (quantità × prezzo, il trasporto non conta), stessa forma della vista equipment_quote_totals. */
async function loadTotals(projectId?: string): Promise<Row[]> {
  let qq = supabase.from("equipment_quotes").select("id, project_id, supplier, version, status");
  if (projectId) qq = qq.eq("project_id", projectId);
  const { data: qs } = await qq;
  if (!qs?.length) return [];
  const { data: its } = await supabase.from("equipment_quote_items").select("quote_id, quantity, unit_price").in("quote_id", qs.map((q) => q.id));
  return qs.map((q) => {
    const mine = (its ?? []).filter((i) => i.quote_id === q.id);
    return { quote_id: q.id, project_id: q.project_id, supplier: q.supplier, version: q.version, status: q.status, items_count: mine.length,
      total_with_vat: mine.reduce((t, i) => t + lineTotal(i), 0) };
  });
}

/** Elimina un preventivo (righe comprese) e il suo file; se era l'ultima versione, la precedente torna attiva. */
async function deleteQuote(q: Row) {
  const { error } = await supabase.from("equipment_quotes").delete().eq("id", q.id);
  if (error) throw error;
  if (q.source_path) await supabase.storage.from("documents").remove([q.source_path]);
  const { data: rest } = await supabase.from("equipment_quotes").select("id, status, version").eq("project_id", q.project_id).eq("supplier", q.supplier).order("version", { ascending: false });
  if (rest?.length && rest.every((r) => r.status === "superato")) await supabase.from("equipment_quotes").update({ status: "inserito" }).eq("id", rest[0].id);
}

/** Numero dei soci (chi è registrato nell'app): i totali si dividono per loro. */
function useSoci() {
  const { profiles } = useAuth();
  return Math.max(1, profiles.length || 3);
}

/** Rinomina un preventivo (se il nome esiste già nel progetto gli dà un numero interno diverso). */
async function renameQuote(q: Row): Promise<Row | null> {
  const name = prompt("Nome del preventivo", q.supplier)?.trim();
  if (!name || name === q.supplier) return null;
  let { data, error } = await supabase.from("equipment_quotes").update({ supplier: name }).eq("id", q.id).select().single();
  if (error?.code === "23505") {
    const { data: same } = await supabase.from("equipment_quotes").select("version").eq("project_id", q.project_id).eq("supplier", name);
    const version = 1 + Math.max(0, ...(same ?? []).map((x) => x.version));
    ({ data, error } = await supabase.from("equipment_quotes").update({ supplier: name, version }).eq("id", q.id).select().single());
  }
  if (error) { alert(errMsg(error)); return null; }
  return data;
}

// ------------------------------------------------------------------ elenco progetti
export function EquipmentProjects() {
  const { isAdmin } = useAuth();
  const nav = useNavigate();
  const [projects, setProjects] = useState<Row[]>([]);
  const [totals, setTotals] = useState<Row[]>([]);

  useEffect(() => {
    supabase.from("equipment_projects").select("*").order("created_at", { ascending: false }).then(({ data }) => setProjects(data ?? []));
    loadTotals().then(setTotals);
  }, []);

  const create = async () => {
    const name = prompt("Nome del progetto (es. Passaggio a impianto 50 L)");
    if (!name) return;
    const { data, error } = await supabase.from("equipment_projects").insert({ name }).select().single();
    if (error) return alert(errMsg(error));
    nav(`/impianto/${data.id}`);
  };

  return (
    <div>
      <div className="page-head">
        <h1>Preventivi impianto</h1>
        {isAdmin && <button className="btn primary" onClick={create}>+ Nuovo progetto</button>}
      </div>
      <div className="cards">
        {projects.map((p) => {
          const qs = totals.filter((t) => t.project_id === p.id && t.status !== "superato" && t.status !== "scartato");
          const best = qs.length ? Math.min(...qs.map((q) => Number(q.total_with_vat))) : null;
          const suppliers = new Set(qs.map((q) => q.supplier)).size;
          return (
            <Link key={p.id} to={`/impianto/${p.id}`} className="card">
              <h3>{p.name}</h3>
              <span className="badge">{PROJECT_STATUS[p.status]}</span>
              <div className="stats">
                <span>{suppliers} fornitori</span>
                <span>migliore: <strong>{eur(best)}</strong></span>
                {p.budget && <span>budget {eur(p.budget)}</span>}
              </div>
            </Link>
          );
        })}
        {!projects.length && <p className="muted">Nessun progetto. Creane uno per iniziare a raccogliere preventivi.</p>}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ dettaglio progetto
export function EquipmentProject() {
  const { id } = useParams();
  const { isAdmin } = useAuth();
  const soci = useSoci();
  const nav = useNavigate();
  const [project, setProject] = useState<Row | null>(null);
  const [quotes, setQuotes] = useState<Row[]>([]);
  const [totals, setTotals] = useState<Record<string, Row>>({});
  const [importMode, setImportMode] = useState<"excel" | "ai" | null>(null);
  const [comparing, setComparing] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    supabase.from("equipment_projects").select("*").eq("id", id!).single().then(({ data }) => setProject(data));
    supabase.from("equipment_quotes").select("*").eq("project_id", id!).order("created_at", { ascending: false })
      .then(({ data }) => setQuotes(data ?? []));
    loadTotals(id!).then((data) => setTotals(Object.fromEntries(data.map((t) => [t.quote_id, t]))));
  }, [id, reload]);

  const newManual = async () => {
    const supplier = prompt("Nome del preventivo")?.trim();
    if (!supplier) return;
    const version = 1 + Math.max(0, ...quotes.filter((q) => q.supplier.toLowerCase() === supplier.toLowerCase()).map((q) => q.version));
    const { error } = await supabase.from("equipment_quotes").insert({ project_id: id, supplier, version });
    if (error) return alert(errMsg(error));
    setReload((x) => x + 1);
  };

  if (!project) return <p>Caricamento…</p>;

  return (
    <div>
      <Link to="/impianto" className="muted small">← Preventivi impianto</Link>
      <h1 className="qv-title">{project.name}</h1>
      {isAdmin && (
        <div className="eqp-actions">
          <button className="btn primary" onClick={() => setImportMode("excel")}>📊 Da Excel / Fogli Google</button>
          <button className="btn primary" onClick={() => setImportMode("ai")}>📸 Da screenshot</button>
          <button className="btn" onClick={newManual}>+ A mano</button>
        </div>
      )}
      {importMode && <ImportQuote projectId={project.id} quotes={quotes} mode={importMode} onClose={() => setImportMode(null)} onDone={() => setReload((x) => x + 1)} />}

      <div className="eqq-list">
        {quotes.map((q) => {
          const t = totals[q.id];
          return (
            <div key={q.id} className="eqq">
              <Link to={`/impianto/preventivo/${q.id}`} className="eqq-main">
                <span className="eqq-name">{q.supplier}</span>
                <span className="eqq-meta">
                  <span className={"badge qs-" + q.status}>{QUOTE_STATUS[q.status] ?? q.status}</span>
                  <span>{num(t?.items_count ?? 0)} oggetti</span>
                  <span>{date(q.quote_date ?? q.created_at)}</span>
                </span>
              </Link>
              <strong className="eqq-tot">{eur(t?.total_with_vat ?? 0)}<small>{eur((t?.total_with_vat ?? 0) / soci)} a testa</small></strong>
              {isAdmin && (
                <span className="eqq-acts">
                  <button className="icon" title="Rinomina" onClick={async () => { if (await renameQuote(q)) setReload((x) => x + 1); }}>✏️</button>
                  <button className="icon" title="Elimina preventivo" onClick={async () => {
                    if (!confirm(`Eliminare il preventivo «${q.supplier}» con tutti gli oggetti e il file?`)) return;
                    try { await deleteQuote(q); setReload((x) => x + 1); } catch (e) { alert(errMsg(e)); }
                  }}>🗑️</button>
                </span>
              )}
            </div>
          );
        })}
        {!quotes.length && <p className="muted">Nessun preventivo. Importane uno da Excel o da screenshot.</p>}
      </div>
      {quotes.length >= 2 && (
        <button className={"btn full-w" + (comparing ? "" : " primary")} style={{ marginBottom: 14 }} onClick={() => setComparing(!comparing)}>
          {comparing ? "Chiudi il confronto" : "⚖️ Confronta due preventivi"}
        </button>
      )}
      {comparing && quotes.length >= 2 && <QuoteCompare quotes={quotes} soci={soci} />}

      <details className="panel qv-more">
        <summary>Dati del progetto</summary>
        <RecordForm table="equipment_projects" row={project} canEdit={isAdmin} onSaved={setProject} sections={[{ fields: [
          { key: "name", label: "Nome", required: true },
          { key: "status", label: "Stato", type: "select", required: true, options: Object.entries(PROJECT_STATUS).map(([value, label]) => ({ value, label })) },
          { key: "budget", label: "Budget €", type: "number", render: (v) => eur(v as number) },
          { key: "description", label: "Obiettivi / requisiti", type: "textarea" },
        ] }]} />
      </details>
      {isAdmin && (
        <button className="btn danger" style={{ width: "100%", marginTop: 4 }} onClick={async () => {
          if (!confirm(`Eliminare tutto il progetto «${project.name}» con i suoi ${quotes.length} preventivi e i file?`)) return;
          const files = quotes.map((q) => q.source_path).filter(Boolean);
          const { error } = await supabase.from("equipment_projects").delete().eq("id", project.id);
          if (error) return alert(errMsg(error));
          if (files.length) await supabase.storage.from("documents").remove(files);
          nav("/impianto");
        }}>🗑️ Elimina progetto</button>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ confronto fra due preventivi
const keyOfItem = (i: Row) => [i.description, i.model].filter(Boolean).join(" ").toLowerCase().replace(/[^a-z0-9à-ú]+/g, " ").trim();

function QuoteCompare({ quotes, soci }: { quotes: Row[]; soci: number }) {
  const [a, setA] = useState(quotes[1]?.id ?? "");
  const [b, setB] = useState(quotes[0]?.id ?? "");
  const [items, setItems] = useState<Row[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => {
    if (!a || !b) return;
    supabase.from("equipment_quote_items").select("*").in("quote_id", [a, b]).order("sort_order").then(({ data }) => setItems(data ?? []));
  }, [a, b]);
  const qa = quotes.find((q) => q.id === a), qb = quotes.find((q) => q.id === b);
  const A = items.filter((i) => i.quote_id === a), B = items.filter((i) => i.quote_id === b);
  const tot = (rs: Row[]) => rs.reduce((t, i) => t + lineTotal(i), 0);
  const ta = tot(A), tb = tot(B), d = tb - ta;
  const catOf = (i: Row) => (i.category ?? "").trim() || "Senza categoria";
  const cats = [...new Set([...A, ...B].map(catOf))].sort((x, y) => (x === "Senza categoria" ? 1 : y === "Senza categoria" ? -1 : x.localeCompare(y)));
  const delta = (v: number) => <span className={"cmp-d" + (Math.abs(v) < 0.005 ? "" : v < 0 ? " less" : " more")}>{Math.abs(v) < 0.005 ? "=" : (v > 0 ? "+" : "−") + eur(Math.abs(v))}</span>;
  const onlyA = A.filter((i) => !B.some((j) => keyOfItem(j) === keyOfItem(i))).length;
  const onlyB = B.filter((i) => !A.some((j) => keyOfItem(j) === keyOfItem(i))).length;

  return (
    <div className="panel cmp">
      <div className="cmp-pick">
        <label><span>Preventivo A</span><select value={a} onChange={(e) => setA(e.target.value)}>{quotes.map((q) => <option key={q.id} value={q.id}>{q.supplier}</option>)}</select></label>
        <label><span>Preventivo B</span><select value={b} onChange={(e) => setB(e.target.value)}>{quotes.map((q) => <option key={q.id} value={q.id}>{q.supplier}</option>)}</select></label>
      </div>
      {a === b ? <p className="muted">Scegli due preventivi diversi.</p> : (
        <>
          <div className="cmp-sum">
            <div><span>{qa?.supplier}</span><strong>{eur(ta)}</strong><small>{eur(ta / soci)} a testa</small></div>
            <div><span>{qb?.supplier}</span><strong>{eur(tb)}</strong><small>{eur(tb / soci)} a testa</small></div>
            <div className="cmp-diff"><span>Differenza B − A</span><strong>{delta(d)}</strong><small>{delta(d / soci)} a testa</small></div>
          </div>
          <p className="muted small">
            {Math.abs(d) < 0.005 ? "Costano uguale." : `«${d < 0 ? qb?.supplier : qa?.supplier}» costa ${eur(Math.abs(d))} in meno (${Math.round(Math.abs(d) / Math.max(ta, tb) * 100)}%).`}
            {onlyA ? ` ${onlyA} ${onlyA === 1 ? "oggetto" : "oggetti"} solo in A.` : ""}{onlyB ? ` ${onlyB} ${onlyB === 1 ? "oggetto" : "oggetti"} solo in B.` : ""} Tocca una tipologia per vedere gli oggetti.
          </p>
          <div className="cmp-table">
            <div className="cmp-row cmp-h"><span>Tipologia</span><span>A</span><span>B</span><span>B − A</span></div>
            {cats.map((c) => {
              const ca = A.filter((i) => catOf(i) === c), cb = B.filter((i) => catOf(i) === c);
              const keys = [...new Set([...ca, ...cb].map(keyOfItem))];
              const isOpen = open === c;
              return (
                <div key={c} className={"cmp-cat" + (isOpen ? " open" : "")}>
                  <button className="cmp-row" onClick={() => setOpen(isOpen ? null : c)}>
                    <span className="cmp-name"><ChevronRight size={15} className="pv-chev" /><span>{c}</span></span>
                    <span>{ca.length ? eur(tot(ca)) : "—"}</span>
                    <span>{cb.length ? eur(tot(cb)) : "—"}</span>
                    {delta(tot(cb) - tot(ca))}
                  </button>
                  {isOpen && keys.map((k) => {
                    const ia = ca.filter((i) => keyOfItem(i) === k), ib = cb.filter((i) => keyOfItem(i) === k);
                    const it = ia[0] ?? ib[0];
                    const qty = (rs: Row[]) => rs.reduce((t, i) => t + Number(i.quantity), 0);
                    return (
                      <div key={k} className="cmp-row cmp-item">
                        <span className="cmp-name">{it.description}{it.model ? <small> {it.model}</small> : null}{(qty(ia) > 1 || qty(ib) > 1) && <small> ×{num(qty(ia) || qty(ib))}</small>}</span>
                        <span>{ia.length ? eur(tot(ia)) : <em className="muted">manca</em>}</span>
                        <span>{ib.length ? eur(tot(ib)) : <em className="muted">manca</em>}</span>
                        {delta(tot(ib) - tot(ia))}
                      </div>
                    );
                  })}
                </div>
              );
            })}
            <div className="cmp-row cmp-h cmp-f"><span>Totale</span><span>{eur(ta)}</span><span>{eur(tb)}</span>{delta(d)}</div>
          </div>
        </>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ dettaglio preventivo
export function EquipmentQuote() {
  const { id } = useParams();
  const { isAdmin } = useAuth();
  const soci = useSoci();
  const nav = useNavigate();
  const [q, setQ] = useState<Row | null>(null);
  const [items, setItems] = useState<Row[]>([]);

  useEffect(() => {
    supabase.from("equipment_quotes").select("*").eq("id", id!).single().then(({ data }) => setQ(data));
  }, [id]);

  const remove = async () => {
    if (!q || !confirm(`Eliminare il preventivo «${q.supplier}» con tutte le righe${q.source_path ? " e il file" : ""}?`)) return;
    try { await deleteQuote(q); nav(`/impianto/${q.project_id}`); } catch (e) { alert(errMsg(e)); }
  };
  const removeFile = async (x: Row) => {
    if (!x.source_path || !confirm("Togliere questo file? Il preventivo e gli oggetti restano.")) return;
    await supabase.storage.from("documents").remove([x.source_path]);
    const { error } = await supabase.from("equipment_quotes").update({ source_path: null }).eq("id", x.id);
    if (error) return alert(errMsg(error));
    if (q) setQ({ ...q, source_path: null });
  };

  if (!q) return <p>Caricamento…</p>;
  const goods = items.reduce((s, i) => s + lineTotal(i), 0);

  const files = q.source_path ? [q] : [];
  return (
    <div>
      <Link to={`/impianto/${q.project_id}`} className="muted small">← Progetto</Link>
      <h1 className="qv-title">{q.supplier}
        {isAdmin && <button className="icon qv-rename" title="Rinomina" onClick={async () => { const d = await renameQuote(q); if (d) setQ(d); }}>✏️</button>}
      </h1>
      <div className="qv-states">
        {STATES.map(([k, l]) => {
          const on = (QUOTE_STATUS[q.status] ?? "") === l;
          return <button key={k} disabled={!isAdmin} className={"qv-state qs-" + k + (on ? " on" : "")} onClick={async () => {
            const { data, error } = await supabase.from("equipment_quotes").update({ status: k }).eq("id", q.id).select().single();
            if (error) return alert(/check|status/i.test(error.message) ? NEED_0017 : errMsg(error));
            setQ(data);
          }}>{l}</button>;
        })}
      </div>
      <div className="kpis qv-kpis">
        <div className="kpi"><span>Oggetti</span><strong>{num(items.reduce((t, i) => t + Number(i.quantity), 0))}</strong></div>
        <div className="kpi main"><span>Totale</span><strong>{eur(goods)}</strong>
          <small className="qv-each">{eur(goods / soci)} a testa ({soci} soci)</small>
          {items.some((i) => i.confirmed) && <small className="qv-conf">confermato {eur(items.filter((i) => i.confirmed).reduce((t, i) => t + lineTotal(i), 0))} · {eur(items.filter((i) => i.confirmed).reduce((t, i) => t + lineTotal(i), 0) / soci)} a testa</small>}
        </div>
      </div>
      <QuoteItems quoteId={q.id} canEdit={isAdmin} onChange={setItems} />

      <details className="panel qv-more">
        <summary>Dati del preventivo</summary>
        <RecordForm table="equipment_quotes" row={q} canEdit={isAdmin} onSaved={setQ} sections={[{ fields: [
          { key: "quote_date", label: "Data", type: "date" },
          { key: "notes", label: "Note", type: "textarea" },
        ] }]} />
      </details>
      <details className="panel qv-more">
        <summary>File importati ({files.length})</summary>
        {!files.length && <p className="muted small">Nessun file: questo preventivo è stato scritto a mano o il file è stato tolto.</p>}
        <div className="qv-files">
          {files.map((x) => (
            <div key={x.id} className="qv-file">
              <button className="qv-file-name" onClick={() => openFile(x.source_path).catch((e) => alert(errMsg(e)))}>
                📎 {String(x.source_path).split("/").pop()?.replace(/^\d+[-_]/, "")}
                <small>importato il {date(x.created_at)}</small>
              </button>
              {isAdmin && <button className="icon" title="Togli file" onClick={() => removeFile(x)}>🗑️</button>}
            </div>
          ))}
        </div>
      </details>
      <details className="panel qv-more">
        <summary>Storico modifiche</summary>
        <HistoryList relatedTo={{ id: q.id, key: "quote_id" }} />
      </details>
      {isAdmin && <button className="btn danger" style={{ width: "100%", margin: "4px 0 16px" }} onClick={remove}>🗑️ Elimina preventivo</button>}
    </div>
  );
}

// ------------------------------------------------------------------ oggetti del preventivo
const ITEM_FIELDS: [string, string][] = [["category", "Categoria"], ["supplier", "Fornitore"], ["brand", "Marca"], ["model", "Modello"], ["code", "Codice"]];

function QuoteItems({ quoteId, canEdit, onChange }: { quoteId: string; canEdit: boolean; onChange: (r: Row[]) => void }) {
  const soci = useSoci();
  const [items, setItems] = useState<Row[]>([]);
  const [openSup, setOpenSup] = useState<Set<string>>(new Set());
  const [openCat, setOpenCat] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<string | null>(null);
  const [edit, setEdit] = useState<Row | null>(null);

  const load = () => supabase.from("equipment_quote_items").select("*").eq("quote_id", quoteId).order("sort_order")
    .then(({ data }) => { setItems(data ?? []); onChange(data ?? []); });
  useEffect(() => { load(); }, [quoteId]);

  const catOf = (i: Row) => (i.category ?? "").trim() || "Senza categoria";
  const cats = [...new Set(items.map(catOf))].sort((a, b) => (a === "Senza categoria" ? 1 : b === "Senza categoria" ? -1 : a.localeCompare(b)));
  const sum = (rs: Row[]) => rs.reduce((t, i) => t + lineTotal(i), 0);

  const save = async () => {
    if (!edit || !String(edit.description ?? "").trim()) return alert("Scrivi l'oggetto");
    const row: Row = { description: edit.description.trim(), quantity: Number(edit.quantity) || 1, unit_price: Number(edit.unit_price) || 0, notes: edit.notes || null };
    for (const [k] of ITEM_FIELDS) if (k in edit || edit.id == null) row[k] = (edit[k] ?? "").trim() || null;
    const q = edit.id
      ? supabase.from("equipment_quote_items").update(row).eq("id", edit.id)
      : supabase.from("equipment_quote_items").insert({ ...row, quote_id: quoteId, sort_order: items.length });
    const { error } = await q;
    if (error) return alert(/brand|model|supplier/i.test(error.message) ? "Per Fornitore, Marca e Modello esegui prima 0016_preventivi_marca_modello.sql su Supabase" : errMsg(error));
    setEdit(null); load();
  };
  const setConfirmed = async (rows: Row[], v: boolean) => {
    const { error } = await supabase.from("equipment_quote_items").update({ confirmed: v }).in("id", rows.map((r) => r.id));
    if (error) return alert(/confirmed/i.test(error.message) ? NEED_0017 : errMsg(error));
    load();
  };
  const remove = async (i: Row) => {
    if (!confirm(`Togliere «${i.description}» dal preventivo?`)) return;
    const { error } = await supabase.from("equipment_quote_items").delete().eq("id", i.id);
    if (error) return alert(errMsg(error));
    setOpen(null); load();
  };

  const form = edit && (
    <div className="qi-edit">
      <div className="form-grid">
        <label className="wide"><span>Oggetto</span><input value={edit.description ?? ""} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></label>
        <label><span>Quantità</span><input type="number" step="any" inputMode="decimal" value={edit.quantity ?? 1} onChange={(e) => setEdit({ ...edit, quantity: e.target.value })} /></label>
        <label><span>Prezzo cad. €</span><input type="number" step="any" inputMode="decimal" value={edit.unit_price ?? 0} onChange={(e) => setEdit({ ...edit, unit_price: e.target.value })} /></label>
        {ITEM_FIELDS.map(([k, l]) => (
          <label key={k}><span>{l}</span><input list={k === "category" ? "qi-cats" : undefined} value={edit[k] ?? ""} onChange={(e) => setEdit({ ...edit, [k]: e.target.value })} /></label>
        ))}
        <label className="wide"><span>Note</span><textarea rows={2} value={edit.notes ?? ""} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} /></label>
      </div>
      <datalist id="qi-cats">{cats.filter((c) => c !== "Senza categoria").map((c) => <option key={c} value={c} />)}</datalist>
      <div className="row-actions">
        <button className="btn primary" onClick={save}>Salva</button>
        <button className="btn" onClick={() => setEdit(null)}>Annulla</button>
      </div>
    </div>
  );

  const supOf = (i: Row) => (i.supplier ?? "").trim() || "Fornitore non indicato";
  const tree = new Map<string, Map<string, Row[]>>();
  for (const i of items) {
    const sm = tree.get(supOf(i)) ?? new Map<string, Row[]>();
    sm.set(catOf(i), [...(sm.get(catOf(i)) ?? []), i]);
    tree.set(supOf(i), sm);
  }
  const last = (a: string, b: string, tail: string) => (a === tail ? 1 : b === tail ? -1 : a.localeCompare(b));
  const sups = [...tree.keys()].sort((a, b) => last(a, b, "Fornitore non indicato"));
  const toggle = (set: Set<string>, k: string, fn: (s: Set<string>) => void) => { const n = new Set(set); n.has(k) ? n.delete(k) : n.add(k); fn(n); };
  const allCats = sups.flatMap((sp) => [...tree.get(sp)!.keys()].map((c) => sp + "|" + c));
  const allOpen = openSup.size === sups.length && allCats.every((k) => openCat.has(k));

  const itemRow = (i: Row) => {
    const isOpen = open === i.id;
    const sub = [i.brand, i.model].filter(Boolean).join(" · ");
    return (
      <div key={i.id} className={"qi" + (isOpen ? " open" : "") + (Number(i.unit_price) ? "" : " zero") + (i.confirmed ? " conf" : "")}>
        <div className="qi-line">
        <button className="qi-check" disabled={!canEdit} title={i.confirmed ? "Confermato: tocca per rimetterlo in valutazione" : "In valutazione: tocca per confermarlo"}
          onClick={() => setConfirmed([i], !i.confirmed)}>{i.confirmed ? <CircleCheck size={22} /> : <Circle size={22} />}</button>
        <button className="qi-row" onClick={() => { setOpen(isOpen ? null : i.id); setEdit(null); }}>
          <span className="qi-name">{i.description}{sub && <small>{sub}</small>}</span>
          <span className="qi-qty">×{num(i.quantity)}</span>
          <span className="qi-price">{Number(i.unit_price) ? eur(lineTotal(i)) : "—"}</span>
        </button>
        </div>
        {isOpen && (edit?.id === i.id ? form : (
          <div className="qi-detail">
            <dl>
              <dt>Stato</dt><dd>{i.confirmed ? <span className="qi-ok">✓ Confermato</span> : "In valutazione"}</dd>
              <dt>Prezzo cad.</dt><dd>{eur(i.unit_price)}</dd>
              {ITEM_FIELDS.map(([k, l]) => i[k] ? <Fragment key={k}><dt>{l}</dt><dd>{i[k]}</dd></Fragment> : null)}
              {i.notes && <><dt>Note</dt><dd className="pre">{i.notes}</dd></>}
            </dl>
            {canEdit && (
              <div className="row-actions">
                <button className="btn" onClick={() => setEdit({ ...i })}>✏️ Modifica</button>
                <button className="btn danger" onClick={() => remove(i)}>🗑️ Togli</button>
              </div>
            )}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="panel">
      <div className="pv-head">
        <h2>Oggetti</h2>
        {items.length > 0 && (
          <button className="btn small" onClick={() => {
            if (allOpen) { setOpenSup(new Set()); setOpenCat(new Set()); }
            else { setOpenSup(new Set(sups)); setOpenCat(new Set(allCats)); }
          }}>{allOpen ? "Chiudi tutto" : "Espandi tutto"}</button>
        )}
      </div>
      <div className="pv">
        {sups.map((sp) => {
          const cm = tree.get(sp)!;
          const its = [...cm.values()].flat();
          const so = openSup.has(sp);
          return (
            <div key={sp} className={"pv-sup" + (so ? " open" : "")}>
              <button className="pv-row lvl1" onClick={() => toggle(openSup, sp, setOpenSup)}>
                <ChevronRight size={18} className="pv-chev" />
                <span className="pv-name">{sp}
                  {its.every((i) => i.confirmed)
                    ? <small className="pv-ready"><ShoppingCart size={13} /> pronto da acquistare</small>
                    : <small className="pv-wait">{its.filter((i) => i.confirmed).length}/{its.length} confermati</small>}
                </span>
                <span className="pv-n">{its.length}</span>
                <span className="pv-tot">{eur(sum(its))}<small>{eur(sum(its) / soci)} a testa</small></span>
              </button>
              {so && canEdit && (
                <div className="pv-acts">
                  {its.every((i) => i.confirmed)
                    ? <button className="btn small" onClick={() => setConfirmed(its, false)}>Rimetti tutto in valutazione</button>
                    : <button className="btn small" onClick={() => setConfirmed(its.filter((i) => !i.confirmed), true)}><CircleCheck size={15} /> Conferma tutto {sp}</button>}
                </div>
              )}
              {so && [...cm.keys()].sort((a, b) => last(a, b, "Senza categoria")).map((c) => {
                const k = sp + "|" + c;
                const ci = cm.get(c)!;
                const co = openCat.has(k);
                return (
                  <div key={k} className={"pv-cat" + (co ? " open" : "")}>
                    <button className="pv-row lvl2" onClick={() => toggle(openCat, k, setOpenCat)}>
                      <ChevronRight size={16} className="pv-chev" />
                      <span className="pv-name">{c}</span>
                      <span className={"pv-n" + (ci.every((i) => i.confirmed) ? " all" : "")}>{ci.filter((i) => i.confirmed).length}/{ci.length}</span>
                      <span className="pv-tot">{eur(sum(ci))}<small>{eur(sum(ci) / soci)} a testa</small></span>
                    </button>
                    {co && <div className="pv-items">{ci.map(itemRow)}</div>}
                  </div>
                );
              })}
            </div>
          );
        })}
        {!items.length && <p className="muted">Nessun oggetto.</p>}
      </div>
      {canEdit && (edit && !edit.id ? form : <button className="btn full-w" style={{ marginTop: 12 }} onClick={() => { setOpen(null); setEdit({ quantity: 1, unit_price: 0 }); }}>+ Aggiungi oggetto</button>)}
    </div>
  );
}

// ------------------------------------------------------------------ import
interface DraftItem { code: string; description: string; category: string; supplier: string; brand: string; model: string; notes: string; quantity: number; unit_price: number }
const FIELDS: { key: keyof DraftItem | "total"; label: string; match: RegExp }[] = [
  { key: "code", label: "Codice", match: /^(cod|codice|art\.?|sku|rif)/i },
  { key: "description", label: "Descrizione *", match: /(descr|articolo|prodotto|oggetto|voce|item|denominaz)/i },
  { key: "category", label: "Categoria", match: /(categ|tipo|gruppo)/i },
  { key: "supplier", label: "Fornitore", match: /(fornitor|negozio|venditor|shop|dove)/i },
  { key: "brand", label: "Marca", match: /^(marca|brand|produttore)/i },
  { key: "model", label: "Modello", match: /^(modell|model)/i },
  { key: "quantity", label: "Quantità", match: /(q\.?\s?t[aà]|quant|qty|pz|n\.|^nr\.?$|^num)/i },
  { key: "unit_price", label: "Prezzo unitario", match: /(prezzo\s*unit|p\.?\s*unit|unitario|€\s*\/|listino|prezzo$|prezzo)/i },
  { key: "total", label: "Totale riga (se manca il prezzo unit.)", match: /(totale|importo|subtot)/i },
  { key: "notes", label: "Note", match: /^note/i },
];

/** Converte "1.234,56 €" / 1234.56 / "10%" in numero. */
function toNum(v: unknown): number {
  if (typeof v === "number") return v;
  if (v == null) return 0;
  let s = String(v).replace(/[€%\s]/g, "");
  if (s.includes(",") && s.includes(".")) s = s.lastIndexOf(",") > s.lastIndexOf(".") ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  else s = s.replace(",", ".");
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

function ImportQuote({ projectId, quotes, mode, onClose, onDone }: { projectId: string; quotes: Row[]; mode: "excel" | "ai"; onClose: () => void; onDone: () => void }) {
  const nav = useNavigate();
  const [step, setStep] = useState<"upload" | "reading" | "map" | "review" | "saving">("upload");
  const [file, setFile] = useState<File | null>(null);
  const [sheets, setSheets] = useState<string[]>([]);
  const [sheet, setSheet] = useState("");
  const [grid, setGrid] = useState<unknown[][]>([]);
  const [headerRow, setHeaderRow] = useState(0);
  const [fromRow, setFromRow] = useState(1);
  const [toRow, setToRow] = useState(0);
  const [mapping, setMapping] = useState<Record<string, number>>({});
  const [items, setItems] = useState<DraftItem[]>([]);
  const [supplier, setSupplier] = useState("");
  const [quoteDate, setQuoteDate] = useState(new Date().toISOString().slice(0, 10));
  const [validUntil, setValidUntil] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [aiPath, setAiPath] = useState<string | null>(null);
  const [aiPicked, setAiPicked] = useState<File[]>([]);
  const [progress, setProgress] = useState("");
  const [readText, setReadText] = useState("");
  const [skipped, setSkipped] = useState<string[]>([]);

  const suppliers = useMemo(() => [...new Set(quotes.map((q) => q.supplier))], [quotes]);

  const guessHeader = (rows: unknown[][]) => {
    let best = 0, bestScore = -1;
    rows.slice(0, 30).forEach((r, i) => {
      const score = r.filter((c) => typeof c === "string" && FIELDS.some((f) => f.match.test(c))).length;
      if (score > bestScore) { best = i; bestScore = score; }
    });
    return best;
  };
  const guessMapping = (header: unknown[]) => {
    const m: Record<string, number> = {};
    for (const f of FIELDS) {
      const idx = header.findIndex((c, i) => typeof c === "string" && f.match.test(c) && !Object.values(m).includes(i));
      if (idx >= 0) m[f.key] = idx;
    }
    return m;
  };

  const loadSheet = async (f: File, name: string) => {
    const rows = /\.(csv|tsv|txt)$/i.test(f.name) ? parseCsv(await f.text()) : (await readXlsxFile(f, { sheet: name })) as unknown[][];
    setGrid(rows);
    const h = guessHeader(rows);
    setHeaderRow(h); setFromRow(h + 1); setToRow(rows.length - 1);
    setMapping(guessMapping(rows[h] ?? []));
  };

  const pick = async (files: FileList | null) => {
    const f = files?.[0];
    if (!f) return;
    setFile(f); setError("");
    if (mode === "excel") {
      try {
        if (!/\.(xlsx|csv|tsv|txt)$/i.test(f.name)) throw new Error("Serve un file .xlsx o .csv. Dal foglio Google: File → Scarica → Microsoft Excel (.xlsx)");
        const names = /\.xlsx$/i.test(f.name) ? await readSheetNames(f) : [f.name.replace(/\.[^.]+$/, "")];
        setSheets(names); setSheet(names[0]);
        await loadSheet(f, names[0]);
        setSupplier(f.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " "));
        setStep("map");
      } catch (e) { setError(errMsg(e)); }
    }
  };

  const readAi = async () => {
    if (!aiPicked.length) return;
    setError(""); setStep("reading");
    {
      try {
        const ps: string[] = [];
        for (const f of aiPicked) ps.push(await uploadFile(`equipment/${projectId}`, f));
        setAiPath(ps[0]);
        const text = await textOf(aiPicked, setProgress, { clean: true });
        if (text != null) {
          // screenshot o testo: lettura sul telefono, senza AI
          const r = parseQuoteText(text);
          setReadText(text); setSkipped(r.skipped);
          setItems(r.items.map((i) => ({ code: "", description: i.description, category: "", supplier: "", brand: "", model: "", notes: "", quantity: i.quantity, unit_price: Math.round(i.unit_price * (1 - i.discount_pct / 100) * 100) / 100 })).concat(
            r.shipping ? [{ code: "", description: "Spedizione", category: "Spedizione", supplier: "", brand: "", model: "", notes: "", quantity: 1, unit_price: r.shipping }] : []));
          setStep("review");
          return;
        }
        const r = await parseQuote(ps);
        setSupplier(r.supplier ?? ""); setQuoteDate(r.date ?? quoteDate); setValidUntil(r.valid_until ?? "");
        setNotes(r.notes ?? "");
        // prezzi sempre IVA inclusa e già scontati
        const gross = (i: { unit_price: number; discount_pct?: number | null; vat_pct?: number | null }) =>
          Math.round(i.unit_price * (1 - (i.discount_pct ?? 0) / 100) * (r.prices_include_vat ? 1 : 1 + (i.vat_pct ?? 22) / 100) * 100) / 100;
        setItems(r.items.map((i) => ({ code: i.code ?? "", description: i.description, category: i.category ?? "", supplier: "", brand: "", model: "", notes: "", quantity: i.quantity, unit_price: gross(i) })).concat(
          r.shipping_cost ? [{ code: "", description: "Spedizione", category: "Spedizione", supplier: r.supplier ?? "", brand: "", model: "", notes: "", quantity: 1, unit_price: r.shipping_cost }] : []));
        setStep("review");
      } catch (e) { setError(errMsg(e)); setStep("upload"); }
    }
  };

  const applyMapping = () => {
    if (mapping.description == null) return setError("Indica almeno la colonna della descrizione");
    setError("");
    const out: DraftItem[] = [];
    // se c'è un «Prezzo finale» compilato vale quello al posto del prezzo del preventivo
    const used = Object.values(mapping);
    const finalCol = header.findIndex((h, i) => /prezzo.*(final|definitiv|effettiv)/i.test(String(h ?? "")) && i !== mapping.unit_price);
    let grandTotal = 0;
    for (const r of grid.slice(Math.max(fromRow, headerRow + 1), toRow + 1)) {
      const get = (k: string) => (mapping[k] != null ? r[mapping[k]] : null);
      const base = String(get("description") ?? "").trim();
      if (!base) {   // riga senza descrizione: di solito il totale del foglio
        const t = toNum(get("total") ?? get("unit_price"));
        if (t) grandTotal = t;
        continue;
      }
      const description = base;
      const txt = (k: string) => String(get(k) ?? "").trim();
      const quantity = mapping.quantity != null ? toNum(get("quantity")) || 1 : 1;
      let unit_price = mapping.unit_price != null ? toNum(get("unit_price")) : 0;
      if (!unit_price && mapping.total != null && toNum(get("total"))) unit_price = toNum(get("total")) / quantity;
      if (finalCol >= 0 && toNum(r[finalCol])) unit_price = toNum(r[finalCol]);
      // salta righe di riepilogo (Totale, Imponibile, IVA...) senza quantità
      if (/^(totale|subtotale|sub-totale|imponibile|iva|total|sconto|trasporto)\b/i.test(description) && (mapping.quantity == null || get("quantity") == null)) continue;
      out.push({
        code: txt("code"), description, category: txt("category"), supplier: txt("supplier"), brand: txt("brand"), model: txt("model"), notes: txt("notes"),
        quantity, unit_price,
      });
    }
    void grandTotal;
    setItems(out); setStep("review");
  };

  const setItem = (i: number, patch: Partial<DraftItem>) => setItems(items.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const total = items.reduce((s, i) => s + lineTotal(i), 0);

  const save = async () => {
    if (!supplier.trim()) return setError("Dai un nome al preventivo (es. Impianto 70)");
    setStep("saving"); setError("");
    try {
      let source_path: string | null = aiPath;
      if (mode === "excel" && file) source_path = await uploadFile(`equipment/${projectId}`, file);
      const same = quotes.filter((q) => q.supplier.toLowerCase() === supplier.trim().toLowerCase());
      const version = 1 + Math.max(0, ...same.map((q) => q.version));
      const { data: q, error } = await supabase.from("equipment_quotes").insert({
        project_id: projectId, supplier: same[0]?.supplier ?? supplier.trim(), version, quote_date: quoteDate || null, valid_until: validUntil || null,
        prices_include_vat: true, shipping_cost: 0, notes: notes || null, source_path,
      }).select().single();
      if (error) throw error;
      if (items.length) {
        const rows = items.map((i, n) => ({
          ...i, code: i.code || null, category: i.category || null, supplier: i.supplier || null, brand: i.brand || null, model: i.model || null,
          notes: i.notes || null, quote_id: q.id, sort_order: n,
          quantity: Number(i.quantity), unit_price: Number(i.unit_price), discount_pct: 0, vat_pct: 22,
        }));
        let { error: e2 } = await supabase.from("equipment_quote_items").insert(rows);
        const missingCols = !!e2 && /brand|model|supplier/i.test(e2.message);
        if (missingCols) {
          // database senza 0016: marca e modello finiscono nella descrizione
          ({ error: e2 } = await supabase.from("equipment_quote_items").insert(rows.map(({ supplier: s, brand, model, ...r }) => ({
            ...r, description: [r.description, brand, model].filter(Boolean).join(" ") + (s ? ` — ${s}` : ""),
          }))));
        }
        if (e2) throw e2;
        if (missingCols) alert("Preventivo salvato, ma Fornitore, Marca e Modello non hanno ancora le loro colonne nel database: li ho messi nella descrizione. Esegui 0016_preventivi_marca_modello.sql su Supabase e reimporta.");
      }
      onDone(); onClose();
      nav(`/impianto/preventivo/${q.id}`);
    } catch (e) { setError(errMsg(e)); setStep("review"); }
  };

  const header = grid[headerRow] ?? [];
  const colLabel = (i: number) => `${String.fromCharCode(65 + (i % 26))}${i >= 26 ? Math.floor(i / 26) : ""}: ${String(header[i] ?? "").slice(0, 25)}`;
  const rowLabel = (i: number) => `${i + 1}: ${(grid[i] ?? []).filter((c) => c != null && c !== "").slice(0, 3).join(" | ").slice(0, 45)}`;

  return (
    <div className="modal-backdrop">
      <div className="modal wide">
        <h2>{mode === "excel" ? "📊 Importa preventivo da Excel / Fogli Google" : "📸 Importa preventivo da screenshot"}</h2>
        {step === "upload" && (
          <>
            <p>{mode === "excel"
              ? "Carica il file .xlsx del preventivo. Nel passo successivo scegli il foglio e quali colonne contengono descrizione, quantità e prezzi."
              : "Carica lo screenshot del preventivo (anche più di uno, ad esempio del foglio Google): leggo il testo direttamente sul telefono e ricavo righe, quantità e prezzi. Potrai correggere tutto prima di salvare."}</p>
            {mode === "excel" && (
              <div className="note small">
                <strong>Da un foglio Google</strong><br />
                Dal computer: <em>File → Scarica → Microsoft Excel (.xlsx)</em>.<br />
                Dall'app Fogli sul telefono: <em>⋮ → Condividi ed esporta → Salva come → Excel</em>, poi scegli il file da «File».<br />
                Al passo dopo scegli il tab (foglio) con il preventivo.
              </div>
            )}
            {mode === "excel" ? (
              <label className="btn primary">Scegli file Excel / CSV
                <input type="file" hidden accept=".xlsx,.csv,.tsv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(e) => pick(e.target.files)} />
              </label>
            ) : (
              <>
                <FilePicker onFiles={(f) => setAiPicked((p) => [...p, ...f].slice(0, 10))} accept="image/*,.txt,.csv"
                  hint="anche più screenshot" />
                <PickedList files={aiPicked} onRemove={(i) => setAiPicked(aiPicked.filter((_, j) => j !== i))} />
              </>
            )}
          </>
        )}
        {step === "reading" && <p>⏳ Sto leggendo il preventivo… {progress}</p>}
        {step === "map" && (
          <>
            <p><strong>Quale tab contiene il preventivo?</strong></p>
            <div className="pay-methods">
              {sheets.map((s) => (
                <button key={s} className={"pay-method" + (s === sheet ? " on" : "")} onClick={async () => { setSheet(s); await loadSheet(file!, s); }}>{s}</button>
              ))}
            </div>
            <div className="form-grid">
              <label><span>Riga d'intestazione</span>
                <select value={headerRow} onChange={(e) => { const h = Number(e.target.value); setHeaderRow(h); setFromRow(h + 1); setToRow(grid.length - 1); setMapping(guessMapping(grid[h] ?? [])); }}>
                  {grid.slice(0, 40).map((r, i) => <option key={i} value={i}>{i + 1}: {r.filter((c) => c != null).slice(0, 4).join(" | ").slice(0, 60)}</option>)}
                </select>
              </label>
              <label><span>Dalla riga</span>
                <select value={fromRow} onChange={(e) => { const v = Number(e.target.value); setFromRow(v); if (toRow < v) setToRow(v); }}>
                  {grid.map((r, i) => i > headerRow && <option key={i} value={i}>{rowLabel(i)}</option>)}
                </select>
              </label>
              <label><span>Alla riga</span>
                <select value={toRow} onChange={(e) => setToRow(Number(e.target.value))}>
                  {grid.map((r, i) => i >= fromRow && <option key={i} value={i}>{rowLabel(i)}</option>)}
                </select>
              </label>
              {FIELDS.map((f) => (
                <label key={f.key}><span>{f.label}</span>
                  <select value={mapping[f.key] ?? ""} onChange={(e) => setMapping({ ...mapping, [f.key]: e.target.value === "" ? (undefined as unknown as number) : Number(e.target.value) })}>
                    <option value="">— nessuna —</option>
                    {header.map((_, i) => <option key={i} value={i}>{colLabel(i)}</option>)}
                  </select>
                </label>
              ))}
            </div>
            <p className="muted small">Righe che importo: dalla {fromRow + 1} alla {toRow + 1} ({Math.max(0, toRow - fromRow + 1)} righe)</p>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Riga</th>{header.map((h, i) => <th key={i}>{colLabel(i)}</th>)}</tr></thead>
                <tbody>{grid.slice(fromRow, toRow + 1).slice(0, 40).map((r, i) => <tr key={i}><td className="small muted">{fromRow + i + 1}</td>{header.map((_, j) => <td key={j} className="small">{r[j] == null ? "" : String(r[j])}</td>)}</tr>)}</tbody>
              </table>
            </div>
          </>
        )}
        {(step === "review" || step === "saving") && (
          <>
            <div className="form-grid">
              <label><span>Nome del preventivo</span>
                <input list="eq-suppliers" value={supplier} onChange={(e) => setSupplier(e.target.value)} />
                <datalist id="eq-suppliers">{suppliers.map((s) => <option key={s} value={s} />)}</datalist>
              </label>
              <label><span>Data</span><input type="date" value={quoteDate} onChange={(e) => setQuoteDate(e.target.value)} /></label>
              <label><span>Valido fino al</span><input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} /></label>
            </div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Codice</th><th>Descrizione</th><th>Fornitore</th><th>Marca</th><th>Modello</th><th>Categoria</th><th>Note</th><th>Q.tà</th><th>Prezzo unit.</th><th>Totale</th><th /></tr></thead>
                <tbody>
                  {items.map((it, i) => (
                    <tr key={i}>
                      <td><input style={{ width: 80 }} value={it.code} onChange={(e) => setItem(i, { code: e.target.value })} /></td>
                      <td><input value={it.description} onChange={(e) => setItem(i, { description: e.target.value })} /></td>
                      <td><input style={{ width: 110 }} value={it.supplier} onChange={(e) => setItem(i, { supplier: e.target.value })} /></td>
                      <td><input style={{ width: 100 }} value={it.brand} onChange={(e) => setItem(i, { brand: e.target.value })} /></td>
                      <td><input style={{ width: 90 }} value={it.model} onChange={(e) => setItem(i, { model: e.target.value })} /></td>
                      <td><input style={{ width: 110 }} value={it.category} onChange={(e) => setItem(i, { category: e.target.value })} /></td>
                      <td><input style={{ width: 130 }} value={it.notes} onChange={(e) => setItem(i, { notes: e.target.value })} /></td>
                      <td><input type="number" step="any" style={{ width: 60 }} value={it.quantity} onChange={(e) => setItem(i, { quantity: Number(e.target.value) })} /></td>
                      <td><input type="number" step="any" style={{ width: 90 }} value={it.unit_price} onChange={(e) => setItem(i, { unit_price: Number(e.target.value) })} /></td>
                      <td className="nowrap">{eur(lineTotal(it))}</td>
                      <td><button className="icon" onClick={() => setItems(items.filter((_, j) => j !== i))}>🗑️</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button className="btn" onClick={() => setItems([...items, { code: "", description: "", category: "", supplier: "", brand: "", model: "", notes: "", quantity: 1, unit_price: 0 }])}>+ Aggiungi riga</button>
            <p>Totale: <strong>{eur(total)}</strong> ({items.length} righe)</p>
            {readText && !items.length && <p className="error">Non ho trovato righe con prezzi: aggiungile a mano o prova con uno screenshot più nitido.</p>}
            {readText && (
              <details>
                <summary className="muted small">Testo letto dallo screenshot{skipped.length ? ` (${skipped.length} righe scartate: totali, intestazioni…)` : ""}</summary>
                <pre className="small" style={{ whiteSpace: "pre-wrap" }}>{readText}</pre>
              </details>
            )}
            <label className="wide"><span>Note / condizioni</span><textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
          </>
        )}
        {error && <p className="error">{error}</p>}
        <div className="row-actions">
          {step === "upload" && mode === "ai" && aiPicked.length > 0 && <button className="btn primary" onClick={readAi}>🔎 Leggi il preventivo</button>}
          {step === "map" && <button className="btn primary" onClick={applyMapping}>Avanti →</button>}
          {step === "review" && mode === "excel" && <button className="btn" onClick={() => setStep("map")}>← Colonne</button>}
          {step === "review" && <button className="btn primary" onClick={save}>Salva preventivo</button>}
          {step === "saving" && <button className="btn primary" disabled>Salvo…</button>}
          <button className="btn" onClick={onClose}>Chiudi</button>
        </div>
      </div>
    </div>
  );
}

