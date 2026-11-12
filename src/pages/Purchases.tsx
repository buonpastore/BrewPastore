import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  supabase, uploadFile, parseDocument, findOrCreateMaterial, loadMaterials, errMsg, eur, date,
  MATERIAL_CATEGORIES, UNITS, type ParsedDocument, type Row,
} from "../lib";
import { useAuth } from "../auth";
import { RecordForm } from "../components/RecordForm";
import { RowsEditor } from "../components/RowsEditor";
import { DocumentsPanel } from "../components/DocumentsPanel";
import { FilePicker } from "../components/FilePicker";
import { PickedList } from "./ImportRecipe";
import { parseOrderText } from "../textParser";
import { rebuildPurchasesFromDocuments, type RebuildReport } from "../rebuild";

export function Purchases({ embedded = false }: { embedded?: boolean }) {
  const { isAdmin } = useAuth();
  const nav = useNavigate();
  const [rows, setRows] = useState<Row[]>([]);
  const [importing, setImporting] = useState(false);
  const [pasted, setPasted] = useState<File[] | undefined>();

  useEffect(() => {
    supabase.from("purchases").select("*, purchase_items(total_price)").order("purchase_date", { ascending: false })
      .then(({ data }) => setRows(data ?? []));
  }, []);

  const [rebuilding, setRebuilding] = useState<string | null>(null);
  const [report, setReport] = useState<RebuildReport | null>(null);
  const rebuild = async () => {
    if (!confirm("Rileggo tutti gli ordini dai documenti salvati con la lettura aggiornata e sostituisco le loro righe?\n(Funziona per gli ordini importati da testo; quelli da PDF o foto restano com'erano.)")) return;
    setReport(null);
    try {
      const r = await rebuildPurchasesFromDocuments((m) => setRebuilding(m));
      setReport(r);
      const { data } = await supabase.from("purchases").select("*, purchase_items(total_price)").order("purchase_date", { ascending: false });
      setRows(data ?? []);
    } catch (e) { alert(errMsg(e)); }
    setRebuilding(null);
  };

  const removePurchase = async (p: Row, goods: number) => {
    if (!confirm(`Eliminare l'acquisto ${p.supplier} del ${date(p.purchase_date)} (${p.purchase_items.length} righe, ${eur(goods + Number(p.shipping_cost))})?\nI costi medi verranno ricalcolati.`)) return;
    const { data: docs } = await supabase.from("documents").select("id, storage_path").eq("purchase_id", p.id);
    if (docs?.length) {
      await supabase.storage.from("documents").remove(docs.map((d) => d.storage_path));
      await supabase.from("documents").delete().in("id", docs.map((d) => d.id));
    }
    const { error } = await supabase.from("purchases").delete().eq("id", p.id);
    if (error) return alert(errMsg(error));
    setRows((r) => r.filter((x) => x.id !== p.id));
  };

  const manual = async () => {
    const supplier = prompt("Fornitore");
    if (!supplier) return;
    const { data, error } = await supabase.from("purchases").insert({ supplier }).select().single();
    if (error) return alert(errMsg(error));
    nav(`/acquisti/${data.id}`);
  };

  return (
    <div>
      {!embedded && <div className="page-head"><h1>Acquisti materie prime</h1></div>}
      <div className="table-wrap">
        <table>
          <thead><tr><th>Data</th><th>Fornitore</th><th>N° doc.</th><th>Righe</th><th>Merce</th><th>Spedizione</th><th>Totale</th>{isAdmin && <th />}</tr></thead>
          <tbody>
            {rows.map((p) => {
              const goods = (p.purchase_items as Row[]).reduce((s, i) => s + Number(i.total_price), 0);
              return (
                <tr key={p.id}>
                  <td>{date(p.purchase_date)}</td>
                  <td><Link to={`/acquisti/${p.id}`}>{p.supplier}</Link></td>
                  <td>{p.invoice_number ?? "—"}</td>
                  <td>{p.purchase_items.length}</td>
                  <td>{eur(goods)}</td>
                  <td>{eur(p.shipping_cost)}</td>
                  <td><strong>{eur(goods + Number(p.shipping_cost))}</strong></td>
                  {isAdmin && <td><button className="icon" title="Elimina acquisto" onClick={() => removePurchase(p, goods)}>🗑️</button></td>}
                </tr>
              );
            })}
            {!rows.length && <tr><td colSpan={7} className="muted">Nessun acquisto. Importane uno qui sotto (es. il PDF o il testo dell'ordine Mr Malt).</td></tr>}
          </tbody>
        </table>
      </div>
      {isAdmin && (
        <div className="ing-import">
          <h3>Importa un acquisto</h3>
          {!importing && (
            <FilePicker compact allowText onFiles={(f) => { setPasted(f); setImporting(true); }} accept="application/pdf,image/*,.eml,.txt,.html"
              title="📋 Incolla qui" hint="fattura, screenshot, scontrino o testo" />
          )}
          <div className="row-actions">
            <button className="mini-btn" onClick={manual}>✏️ <span>Inserimento manuale</span></button>
            <button className="mini-btn" disabled={rebuilding !== null} onClick={rebuild}>♻️ <span>{rebuilding ?? "Rileggi tutti gli ordini salvati"}</span></button>
          </div>
          {report && (
            <div className="rebuild-report">
              {report.ok.map((x) => <div key={x} className="ok small">✓ {x}</div>)}
              {report.skipped.map((x) => <div key={x} className="muted small">– {x}</div>)}
              {report.errors.map((x) => <div key={x} className="error small">✗ {x}</div>)}
            </div>
          )}
        </div>
      )}
      {importing && <ImportPurchase initialFiles={pasted} onClose={() => { setImporting(false); setPasted(undefined); }} />}
    </div>
  );
}

interface ReviewItem { code?: string | null; description: string; material_name: string; material_id: string; category: string; quantity: number; unit: string; total_price: number }

/** Upload → lettura AI → revisione → salvataggio acquisto */
export function ImportPurchase({ onClose, initialFiles }: { onClose: () => void; initialFiles?: File[] }) {
  const nav = useNavigate();
  const [step, setStep] = useState<"upload" | "reading" | "review" | "saving">("upload");
  const [picked, setPicked] = useState<File[]>(initialFiles ?? []);
  const [uploaded, setUploaded] = useState<{ path: string; name: string; type: string; size: number }[]>([]);
  const [head, setHead] = useState<Omit<ParsedDocument, "items">>({ supplier: "", date: null, invoice_number: null, currency: "EUR", shipping_cost: 0, total_amount: null, notes: null });
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [materials, setMaterials] = useState<Row[]>([]);
  const [error, setError] = useState("");

  const [materialsLoaded, setMaterialsLoaded] = useState(false);
  useEffect(() => { loadMaterials().then((m) => { setMaterials(m); setMaterialsLoaded(true); }); }, []);

  const addFiles = (files: File[]) => {
    if (!files.length) return;
    setError("");
    setPicked((prev) => [...prev, ...files].slice(0, 10));
  };

  const read = async () => {
    if (!picked.length) return;
    setError(""); setStep("reading");
    try {
      const ups = [];
      for (const f of picked) ups.push({ path: await uploadFile("purchases/import", f), name: f.name, type: f.type, size: f.size });
      setUploaded(ups);
      // testo incollato: prima prova la lettura diretta (non serve l'AI)
      let parsed: ParsedDocument | null = null;
      if (picked.every((f) => f.type.startsWith("text/") || /\.txt$/i.test(f.name))) {
        const texts = await Promise.all(picked.map((f) => f.text()));
        const local = parseOrderText(texts.join("\n"));
        if (local.items.length) parsed = local;
      }
      if (!parsed) parsed = await parseDocument(ups.map((u) => u.path));
      const { items: its, ...h } = parsed;
      setHead({ ...h, supplier: h.supplier ?? "", date: h.date ?? new Date().toISOString().slice(0, 10) });
      setItems(its.map((i) => {
        const match = materials.find((m) => m.name.toLowerCase() === i.material_name.toLowerCase());
        return { ...i, material_id: match?.id ?? "" };
      }));
      setStep("review");
    } catch (e) { setError(errMsg(e)); setStep("upload"); }
  };

  const started = useRef(false);
  useEffect(() => {
    if (initialFiles?.length && !started.current && materialsLoaded) { started.current = true; read(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [materialsLoaded]);

  const setItem = (i: number, patch: Partial<ReviewItem>) => setItems(items.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const goods = items.reduce((s, i) => s + Number(i.total_price || 0), 0);
  const computed = goods + Number(head.shipping_cost || 0);

  const save = async () => {
    setStep("saving"); setError("");
    try {
      const kindOf = (u: { name: string; type: string }) =>
        u.type === "application/pdf" ? "fattura" : u.name.endsWith(".eml") ? "email" : u.type.startsWith("image/") ? "scontrino" : "altro";
      const { data: docs, error: de } = await supabase.from("documents").insert(uploaded.map((u) => ({
        title: u.name, kind: kindOf(u), storage_path: u.path, mime_type: u.type, size_bytes: u.size,
      }))).select();
      if (de) throw de;
      const { data: p, error: pe } = await supabase.from("purchases").insert({
        supplier: head.supplier || "Sconosciuto", purchase_date: head.date ?? new Date().toISOString().slice(0, 10),
        invoice_number: head.invoice_number, shipping_cost: Number(head.shipping_cost || 0), total_amount: head.total_amount,
        notes: head.notes, document_id: docs?.[0]?.id ?? null,
      }).select().single();
      if (pe) throw pe;
      await supabase.from("documents").update({ purchase_id: p.id }).in("id", (docs ?? []).map((d) => d.id));
      const rows = [];
      for (const it of items) {
        const material_id = it.material_id || await findOrCreateMaterial(it.material_name, it.category, it.unit);
        rows.push({ purchase_id: p.id, material_id, description: it.code ? `[${it.code}] ${it.description}` : it.description, quantity: Number(it.quantity), unit: it.unit, total_price: Number(it.total_price) });
      }
      if (rows.length) {
        const { error } = await supabase.from("purchase_items").insert(rows);
        if (error) throw error;
      }
      onClose();
      nav(`/acquisti/${p.id}`);
    } catch (e) { setError(errMsg(e)); setStep("review"); }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal wide">
        <h2>📄 Importa acquisto</h2>
        {step === "upload" && (
          <>
            <p className="muted">Fattura PDF, screenshot dell'ordine, foto dello scontrino, email <code>.eml</code> o testo: controlli le righe prima di salvare.</p>
            <FilePicker onFiles={addFiles} accept="application/pdf,image/*,.eml,.txt,.html" allowText
              hint="più screenshot dello stesso ordine vengono uniti" />
            <PickedList files={picked} onRemove={(i) => setPicked(picked.filter((_, j) => j !== i))} />
          </>
        )}
        {step === "reading" && <p>⏳ Sto leggendo il documento… (può volerci fino a un minuto)</p>}
        {(step === "review" || step === "saving") && (
          <>
            <div className="form-grid">
              <label><span>Fornitore</span><input value={head.supplier ?? ""} onChange={(e) => setHead({ ...head, supplier: e.target.value })} /></label>
              <label><span>Data</span><input type="date" value={head.date ?? ""} onChange={(e) => setHead({ ...head, date: e.target.value })} /></label>
              <label><span>N° documento</span><input value={head.invoice_number ?? ""} onChange={(e) => setHead({ ...head, invoice_number: e.target.value })} /></label>
              <label><span>Spedizione €</span><input type="number" step="any" value={head.shipping_cost} onChange={(e) => setHead({ ...head, shipping_cost: Number(e.target.value) })} /></label>
            </div>
            <div className="table-wrap">
              <table className="review-table">
                <thead><tr><th>Codice</th><th>Riga documento</th><th>Materia prima</th><th>Categoria</th><th>Q.tà</th><th>Unità</th><th>Prezzo riga €</th><th /></tr></thead>
                <tbody>
                  {items.map((it, i) => (
                    <tr key={i}>
                      <td data-label="Codice" className="rv-code"><input value={it.code ?? ""} placeholder="—" onChange={(e) => setItem(i, { code: e.target.value })} style={{ width: 95 }} /></td>
                      <td className="small rv-desc">{it.description}</td>
                      <td data-label="Materia prima" className="rv-wide">
                        <select value={it.material_id} onChange={(e) => setItem(i, { material_id: e.target.value })}>
                          <option value="">➕ nuova: {it.material_name}</option>
                          {materials.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                        </select>
                        {!it.material_id && <input value={it.material_name} onChange={(e) => setItem(i, { material_name: e.target.value })} />}
                      </td>
                      <td data-label="Categoria"><select value={it.category} onChange={(e) => setItem(i, { category: e.target.value })}>{MATERIAL_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></td>
                      <td data-label="Quantità"><input type="number" step="any" style={{ width: 80 }} value={it.quantity} onChange={(e) => setItem(i, { quantity: Number(e.target.value) })} /></td>
                      <td data-label="Unità"><select value={it.unit} onChange={(e) => setItem(i, { unit: e.target.value })}>{UNITS.map((u) => <option key={u}>{u}</option>)}</select></td>
                      <td data-label="Prezzo €"><input type="number" step="any" style={{ width: 90 }} value={it.total_price} onChange={(e) => setItem(i, { total_price: Number(e.target.value) })} /></td>
                      <td className="rv-del"><button className="icon" title="Togli riga" onClick={() => setItems(items.filter((_, j) => j !== i))}>🗑️</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p>
              Merce {eur(goods)} + spedizione {eur(head.shipping_cost)} = <strong>{eur(computed)}</strong>
              {head.total_amount != null && (
                Math.abs(head.total_amount - computed) > 0.05
                  ? <span className="warn"> ⚠️ il documento riporta {eur(head.total_amount)}: controlla le righe</span>
                  : <span className="ok"> ✓ coincide con il totale del documento</span>
              )}
            </p>
            {head.notes && <p className="note">📝 {head.notes}</p>}
          </>
        )}
        {error && <p className="error">{error}</p>}
        <div className="row-actions">
          {step === "upload" && picked.length > 0 && <button className="btn primary" onClick={read}>🔎 Leggi {picked.length > 1 ? `${picked.length} file` : "il file"}</button>}
          {step === "review" && <button className="btn primary" onClick={save}>Salva acquisto</button>}
          {step === "saving" && <button className="btn primary" disabled>Salvo…</button>}
          <button className="btn" onClick={onClose}>Chiudi</button>
        </div>
      </div>
    </div>
  );
}

export function PurchaseDetail() {
  const { id } = useParams();
  const { isAdmin } = useAuth();
  const nav = useNavigate();
  const [p, setP] = useState<Row | null>(null);
  const [materials, setMaterials] = useState<Row[]>([]);
  const [goods, setGoods] = useState(0);

  useEffect(() => {
    supabase.from("purchases").select("*").eq("id", id!).single().then(({ data }) => setP(data));
    loadMaterials().then(setMaterials);
  }, [id]);

  const remove = async () => {
    if (!confirm("Eliminare l'acquisto e tutte le sue righe?")) return;
    const { error } = await supabase.from("purchases").delete().eq("id", id!);
    if (error) return alert(errMsg(error));
    nav("/materie-prime?vista=acquisti");
  };

  if (!p) return <p>Caricamento…</p>;
  return (
    <div>
      <div className="page-head">
        <div>
          <Link to="/materie-prime?vista=acquisti" className="muted small">← Acquisti</Link>
          <h1>{p.supplier} <span className="muted">{date(p.purchase_date)}</span></h1>
        </div>
        {isAdmin && <button className="btn danger" onClick={remove}>Elimina acquisto</button>}
      </div>
      <div className="panel">
        <RecordForm table="purchases" row={p} canEdit={isAdmin} onSaved={setP} sections={[{ fields: [
          { key: "supplier", label: "Fornitore", required: true },
          { key: "purchase_date", label: "Data", type: "date", required: true },
          { key: "invoice_number", label: "N° documento" },
          { key: "shipping_cost", label: "Spedizione €", type: "number", render: (v) => eur(v as number) },
          { key: "total_amount", label: "Totale documento €", type: "number", render: (v) => eur(v as number) },
          { key: "notes", label: "Note", type: "textarea" },
        ] }]} />
      </div>
      <div className="panel">
        <h2>Righe</h2>
        <RowsEditor table="purchase_items" parentKey="purchase_id" parentId={p.id} canEdit={isAdmin}
          defaults={{ unit: "kg" }} onChange={(rows) => setGoods(rows.reduce((s, r) => s + Number(r.total_price), 0))}
          fields={[
            { key: "material_id", label: "Materia prima", type: "select", required: true, options: materials.map((m) => ({ value: m.id, label: m.name })) },
            { key: "description", label: "Descrizione" },
            { key: "quantity", label: "Q.tà", type: "number", required: true },
            { key: "unit", label: "Unità", type: "select", options: UNITS, required: true },
            { key: "total_price", label: "Prezzo riga €", type: "number", required: true, render: (v) => eur(v as number) },
          ]}
          extraColumns={[{ label: "€/unità", render: (r) => {
            const q = ["g", "ml"].includes(r.unit) ? r.quantity / 1000 : r.quantity;
            return `${eur(r.total_price / q)}/${["g", "kg"].includes(r.unit) ? "kg" : ["ml", "l"].includes(r.unit) ? "l" : "pz"}`;
          } }]} />
        <p>Merce {eur(goods)} + spedizione {eur(p.shipping_cost)} = <strong>{eur(goods + Number(p.shipping_cost))}</strong>
          {p.total_amount != null && <span className="muted"> (documento: {eur(p.total_amount)})</span>}</p>
        <p className="muted small">La spedizione viene ripartita sulle righe in proporzione al valore per calcolare il costo medio.</p>
      </div>
      <div className="panel">
        <h2>Documenti</h2>
        <DocumentsPanel purchaseId={p.id} />
      </div>
    </div>
  );
}
