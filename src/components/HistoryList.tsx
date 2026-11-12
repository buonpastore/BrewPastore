import { useEffect, useState } from "react";
import { supabase, dateTime, errMsg, TABLE_LABELS, type Row } from "../lib";
import { useAuth } from "../auth";

const SKIP = new Set(["updated_at", "created_at"]);
const ACTION: Record<string, string> = { INSERT: "Creato", UPDATE: "Modificato", DELETE: "Eliminato" };

function fmt(v: unknown) {
  if (v == null || v === "") return "∅";
  if (typeof v === "object") return JSON.stringify(v);
  const s = String(v);
  return s.length > 80 ? s.slice(0, 80) + "…" : s;
}

export function diff(e: Row): { key: string; from: unknown; to: unknown }[] {
  const o = e.old_data ?? {}, n = e.new_data ?? {};
  const keys = new Set([...Object.keys(o), ...Object.keys(n)]);
  const out: { key: string; from: unknown; to: unknown }[] = [];
  keys.forEach((k) => {
    if (SKIP.has(k) || k === "id") return;
    if (JSON.stringify(o[k] ?? null) !== JSON.stringify(n[k] ?? null)) out.push({ key: k, from: o[k], to: n[k] });
  });
  return out;
}

interface Props {
  /** filtra per record o lista di record (es. ricetta + suoi ingredienti) */
  recordIds?: string[];
  limit?: number;
  tableFilter?: string;
  /** include anche le righe figlie: record il cui new/old_data.<key> = id (es. batch_id) */
  relatedTo?: { id: string; key: string };
}

/** Storico versioni: ogni modifica genera una versione; l'admin può ripristinarne una. */
export function HistoryList({ recordIds, limit = 100, tableFilter, relatedTo }: Props) {
  const { nameOf, isAdmin } = useAuth();
  const [entries, setEntries] = useState<Row[]>([]);
  const [open, setOpen] = useState<number | null>(null);
  const [reload, setReload] = useState(0);
  const key = recordIds?.join(",");

  useEffect(() => {
    let q = supabase.from("audit_log").select("*").order("changed_at", { ascending: false }).limit(limit);
    if (recordIds) q = q.in("record_id", recordIds.length ? recordIds : ["00000000-0000-0000-0000-000000000000"]);
    if (tableFilter) q = q.eq("table_name", tableFilter);
    if (relatedTo) {
      const { id, key: k } = relatedTo;
      q = q.or(`record_id.eq.${id},new_data->>${k}.eq.${id},old_data->>${k}.eq.${id}`);
    }
    q.then(({ data }) => setEntries(data ?? []));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, limit, tableFilter, reload, relatedTo?.id, relatedTo?.key]);

  const restore = async (e: Row) => {
    // ripristina lo stato PRIMA di questa modifica
    const target = e.old_data;
    if (!target) return;
    if (!confirm(`Ripristinare ${TABLE_LABELS[e.table_name] ?? e.table_name} alla versione ${e.version - 1}?`)) return;
    const { id, created_at, updated_at, abv, ...rest } = target;
    void created_at; void updated_at; void abv;
    const res = e.action === "DELETE"
      ? await supabase.from(e.table_name).insert({ id, ...rest })
      : await supabase.from(e.table_name).update(rest).eq("id", id);
    if (res.error) alert(errMsg(res.error)); else { alert("Ripristinato. Ricarica la pagina per vedere i dati."); setReload((x) => x + 1); }
  };

  if (!entries.length) return <p className="muted">Nessuna modifica registrata.</p>;
  return (
    <ul className="history">
      {entries.map((e) => {
        const d = diff(e);
        const label = e.new_data?.name ?? e.new_data?.code ?? e.new_data?.title ?? e.new_data?.description
          ?? e.old_data?.name ?? e.old_data?.code ?? e.old_data?.title ?? e.old_data?.description ?? "";
        return (
          <li key={e.id}>
            <button className="link" onClick={() => setOpen(open === e.id ? null : e.id)}>
              <span className={"badge " + e.action.toLowerCase()}>{ACTION[e.action]}</span>{" "}
              <strong>{TABLE_LABELS[e.table_name] ?? e.table_name}</strong> {label && <>«{fmt(label)}»</>}{" "}
              <span className="muted small">v{e.version} · {dateTime(e.changed_at)} · {nameOf(e.changed_by)}</span>
            </button>
            {open === e.id && (
              <div className="diff">
                {e.action === "UPDATE" ? (
                  d.length ? (
                    <table>
                      <tbody>
                        {d.map((x) => (
                          <tr key={x.key}><td>{x.key}</td><td className="from">{fmt(x.from)}</td><td>→</td><td className="to">{fmt(x.to)}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  ) : <p className="muted">Nessun campo cambiato</p>
                ) : (
                  <pre>{JSON.stringify(e.new_data ?? e.old_data, null, 2)}</pre>
                )}
                {isAdmin && e.action !== "INSERT" && (
                  <button className="btn small" onClick={() => restore(e)}>↩️ Ripristina versione precedente</button>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
