import { FONDO, moveBottles, loadStock, isBottlesMissing, NEED_0032 } from "../bottles";
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Calculator, ClipboardList, Handshake, Minus, Pencil, Plus, Trash2, Users, Wallet, X } from "lucide-react";
import { loadCash, cashBalance, setLinkedCash, addCash, isCashMissing, NEED_0030 } from "../cash";
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
/** Bottiglie di una vendita da rimettere (+1) o togliere (−1): dalla cantina di chi le dà o dal fondo birre. */
const cellarOut = (s: Row, sign: 1 | -1) => (s.from_cellar ? itemsOf(s).filter((i) => i.batch_id).map((i) => ({ user: i.from_fund ? FONDO : (i.giver_id ?? s.seller_id), batch: i.batch_id, delta: sign * Number(i.bottles) })) : []);
const moveCellar = moveBottles;

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
  // proposte di vendita
  const [props, setProps] = useState<Row[]>([]);
  const [propErr, setPropErr] = useState("");
  const [propForm, setPropForm] = useState(false);
  const [selling, setSelling] = useState<Row | null>(null);   // proposta da trasformare in vendita
  const [view, setView] = useState<"vendite" | "clienti">("vendite");
  const [reload, setReload] = useState(0);
  // fondo cassa
  const [cash, setCash] = useState<Row[]>([]);
  const [cashErr, setCashErr] = useState("");
  const [cashForm, setCashForm] = useState<"versamento" | "prelievo" | null>(null);
  const [showMoves, setShowMoves] = useState(false);
  useEffect(() => { loadCash().then(({ rows, error }) => { setCash(rows); setCashErr(error); }); }, [reload]);
  useEffect(() => {
    supabase.from("sale_proposals").select("*, sale_proposal_items(*)").eq("status", "aperta").order("created_at", { ascending: false })
      .then(({ data, error }) => { setPropErr(error ? (isBottlesMissing(error.message) ? NEED_0032 : errMsg(error)) : ""); setProps(data ?? []); });
  }, [reload]);
  const answerItem = async (i: Row, ok: boolean) => {
    const { error } = await supabase.from("sale_proposal_items").update({ giver_status: ok ? "ok" : "no" }).eq("id", i.id);
    if (error) return alert(errMsg(error));
    setReload((x) => x + 1);
  };
  const cancelProp = async (p: Row) => {
    if (!confirm(`Annullare la proposta per ${p.buyer}? Le bottiglie prenotate tornano libere.`)) return;
    const { error } = await supabase.from("sale_proposals").update({ status: "annullata" }).eq("id", p.id);
    if (error) return alert(errMsg(error));
    setReload((x) => x + 1);
  };

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
    for (const s of list.filter((x) => x.split !== "cassa")) {   // le vendite nel fondo cassa non sono soldi dei singoli
      const t = total(s);
      get(s.seller_id).incassato += t;
      if (s.split === "venditore") get(s.seller_id).spetta += t;
      else for (const p of soci) get(p.id).spetta += t / soci.length;
    }
    return m;
  }, [list, soci]);
  const tot = list.reduce((a, s) => a + total(s), 0);
  const bottles = list.reduce((a, s) => a + itemsOf(s).reduce((x, i) => x + Number(i.bottles), 0), 0);
  const divisi = list.filter((s) => s.split === "soci").reduce((a, s) => a + total(s), 0);
  const personal = list.filter((s) => s.split !== "cassa");
  const balance = cashBalance(cash);

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
      <div className="sales-new">
        <button className="btn primary" onClick={() => setEditing("new")} disabled={!!err && err === NEED_0024}><Plus size={18} /> Nuova vendita</button>
        <button className="btn" onClick={() => setPropForm(true)}><ClipboardList size={18} /> Proposta</button>
      </div>
      {err && <p className="error" style={{ marginTop: 12 }}>{err}</p>}

      {/* l'informazione principale: quanto c'è nel fondo cassa */}
      <div className="cash-card">
        <div className="cash-top">
          <span><Wallet size={18} /> Fondo cassa</span>
          <strong className={balance < 0 ? "neg" : ""}>{cashErr ? "—" : eur(balance)}</strong>
        </div>
        {cashErr ? <p className="muted small">{cashErr}</p> : (
          <>
            <div className="cash-btns">
              <button type="button" className="btn small" onClick={() => setCashForm("versamento")}><Plus size={15} /> Versamento</button>
              <button type="button" className="btn small" onClick={() => setCashForm("prelievo")}><Minus size={15} /> Prelievo</button>
              <button type="button" className="btn small" onClick={() => setShowMoves(!showMoves)}>{showMoves ? "Chiudi movimenti" : `Movimenti (${cash.length})`}</button>
            </div>
            {showMoves && (
              <ul className="cash-moves">
                {cash.map((m) => (
                  <li key={m.id}>
                    <span className="cm-date">{date(m.moved_on)}</span>
                    <span className="cm-desc">{m.description || m.kind}</span>
                    <strong className={Number(m.amount) < 0 ? "neg" : "pos"}>{Number(m.amount) > 0 ? "+" : ""}{eur(Number(m.amount))}</strong>
                    {(isAdmin || m.created_by === me) && !m.sale_id && !m.purchase_id && !m.expense_id && (
                      <button type="button" className="icon-btn" title="Elimina" onClick={async () => {
                        if (!confirm(`Eliminare il movimento «${m.description || m.kind}» di ${eur(Number(m.amount))}?`)) return;
                        const { error } = await supabase.from("cash_movements").delete().eq("id", m.id);
                        if (error) return alert(errMsg(error));
                        setReload((x) => x + 1);
                      }}><Trash2 size={14} /></button>
                    )}
                  </li>
                ))}
                {!cash.length && <li className="muted small">Nessun movimento ancora.</li>}
              </ul>
            )}
          </>
        )}
      </div>
      {cashForm && <CashForm kind={cashForm} onClose={() => setCashForm(null)} onSaved={() => { setCashForm(null); setReload((x) => x + 1); }} />}

      {/* proposte: birre richieste ma non ancora vendute */}
      {(props.length > 0 || propErr) && (
        <div className="props">
          <h3 className="sales-h"><ClipboardList size={16} /> Proposte di vendita <span className="muted small">({props.length})</span></h3>
          {propErr && <p className="muted small">{propErr}</p>}
          {props.map((p) => {
            const its = (p.sale_proposal_items ?? []) as Row[];
            const ready = its.length > 0 && its.every((i) => i.giver_status === "ok");
            const tot = its.reduce((a, i) => a + Number(i.bottles) * Number(i.unit_price), 0);
            const mineToAnswer = its.filter((i) => !i.from_fund && i.giver_id === me && i.giver_status === "attesa");
            return (
              <div key={p.id} className={"prop-card" + (ready ? " ready" : "")}>
                <div className="sr-top"><strong>{p.buyer}</strong><strong className="sr-tot">{eur(tot)}</strong></div>
                <div className="sr-meta"><span>chiesta a <b>{nameOf(p.requested_by)}</b> · {date(p.created_at)}</span></div>
                <div className="sr-items">
                  {its.map((i) => {
                    const b = batchOf(i.batch_id);
                    return (
                      <span key={i.id}>
                        {b ? <CapDot color={b.cap_color} /> : <i className="sr-nocap" />}
                        <b>{i.bottles}×</b> {beerName(i.batch_id) ?? "birra"} <span className="muted">da {i.from_fund ? "Fondo birre" : nameOf(i.giver_id)}</span>
                        <em className={"pi-st " + i.giver_status}>{i.giver_status === "ok" ? "✓" : i.giver_status === "no" ? "✋ no" : "⏳"}</em>
                      </span>
                    );
                  })}
                </div>
                {p.notes && <div className="muted small">{p.notes}</div>}
                {mineToAnswer.length > 0 && (
                  <div className="prop-ask">
                    <span>Te le chiedono: le dai tu?</span>
                    <div className="half-actions">
                      <button className="btn primary" onClick={() => Promise.all(mineToAnswer.map((i) => answerItem(i, true)))}>✓ Gliele do</button>
                      <button className="btn" onClick={() => Promise.all(mineToAnswer.map((i) => answerItem(i, false)))}>✋ Non posso</button>
                    </div>
                  </div>
                )}
                {(p.requested_by === me || isAdmin) && (
                  <div className="half-actions" style={{ marginTop: 8 }}>
                    <button className="btn" onClick={() => cancelProp(p)}>Annulla</button>
                    <button className="btn primary" disabled={!ready} title={ready ? "" : "Aspetta che chi dà le bottiglie confermi"} onClick={() => setSelling(p)}>{ready ? "Conferma vendita" : "Aspetta le conferme"}</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {sales && list.length > 0 && (
        <>
          <div className="sales-kpi">
            <div style={{ ["--c" as string]: "var(--gold)" }}><small>Incassato</small><strong>{eur(tot)}</strong></div>
            <div style={{ ["--c" as string]: "var(--teal)" }}><small>Bottiglie</small><strong>{bottles}</strong></div>
            <div style={{ ["--c" as string]: "var(--magenta)" }}><small>Clienti</small><strong>{clienti.length}</strong></div>
          </div>

          {personal.length > 0 && (
          <details className="sales-personal">
          <summary><Users size={16} /> Incassi dei singoli soci <span className="muted small">(vendite non messe nel fondo)</span></summary>
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
          <p className="muted small">«Gli spetta»: la sua parte delle vendite da dividere ({eur(divisi)} in {soci.length}) più tutto quello che ha venduto tenendosi l'incasso. Chi ha incassato più di quanto gli spetta deve dare la differenza agli altri. Le vendite nel fondo cassa non contano qui.</p>
          </details>
          )}

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
                            <b>{i.bottles}×</b> {beerName(i.batch_id) ?? "birra"} <span className="muted">a {eur(i.unit_price)}{i.giver_id ? ` · da ${nameOf(i.giver_id)}` : ""}</span>
                          </span>
                        );
                      })}
                    </div>
                    <div className="sr-meta">
                      <span>venduta da <b>{nameOf(s.seller_id)}</b></span>
                      <span className={"sr-split " + (s.split === "venditore" ? "own" : s.split === "cassa" ? "cash" : "shared")}>{s.split === "cassa" ? "💰 nel fondo cassa" : s.split === "venditore" ? "se la tiene chi vende" : `divisa tra i soci · ${eur(total(s) / soci.length)} a testa`}</span>
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

      {propForm && (
        <SaleForm mode="proposta" sale={null} me={me} soci={soci} batches={batches} buyers={clienti.map((c) => c.name)} items={[]}
          onClose={() => setPropForm(false)} onSaved={() => { setPropForm(false); setReload((x) => x + 1); }} />
      )}
      {selling && (
        <SaleForm sale={null} me={me} soci={soci} batches={batches} buyers={clienti.map((c) => c.name)} prefillBuyer={selling.buyer}
          items={((selling.sale_proposal_items ?? []) as Row[]).map((i) => ({ batch_id: i.batch_id, bottles: i.bottles, unit_price: i.unit_price, giver_id: i.giver_id, from_fund: i.from_fund }))}
          onClose={() => setSelling(null)}
          onSaved={async (id) => {
            await supabase.from("sale_proposals").update({ status: "venduta", sale_id: id ?? null }).eq("id", selling.id);
            setSelling(null); setReload((x) => x + 1);
          }} />
      )}
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

type Line = { key: string; batch_id: string | null; qty: number; price: number; giver: string };

/** Vendita (o proposta di vendita): chi la fa, a chi, quali birre, quante, da chi (socio o fondo birre), a che prezzo. */
function SaleForm({ sale, me, soci, batches, buyers, items, onClose, onSaved, mode = "vendita", prefillBuyer }: {
  sale: Row | null; me: string; soci: Row[]; batches: Row[]; buyers: string[]; items: Row[]; onClose: () => void; onSaved: (id?: string) => void;
  mode?: "vendita" | "proposta"; prefillBuyer?: string;
}) {
  const isProp = mode === "proposta";
  const [seller, setSeller] = useState<string>(sale?.seller_id ?? me);
  const [buyer, setBuyer] = useState<string>(sale?.buyer ?? prefillBuyer ?? "");
  const [day, setDay] = useState<string>(sale?.sold_on ?? today());
  // di partenza i soldi vanno nel fondo cassa
  const [split, setSplit] = useState<"cassa" | "soci" | "venditore">(sale?.split ?? "cassa");
  const [notes, setNotes] = useState<string>(sale?.notes ?? "");
  const [payment, setPayment] = useState<string>(sale?.payment ?? "contanti");
  // le bottiglie si tolgono dalla cantina di chi le dà (o dal fondo birre); di partenza sì
  const [fromCellar, setFromCellar] = useState<boolean>(sale ? Boolean(sale.from_cellar) : true);
  const [stock, setStock] = useState<Record<string, number>>({});   // «socio|batch» e «fondo|batch» → bottiglie
  useEffect(() => { loadStock().then(setStock); }, []);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  // le ultime 5 birre non esaurite (dalla più recente), più quelle già nella vendita, più «altra birra»
  const beers = useMemo(() => {
    const last = batches.filter((b) => !isEnded(b.status)).slice(0, 5);
    for (const i of items) { const b = batches.find((x) => x.id === i.batch_id); if (b && !last.includes(b)) last.push(b); }
    return last;
  }, [batches, items]);
  const giverOf = (it?: Row) => (it ? (it.from_fund ? FONDO : (it.giver_id ?? sale?.seller_id ?? me)) : me);
  const [lines, setLines] = useState<Line[]>(() => [
    ...beers.map((b) => { const it = items.find((i) => i.batch_id === b.id); return { key: b.id, batch_id: b.id, qty: it ? Number(it.bottles) : 0, price: it ? Number(it.unit_price) : 0, giver: giverOf(it) }; }),
    (() => { const it = items.find((i) => !i.batch_id || !beers.some((b) => b.id === i.batch_id)); return { key: "altro", batch_id: null, qty: it ? Number(it.bottles) : 0, price: it ? Number(it.unit_price) : 0, giver: giverOf(it) }; })(),
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
  const giverName = (g: string) => (g === FONDO ? "Fondo birre" : soci.find((p) => p.id === g)?.display_name ?? "");
  const usesFund = chosen.some((l) => l.giver === FONDO);
  // quante ne ha chi le dà (contando quelle che questa vendita aveva già tolto)
  const haveOf = (l: Line) => {
    const before = items.find((i) => i.batch_id === l.batch_id);
    const back = sale?.from_cellar && before && giverOf(before) === l.giver ? Number(before.bottles) : 0;
    return (stock[`${l.giver}|${l.batch_id}`] ?? 0) + back;
  };

  const saveProposal = async () => {
    const { data, error } = await supabase.from("sale_proposals").insert({ buyer: buyer.trim(), notes: notes.trim() || null }).select("id").single();
    if (error) throw error;
    const { error: e2 } = await supabase.from("sale_proposal_items").insert(chosen.map((l) => ({
      proposal_id: data.id, batch_id: l.batch_id, bottles: l.qty, unit_price: l.price,
      giver_id: l.giver === FONDO ? null : l.giver, from_fund: l.giver === FONDO,
      // chi chiede le proprie bottiglie o quelle del fondo non deve aspettare nessuno; le bottiglie degli altri le confermano loro
      giver_status: l.giver === FONDO || l.giver === me ? "ok" : "attesa",
    })));
    if (e2) throw e2;
    return data.id as string;
  };

  const save = async () => {
    if (!buyer.trim()) return setErr(isProp ? "Scrivi chi le ha chieste." : "Scrivi a chi l'avete venduta.");
    if (!chosen.length) return setErr("Metti quante bottiglie di almeno una birra.");
    setBusy(true); setErr("");
    const fail = (e: { message: string }) => { setBusy(false); setErr(isBottlesMissing(e.message) ? NEED_0032 : isCashMissing(e.message) ? NEED_0030 : /from_cellar/i.test(e.message) ? NEED_0029 : /payment/i.test(e.message) ? NEED_0026 : /amount|sale_items/i.test(e.message) ? NEED_0025 : /sales|relation|schema cache/i.test(e.message) ? NEED_0024 : errMsg(e)); };
    if (isProp) {
      try { await saveProposal(); } catch (e) { return fail(e as { message: string }); }
      setBusy(false); return onSaved();
    }
    const amount = Math.round(t * 100) / 100;
    const row = {
      seller_id: seller, buyer: buyer.trim(), sold_on: day || today(), split, payment, notes: notes.trim() || null,
      batch_id: chosen.length === 1 ? chosen[0].batch_id : null, bottles: nBottles,
      unit_price: Math.round((amount / nBottles) * 100) / 100, amount,
      ...(fromCellar || sale?.from_cellar ? { from_cellar: fromCellar } : {}),
    };
    let id = sale?.id as string | undefined;
    if (sale) { const { error } = await supabase.from("sales").update(row).eq("id", sale.id); if (error) return fail(error); }
    else { const { data, error } = await supabase.from("sales").insert(row).select("id").single(); if (error) return fail(error); id = data.id; }
    await supabase.from("sale_items").delete().eq("sale_id", id!);
    const { error } = await supabase.from("sale_items").insert(chosen.map((l) => ({
      sale_id: id, batch_id: l.batch_id, bottles: l.qty, unit_price: l.price,
      giver_id: l.giver === FONDO ? null : l.giver, ...(usesFund || items.some((i) => i.from_fund) ? { from_fund: l.giver === FONDO } : {}),
    })));
    if (error) return fail(error);
    // fondo cassa: l'incasso entra nel fondo (o ne esce, se la vendita non è più nel fondo)
    try {
      await setLinkedCash({ sale_id: id! }, { amount: split === "cassa" ? amount : 0, kind: "vendita", description: `Vendita a ${buyer.trim()}`, day: day || today() });
    } catch (e) { setBusy(false); return setErr("Vendita salvata, ma il fondo cassa non si è aggiornato: " + errMsg(e as { message: string })); }
    // cantine e fondo birre: rimetto quello che la vendita aveva tolto prima e tolgo quello di adesso
    try {
      await moveBottles([
        ...(sale ? cellarOut({ ...sale, sale_items: items }, 1) : []),
        ...(fromCellar ? chosen.filter((l) => l.batch_id).map((l) => ({ user: l.giver, batch: l.batch_id!, delta: -l.qty })) : []),
      ]);
    } catch (e) { setBusy(false); return setErr("Vendita salvata, ma la cantina non si è aggiornata: " + errMsg(e as { message: string })); }
    setBusy(false);
    onSaved(id);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal sale-modal" onClick={(e) => e.stopPropagation()}>
        <button className="icon-btn famous-x" aria-label="Chiudi" onClick={onClose}><X size={18} /></button>
        <h2>{isProp ? "📝 Proposta di vendita" : sale ? "Modifica vendita" : "Nuova vendita"}</h2>
        {isProp && <p className="muted small">Te le hanno chieste ma non le hai ancora vendute: chi deve dare le bottiglie conferma, e quelle confermate restano prenotate nella sua cantina.</p>}

        {!isProp && (
          <>
            <span className="nb-label">Chi ha fatto la vendita</span>
            <div className="xp-types">
              {soci.map((p) => <button key={p.id} type="button" className={"pay-method" + (seller === p.id ? " on" : "")} onClick={() => setSeller(p.id)}>{p.display_name}{p.id === me ? " (tu)" : ""}</button>)}
            </div>
          </>
        )}
        <label className="block"><span>{isProp ? "Chi le ha chieste" : "A chi"}</span>
          <input list="sale-buyers" value={buyer} onChange={(e) => setBuyer(e.target.value)} placeholder="Nome di chi compra" />
          <datalist id="sale-buyers">{buyers.map((b) => <option key={b} value={b} />)}</datalist>
        </label>
        {!isProp && <label className="block"><span>Data</span><input type="date" value={day} onChange={(e) => setDay(e.target.value)} /></label>}

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
                  <>
                    <div className="sb-price">
                      <span className="muted small">a bottiglia</span>
                      <MiniStep value={l.price} step={0.5} digits={2} unit="€" onChange={(p) => setLine(l.key, { price: p })} />
                      <strong>{eur(l.qty * l.price)}</strong>
                    </div>
                    <div className="sb-giver">
                      <span className="muted small">le dà</span>
                      {[...soci.map((p) => p.id), FONDO].map((g) => (
                        <button key={g} type="button" className={"chip" + (l.giver === g ? " on" : "")} onClick={() => setLine(l.key, { giver: g })}>
                          {g === FONDO ? "🍺 Fondo" : giverName(g)}{l.batch_id ? ` (${stock[`${g}|${l.batch_id}`] ?? 0})` : ""}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            );
          })}
          {!beers.length && <p className="muted small">Nessuna birra imbottigliata e non esaurita: usa «Altra birra».</p>}
        </div>
        <div className="sale-total">{nBottles} {nBottles === 1 ? "bottiglia" : "bottiglie"} · totale <strong>{eur(t)}</strong></div>

        {!isProp && (
          <>
            <div className={"sale-cellar" + (fromCellar ? " on" : "")}>
              <label className="check"><input type="checkbox" checked={fromCellar} onChange={(e) => setFromCellar(e.target.checked)} /> <span>🍾 Togli le bottiglie dalla cantina di chi le dà</span></label>
              {fromCellar && chosen.filter((l) => l.batch_id).map((l) => {
                const b = beers.find((x) => x.id === l.batch_id);
                const have = haveOf(l);
                return (
                  <div key={l.key} className={"sc-row" + (l.qty > have ? " short" : "")}>
                    <span>{b ? label(b) : "Birra"} · <b>{giverName(l.giver)}</b></span>
                    <span>{have} → <b>{Math.max(0, have - l.qty)}</b>{l.qty > have ? " (non bastano)" : ""}</span>
                  </div>
                );
              })}
              {fromCellar && chosen.some((l) => !l.batch_id) && <p className="muted small">«Altra birra» non è in cantina e non viene tolta.</p>}
            </div>

            <span className="nb-label">I soldi</span>
            <div className="xp-types">
              <button type="button" className={"pay-method" + (split === "cassa" ? " on" : "")} onClick={() => setSplit("cassa")}>💰 Nel fondo cassa<small>{eur(t)}</small></button>
              <button type="button" className={"pay-method" + (split === "soci" ? " on" : "")} onClick={() => setSplit("soci")}>Divisi tra i soci<small>{eur(t / Math.max(1, soci.length))} a testa</small></button>
              <button type="button" className={"pay-method" + (split === "venditore" ? " on" : "")} onClick={() => setSplit("venditore")}>Li tiene chi vende<small>{eur(t)}</small></button>
            </div>
            <span className="nb-label">Pagamento</span>
            <div className="xp-types">
              {PAYMENTS.map((p) => <button key={p.key} type="button" className={"pay-method" + (payment === p.key ? " on" : "")} onClick={() => setPayment(p.key)}>{p.label}</button>)}
            </div>
          </>
        )}
        <label className="block"><span>Note</span><input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={isProp ? "es. le vuole per sabato" : "es. bottiglie da 33 cl, regalo…"} /></label>

        {err && <p className="error">{err}</p>}
        <div className="half-actions" style={{ marginTop: 14 }}>
          <button className="btn" onClick={onClose}>Annulla</button>
          <button className="btn primary" disabled={busy} onClick={save}>{busy ? "Salvo…" : isProp ? "Registra la proposta" : sale ? "Salva" : "Registra vendita"}</button>
        </div>
      </div>
    </div>
  );
}

/** Versamento nel fondo cassa (soldi messi dai soci) o prelievo a mano. */
function CashForm({ kind, onClose, onSaved }: { kind: "versamento" | "prelievo"; onClose: () => void; onSaved: () => void }) {
  const [amount, setAmount] = useState(0);
  const [desc, setDesc] = useState("");
  const [day, setDay] = useState(today());
  const [err, setErr] = useState("");
  const save = async () => {
    if (!(amount > 0)) return setErr("Metti l'importo.");
    try {
      await addCash({ amount: kind === "prelievo" ? -amount : amount, kind, description: desc.trim() || (kind === "versamento" ? "Versamento nel fondo" : "Prelievo dal fondo"), day });
      onSaved();
    } catch (e) { setErr(errMsg(e as { message: string })); }
  };
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal sale-modal" onClick={(e) => e.stopPropagation()}>
        <button className="icon-btn famous-x" aria-label="Chiudi" onClick={onClose}><X size={18} /></button>
        <h2>{kind === "versamento" ? "💰 Versamento nel fondo" : "💸 Prelievo dal fondo"}</h2>
        <div className="sb-price" style={{ border: 0, paddingTop: 0 }}>
          <span className="muted small">Importo</span>
          <MiniStep value={amount} step={5} digits={2} unit="€" onChange={setAmount} />
        </div>
        <label className="block"><span>Per cosa</span><input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder={kind === "versamento" ? "es. quota iniziale dei soci" : "es. bombola CO₂"} /></label>
        <label className="block"><span>Data</span><input type="date" value={day} onChange={(e) => setDay(e.target.value)} /></label>
        {err && <p className="error">{err}</p>}
        <div className="half-actions" style={{ marginTop: 12 }}>
          <button className="btn" onClick={onClose}>Annulla</button>
          <button className="btn primary" onClick={save}>Salva</button>
        </div>
      </div>
    </div>
  );
}
