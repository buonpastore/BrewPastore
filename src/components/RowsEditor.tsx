import { useCallback, useEffect, useState } from "react";
import { supabase, errMsg, type Row } from "../lib";
import { display, FieldInput, toDb, type FieldDef } from "./fields";

interface Props {
  table: string;
  parentKey: string;
  parentId: string;
  fields: FieldDef[];
  canEdit: boolean;
  orderBy?: { column: string; ascending?: boolean };
  defaults?: Row;
  emptyText?: string;
  /** chiamata dopo ogni modifica (per ricalcolare totali ecc.) */
  onChange?: (rows: Row[]) => void;
  /** colonne extra calcolate (sola lettura) */
  extraColumns?: { label: string; render: (row: Row) => React.ReactNode }[];
  /** trasforma la riga prima del salvataggio */
  beforeSave?: (row: Row) => Row | Promise<Row>;
  reloadKey?: unknown;
}

/** Tabella di righe figlie (ingredienti, correzioni acqua, costi...) con aggiunta/modifica/eliminazione. */
export function RowsEditor(p: Props) {
  const [rows, setRows] = useState<Row[]>([]);
  const [editId, setEditId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Row>({});
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");
  const { table, parentKey, parentId, onChange } = p;
  const ob = p.orderBy ?? { column: "id", ascending: true };

  const load = useCallback(async () => {
    const { data, error } = await supabase.from(table).select("*").eq(parentKey, parentId)
      .order(ob.column, { ascending: ob.ascending ?? true });
    if (error) return setError(errMsg(error));
    setRows(data ?? []);
    onChange?.(data ?? []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, parentKey, parentId, ob.column, ob.ascending]);

  useEffect(() => { load(); }, [load, p.reloadKey]);

  const build = async (src: Row) => {
    let out: Row = {};
    for (const f of p.fields) out[f.key] = toDb(f, src[f.key]);
    if (p.beforeSave) out = await p.beforeSave(out);
    return out;
  };

  const saveNew = async (e: React.FormEvent) => {
    e.preventDefault(); setError("");
    try {
      const rec = { ...(await build(draft)), [parentKey]: parentId };
      const { error } = await supabase.from(table).insert(rec);
      if (error) throw error;
      setAdding(false); setDraft({}); load();
    } catch (err) { setError(errMsg(err)); }
  };

  const saveEdit = async (e: React.FormEvent) => {
    e.preventDefault(); setError("");
    try {
      const { error } = await supabase.from(table).update(await build(draft)).eq("id", editId!);
      if (error) throw error;
      setEditId(null); load();
    } catch (err) { setError(errMsg(err)); }
  };

  const remove = async (id: string) => {
    if (!confirm("Eliminare questa riga? (resta comunque nello storico)")) return;
    const { error } = await supabase.from(table).delete().eq("id", id);
    if (error) return setError(errMsg(error));
    load();
  };

  const formRow = (onSubmit: (e: React.FormEvent) => void, onCancel: () => void, key: string) => (
    <tr key={key} className="editing">
      <td colSpan={p.fields.length + (p.extraColumns?.length ?? 0) + 1}>
        <form className="inline-form" onSubmit={onSubmit}>
          {p.fields.map((f) => (
            <label key={f.key}>
              <span>{f.label}</span>
              <FieldInput f={f} value={draft[f.key]} onChange={(v) => setDraft((d) => ({ ...d, [f.key]: v }))} />
            </label>
          ))}
          <div className="row-actions">
            <button className="btn primary small">Salva</button>
            <button type="button" className="btn small" onClick={onCancel}>Annulla</button>
          </div>
        </form>
      </td>
    </tr>
  );

  return (
    <div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {p.fields.map((f) => <th key={f.key}>{f.label}</th>)}
              {p.extraColumns?.map((c) => <th key={c.label}>{c.label}</th>)}
              {p.canEdit && <th />}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && !adding && (
              <tr><td colSpan={99} className="muted">{p.emptyText ?? "Nessuna riga"}</td></tr>
            )}
            {rows.map((r) =>
              editId === r.id ? formRow(saveEdit, () => setEditId(null), r.id) : (
                <tr key={r.id}>
                  {p.fields.map((f) => <td key={f.key}>{display(f, r)}</td>)}
                  {p.extraColumns?.map((c) => <td key={c.label}>{c.render(r)}</td>)}
                  {p.canEdit && (
                    <td className="nowrap">
                      <button className="icon" title="Modifica" onClick={() => { setDraft(r); setEditId(r.id); setAdding(false); }}>✏️</button>
                      <button className="icon" title="Elimina" onClick={() => remove(r.id)}>🗑️</button>
                    </td>
                  )}
                </tr>
              ),
            )}
            {adding && formRow(saveNew, () => setAdding(false), "new")}
          </tbody>
        </table>
      </div>
      {error && <p className="error">{error}</p>}
      {p.canEdit && !adding && (
        <button className="btn small" onClick={() => { setDraft({ ...(p.defaults ?? {}) }); setAdding(true); setEditId(null); }}>
          + Aggiungi
        </button>
      )}
    </div>
  );
}
