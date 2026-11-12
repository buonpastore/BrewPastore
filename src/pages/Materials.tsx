import { Fragment, useEffect, useState } from "react";
import { supabase, eur, num, date, errMsg, MATERIAL_CATEGORIES, type Row } from "../lib";
import { ImportPurchase } from "./Purchases";
import { FilePicker } from "../components/FilePicker";
import { useAuth } from "../auth";

export function Materials({ embedded = false }: { embedded?: boolean }) {
  const { isAdmin } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [cat, setCat] = useState("");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [history, setHistory] = useState<Row[]>([]);
  const [reload, setReload] = useState(0);
  const [importing, setImporting] = useState(false);
  const [pasted, setPasted] = useState<File[] | undefined>();

  useEffect(() => {
    supabase.from("material_costs").select("*").order("category").order("name").then(({ data }) => setRows(data ?? []));
  }, [reload]);

  const toggle = async (id: string) => {
    if (open === id) return setOpen(null);
    setOpen(id);
    const { data } = await supabase.from("purchase_items").select("*, purchases(supplier, purchase_date)").eq("material_id", id);
    setHistory((data ?? []).sort((a, b) => String(b.purchases?.purchase_date).localeCompare(String(a.purchases?.purchase_date))));
  };

  const edit = async (m: Row) => {
    const name = prompt("Nome materia prima", m.name);
    if (!name) return;
    const category = prompt(`Categoria (${MATERIAL_CATEGORIES.join(", ")})`, m.category);
    if (!category || !MATERIAL_CATEGORIES.includes(category)) return alert("Categoria non valida");
    const { error } = await supabase.from("materials").update({ name, category }).eq("id", m.material_id);
    if (error) return alert(errMsg(error));
    setReload((x) => x + 1);
  };

  const merge = async (m: Row) => {
    const others = rows.filter((r) => r.material_id !== m.material_id && r.base_unit === m.base_unit);
    const target = prompt(`Unisci "${m.name}" in quale materia prima? Scrivi il nome esatto:\n\n${others.map((o) => o.name).join("\n")}`);
    const t = others.find((o) => o.name.toLowerCase() === target?.toLowerCase());
    if (!t) return;
    for (const table of ["purchase_items", "recipe_ingredients", "batch_ingredients", "batch_costs"]) {
      const { error } = await supabase.from(table).update({ material_id: t.material_id }).eq("material_id", m.material_id);
      if (error) return alert(errMsg(error));
    }
    await supabase.from("materials").delete().eq("id", m.material_id);
    setReload((x) => x + 1);
  };

  const list = rows.filter((r) => (!cat || r.category === cat) && r.name.toLowerCase().includes(q.toLowerCase()));
  const totalSpent = list.reduce((s, r) => s + Number(r.total_spent), 0);

  return (
    <div>
      <div className="page-head">
        {!embedded && <h1>Materie prime e costi medi</h1>}
        {isAdmin && <button className="btn primary" onClick={() => setImporting(true)}>📸 Carica prezzi da screenshot / fattura</button>}
      </div>
      <p className="muted">Costo medio ponderato su tutti gli acquisti (spedizione inclusa). I prezzi arrivano dagli acquisti registrati.</p>
      {isAdmin && !importing && (
        <FilePicker compact onFiles={(f) => { setPasted(f); setImporting(true); }} accept="application/pdf,image/*,.eml,.txt,.html"
          title="📋 Incolla qui lo screenshot dell'acquisto" hint="I prezzi aggiornano subito i costi medi." />
      )}
      {importing && <ImportPurchase initialFiles={pasted} onClose={() => { setImporting(false); setPasted(undefined); }} />}
      <div className="toolbar">
        <input placeholder="Cerca…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="">Tutte le categorie</option>
          {MATERIAL_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
        </select>
        <span className="muted">Speso in totale: <strong>{eur(totalSpent)}</strong></span>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Materia prima</th><th>Categoria</th><th>Acquistato</th><th>Speso</th><th>Costo medio</th><th>Acquisti</th>{isAdmin && <th />}</tr></thead>
          <tbody>
            {list.map((m) => (
              <Fragment key={m.material_id}>
                <tr>
                  <td><button className="link" onClick={() => toggle(m.material_id)}>{open === m.material_id ? "▾" : "▸"} {m.name}</button></td>
                  <td><span className="badge">{m.category}</span></td>
                  <td>{num(m.qty_purchased, 3)} {m.base_unit}</td>
                  <td>{eur(m.total_spent)}</td>
                  <td><strong>{m.avg_unit_cost != null ? `${eur(m.avg_unit_cost)}/${m.base_unit}` : "—"}</strong></td>
                  <td>{m.purchases_count}</td>
                  {isAdmin && <td className="nowrap"><button className="icon" title="Modifica" onClick={() => edit(m)}>✏️</button><button className="icon" title="Unisci a un'altra (duplicati)" onClick={() => merge(m)}>🔗</button></td>}
                </tr>
                {open === m.material_id && (
                  <tr className="sub"><td colSpan={7}>
                    {history.length ? (
                      <table>
                        <thead><tr><th>Data</th><th>Fornitore</th><th>Riga</th><th>Q.tà</th><th>Prezzo</th></tr></thead>
                        <tbody>{history.map((h) => (
                          <tr key={h.id}><td>{date(h.purchases?.purchase_date)}</td><td>{h.purchases?.supplier}</td><td className="small">{h.description}</td><td>{num(h.quantity, 3)} {h.unit}</td><td>{eur(h.total_price)}</td></tr>
                        ))}</tbody>
                      </table>
                    ) : <span className="muted">Nessun acquisto registrato</span>}
                  </td></tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
