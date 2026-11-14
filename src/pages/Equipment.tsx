import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import readXlsxFile, { readSheetNames } from "read-excel-file";
import { supabase, uploadFile, parseQuote, openFile, errMsg, eur, date, num, type Row } from "../lib";
import { useAuth } from "../auth";
import { RecordForm } from "../components/RecordForm";
import { RowsEditor } from "../components/RowsEditor";
import { HistoryList } from "../components/HistoryList";
import { Tabs } from "../components/Layout";
import { FilePicker } from "../components/FilePicker";
import { PickedList } from "./ImportRecipe";
import { textOf } from "../ocr";
import { parseQuoteText, parseCsv } from "../quoteParser";

const PROJECT_STATUS: Record<string, string> = { in_valutazione: "In valutazione", approvato: "Approvato", acquistato: "Acquistato", scartato: "Scartato" };
const QUOTE_STATUS: Record<string, string> = { ricevuto: "Ricevuto", in_trattativa: "In trattativa", scelto: "Scelto ✓", scartato: "Scartato", superato: "Superato da nuova versione" };

const lineTotal = (i: Row, includeVat: boolean) => {
  const net = Number(i.quantity) * Number(i.unit_price) * (1 - Number(i.discount_pct || 0) / 100);
  return includeVat ? net : net * (1 + Number(i.vat_pct ?? 22) / 100);
};

/** Elimina un preventivo (righe comprese) e il suo file; se era l'ultima versione, la precedente torna attiva. */
async function deleteQuote(q: Row) {
  const { error } = await supabase.from("equipment_quotes").delete().eq("id", q.id);
  if (error) throw error;
  if (q.source_path) await supabase.storage.from("documents").remove([q.source_path]);
  const { data: rest } = await supabase.from("equipment_quotes").select("id, status, version").eq("project_id", q.project_id).eq("supplier", q.supplier).order("version", { ascending: false });
  if (rest?.length && rest.every((r) => r.status === "superato")) await supabase.from("equipment_quotes").update({ status: "ricevuto" }).eq("id", rest[0].id);
}

// ------------------------------------------------------------------ elenco progetti
export function EquipmentProjects() {
  const { isAdmin } = useAuth();
  const nav = useNavigate();
  const [projects, setProjects] = useState<Row[]>([]);
  const [totals, setTotals] = useState<Row[]>([]);

  useEffect(() => {
    supabase.from("equipment_projects").select("*").order("created_at", { ascending: false }).then(({ data }) => setProjects(data ?? []));
    supabase.from("equipment_quote_totals").select("*").then(({ data }) => setTotals(data ?? []));
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
  const nav = useNavigate();
  const [project, setProject] = useState<Row | null>(null);
  const [quotes, setQuotes] = useState<Row[]>([]);
  const [totals, setTotals] = useState<Record<string, Row>>({});
  const [importMode, setImportMode] = useState<"excel" | "ai" | null>(null);
  const [compare, setCompare] = useState<string[]>([]);
  const [showOld, setShowOld] = useState(false);
  const [tab, setTab] = useState("preventivi");
  const [reload, setReload] = useState(0);

  useEffect(() => {
    supabase.from("equipment_projects").select("*").eq("id", id!).single().then(({ data }) => setProject(data));
    supabase.from("equipment_quotes").select("*").eq("project_id", id!).order("supplier").order("version", { ascending: false })
      .then(({ data }) => setQuotes(data ?? []));
    supabase.from("equipment_quote_totals").select("*").eq("project_id", id!)
      .then(({ data }) => setTotals(Object.fromEntries((data ?? []).map((t) => [t.quote_id, t]))));
  }, [id, reload]);

  const newManual = async () => {
    const supplier = prompt("Fornitore");
    if (!supplier) return;
    const version = 1 + Math.max(0, ...quotes.filter((q) => q.supplier.toLowerCase() === supplier.toLowerCase()).map((q) => q.version));
    const { error } = await supabase.from("equipment_quotes").insert({ project_id: id, supplier, version });
    if (error) return alert(errMsg(error));
    setReload((x) => x + 1);
  };

  if (!project) return <p>Caricamento…</p>;
  const visible = quotes.filter((q) => showOld || q.status !== "superato");
  const bySupplier = visible.reduce<Record<string, Row[]>>((acc, q) => ((acc[q.supplier] ??= []).push(q), acc), {});

  return (
    <div>
      <div className="page-head">
        <div>
          <Link to="/impianto" className="muted small">← Preventivi impianto</Link>
          <h1>{project.name}</h1>
        </div>
        {isAdmin && (
          <div className="row-actions">
            <button className="btn primary" onClick={() => setImportMode("excel")}>📊 Importa da Excel / Fogli Google</button>
            <button className="btn primary" onClick={() => setImportMode("ai")}>📸 Importa da screenshot</button>
            <button className="btn" onClick={newManual}>+ Manuale</button>
          </div>
        )}
      </div>
      {importMode && <ImportQuote projectId={project.id} quotes={quotes} mode={importMode} onClose={() => setImportMode(null)} onDone={() => setReload((x) => x + 1)} />}

      <Tabs active={tab} onChange={setTab} tabs={[["preventivi", "Preventivi"], ["confronto", `Confronto (${compare.length})`], ["scheda", "Scheda progetto"], ["storico", "Storico versioni"]]} />
      <div className="panel">
        {tab === "preventivi" && (
          <>
            <div className="toolbar">
              <label className="check"><input type="checkbox" checked={showOld} onChange={(e) => setShowOld(e.target.checked)} /> mostra anche le versioni superate</label>
              <span className="muted small">Spunta 2 o più preventivi per confrontarli.</span>
            </div>
            <div className="table-wrap">
              <table>
                <thead><tr><th /><th>Fornitore</th><th>Versione</th><th>Data</th><th>Valido fino</th><th>Righe</th><th>Totale IVA incl.</th><th>Stato</th>{isAdmin && <th />}</tr></thead>
                <tbody>
                  {Object.entries(bySupplier).map(([sup, qs]) => qs.map((q, i) => {
                    const t = totals[q.id];
                    const prev = qs[i + 1] ? totals[qs[i + 1].id] : null;
                    const delta = t && prev ? Number(t.total_with_vat) - Number(prev.total_with_vat) : null;
                    return (
                      <tr key={q.id} className={q.status === "superato" ? "muted" : ""}>
                        <td><input type="checkbox" checked={compare.includes(q.id)} onChange={(e) => setCompare(e.target.checked ? [...compare, q.id] : compare.filter((x) => x !== q.id))} /></td>
                        <td>{i === 0 ? <strong>{sup}</strong> : ""}</td>
                        <td><Link to={`/impianto/preventivo/${q.id}`}>v{q.version}</Link></td>
                        <td>{date(q.quote_date)}</td>
                        <td>{date(q.valid_until)}</td>
                        <td>{t?.items_count ?? 0}</td>
                        <td><strong>{eur(t?.total_with_vat)}</strong>{delta != null && Math.abs(delta) > 0.005 && <span className={delta < 0 ? "ok small" : "warn small"}> {delta < 0 ? "▼" : "▲"} {eur(Math.abs(delta))} vs v{qs[i + 1].version}</span>}</td>
                        <td><span className="badge">{QUOTE_STATUS[q.status]}</span></td>
                        {isAdmin && <td><button className="icon" title="Elimina preventivo" onClick={async () => {
                          if (!confirm(`Eliminare il preventivo ${q.supplier} v${q.version} con tutte le righe e il file?`)) return;
                          try { await deleteQuote(q); setReload((x) => x + 1); } catch (e) { alert(errMsg(e)); }
                        }}>🗑️</button></td>}
                      </tr>
                    );
                  }))}
                  {!visible.length && <tr><td colSpan={9} className="muted">Nessun preventivo. Importane uno da Excel o da screenshot.</td></tr>}
                </tbody>
              </table>
            </div>
            {project.budget && <p className="muted">Budget del progetto: <strong>{eur(project.budget)}</strong></p>}
          </>
        )}
        {tab === "confronto" && <QuoteComparison ids={compare} quotes={quotes} />}
        {tab === "scheda" && (
          <RecordForm table="equipment_projects" row={project} canEdit={isAdmin} onSaved={setProject} sections={[{ fields: [
            { key: "name", label: "Nome", required: true },
            { key: "status", label: "Stato", type: "select", required: true, options: Object.entries(PROJECT_STATUS).map(([value, label]) => ({ value, label })) },
            { key: "budget", label: "Budget €", type: "number", render: (v) => eur(v as number) },
            { key: "description", label: "Obiettivi / requisiti", type: "textarea" },
          ] }]} />
        )}
        {tab === "scheda" && isAdmin && (
          <button className="btn danger" style={{ width: "100%", marginTop: 16 }} onClick={async () => {
            if (!confirm(`Eliminare tutto il progetto «${project.name}» con i suoi ${quotes.length} preventivi e i file?`)) return;
            const files = quotes.map((q) => q.source_path).filter(Boolean);
            const { error } = await supabase.from("equipment_projects").delete().eq("id", project.id);
            if (error) return alert(errMsg(error));
            if (files.length) await supabase.storage.from("documents").remove(files);
            nav("/impianto");
          }}>🗑️ Elimina progetto</button>
        )}
        {tab === "storico" && <HistoryList recordIds={[project.id, ...quotes.map((q) => q.id)]} />}
      </div>
    </div>
  );
}

function QuoteComparison({ ids, quotes }: { ids: string[]; quotes: Row[] }) {
  const [items, setItems] = useState<Row[]>([]);
  useEffect(() => {
    if (!ids.length) return setItems([]);
    supabase.from("equipment_quote_items").select("*").in("quote_id", ids).order("sort_order").then(({ data }) => setItems(data ?? []));
  }, [ids.join(",")]);
  const qs = ids.map((id) => quotes.find((q) => q.id === id)!).filter(Boolean);
  if (qs.length < 2) return <p className="muted">Seleziona almeno 2 preventivi nella scheda "Preventivi".</p>;

  // raggruppa per categoria (o descrizione) per affiancare le voci
  const keyOf = (i: Row) => (i.category || i.description).toLowerCase().trim();
  const keys = [...new Set(items.map(keyOf))];
  const totalOf = (q: Row) => items.filter((i) => i.quote_id === q.id).reduce((s, i) => s + lineTotal(i, q.prices_include_vat), 0) + Number(q.shipping_cost);
  const best = Math.min(...qs.map(totalOf));

  return (
    <div className="table-wrap">
      <table>
        <thead><tr><th>Voce / categoria</th>{qs.map((q) => <th key={q.id}>{q.supplier} v{q.version}</th>)}</tr></thead>
        <tbody>
          {keys.map((k) => (
            <tr key={k}>
              <td>{k}</td>
              {qs.map((q) => {
                const its = items.filter((i) => i.quote_id === q.id && keyOf(i) === k);
                return <td key={q.id} className="small">{its.length ? its.map((i) => <div key={i.id}>{i.description}{i.quantity != 1 ? ` ×${num(i.quantity)}` : ""} — <strong>{eur(lineTotal(i, q.prices_include_vat))}</strong></div>) : <span className="muted">—</span>}</td>;
              })}
            </tr>
          ))}
          <tr><td>Trasporto / extra</td>{qs.map((q) => <td key={q.id}>{eur(q.shipping_cost)}</td>)}</tr>
          <tr><td><strong>Totale IVA inclusa</strong></td>{qs.map((q) => <td key={q.id}><strong className={totalOf(q) === best ? "ok" : ""}>{eur(totalOf(q))}{totalOf(q) === best ? " ★" : ""}</strong></td>)}</tr>
          <tr><td>Note</td>{qs.map((q) => <td key={q.id} className="small pre">{q.notes ?? "—"}</td>)}</tr>
        </tbody>
      </table>
      <p className="muted small">Le voci sono affiancate per categoria: assegna la stessa categoria (es. "pentola", "fermentatore") alle righe equivalenti per un confronto più preciso.</p>
    </div>
  );
}

// ------------------------------------------------------------------ dettaglio preventivo
export function EquipmentQuote() {
  const { id } = useParams();
  const { isAdmin } = useAuth();
  const nav = useNavigate();
  const [q, setQ] = useState<Row | null>(null);
  const [items, setItems] = useState<Row[]>([]);
  const [siblings, setSiblings] = useState<Row[]>([]);

  useEffect(() => {
    supabase.from("equipment_quotes").select("*").eq("id", id!).single().then(({ data }) => {
      setQ(data);
      if (data) supabase.from("equipment_quotes").select("id, version, status").eq("project_id", data.project_id).eq("supplier", data.supplier)
        .order("version").then(({ data: s }) => setSiblings(s ?? []));
    });
  }, [id]);

  const newVersion = async () => {
    if (!q) return;
    const version = Math.max(...siblings.map((s) => s.version)) + 1;
    if (!confirm(`Creare la versione v${version} partendo da questa? La versione attuale verrà segnata come "superata".`)) return;
    const { id: _i, created_at, updated_at, ...rest } = q;
    void _i; void created_at; void updated_at;
    const { data: nq, error } = await supabase.from("equipment_quotes").insert({ ...rest, version, status: "ricevuto", quote_date: new Date().toISOString().slice(0, 10) }).select().single();
    if (error) return alert(errMsg(error));
    if (items.length) await supabase.from("equipment_quote_items").insert(items.map(({ id: _x, ...i }) => ({ ...i, quote_id: nq.id })));
    await supabase.from("equipment_quotes").update({ status: "superato" }).eq("id", q.id);
    nav(`/impianto/preventivo/${nq.id}`);
  };

  const remove = async () => {
    if (!q || !confirm(`Eliminare il preventivo ${q.supplier} v${q.version} con tutte le righe${q.source_path ? " e il file" : ""}?`)) return;
    try { await deleteQuote(q); nav(`/impianto/${q.project_id}`); } catch (e) { alert(errMsg(e)); }
  };
  const removeFile = async () => {
    if (!q?.source_path || !confirm("Togliere il file originale? Il preventivo e le righe restano.")) return;
    await supabase.storage.from("documents").remove([q.source_path]);
    const { data, error } = await supabase.from("equipment_quotes").update({ source_path: null }).eq("id", q.id).select().single();
    if (error) return alert(errMsg(error));
    setQ(data);
  };

  if (!q) return <p>Caricamento…</p>;
  const goods = items.reduce((s, i) => s + lineTotal(i, true), 0);
  const total = items.reduce((s, i) => s + lineTotal(i, q.prices_include_vat), 0) + Number(q.shipping_cost);

  return (
    <div>
      <div className="page-head">
        <div>
          <Link to={`/impianto/${q.project_id}`} className="muted small">← Progetto</Link>
          <h1>{q.supplier} <span className="badge">v{q.version}</span> <span className="badge">{QUOTE_STATUS[q.status]}</span></h1>
          <div className="row-actions">
            {siblings.map((s) => <Link key={s.id} to={`/impianto/preventivo/${s.id}`} className={"badge" + (s.id === q.id ? " admin" : "")}>v{s.version}</Link>)}
          </div>
        </div>
        <div className="row-actions">
          {q.source_path && <button className="btn" onClick={() => openFile(q.source_path).catch((e) => alert(errMsg(e)))}>📎 File originale</button>}
          {q.source_path && isAdmin && <button className="btn" onClick={removeFile}>🗑️ Togli file</button>}
          {isAdmin && <button className="btn primary" onClick={newVersion}>⧉ Nuova versione</button>}
        </div>
      </div>
      <div className="kpis">
        <div className="kpi"><span>Righe</span><strong>{items.length}</strong></div>
        <div className="kpi"><span>Merce (scontata, {q.prices_include_vat ? "IVA incl." : "IVA escl."})</span><strong>{eur(goods)}</strong></div>
        <div className="kpi"><span>Trasporto / extra</span><strong>{eur(q.shipping_cost)}</strong></div>
        <div className="kpi main"><span>Totale IVA inclusa</span><strong>{eur(total)}</strong></div>
      </div>
      <div className="panel">
        <RecordForm table="equipment_quotes" row={q} canEdit={isAdmin} onSaved={setQ} sections={[{ fields: [
          { key: "supplier", label: "Fornitore", required: true },
          { key: "status", label: "Stato", type: "select", required: true, options: Object.entries(QUOTE_STATUS).map(([value, label]) => ({ value, label })) },
          { key: "quote_date", label: "Data", type: "date" },
          { key: "valid_until", label: "Valido fino al", type: "date" },
          { key: "shipping_cost", label: "Trasporto / extra € (IVA incl.)", type: "number", render: (v) => eur(v as number) },
          { key: "prices_include_vat", label: "Prezzi IVA inclusa", type: "checkbox" },
          { key: "notes", label: "Note / condizioni", type: "textarea" },
        ] }]} />
      </div>
      <div className="panel">
        <h2>Righe</h2>
        <RowsEditor table="equipment_quote_items" parentKey="quote_id" parentId={q.id} canEdit={isAdmin}
          orderBy={{ column: "sort_order" }} onChange={setItems} defaults={{ quantity: 1, discount_pct: 0, vat_pct: 22, sort_order: items.length }}
          fields={[
            { key: "code", label: "Codice" },
            { key: "description", label: "Descrizione", required: true },
            { key: "category", label: "Categoria" },
            { key: "supplier", label: "Fornitore" },
            { key: "brand", label: "Marca" },
            { key: "model", label: "Modello" },
            { key: "quantity", label: "Q.tà", type: "number", required: true },
            { key: "unit_price", label: "Prezzo unit. €", type: "number", required: true, render: (v) => eur(v as number) },
            { key: "discount_pct", label: "Sconto %", type: "number" },
            { key: "vat_pct", label: "IVA %", type: "number" },
            { key: "sort_order", label: "Ordine", type: "number" },
          ]}
          extraColumns={[{ label: "Totale IVA incl.", render: (r) => eur(lineTotal(r, q.prices_include_vat)) }]} />
      </div>
      {isAdmin && <button className="btn danger" style={{ width: "100%", margin: "4px 0 16px" }} onClick={remove}>🗑️ Elimina preventivo</button>}
      <div className="panel">
        <h2>Storico versioni di questo preventivo</h2>
        <HistoryList relatedTo={{ id: q.id, key: "quote_id" }} />
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ import
interface DraftItem { code: string; description: string; category: string; supplier: string; brand: string; model: string; quantity: number; unit_price: number; discount_pct: number; vat_pct: number }
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
  { key: "discount_pct", label: "Sconto %", match: /(sconto|sc\.|disc)/i },
  { key: "vat_pct", label: "IVA %", match: /^(iva|vat|aliq)/i },
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
  const [includeVat, setIncludeVat] = useState(false);
  const [shipping, setShipping] = useState(0);
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
          setItems(r.items.map((i) => ({ ...i, supplier: "", brand: "", model: "" }))); setShipping(r.shipping); setIncludeVat(r.includeVat);
          setStep("review");
          return;
        }
        const r = await parseQuote(ps);
        setSupplier(r.supplier ?? ""); setQuoteDate(r.date ?? quoteDate); setValidUntil(r.valid_until ?? "");
        setIncludeVat(r.prices_include_vat); setShipping(r.shipping_cost ?? 0); setNotes(r.notes ?? "");
        setItems(r.items.map((i) => ({ code: i.code ?? "", description: i.description, category: i.category ?? "", supplier: "", brand: "", model: "", quantity: i.quantity, unit_price: i.unit_price, discount_pct: i.discount_pct ?? 0, vat_pct: i.vat_pct ?? 22 })));
        setStep("review");
      } catch (e) { setError(errMsg(e)); setStep("upload"); }
    }
  };

  const applyMapping = () => {
    if (mapping.description == null) return setError("Indica almeno la colonna della descrizione");
    setError("");
    const out: DraftItem[] = [];
    // le note del foglio vanno fra parentesi nella descrizione;
    // se c'è un «Prezzo finale» compilato vale quello al posto del prezzo del preventivo
    const used = Object.values(mapping);
    const noteCol = header.findIndex((h, i) => /^note/i.test(String(h ?? "")) && !used.includes(i));
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
      const note = noteCol >= 0 ? String(r[noteCol] ?? "").trim() : "";
      const description = base + (note ? ` (${note})` : "");
      const txt = (k: string) => String(get(k) ?? "").trim();
      const quantity = mapping.quantity != null ? toNum(get("quantity")) || 1 : 1;
      let unit_price = mapping.unit_price != null ? toNum(get("unit_price")) : 0;
      if (!unit_price && mapping.total != null && toNum(get("total"))) unit_price = toNum(get("total")) / quantity;
      if (finalCol >= 0 && toNum(r[finalCol])) unit_price = toNum(r[finalCol]);
      // salta righe di riepilogo (Totale, Imponibile, IVA...) senza quantità
      if (/^(totale|subtotale|sub-totale|imponibile|iva|total|sconto|trasporto)\b/i.test(description) && (mapping.quantity == null || get("quantity") == null)) continue;
      out.push({
        code: txt("code"), description, category: txt("category"), supplier: txt("supplier"), brand: txt("brand"), model: txt("model"),
        quantity, unit_price, discount_pct: toNum(get("discount_pct")), vat_pct: mapping.vat_pct != null ? toNum(get("vat_pct")) || 22 : 22,
      });
    }
    const priceHead = String(header[mapping.unit_price ?? mapping.total ?? -1] ?? "");
    const sum = out.reduce((t, i) => t + i.quantity * i.unit_price * (1 - i.discount_pct / 100), 0);
    // se il totale del foglio è la somma semplice delle righe, i prezzi sono già IVA inclusa
    if (/iva\s*(incl|compr)|ivat/i.test(priceHead) || (grandTotal && Math.abs(sum - grandTotal) < 0.05)) setIncludeVat(true);
    // trasporto / spedizione come riga del foglio → campo trasporto
    const ship = out.filter((i) => /(spedizion|trasport|consegna|corriere)/i.test(i.description));
    if (ship.length) setShipping(ship.reduce((t, i) => t + i.quantity * i.unit_price, 0));
    setItems(out.filter((i) => !ship.includes(i))); setStep("review");
  };

  const setItem = (i: number, patch: Partial<DraftItem>) => setItems(items.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const total = items.reduce((s, i) => s + lineTotal(i, includeVat), 0) + Number(shipping || 0);

  const save = async () => {
    if (!supplier.trim()) return setError("Indica il fornitore");
    setStep("saving"); setError("");
    try {
      let source_path: string | null = aiPath;
      if (mode === "excel" && file) source_path = await uploadFile(`equipment/${projectId}`, file);
      const same = quotes.filter((q) => q.supplier.toLowerCase() === supplier.trim().toLowerCase());
      const version = 1 + Math.max(0, ...same.map((q) => q.version));
      const { data: q, error } = await supabase.from("equipment_quotes").insert({
        project_id: projectId, supplier: same[0]?.supplier ?? supplier.trim(), version, quote_date: quoteDate || null, valid_until: validUntil || null,
        prices_include_vat: includeVat, shipping_cost: Number(shipping || 0), notes: notes || null, source_path,
      }).select().single();
      if (error) throw error;
      if (items.length) {
        const rows = items.map((i, n) => ({
          ...i, code: i.code || null, category: i.category || null, supplier: i.supplier || null, brand: i.brand || null, model: i.model || null,
          quote_id: q.id, sort_order: n,
          quantity: Number(i.quantity), unit_price: Number(i.unit_price), discount_pct: Number(i.discount_pct || 0), vat_pct: Number(i.vat_pct ?? 22),
        }));
        let { error: e2 } = await supabase.from("equipment_quote_items").insert(rows);
        if (e2 && /brand|model|supplier/i.test(e2.message)) {
          // database senza 0016: marca e modello finiscono nella descrizione
          ({ error: e2 } = await supabase.from("equipment_quote_items").insert(rows.map(({ supplier: s, brand, model, ...r }) => ({
            ...r, description: [r.description, brand, model].filter(Boolean).join(" ") + (s ? ` — ${s}` : ""),
          }))));
        }
        if (e2) throw e2;
      }
      if (same.length) await supabase.from("equipment_quotes").update({ status: "superato" }).in("id", same.filter((s) => s.status !== "scartato").map((s) => s.id));
      onDone(); onClose();
      nav(`/impianto/preventivo/${q.id}`);
    } catch (e) { setError(errMsg(e)); setStep("review"); }
  };

  const header = grid[headerRow] ?? [];
  const colLabel = (i: number) => `${String.fromCharCode(65 + (i % 26))}${i >= 26 ? Math.floor(i / 26) : ""}: ${String(header[i] ?? "").slice(0, 25)}`;
  const rowLabel = (i: number) => `${i + 1}: ${(grid[i] ?? []).filter((c) => c != null && c !== "").slice(0, 3).join(" | ").slice(0, 45)}`;
  const isNewVersion = suppliers.some((s) => s.toLowerCase() === supplier.trim().toLowerCase());

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
              <label><span>Fornitore</span>
                <input list="eq-suppliers" value={supplier} onChange={(e) => setSupplier(e.target.value)} />
                <datalist id="eq-suppliers">{suppliers.map((s) => <option key={s} value={s} />)}</datalist>
              </label>
              <label><span>Data</span><input type="date" value={quoteDate} onChange={(e) => setQuoteDate(e.target.value)} /></label>
              <label><span>Valido fino al</span><input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} /></label>
              <label><span>Trasporto / extra €</span><input type="number" step="any" value={shipping} onChange={(e) => setShipping(Number(e.target.value))} /></label>
              <label className="check"><input type="checkbox" checked={includeVat} onChange={(e) => setIncludeVat(e.target.checked)} /> prezzi IVA inclusa</label>
            </div>
            {isNewVersion && <p className="note">Esiste già un preventivo di "{supplier}": questo verrà salvato come <strong>nuova versione</strong> e quella precedente segnata come superata.</p>}
            <div className="table-wrap">
              <table>
                <thead><tr><th>Codice</th><th>Descrizione</th><th>Fornitore</th><th>Marca</th><th>Modello</th><th>Categoria</th><th>Q.tà</th><th>Prezzo unit.</th><th>Sc. %</th><th>IVA %</th><th>Totale</th><th /></tr></thead>
                <tbody>
                  {items.map((it, i) => (
                    <tr key={i}>
                      <td><input style={{ width: 80 }} value={it.code} onChange={(e) => setItem(i, { code: e.target.value })} /></td>
                      <td><input value={it.description} onChange={(e) => setItem(i, { description: e.target.value })} /></td>
                      <td><input style={{ width: 110 }} value={it.supplier} onChange={(e) => setItem(i, { supplier: e.target.value })} /></td>
                      <td><input style={{ width: 100 }} value={it.brand} onChange={(e) => setItem(i, { brand: e.target.value })} /></td>
                      <td><input style={{ width: 90 }} value={it.model} onChange={(e) => setItem(i, { model: e.target.value })} /></td>
                      <td><input style={{ width: 110 }} value={it.category} onChange={(e) => setItem(i, { category: e.target.value })} /></td>
                      <td><input type="number" step="any" style={{ width: 60 }} value={it.quantity} onChange={(e) => setItem(i, { quantity: Number(e.target.value) })} /></td>
                      <td><input type="number" step="any" style={{ width: 90 }} value={it.unit_price} onChange={(e) => setItem(i, { unit_price: Number(e.target.value) })} /></td>
                      <td><input type="number" step="any" style={{ width: 55 }} value={it.discount_pct} onChange={(e) => setItem(i, { discount_pct: Number(e.target.value) })} /></td>
                      <td><input type="number" step="any" style={{ width: 55 }} value={it.vat_pct} onChange={(e) => setItem(i, { vat_pct: Number(e.target.value) })} /></td>
                      <td className="nowrap">{eur(lineTotal(it, includeVat))}</td>
                      <td><button className="icon" onClick={() => setItems(items.filter((_, j) => j !== i))}>🗑️</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button className="btn" onClick={() => setItems([...items, { code: "", description: "", category: "", supplier: "", brand: "", model: "", quantity: 1, unit_price: 0, discount_pct: 0, vat_pct: 22 }])}>+ Aggiungi riga</button>
            <p>Totale IVA inclusa: <strong>{eur(total)}</strong> ({items.length} righe)</p>
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

