import { Fragment, useEffect, useState } from "react";
import { supabase, eur, num, date, errMsg, MATERIAL_CATEGORIES, fmtUnitPrice, fmtBaseQty, toBase, type Row } from "../lib";
import { deleteMaterialsWithoutPurchases } from "../rebuild";
import { catColor, nameColor } from "../categories";

type SortKey = "name" | "category" | "qty" | "spent" | "avg" | "last" | "count";
const CAT_ORDER = ["malto", "luppolo", "lievito", "sali_acqua", "additivo", "bottiglie", "tappi", "etichette", "detergenti", "altro"];
import { useAuth } from "../auth";
import { isCore, pieceSizes, perPiece, piecesOfLine, matchPurchased } from "../costs";

export function Materials({ embedded = false }: { embedded?: boolean }) {
  const { isAdmin } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [cat, setCat] = useState("");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [history, setHistory] = useState<Row[]>([]);
  const [reload, setReload] = useState(0);
  const [piece, setPiece] = useState<Record<string, number>>({});
  const [last, setLast] = useState<Record<string, { cost: number; date: string; supplier: string }>>({});

  useEffect(() => {
    supabase.from("material_costs").select("*").order("category").order("name").then(({ data }) => setRows(data ?? []));
    // prezzo dell'ultimo acquisto (spedizione ripartita come per il costo medio)
    supabase.from("purchase_items").select("material_id, description, quantity, unit, total_price, purchase_id, purchases(purchase_date, created_at, shipping_cost, total_amount, supplier)")
      .then(({ data }) => {
        const items = (data ?? []) as Row[];
        setPiece(pieceSizes(items));
        const goods: Record<string, number> = {};
        for (const i of items) goods[i.purchase_id] = (goods[i.purchase_id] ?? 0) + Number(i.total_price);
        const out: Record<string, { cost: number; date: string; supplier: string; key: string }> = {};
        for (const i of items) {
          const p = i.purchases ?? {};
          const g = goodsBase(goods[i.purchase_id] ?? 0, p.total_amount, p.shipping_cost);
          const share = g > 0 ? Number(p.shipping_cost ?? 0) * Number(i.total_price) / g : 0;
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
    const { data } = await supabase.from("purchase_items").select("*, purchases(supplier, purchase_date, shipping_cost, total_amount)").eq("material_id", id);
    const rows = data ?? [];
    // quota di spedizione di ogni riga: spedizione dell'ordine divisa in proporzione al prezzo delle righe
    const pids = [...new Set(rows.map((x) => x.purchase_id))];
    const { data: all } = pids.length ? await supabase.from("purchase_items").select("purchase_id, total_price").in("purchase_id", pids) : { data: [] as Row[] };
    const goods: Record<string, number> = {};
    for (const x of all ?? []) goods[x.purchase_id] = (goods[x.purchase_id] ?? 0) + Number(x.total_price);
    const withShip = rows.map((x) => {
      const ship = Number(x.purchases?.shipping_cost ?? 0), g = goodsBase(goods[x.purchase_id] ?? 0, x.purchases?.total_amount, ship);
      return { ...x, ship_share: g > 0 ? ship * Number(x.total_price) / g : 0, order_ship: ship };
    });
    setHistory(withShip.sort((a, b) => String(b.purchases?.purchase_date).localeCompare(String(a.purchases?.purchase_date))));
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
  const [view, setViewState] = useState<"estesa" | "compatta">(() => { try { return localStorage.getItem("bp-materie-vista") === "compatta" ? "compatta" : "estesa"; } catch { return "estesa"; } });
  const setView = (v: "estesa" | "compatta") => { setViewState(v); try { localStorage.setItem("bp-materie-vista", v); } catch { /* niente */ } };
  const full = view === "estesa";
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
  const linkEmpty = async () => {
    try {
      const { data: all } = await supabase.from("material_costs").select("*");
      const rows = all ?? [];
      const done: string[] = [], left: string[] = [];
      for (const m of rows.filter((x) => Number(x.purchases_count) === 0)) {
        const hit = matchPurchased(m.name, m.category, m.base_unit, rows);
        if (!hit) { left.push(m.name); continue; }
        for (const tb of ["recipe_ingredients", "batch_ingredients", "batch_costs"]) {
          await supabase.from(tb).update({ material_id: hit.material_id }).eq("material_id", m.material_id);
        }
        const { error } = await supabase.from("materials").delete().eq("id", m.material_id);
        if (!error) done.push(`${m.name} → ${hit.name}`);
      }
      alert(`${done.length ? `Collegati ${done.length}:\n${done.join("\n")}` : "Nessun collegamento trovato."}${left.length ? `\n\nRestano senza acquisti (${left.length}): ${left.join(", ")}` : ""}`);
      setReload((x) => x + 1);
    } catch (e) { alert(errMsg(e)); }
  };
  const cleanEmpty = async () => {
    if (!confirm(`Eliminare le ${empty.length} materie prime senza nessun acquisto?\nSono quelle create importando le ricette o rimaste da import sbagliati. Nelle ricette gli ingredienti restano.`)) return;
    try { await deleteMaterialsWithoutPurchases(); setReload((x) => x + 1); } catch (e) { alert(errMsg(e)); }
  };
  const totalSpent = list.reduce((s, r) => s + Number(r.total_spent), 0);
  // malti, luppoli e lieviti nella loro unità; tutto il resto a unità (pezzo/confezione)
  const price = (v: number | null | undefined, m: Row) => {
    if (v == null) return "—";
    if (isCore(m.category)) return fmtUnitPrice(v, m.category, m.base_unit);
    const pp = perPiece(Number(v), m.base_unit, piece[m.material_id]);
    return pp != null ? `${eur(pp)}/pz` : fmtUnitPrice(v, m.category, m.base_unit);
  };
  const qtyOf = (q: number | null | undefined, m: Row) => {
    if (q == null) return "—";
    if (isCore(m.category) || m.base_unit === "pz" || !piece[m.material_id]) return fmtBaseQty(q, m.category, m.base_unit);
    return `${num(Number(q) / piece[m.material_id], 1)} pz`;
  };

  return (
    <div>
      <div className="page-head">
        {!embedded && <h1>Materie prime e costi medi</h1>}
      </div>
      <div className="view-switch" role="group" aria-label="Visualizzazione">
        <button className={"mini-btn" + (!full ? " on" : "")} onClick={() => setView("compatta")}>☰ <span>Compatta</span></button>
        <button className={"mini-btn" + (full ? " on" : "")} onClick={() => setView("estesa")}>▦ <span>Estesa</span></button>
      </div>
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
      </div>
      <div className="table-wrap">
        <table className={full ? "" : "mat-compact"}>
          <thead><tr><Th k="name">Materia prima</Th><Th k="category">Categoria</Th>{full && <><Th k="qty">Acquistato</Th><Th k="spent">Speso</Th></>}<Th k="avg">Costo medio</Th><Th k="last">{full ? "Ultimo acquisto" : "Ultimo costo"}</Th>{full && <Th k="count">Acquisti</Th>}{full && isAdmin && <th />}</tr></thead>
          <tbody>
            {list.map((m) => (
              <Fragment key={m.material_id}>
                <tr>
                  <td><button className="link mat-name" style={{ color: nameColor(m.category) }} onClick={() => toggle(m.material_id)}>{open === m.material_id ? "▾" : "▸"} {m.name}</button></td>
                  <td><span className="badge cat" style={{ ["--c" as string]: catColor(m.category) }}>{m.category.replace("_", " ")}</span></td>
                  {full && <td className="nowrap">{qtyOf(m.qty_purchased, m)}</td>}
                  {full && <td>{eur(m.total_spent)}</td>}
                  <td className="nowrap"><strong>{price(m.avg_unit_cost, m)}</strong></td>
                  <td className="nowrap">
                    {last[m.material_id] ? (() => {
                      const l = last[m.material_id];
                      const diff = m.avg_unit_cost ? (l.cost / Number(m.avg_unit_cost) - 1) * 100 : 0;
                      return (
                        <>
                          <strong>{price(l.cost, m)}</strong>
                          {Math.abs(diff) >= 1 && <span className={diff > 0 ? "warn small" : "ok small"}> {diff > 0 ? "▲" : "▼"}{num(Math.abs(diff), 0)}%</span>}
                          {full && <div className="muted small">{date(l.date)} · {l.supplier}</div>}
                        </>
                      );
                    })() : "—"}
                  </td>
                  {full && <td>{m.purchases_count}</td>}
                  {full && isAdmin && <td className="nowrap"><button className="icon" title="Modifica" onClick={() => edit(m)}>✏️</button><button className="icon" title="Unisci a un'altra (duplicati)" onClick={() => merge(m)}>🔗</button><button className="icon" title="Elimina materia prima" onClick={() => removeMaterial(m)}>🗑️</button></td>}
                </tr>
                {open === m.material_id && (
                  <tr className="sub"><td colSpan={10}>
                    {history.length ? (() => {
                      const q = (h: Row) => toBase(Number(h.quantity), h.unit);
                      const up = (v: number) => price(v, m);
                      // prezzo della singola riga: a pezzo per tutto ciò che non è malto, luppolo o lievito
                      const lineUp = (h: Row, extra: number) => !isCore(m.category)
                        ? `${eur((Number(h.total_price) + extra) / piecesOfLine(h))}/pz`
                        : q(h) ? up((Number(h.total_price) + extra) / q(h)) : "—";
                      const tq = history.reduce((t, h) => t + q(h), 0), tp = history.reduce((t, h) => t + Number(h.total_price), 0), ts = history.reduce((t, h) => t + h.ship_share, 0);
                      return (
                        <>
                          <table className="mat-hist">
                            <thead><tr><th>Ordine</th><th>Q.tà</th><th>Prezzo</th><th>Quota sped.</th><th>Unitario</th><th>Con sped.</th>{isAdmin && <th />}</tr></thead>
                            <tbody>{history.map((h) => (
                              <tr key={h.id}>
                                <td>{date(h.purchases?.purchase_date)}<div className="muted small">{h.purchases?.supplier}{h.order_ship ? ` · sped. ordine ${eur(h.order_ship)}` : ""}</div></td>
                                <td className="nowrap">{isCore(m.category) ? `${num(h.quantity, 3)} ${h.unit}` : `${num(piecesOfLine(h), 1)} pz`}</td>
                                <td className="nowrap">{eur(h.total_price)}</td>
                                <td className="nowrap">{h.ship_share ? `+ ${eur(h.ship_share)}` : "—"}</td>
                                <td className="nowrap">{lineUp(h, 0)}</td>
                                <td className="nowrap"><strong>{lineUp(h, h.ship_share)}</strong></td>
                                {isAdmin && <td><button className="icon" title="Elimina questa riga d'acquisto" onClick={() => removeLine(h, m)}>🗑️</button></td>}
                              </tr>
                            ))}</tbody>
                            <tfoot><tr>
                              <td><strong>Media</strong></td>
                              <td className="nowrap">{qtyOf(tq, m)}</td>
                              <td className="nowrap">{eur(tp)}</td>
                              <td className="nowrap">{ts ? `+ ${eur(ts)}` : "—"}</td>
                              <td className="nowrap">{tq ? up(tp / tq) : "—"}</td>
                              <td className="nowrap"><strong>{tq ? up((tp + ts) / tq) : "—"}</strong></td>
                              {isAdmin && <td />}
                            </tr></tfoot>
                          </table>
                          <p className="muted small mat-formula">Costo medio = (prezzi + quote di spedizione) ÷ quantità totale. La spedizione di un ordine si divide in proporzione al prezzo: un articolo da 30 € ne prende 30 volte più di uno da 1 €.</p>
                        </>
                      );
                    })() : <span className="muted">Nessun acquisto registrato</span>}
                  </td></tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mat-total">Speso in totale: <strong>{eur(totalSpent)}</strong></p>
      {empty.length > 0 && (
        <div className="mat-empty">
          <p><strong>{empty.length}</strong> {empty.length === 1 ? "materia prima senza acquisti" : "materie prime senza acquisti"} {showEmpty ? (empty.length === 1 ? "mostrata nella lista" : "mostrate nella lista") : (empty.length === 1 ? "nascosta" : "nascoste")}</p>
          <div className={"mat-empty-btns" + (isAdmin ? "" : " one")}>
            <button className="btn" onClick={() => setShowEmpty(!showEmpty)}>{showEmpty ? "🙈 Nascondi" : "👁️ Mostra"}</button>
            {isAdmin && <button className="btn primary" onClick={linkEmpty}>🔗 Collega agli acquisti</button>}
            {isAdmin && <button className="btn danger" onClick={cleanEmpty}>🗑️ Elimina</button>}
          </div>
        </div>
      )}
    </div>
  );
}

/** Valore della merce di un ordine su cui ripartire la spedizione: il totale dell'ordine meno la spedizione,
 *  se è maggiore delle righe rimaste (righe cancellate), altrimenti la somma delle righe. Come nel database. */
function goodsBase(itemsSum: number, total: unknown, shipping: unknown): number {
  const t = total != null ? Number(total) - Number(shipping ?? 0) : 0;
  return t > itemsSum + 0.01 ? t : itemsSum;
}
