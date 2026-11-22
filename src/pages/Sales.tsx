import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Calculator, Handshake, Minus, Pencil, Plus, Trash2, Users, X } from "lucide-react";
import { supabase, eur, date, errMsg, isEnded, type Row } from "../lib";
import { useAuth } from "../auth";
import { CapDot, useCapColors } from "../components/CapColor";
import { loadProduced } from "../cellar";
import { Revenue, DEFAULT_PRICE } from "./Revenue";

const NEED_0024 = "Per registrare le vendite esegui 0024_vendite.sql nello SQL Editor di Supabase.";
const NEED_0029 = "Per togliere le bottiglie dalla cantina esegui 0029_vendite_cantina.sql nello SQL Editor di Supabase.";
const NEED_0026 = "Per segnare come hanno pagato esegui 0026_vendite_pagamento.sql nello SQL Editor di Supabase.";
const PAYMENTS: { key: string; label: string }[] = [{ key: "contanti", label: "💶 Contanti" }, { key: "paypal", label: "🅿️ PayPal" }, { key: "bonifico", label: "🏦 Bonifico" }];
const payLabel = (k?: string | null) => PAYMENTS.find((p) => p.key === k)?.label ?? null;
const NEED_0025 = "Per vendere più birre insieme esegui 0025_vendite_righe.sql nello SQL Editor di Supabase.";
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

/** Righe della vendita: quale birra, quante bottiglie, a che prezzo (le vendite vecchie hanno una sola birra sulla vendita). */
const itemsOf = (s: Row): Row[] => ((s.sale_items as Row[] | undefined)?.length ? s.sale_items as Row[]
  : [{ batch_id: s.batch_id ?? null, bottles: s.bottles, unit_price: s.unit_price }]);
/** Cantina: aggiunge (delta > 0) o toglie (delta < 0) bottiglie dalla cantina di un socio, mai sotto zero. */
async function moveCellar(changes: { user: string; batch: string; delta: number }[]) {
  const sum = new Map<string, { user: string; batch: string; delta: number }>();
  for (const c of changes) {
    if (!c.batch || !c.delta) continue;
    const k = `${c.user}|${c.batch}`;
    const cur = sum.get(k) ?? { user: c.user, batch: c.batch, delta: 0 };
    cur.delta += c.delta; sum.set(k, cur);
  }
  for (const c of sum.values()) {
    if (!c.delta) continue;
    const { data } = await supabase.from("cellar_bottles").select("bottles").eq("user_id", c.user).eq("batch_id", c.batch).maybeSingle();
    const next = Math.max(0, Number(data?.bottles ?? 0) + c.delta);
    const { error } = await supabase.from("cellar_bottles").upsert({ user_id: c.user, batch_id: c.batch, bottles: next, updated_at: new Date().toISOString() });
    if (error) throw error;
  }
}
const cellarOut = (s: Row, sign: 1 | -1) => (s.from_cellar ? itemsOf(s).filter((i) => i.batch_id).map((i) => ({ user: s.seller_id, batch: i.batch_id, delta: sign * Number(i.bottles) })) : []);

const total = (s: Row) => (s.amount != null ? Number(s.amount) : itemsOf(s).reduce((a, i) => a + Number(i.bottles) * Number(i.unit_price), 0));
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
    (async () => {
      let { data, error } = await supabase.from("sales").select("*, sale_items(*)").order("created_at", { ascending: false });
      let warn = "";
      if (error && /sale_items|relationship/i.test(error.message)) {
        // 0025 non ancora eseguita: le vendite si leggono lo stesso
        ({ data, error } = await supabase.from("sales").select("*").order("created_at", { ascending: false }));
        warn = NEED_0025;
      }
      if (error) { setErr(/sales|relation|schema cache/i.test(error.message) ? NEED_0024 : errMsg(error)); setSales([]); }
      else { setErr(warn); setSales(data ?? []); }
    })();
  }, [reload]);
  useEffect(() => { loadProduced().then(setBatches); }, []);

  const batchOf = (id?: string | null) => batches.find((b) => b.id === id);
  const beerName = (id?: string | null) => { const b = batchOf(id); return b ? (b.recipes?.name ?? b.code) : null; };
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
  const bottles = list.reduce((a, s) => a + itemsOf(s).reduce((x, i) => x + Number(i.bottles), 0), 0);
  const divisi = list.filter((s) => s.split !== "venditore").reduce((a, s) => a + total(s), 0);

  // clienti: a chi abbiamo venduto, quanto e quando
  const clienti = useMemo(() => {
    const m = new Map<string, { name: string; bottles: number; euro: number; n: number; last: string; first: string }>();
    for (const s of list) {
      const k = s.buyer.trim().toLowerCase();
      const c = m.get(k) ?? { name: s.buyer.trim(), bottles: 0, euro: 0, n: 0, last: s.sold_on, first: s.created_at };
      c.bottles += itemsOf(s).reduce((a, i) => a + Number(i.bottles), 0); c.euro += total(s); c.n += 1;
      if (s.sold_on > c.last) c.last = s.sold_on;
      m.set(k, c);
    }
    return [...m.values()];   // le vendite arrivano dall'ultima inserita: il primo cliente è quello dell'ultima vendita
  }, [list]);

  const remove = async (s: Row) => {
    if (!confirm(`Eliminare la vendita a ${s.buyer} (${itemsOf(s).reduce((a, i) => a + Number(i.bottles), 0)} bottiglie, ${eur(total(s))})?`)) return;
    const { error } = await supabase.from("sales").delete().eq("id", s.id);
    if (error) return alert(errMsg(error));
    // se le bottiglie erano state tolte dalla cantina, ci tornano
    try { await moveCellar(cellarOut(s, 1)); } catch (e) { alert("Vendita eliminata, ma non sono riuscito a rimettere le bottiglie in cantina: " + errMsg(e)); }
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
                return (
                  <div key={s.id} className="sales-row">
                    <div className="sr-top">
                      <strong>{s.buyer}</strong>
                      <strong className="sr-tot">{eur(total(s))}</strong>
                    </div>
                    <div className="sr-meta"><span>{date(s.sold_on)}</span>{payLabel(s.payment) && <span>{payLabel(s.payment)}</span>}</div>
                    <div className="sr-items">
                      {itemsOf(s).map((i, k) => {
                        const b = batchOf(i.batch_id);
                        return (
                          <span key={k}>
                            {b ? <CapDot color={b.cap_color} /> : <i className="sr-nocap" />}
                            <b>{i.bottles}×</b> {beerName(i.batch_id) ?? "birra"} <span className="muted">a {eur(i.unit_price)}</span>
                          </span>
                        );
                      })}
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
        <SaleForm sale={editing === "new" ? null : editing} me={me} soci={soci} batches={batches} buyers={clienti.map((c) => c.name)} items={editing === "new" ? [] : itemsOf(editing)}
          onClose={() => setEditing(null)} onSaved={() => { setEditing(null); setReload((x) => x + 1); }} />
      )}
      <p className="muted small" style={{ marginTop: 16 }}>Il prezzo giusto da chiedere lo trovi in <Link to="/ricavi">Calcolo</Link>.</p>
    </div>
  );
}

/** − numero + compatto, per le righe delle birre. */
function MiniStep({ value, step, digits, unit, onChange }: { value: number; step: number; digits: number; unit?: string; onChange: (n: number) => void }) {
  const fmt = (v: number) => v.toFixed(digits).replace(".", ",");
  const [text, setText] = useState(fmt(value));
  useEffect(() => setText(fmt(value)), [value]);   // eslint-disable-line react-hooks/exhaustive-deps
  const set = (n: number) => onChange(Number(Math.max(0, Math.round(n / step) * step).toFixed(digits)));
  return (
    <div className="mini-step">
      <button type="button" onClick={() => set(value - step)}><Minus size={16} /></button>
      <span><input inputMode="decimal" value={text} onChange={(e) => setText(e.target.value)} onFocus={(e) => e.target.select()}
        onBlur={() => set(Number(text.trim().replace(",", ".")) || 0)} />{unit && <small>{unit}</small>}</span>
      <button type="button" onClick={() => set(value + step)}><Plus size={16} /></button>
    </div>
  );
}

type Line = { key: string; batch_id: string | null; qty: number; price: number };

function SaleForm({ sale, me, soci, batches, buyers, items, onClose, onSaved }: {
  sale: Row | null; me: string; soci: Row[]; batches: Row[]; buyers: string[]; items: Row[]; onClose: () => void; onSaved: () => void;
}) {
  const [seller, setSeller] = useState<string>(sale?.seller_id ?? me);
  const [buyer, setBuyer] = useState<string>(sale?.buyer ?? "");
  const [day, setDay] = useState<string>(sale?.sold_on ?? today());
  const [split, setSplit] = useState<"soci" | "venditore">(sale?.split ?? "soci");
  const [notes, setNotes] = useState<string>(sale?.notes ?? "");
  const [payment, setPayment] = useState<string>(sale?.payment ?? "contanti");
  // togliere le bottiglie vendute dalla cantina di chi vende
  const [fromCellar, setFromCellar] = useState<boolean>(Boolean(sale?.from_cellar));
  const [cellar, setCellar] = useState<Record<string, number>>({});
  useEffect(() => {
    supabase.from("cellar_bottles").select("batch_id, bottles").eq("user_id", seller)
      .then(({ data }) => setCellar(Object.fromEntries((data ?? []).map((c) => [c.batch_id, Number(c.bottles)]))));
  }, [seller]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  // le ultime 5 birre non esaurite (dalla più recente), più quelle già nella vendita che si modifica, più «altra birra»
  const beers = useMemo(() => {
    const last = batches.filter((b) => !isEnded(b.status)).slice(0, 5);
    for (const i of items) { const b = batches.find((x) => x.id === i.batch_id); if (b && !last.includes(b)) last.push(b); }
    return last;
  }, [batches, items]);
  const [lines, setLines] = useState<Line[]>(() => [
    ...beers.map((b) => { const it = items.find((i) => i.batch_id === b.id); return { key: b.id, batch_id: b.id, qty: it ? Number(it.bottles) : 0, price: it ? Number(it.unit_price) : 0 }; }),
    (() => { const it = items.find((i) => !i.batch_id || !beers.some((b) => b.id === i.batch_id)); return { key: "altro", batch_id: null, qty: it ? Number(it.bottles) : 0, price: it ? Number(it.unit_price) : 0 }; })(),
  ]);
  const setLine = (key: string, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  // prezzo proposto: quello salvato in Calcolo per la ricetta della birra
  const [suggested, setSuggested] = useState<Record<string, number>>({});
  useEffect(() => {
    const ids = [...new Set(beers.map((b) => b.recipe_id).filter(Boolean))] as string[];
    let local: Record<string, number> = {};
    try { local = JSON.parse(localStorage.getItem(LKEY) ?? "{}"); } catch { /* niente */ }
    supabase.from("recipes").select("id, sale_price").in("id", ids).then(({ data }) => {
      const out: Record<string, number> = {};
      for (const b of beers) {
        const r = (data ?? []).find((x) => x.id === b.recipe_id);
        const p = local[b.recipe_id] ?? (r?.sale_price != null ? Number(r.sale_price) : undefined);
        if (p != null) out[b.id] = p;
      }
      setSuggested(out);
    });
  }, [beers]);
  // prezzo di partenza: quello salvato in Calcolo per la birra, altrimenti 4 €
  const addOne = (l: Line) => setLine(l.key, { qty: l.qty + 1, price: l.price || (l.batch_id ? suggested[l.batch_id] ?? DEFAULT_PRICE : DEFAULT_PRICE) });

  const chosen = lines.filter((l) => l.qty > 0);
  const t = chosen.reduce((a, l) => a + l.qty * l.price, 0);
  const nBottles = chosen.reduce((a, l) => a + l.qty, 0);
  const names = beers.map((b) => b.recipes?.name ?? b.code);
  const label = (b: Row) => { const n = b.recipes?.name ?? b.code; return names.filter((x) => x === n).length > 1 && b.code ? `${n} (${b.code})` : n; };

  const save = async () => {
    if (!buyer.trim()) return setErr("Scrivi a chi l'avete venduta.");
    if (!chosen.length) return setErr("Metti quante bottiglie di almeno una birra.");
    setBusy(true); setErr("");
    const amount = Math.round(t * 100) / 100;
    const row = {
      seller_id: seller, buyer: buyer.trim(), sold_on: day || today(), split, payment, notes: notes.trim() || null,
      batch_id: chosen.length === 1 ? chosen[0].batch_id : null, bottles: nBottles,
      unit_price: Math.round((amount / nBottles) * 100) / 100, amount,
      ...(fromCellar || sale?.from_cellar ? { from_cellar: fromCellar } : {}),
    };
    const fail = (e: { message: string }) => { setBusy(false); setErr(/from_cellar/i.test(e.message) ? NEED_0029 : /payment/i.test(e.message) ? NEED_0026 : /amount|sale_items/i.test(e.message) ? NEED_0025 : /sales|relation|schema cache/i.test(e.message) ? NEED_0024 : errMsg(e)); };
    let id = sale?.id as string | undefined;
    if (sale) { const { error } = await supabase.from("sales").update(row).eq("id", sale.id); if (error) return fail(error); }
    else { const { data, error } = await supabase.from("sales").insert(row).select("id").single(); if (error) return fail(error); id = data.id; }
    await supabase.from("sale_items").delete().eq("sale_id", id!);
    const { error } = await supabase.from("sale_items").insert(chosen.map((l) => ({ sale_id: id, batch_id: l.batch_id, bottles: l.qty, unit_price: l.price })));
    if (error) return fail(error);
    // cantina: rimetto quello che la vendita aveva tolto prima e tolgo quello di adesso
    try {
      await moveCellar([
        ...(sale ? cellarOut({ ...sale, sale_items: items }, 1) : []),
        ...(fromCellar ? chosen.filter((l) => l.batch_id).map((l) => ({ user: seller, batch: l.batch_id!, delta: -l.qty })) : []),
      ]);
    } catch (e) { setBusy(false); return setErr("Vendita salvata, ma la cantina non si è aggiornata: " + errMsg(e as { message: string })); }
    setBusy(false);
    onSaved();
  };

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

        <span className="nb-label">Quali birre e quante bottiglie</span>
        <div className="sale-beers">
          {lines.map((l) => {
            const b = beers.find((x) => x.id === l.batch_id);
            return (
              <div key={l.key} className={"sale-beer" + (l.qty > 0 ? " on" : "")}>
                <div className="sb-top">
                  <span className="sb-name">{b ? <CapDot color={b.cap_color} size={18} /> : <i className="sr-nocap" />}{b ? label(b) : "Altra birra"}</span>
                  <MiniStep value={l.qty} step={1} digits={0} onChange={(q) => (q > l.qty && l.qty === 0 ? addOne(l) : setLine(l.key, { qty: q }))} />
                </div>
                {l.qty > 0 && (
                  <div className="sb-price">
                    <span className="muted small">a bottiglia</span>
                    <MiniStep value={l.price} step={0.5} digits={2} unit="€" onChange={(p) => setLine(l.key, { price: p })} />
                    <strong>{eur(l.qty * l.price)}</strong>
                  </div>
                )}
              </div>
            );
          })}
          {!beers.length && <p className="muted small">Nessuna birra imbottigliata e non esaurita: usa «Altra birra».</p>}
        </div>
        <div className="sale-total">{nBottles} {nBottles === 1 ? "bottiglia" : "bottiglie"} · totale <strong>{eur(t)}</strong></div>

        <div className={"sale-cellar" + (fromCellar ? " on" : "")}>
          <label className="check"><input type="checkbox" checked={fromCellar} onChange={(e) => setFromCellar(e.target.checked)} /> <span>🍾 Togli queste bottiglie dalla cantina di <b>{soci.find((p) => p.id === seller)?.display_name ?? "chi vende"}</b></span></label>
          {fromCellar && chosen.filter((l) => l.batch_id).map((l) => {
            const b = beers.find((x) => x.id === l.batch_id);
            const have = (cellar[l.batch_id!] ?? 0) + (sale?.from_cellar && sale.seller_id === seller ? Number(items.find((i) => i.batch_id === l.batch_id)?.bottles ?? 0) : 0);
            return (
              <div key={l.key} className={"sc-row" + (l.qty > have ? " short" : "")}>
                <span>{b ? label(b) : "Birra"}</span>
                <span>{have} in cantina → <b>{Math.max(0, have - l.qty)}</b>{l.qty > have ? " (non bastano)" : ""}</span>
              </div>
            );
          })}
          {fromCellar && chosen.some((l) => !l.batch_id) && <p className="muted small">«Altra birra» non è in cantina e non viene tolta.</p>}
        </div>

        <span className="nb-label">I soldi</span>
        <div className="xp-types two">
          <button type="button" className={"pay-method" + (split === "soci" ? " on" : "")} onClick={() => setSplit("soci")}>Divisi tra i soci<small>{eur(t / Math.max(1, soci.length))} a testa</small></button>
          <button type="button" className={"pay-method" + (split === "venditore" ? " on" : "")} onClick={() => setSplit("venditore")}>Li tiene chi vende<small>{eur(t)}</small></button>
        </div>
        <span className="nb-label">Pagamento</span>
        <div className="xp-types">
          {PAYMENTS.map((p) => <button key={p.key} type="button" className={"pay-method" + (payment === p.key ? " on" : "")} onClick={() => setPayment(p.key)}>{p.label}</button>)}
        </div>
        <label className="block"><span>Note</span><input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="es. bottiglie da 33 cl, regalo…" /></label>

        {err && <p className="error">{err}</p>}
        <div className="half-actions" style={{ marginTop: 14 }}>
          <button className="btn" onClick={onClose}>Annulla</button>
          <button className="btn primary" disabled={busy} onClick={save}>{busy ? "Salvo…" : sale ? "Salva" : "Registra vendita"}</button>
        </div>
      </div>
    </div>
  );
}
