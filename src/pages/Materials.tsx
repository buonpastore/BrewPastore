import { Fragment, useEffect, useState } from "react";
import { supabase, eur, num, date, errMsg, MATERIAL_CATEGORIES, fmtUnitPrice, fmtBaseQty, toBase, type Row } from "../lib";
import { Link } from "react-router-dom";
import { deleteMaterialsWithoutPurchases } from "../rebuild";
import { catColor, nameColor } from "../categories";

type SortKey = "name" | "category" | "qty" | "spent" | "avg" | "last" | "count";
const CAT_ORDER = ["malto", "luppolo", "lievito", "sali_acqua", "additivo", "bottiglie", "tappi", "etichette", "detergenti", "altro"];
import { useAuth } from "../auth";

export function Materials({ embedded = false }: { embedded?: boolean }) {
  const { isAdmin } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [cat, setCat] = useState("");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [history, setHistory] = useState<Row[]>([]);
  const [reload, setReload] = useState(0);
  const [last, setLast] = useState<Record<string, { cost: number; date: string; supplier: string }>>({});

  useEffect(() => {
    supabase.from("material_costs").select("*").order("category").order("name").then(({ data }) => setRows(data ?? []));
    // prezzo dell'ultimo acquisto (spedizione ripartita come per il costo medio)
    supabase.from("purchase_items").select("material_id, quantity, unit, total_price, purchase_id, purchases(purchase_date, created_at, shipping_cost, supplier)")
      .then(({ data }) => {
        const items = (data ?? []) as Row[];
        const goods: Record<string, number> = {};
        for (const i of items) goods[i.purchase_id] = (goods[i.purchase_id] ?? 0) + Number(i.total_price);
        const out: Record<string, { cost: number; date: string; supplier: string; key: string }> = {};
        for (const i of items) {
          const p = i.purchases ?? {};
          const share = goods[i.purchase_id] > 0 ? Number(p.shipping_cost ?? 0) * Number(i.total_price) / goods[i.purchase_id] : 0;
          const q = toBase(Number(i.quantity), i.unit);
          if (!q) continue;
          const key = `${p.purchase_date ?? ""}|${p.created_at ?? ""}`;
          if (!out[i.material_id] || key > out[i.material_id].key) {
            out[i.material_id] = { cost: (Number(i.total_price) + share) / q, date: p.purchase_date, supplier: p.supplier, key };
          }
        }
        setLast(out);
      });
  }, [reload]);

  const toggle = async (id: string) => {
    if (open === id) return setOpen(null);
    setOpen(id);
    const { data } = await supabase.from("purchase_items").select("*, purchases(supplier, purchase_date)").eq("material_id", id);
    setHistory((data ?? []).sort((a, b) => String(b.purchases?.purchase_date).localeCompare(String(a.purchases?.purchase_date))));
  };

  const removeLine = async (h: Row, m: Row) => {
    if (!confirm(`Eliminare la riga «${h.description ?? m.name}» (${num(h.quantity, 3)} ${h.unit}, ${eur(h.total_price)}) di ${h.purchases?.supplier ?? ""}?`)) return;
    const { error } = await supabase.from("purchase_items").delete().eq("id", h.id);
    if (error) return alert(errMsg(error));
    setHistory((x) => x.filter((r) => r.id !== h.id));
    setReload((x) => x + 1);
  };

  const removeMaterial = async (m: Row) => {
    const n = Number(m.purchases_count);
    if (!confirm(`Eliminare la materia prima «${m.name}»?${n ? `\nVerranno cancellate anche le sue ${n} righe d'acquisto (${eur(m.total_spent)}).` : ""}\nNelle ricette e nei batch l'ingrediente resta, ma senza prezzo collegato.`)) return;
    if (n) {
      const { error } = await supabase.from("purchase_items").delete().eq("material_id", m.material_id);
      if (error) return alert(errMsg(error));
    }
    const { error } = await supabase.from("materials").delete().eq("id", m.material_id);
    if (error) return alert(errMsg(error));
    if (open === m.material_id) setOpen(null);
    setReload((x) => x + 1);
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

  const [showEmpty, setShowEmpty] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "category", dir: "asc" });
  const empty = rows.filter((r) => Number(r.purchases_count) === 0);
  const filtered = rows.filter((r) => (showEmpty || Number(r.purchases_count) > 0) && (!cat || r.category === cat) && r.name.toLowerCase().includes(q.toLowerCase()));
  const catRank = (c: string) => { const i = CAT_ORDER.indexOf(c); return i < 0 ? 99 : i; };
  const val = (r: Row): number | string => {
    switch (sort.key) {
      case "name": return r.name.toLowerCase();
      case "category": return catRank(r.category);
      case "qty": return Number(r.qty_purchased);
      case "spent": return Number(r.total_spent);
      case "avg": return r.avg_unit_cost == null ? -1 : Number(r.avg_unit_cost);
      case "last": return last[r.material_id]?.cost ?? -1;
      case "count": return Number(r.purchases_count);
    }
  };
  const list = [...filtered].sort((a, b) => {
    const va = val(a), vb = val(b);
    const c = typeof va === "string" ? va.localeCompare(vb as string, "it") : (va as number) - (vb as number);
    // a parità (es. stessa categoria) ordine alfabetico
    return (c !== 0 ? c : a.name.localeCompare(b.name, "it")) * (sort.dir === "asc" || c === 0 ? 1 : -1);
  });
  const sortBy = (key: SortKey) => setSort((s0) => (s0.key === key ? { key, dir: s0.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "name" || key === "category" ? "asc" : "desc" }));
  const Th = ({ k, children }: { k: SortKey; children: string }) => (
    <th className={"sortable" + (sort.key === k ? " on" : "")} onClick={() => sortBy(k)}>
      {children}{sort.key === k ? (sort.dir === "asc" ? " ▲" : " ▼") : ""}
    </th>
  );
  const cleanEmpty = async () => {
    if (!confirm(`Eliminare le ${empty.length} materie prime senza nessun acquisto?\nSono quelle create importando le ricette o rimaste da import sbagliati. Nelle ricette gli ingredienti restano.`)) return;
    try { await deleteMaterialsWithoutPurchases(); setReload((x) => x + 1); } catch (e) { alert(errMsg(e)); }
  };
  const totalSpent = list.reduce((s, r) => s + Number(r.total_spent), 0);

  return (
    <div>
      <div className="page-head">
        {!embedded && <h1>Materie prime e costi medi</h1>}
      </div>
      <p className="muted">Costo medio ponderato su tutti gli acquisti e prezzo dell'ultimo acquisto (spedizione inclusa). Malti al kg, luppoli al grammo, lieviti a unità. Per aggiungere prezzi carica gli acquisti in <Link to="/materie-prime?vista=acquisti">Acquisti e fatture</Link>.</p>
      <div className="toolbar">
        <input placeholder="Cerca…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="">Tutte le categorie</option>
          {MATERIAL_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
        </select>
        <select value={`${sort.key}:${sort.dir}`} onChange={(e) => { const [k, d] = e.target.value.split(":"); setSort({ key: k as SortKey, dir: d as "asc" | "desc" }); }} aria-label="Ordina per">
          <option value="category:asc">Ordina: categoria (malti, luppoli, lieviti…)</option>
          <option value="name:asc">Ordina: nome A→Z</option>
          <option value="avg:desc">Ordina: costo medio (più caro)</option>
          <option value="avg:asc">Ordina: costo medio (più economico)</option>
          <option value="spent:desc">Ordina: speso (di più)</option>
          <option value="qty:desc">Ordina: quantità acquistata</option>
          <option value="last:desc">Ordina: ultimo prezzo</option>
          <option value="count:desc">Ordina: numero di acquisti</option>
        </select>
        <span className="muted">Speso in totale: <strong>{eur(totalSpent)}</strong></span>
      </div>
      {empty.length > 0 && (
        <div className="row-actions" style={{ marginTop: -4, marginBottom: 12 }}>
          <span className="muted small">{empty.length} materie prime senza acquisti {showEmpty ? "mostrate" : "nascoste"} (create dalle ricette o da import sbagliati)</span>
          <button className="mini-btn" onClick={() => setShowEmpty(!showEmpty)}>{showEmpty ? "Nascondi" : "Mostra"}</button>
          {isAdmin && <button className="mini-btn" onClick={cleanEmpty}>🗑️ <span>Elimina quelle senza acquisti</span></button>}
        </div>
      )}
      <div className="table-wrap">
        <table>
          <thead><tr><Th k="name">Materia prima</Th><Th k="category">Categoria</Th><Th k="qty">Acquistato</Th><Th k="spent">Speso</Th><Th k="avg">Costo medio</Th><Th k="last">Ultimo acquisto</Th><Th k="count">Acquisti</Th>{isAdmin && <th />}</tr></thead>
          <tbody>
            {list.map((m) => (
              <Fragment key={m.material_id}>
                <tr>
                  <td><button className="link mat-name" style={{ color: nameColor(m.category) }} onClick={() => toggle(m.material_id)}>{open === m.material_id ? "▾" : "▸"} {m.name}</button></td>
                  <td><span className="badge cat" style={{ ["--c" as string]: catColor(m.category) }}>{m.category.replace("_", " ")}</span></td>
                  <td className="nowrap">{fmtBaseQty(m.qty_purchased, m.category, m.base_unit)}</td>
                  <td>{eur(m.total_spent)}</td>
                  <td className="nowrap"><strong>{fmtUnitPrice(m.avg_unit_cost, m.category, m.base_unit)}</strong></td>
                  <td className="nowrap">
                    {last[m.material_id] ? (() => {
                      const l = last[m.material_id];
                      const diff = m.avg_unit_cost ? (l.cost / Number(m.avg_unit_cost) - 1) * 100 : 0;
                      return (
                        <>
                          <strong>{fmtUnitPrice(l.cost, m.category, m.base_unit)}</strong>
                          {Math.abs(diff) >= 1 && <span className={diff > 0 ? "warn small" : "ok small"}> {diff > 0 ? "▲" : "▼"}{num(Math.abs(diff), 0)}%</span>}
                          <div className="muted small">{date(l.date)} · {l.supplier}</div>
                        </>
                      );
                    })() : "—"}
                  </td>
                  <td>{m.purchases_count}</td>
                  {isAdmin && <td className="nowrap"><button className="icon" title="Modifica" onClick={() => edit(m)}>✏️</button><button className="icon" title="Unisci a un'altra (duplicati)" onClick={() => merge(m)}>🔗</button><button className="icon" title="Elimina materia prima" onClick={() => removeMaterial(m)}>🗑️</button></td>}
                </tr>
                {open === m.material_id && (
                  <tr className="sub"><td colSpan={10}>
                    {history.length ? (
                      <table>
                        <thead><tr><th>Data</th><th>Fornitore</th><th>Riga</th><th>Q.tà</th><th>Prezzo</th><th>Prezzo unitario</th>{isAdmin && <th />}</tr></thead>
                        <tbody>{history.map((h) => (
                          <tr key={h.id}><td>{date(h.purchases?.purchase_date)}</td><td>{h.purchases?.supplier}</td><td className="small">{h.description}</td><td>{num(h.quantity, 3)} {h.unit}</td><td>{eur(h.total_price)}</td>
                            <td>{toBase(Number(h.quantity), h.unit) ? fmtUnitPrice(Number(h.total_price) / toBase(Number(h.quantity), h.unit), m.category, m.base_unit) : "—"}</td>
                            {isAdmin && <td><button className="icon" title="Elimina questa riga d'acquisto" onClick={() => removeLine(h, m)}>🗑️</button></td>}</tr>
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
