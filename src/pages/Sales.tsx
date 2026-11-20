import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Calculator, Handshake, Pencil, Plus, Trash2, Users, X } from "lucide-react";
import { supabase, eur, date, errMsg, type Row } from "../lib";
import { useAuth } from "../auth";
import { CapDot, useCapColors } from "../components/CapColor";
import { Stepper } from "../components/Stepper";
import { loadProduced } from "../cellar";
import { Revenue } from "./Revenue";

const NEED_0024 = "Per registrare le vendite esegui 0024_vendite.sql nello SQL Editor di Supabase.";
const LKEY = "pastorizia-prezzi-vendita";

/** Economia → Ricavi: due viste, il calcolo (a quanto vendere) e le vendite fatte (a chi e quanto abbiamo incassato). */
export function RevenuePage() {
  const [sp, setSp] = useSearchParams();
  const vista = sp.get("vista") === "vendite" ? "vendite" : "calcolo";
  return (
    <div>
      <div className="pv-views sub-switch">
        <button className={"pv-view" + (vista === "calcolo" ? " on" : "")} onClick={() => setSp({}, { replace: true })}><Calculator size={15} /> Calcolo</button>
        <button className={"pv-view" + (vista === "vendite" ? " on" : "")} onClick={() => setSp({ vista: "vendite" }, { replace: true })}><Handshake size={15} /> Vendite</button>
      </div>
      {vista === "vendite" ? <Sales /> : <Revenue />}
    </div>
  );
}

const total = (s: Row) => Number(s.bottles) * Number(s.unit_price);
const today = () => new Date().toISOString().slice(0, 10);

/** Le vendite: chi vende, a chi, quante bottiglie di quale birra, a che prezzo, e se l'incasso si divide tra i soci. */
export function Sales() {
  useCapColors();
  const { session, profiles, nameOf, isAdmin } = useAuth();
  const me = session!.user.id;
  const [sales, setSales] = useState<Row[] | null>(null);
  const [batches, setBatches] = useState<Row[]>([]);
  const [err, setErr] = useState("");
  const [editing, setEditing] = useState<Row | "new" | null>(null);
  const [view, setView] = useState<"vendite" | "clienti">("vendite");
  const [reload, setReload] = useState(0);

  useEffect(() => {
    supabase.from("sales").select("*").order("created_at", { ascending: false }).then(({ data, error }) => {
      if (error) { setErr(/sales|relation|schema cache/i.test(error.message) ? NEED_0024 : errMsg(error)); setSales([]); }
      else { setErr(""); setSales(data ?? []); }
    });
  }, [reload]);
  useEffect(() => { loadProduced().then(setBatches); }, []);

  const batchOf = (id?: string | null) => batches.find((b) => b.id === id);
  const beerName = (s: Row) => { const b = batchOf(s.batch_id); return b ? (b.recipes?.name ?? b.code) : null; };
  const list = sales ?? [];
  const soci = profiles.length ? profiles : [{ id: me, display_name: "Io" }];

  // conti: chi ha in tasca i soldi e a chi spettano
  const conti = useMemo(() => {
    const m = new Map<string, { incassato: number; spetta: number }>(soci.map((p) => [p.id, { incassato: 0, spetta: 0 }]));
    const get = (id: string) => { if (!m.has(id)) m.set(id, { incassato: 0, spetta: 0 }); return m.get(id)!; };
    for (const s of list) {
      const t = total(s);
      get(s.seller_id).incassato += t;
      if (s.split === "venditore") get(s.seller_id).spetta += t;
      else for (const p of soci) get(p.id).spetta += t / soci.length;
    }
    return m;
  }, [list, soci]);
  const tot = list.reduce((a, s) => a + total(s), 0);
  const bottles = list.reduce((a, s) => a + Number(s.bottles), 0);
  const divisi = list.filter((s) => s.split !== "venditore").reduce((a, s) => a + total(s), 0);

  // clienti: a chi abbiamo venduto, quanto e quando
  const clienti = useMemo(() => {
    const m = new Map<string, { name: string; bottles: number; euro: number; n: number; last: string; first: string }>();
    for (const s of list) {
      const k = s.buyer.trim().toLowerCase();
      const c = m.get(k) ?? { name: s.buyer.trim(), bottles: 0, euro: 0, n: 0, last: s.sold_on, first: s.created_at };
      c.bottles += Number(s.bottles); c.euro += total(s); c.n += 1;
      if (s.sold_on > c.last) c.last = s.sold_on;
      m.set(k, c);
    }
    return [...m.values()];   // le vendite arrivano dall'ultima inserita: il primo cliente è quello dell'ultima vendita
  }, [list]);

  const remove = async (s: Row) => {
    if (!confirm(`Eliminare la vendita a ${s.buyer} (${s.bottles} bottiglie, ${eur(total(s))})?`)) return;
    const { error } = await supabase.from("sales").delete().eq("id", s.id);
    if (error) return alert(errMsg(error));
    setReload((x) => x + 1);
  };
  const canEdit = (s: Row) => isAdmin || s.created_by === me || s.seller_id === me;

  return (
    <div className="sales">
      <button className="btn primary full-w" onClick={() => setEditing("new")} disabled={!!err && err === NEED_0024}><Plus size={18} /> Nuova vendita</button>
      {err && <p className="error" style={{ marginTop: 12 }}>{err}</p>}

      {sales && list.length > 0 && (
        <>
          <div className="sales-kpi">
            <div style={{ ["--c" as string]: "var(--gold)" }}><small>Incassato</small><strong>{eur(tot)}</strong></div>
            <div style={{ ["--c" as string]: "var(--teal)" }}><small>Bottiglie</small><strong>{bottles}</strong></div>
            <div style={{ ["--c" as string]: "var(--magenta)" }}><small>Clienti</small><strong>{clienti.length}</strong></div>
          </div>

          <h3 className="sales-h"><Users size={16} /> Soldi dei soci</h3>
          <div className="table-wrap">
            <table className="sales-soci">
              <thead><tr><th>Socio</th><th>Ha incassato</th><th>Gli spetta</th><th>Conto</th></tr></thead>
              <tbody>
                {[...conti.entries()].map(([id, c]) => {
                  const d = c.spetta - c.incassato;
                  return (
                    <tr key={id}>
                      <td><strong>{nameOf(id)}</strong></td>
                      <td>{eur(c.incassato)}</td>
                      <td>{eur(c.spetta)}</td>
                      <td className={"sc " + (Math.abs(d) < 0.005 ? "muted" : d > 0 ? "sales-plus" : "sales-minus")}>
                        {Math.abs(d) < 0.005 ? "in pari" : <><small>{d > 0 ? "deve ricevere" : "deve dare"}</small>{eur(Math.abs(d))}</>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="muted small">«Gli spetta»: la sua parte delle vendite da dividere ({eur(divisi)} in {soci.length}) più tutto quello che ha venduto tenendosi l'incasso. Chi ha incassato più di quanto gli spetta deve dare la differenza agli altri.</p>

          <div className="pv-views sub-switch" style={{ marginTop: 18 }}>
            <button className={"pv-view" + (view === "vendite" ? " on" : "")} onClick={() => setView("vendite")}>🧾 Vendite</button>
            <button className={"pv-view" + (view === "clienti" ? " on" : "")} onClick={() => setView("clienti")}>👥 Clienti</button>
          </div>

          {view === "vendite" ? (
            <div className="sales-list">
              {list.map((s) => {
                const b = batchOf(s.batch_id);
                return (
                  <div key={s.id} className="sales-row">
                    <div className="sr-top">
                      <strong>{s.buyer}</strong>
                      <strong className="sr-tot">{eur(total(s))}</strong>
                    </div>
                    <div className="sr-meta">
                      <span>{date(s.sold_on)}</span>
                      <span>{s.bottles} {Number(s.bottles) === 1 ? "bottiglia" : "bottiglie"} × {eur(s.unit_price)}</span>
                      {b && <span><CapDot color={b.cap_color} /> {beerName(s)}</span>}
                    </div>
                    <div className="sr-meta">
                      <span>venduta da <b>{nameOf(s.seller_id)}</b></span>
                      <span className={"sr-split " + (s.split === "venditore" ? "own" : "shared")}>{s.split === "venditore" ? "se la tiene chi vende" : `divisa tra i soci · ${eur(total(s) / soci.length)} a testa`}</span>
                    </div>
                    {s.notes && <div className="muted small">{s.notes}</div>}
                    {canEdit(s) && (
                      <div className="sr-actions">
                        <button className="icon-btn" title="Modifica" onClick={() => setEditing(s)}><Pencil size={16} /></button>
                        <button className="icon-btn" title="Elimina" onClick={() => remove(s)}><Trash2 size={16} /></button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="table-wrap">
              <table className="sales-clienti">
                <thead><tr><th>Cliente</th><th>Bottiglie</th><th>Speso</th><th>Ultima</th></tr></thead>
                <tbody>
                  {clienti.map((c) => (
                    <tr key={c.name}>
                      <td><strong>{c.name}</strong>{c.n > 1 && <div className="muted small">{c.n} acquisti</div>}</td>
                      <td>{c.bottles}</td>
                      <td>{eur(c.euro)}</td>
                      <td className="nowrap">{date(c.last)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
      {sales && !list.length && !err && <p className="muted" style={{ marginTop: 14 }}>Nessuna vendita ancora. Con «Nuova vendita» segnate a chi vendete le bottiglie: qui vedrete quanto avete incassato e quanto spetta a ciascuno.</p>}

      {editing && (
        <SaleForm sale={editing === "new" ? null : editing} me={me} soci={soci} batches={batches} buyers={clienti.map((c) => c.name)}
          onClose={() => setEditing(null)} onSaved={() => { setEditing(null); setReload((x) => x + 1); }} />
      )}
      <p className="muted small" style={{ marginTop: 16 }}>Il prezzo giusto da chiedere lo trovi in <Link to="/ricavi">Calcolo</Link>.</p>
    </div>
  );
}

function SaleForm({ sale, me, soci, batches, buyers, onClose, onSaved }: {
  sale: Row | null; me: string; soci: Row[]; batches: Row[]; buyers: string[]; onClose: () => void; onSaved: () => void;
}) {
  const [seller, setSeller] = useState<string>(sale?.seller_id ?? me);
  const [buyer, setBuyer] = useState<string>(sale?.buyer ?? "");
  const [day, setDay] = useState<string>(sale?.sold_on ?? today());
  const [batch, setBatch] = useState<string>(sale?.batch_id ?? "");
  const [n, setN] = useState<number>(sale ? Number(sale.bottles) : 1);
  const [price, setPrice] = useState<number>(sale ? Number(sale.unit_price) : 0);
  const [split, setSplit] = useState<"soci" | "venditore">(sale?.split ?? "soci");
  const [notes, setNotes] = useState<string>(sale?.notes ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  // scegliendo la birra propongo il suo prezzo di vendita (quello salvato in Calcolo)
  const pickBatch = async (id: string) => {
    setBatch(id);
    if (!id || price > 0) return;
    const b = batches.find((x) => x.id === id);
    if (!b?.recipe_id) return;
    let p: number | null = null;
    try { p = JSON.parse(localStorage.getItem(LKEY) ?? "{}")[b.recipe_id] ?? null; } catch { /* niente */ }
    if (p == null) {
      const { data } = await supabase.from("recipes").select("sale_price").eq("id", b.recipe_id).single();
      if (data?.sale_price != null) p = Number(data.sale_price);
    }
    if (p != null) setPrice(p);
  };

  const save = async () => {
    if (!buyer.trim()) return setErr("Scrivi a chi l'avete venduta.");
    if (n < 1) return setErr("Almeno una bottiglia.");
    setBusy(true); setErr("");
    const row = { seller_id: seller, buyer: buyer.trim(), sold_on: day || today(), batch_id: batch || null, bottles: Math.round(n), unit_price: price, split, notes: notes.trim() || null };
    const { error } = sale ? await supabase.from("sales").update(row).eq("id", sale.id) : await supabase.from("sales").insert(row);
    setBusy(false);
    if (error) return setErr(/sales|relation|schema cache/i.test(error.message) ? NEED_0024 : errMsg(error));
    onSaved();
  };

  const t = n * price;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal sale-modal" onClick={(e) => e.stopPropagation()}>
        <button className="icon-btn famous-x" aria-label="Chiudi" onClick={onClose}><X size={18} /></button>
        <h2>{sale ? "Modifica vendita" : "Nuova vendita"}</h2>

        <span className="nb-label">Chi vende</span>
        <div className="xp-types">
          {soci.map((p) => <button key={p.id} type="button" className={"pay-method" + (seller === p.id ? " on" : "")} onClick={() => setSeller(p.id)}>{p.display_name}{p.id === me ? " (tu)" : ""}</button>)}
        </div>
        <label className="block"><span>A chi</span>
          <input list="sale-buyers" value={buyer} onChange={(e) => setBuyer(e.target.value)} placeholder="Nome di chi compra" />
          <datalist id="sale-buyers">{buyers.map((b) => <option key={b} value={b} />)}</datalist>
        </label>
        <label className="block"><span>Data</span><input type="date" value={day} onChange={(e) => setDay(e.target.value)} /></label>
        <label className="block"><span>Quale birra (facoltativo)</span>
          <select value={batch} onChange={(e) => pickBatch(e.target.value)}>
            <option value="">— non specificata —</option>
            {batches.map((b) => <option key={b.id} value={b.id}>{b.recipes?.name ?? b.code}{b.code && b.recipes?.name ? ` (${b.code})` : ""}</option>)}
          </select>
        </label>
        <div className="sale-steppers">
          <Stepper label="Bottiglie" value={n} step={1} digits={0} onChange={setN} />
          <Stepper label="Prezzo a bottiglia" value={price} step={0.5} digits={2} unit="€" onChange={setPrice} />
        </div>
        <div className="sale-total">Totale <strong>{eur(t)}</strong></div>

        <span className="nb-label">I soldi</span>
        <div className="xp-types two">
          <button type="button" className={"pay-method" + (split === "soci" ? " on" : "")} onClick={() => setSplit("soci")}>Divisi tra i soci<small>{eur(t / Math.max(1, soci.length))} a testa</small></button>
          <button type="button" className={"pay-method" + (split === "venditore" ? " on" : "")} onClick={() => setSplit("venditore")}>Li tiene chi vende<small>{eur(t)}</small></button>
        </div>
        <label className="block"><span>Note</span><input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="es. pagato con bonifico, 33 cl…" /></label>

        {err && <p className="error">{err}</p>}
        <div className="half-actions" style={{ marginTop: 14 }}>
          <button className="btn" onClick={onClose}>Annulla</button>
          <button className="btn primary" disabled={busy} onClick={save}>{busy ? "Salvo…" : sale ? "Salva" : "Registra vendita"}</button>
        </div>
      </div>
    </div>
  );
}
