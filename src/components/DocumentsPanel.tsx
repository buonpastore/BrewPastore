import { useCallback, useEffect, useState } from "react";
import { supabase, uploadFile, openFile, errMsg, dateTime, type Row } from "../lib";
import { useAuth } from "../auth";

const KINDS = ["fattura", "scontrino", "email", "foto", "scheda_tecnica", "etichetta", "altro"];

interface Props { recipeId?: string; batchId?: string; purchaseId?: string }

/** Elenco documenti collegati a ricetta / batch / acquisto + upload. */
export function DocumentsPanel({ recipeId, batchId, purchaseId }: Props) {
  const { isAdmin, nameOf } = useAuth();
  const [docs, setDocs] = useState<Row[]>([]);
  const [kind, setKind] = useState("foto");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    let q = supabase.from("documents").select("*").order("created_at", { ascending: false });
    if (recipeId) q = q.eq("recipe_id", recipeId);
    if (batchId) q = q.eq("batch_id", batchId);
    if (purchaseId) q = q.eq("purchase_id", purchaseId);
    const { data } = await q;
    setDocs(data ?? []);
  }, [recipeId, batchId, purchaseId]);

  useEffect(() => { load(); }, [load]);

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true); setError("");
    try {
      for (const file of Array.from(files)) {
        const folder = recipeId ? `recipes/${recipeId}` : batchId ? `batches/${batchId}` : `purchases/${purchaseId}`;
        const path = await uploadFile(folder, file);
        const { error } = await supabase.from("documents").insert({
          title: file.name, kind, storage_path: path, mime_type: file.type, size_bytes: file.size,
          recipe_id: recipeId ?? null, batch_id: batchId ?? null, purchase_id: purchaseId ?? null,
        });
        if (error) throw error;
      }
      load();
    } catch (e) { setError(errMsg(e)); }
    setBusy(false);
  };

  const remove = async (d: Row) => {
    if (!confirm(`Eliminare "${d.title}"?`)) return;
    await supabase.storage.from("documents").remove([d.storage_path]);
    await supabase.from("documents").delete().eq("id", d.id);
    load();
  };

  const rename = async (d: Row) => {
    const t = prompt("Titolo / descrizione", d.title);
    if (!t) return;
    await supabase.from("documents").update({ title: t }).eq("id", d.id);
    load();
  };

  return (
    <div>
      {docs.length === 0 && <p className="muted">Nessun documento.</p>}
      <ul className="doc-list">
        {docs.map((d) => (
          <li key={d.id}>
            <button className="link" onClick={() => openFile(d.storage_path).catch((e) => alert(errMsg(e)))}>
              {d.mime_type?.startsWith("image/") ? "🖼️" : d.mime_type === "application/pdf" ? "📄" : "📎"} {d.title}
            </button>
            <span className="badge">{d.kind}</span>
            <span className="muted small">{dateTime(d.created_at)} · {nameOf(d.uploaded_by)}</span>
            {isAdmin && (
              <span className="nowrap">
                <button className="icon" title="Rinomina" onClick={() => rename(d)}>✏️</button>
                <button className="icon" title="Elimina" onClick={() => remove(d)}>🗑️</button>
              </span>
            )}
          </li>
        ))}
      </ul>
      {isAdmin && (
        <div className="upload-row">
          <select value={kind} onChange={(e) => setKind(e.target.value)}>
            {KINDS.map((k) => <option key={k}>{k}</option>)}
          </select>
          <label className="btn small">
            {busy ? "Carico…" : "📤 Carica file"}
            <input type="file" multiple hidden disabled={busy} onChange={(e) => upload(e.target.files)} />
          </label>
        </div>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  );
}
