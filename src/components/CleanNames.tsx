import { useEffect, useState } from "react";
import { supabase, errMsg, type Row } from "../lib";
import { cleanSavedName } from "../textParser";

/** Pulsante + anteprima: toglie le descrizioni dai nomi degli ingredienti già salvati. */
export function CleanNamesButton({ table, parentKey, parentId, onDone }: { table: string; parentKey: string; parentId: string; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="mini-btn" onClick={() => setOpen(true)} title="Togli le descrizioni dai nomi degli ingredienti">🧹 <span>Pulisci nomi</span></button>
      {open && <CleanNamesDialog table={table} parentKey={parentKey} parentId={parentId} onClose={() => setOpen(false)} onDone={onDone} />}
    </>
  );
}

function CleanNamesDialog({ table, parentKey, parentId, onClose, onDone }: { table: string; parentKey: string; parentId: string; onClose: () => void; onDone: () => void }) {
  const [changes, setChanges] = useState<{ row: Row; to: string; on: boolean }[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    supabase.from(table).select("*").eq(parentKey, parentId).then(({ data, error }) => {
      if (error) return setError(errMsg(error));
      setChanges((data ?? []).map((row) => ({ row, to: cleanSavedName(row.name, row.category), on: true })).filter((c) => c.to !== row(c)));
    });
    function row(c: { row: Row }) { return c.row.name; }
  }, [table, parentKey, parentId]);

  const apply = async () => {
    setBusy(true); setError("");
    try {
      for (const c of changes!.filter((x) => x.on)) {
        const { error } = await supabase.from(table).update({ name: c.to }).eq("id", c.row.id);
        if (error) throw error;
      }
      onDone(); onClose();
    } catch (e) { setError(errMsg(e)); setBusy(false); }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <h2>🧹 Pulisci i nomi</h2>
        {changes === null && !error && <p className="muted">Controllo gli ingredienti…</p>}
        {changes?.length === 0 && <p>I nomi sono già puliti, non c'è niente da cambiare. ✓</p>}
        {changes && changes.length > 0 && (
          <>
            <p className="muted">Questi nomi verranno accorciati. Puoi correggere il nuovo nome o togliere la spunta.</p>
            <ul className="clean-list">
              {changes.map((c, i) => (
                <li key={c.row.id}>
                  <input type="checkbox" checked={c.on} onChange={(e) => setChanges(changes.map((x, j) => (j === i ? { ...x, on: e.target.checked } : x)))} />
                  <div>
                    <div className="from small">{c.row.name}</div>
                    <input value={c.to} onChange={(e) => setChanges(changes.map((x, j) => (j === i ? { ...x, to: e.target.value } : x)))} />
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
        {error && <p className="error">{error}</p>}
        <div className="row-actions">
          {changes && changes.length > 0 && <button className="btn primary" disabled={busy} onClick={apply}>{busy ? "Salvo…" : `Applica (${changes.filter((c) => c.on).length})`}</button>}
          <button className="btn" onClick={onClose}>Chiudi</button>
        </div>
      </div>
    </div>
  );
}
