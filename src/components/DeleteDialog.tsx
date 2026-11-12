import { useEffect, useState } from "react";
import { errMsg } from "../lib";

interface Props {
  title: string;
  name: string;                    // da riscrivere per confermare
  loadSummary: () => Promise<Record<string, number>>;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}

/** Conferma di eliminazione con riepilogo di tutto ciò che verrà cancellato. */
export function DeleteDialog({ title, name, loadSummary, onConfirm, onClose }: Props) {
  const [summary, setSummary] = useState<Record<string, number> | null>(null);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { loadSummary().then(setSummary).catch((e) => setError(errMsg(e))); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const go = async () => {
    setBusy(true); setError("");
    try { await onConfirm(); } catch (e) { setError(errMsg(e)); setBusy(false); }
  };
  const items = summary ? Object.entries(summary).filter(([, n]) => n > 0) : [];

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <h2>🗑️ {title}</h2>
        <p>Verrà eliminato definitivamente <strong>«{name}»</strong>{items.length ? " insieme a:" : "."}</p>
        {summary === null && !error && <p className="muted">Conto i dati collegati…</p>}
        {items.length > 0 && (
          <ul className="delete-list">
            {items.map(([k, n]) => <li key={k}><strong>{n}</strong> {k}</li>)}
          </ul>
        )}
        <p className="muted small">Le spese condivise collegate restano (perdono solo il collegamento). Nello storico versioni resta traccia di tutto.</p>
        <label className="block"><span>Per confermare scrivi il nome: {name}</span>
          <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={name} autoFocus />
        </label>
        {error && <p className="error">{error}</p>}
        <div className="row-actions">
          <button className="btn danger-solid" disabled={busy || typed.trim().toLowerCase() !== name.trim().toLowerCase()} onClick={go}>
            {busy ? "Elimino…" : "Elimina definitivamente"}
          </button>
          <button className="btn" onClick={onClose} disabled={busy}>Annulla</button>
        </div>
      </div>
    </div>
  );
}
