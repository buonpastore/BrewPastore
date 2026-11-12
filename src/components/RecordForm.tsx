import { useState } from "react";
import { supabase, errMsg, type Row } from "../lib";
import { display, FieldInput, toDb, type FieldDef } from "./fields";

interface Props {
  table: string;
  row: Row;
  sections: { title?: string; fields: FieldDef[] }[];
  canEdit: boolean;
  onSaved: (row: Row) => void;
  startEditing?: boolean;
  /** in sola lettura mostra solo il pulsante Modifica (i valori sono già visibili altrove) */
  hideView?: boolean;
  editLabel?: string;
  onCancel?: () => void;
}

/** Scheda di un record con modalità visualizza/modifica. */
export function RecordForm({ table, row, sections, canEdit, onSaved, startEditing, hideView, editLabel, onCancel }: Props) {
  const [editing, setEditing] = useState(Boolean(startEditing));
  const [draft, setDraft] = useState<Row>(row);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true); setError("");
    const patch: Row = {};
    for (const s of sections) for (const f of s.fields) patch[f.key] = toDb(f, draft[f.key]);
    const { data, error } = await supabase.from(table).update(patch).eq("id", row.id).select().single();
    setSaving(false);
    if (error) return setError(errMsg(error));
    setEditing(false);
    onSaved(data);
  };

  if (!editing && hideView) {
    return canEdit ? <button className="btn" onClick={() => { setDraft(row); setEditing(true); }}>✏️ {editLabel ?? "Modifica"}</button> : null;
  }
  if (!editing) {
    return (
      <div>
        {sections.map((s, i) => (
          <div key={i} className="section">
            {s.title && <h3>{s.title}</h3>}
            <dl className="grid-dl">
              {s.fields.map((f) => (
                <div key={f.key} className={f.wide || f.type === "textarea" ? "wide" : ""}>
                  <dt>{f.label}</dt>
                  <dd className={f.type === "textarea" ? "pre" : ""}>{display(f, row)}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
        {canEdit && (
          <button className="btn" onClick={() => { setDraft(row); setEditing(true); }}>✏️ Modifica</button>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={save}>
      {sections.map((s, i) => (
        <fieldset key={i} className="section">
          {s.title && <legend>{s.title}</legend>}
          <div className="form-grid">
            {s.fields.map((f) => (
              <label key={f.key} className={f.wide || f.type === "textarea" ? "wide" : ""}>
                <span>{f.label}</span>
                <FieldInput f={f} value={draft[f.key]} onChange={(v) => setDraft({ ...draft, [f.key]: v })} />
              </label>
            ))}
          </div>
        </fieldset>
      ))}
      {error && <p className="error">{error}</p>}
      <div className="row-actions">
        <button className="btn primary" disabled={saving}>{saving ? "Salvo…" : "Salva"}</button>
        <button type="button" className="btn" onClick={() => { setEditing(false); onCancel?.(); }}>Annulla</button>
      </div>
    </form>
  );
}
