import { useEffect, useState } from "react";
import { Camera, Receipt, Check, Hourglass, ChevronDown, ChevronRight, Paperclip, Trash2 } from "lucide-react";
import { supabase, uploadFile, openFile, errMsg, eur, date, type Row } from "../lib";
import { useAuth } from "../auth";

/* Spese condivise, in modo semplice:
   1. chi paga inserisce la spesa (tipologia + importo), divisa in parti uguali tra chi partecipa;
   2. gli altri vedono le quote da pagare e toccano «Ho saldato»;
   3. quando tutti hanno saldato, la spesa passa nello storico. */

const TYPES = ["Materie prime", "Bottiglie", "Altro"];

export function Expenses() {
  const { session, profiles, nameOf, isAdmin } = useAuth();
  const me = session!.user.id;
  const [expenses, setExpenses] = useState<Row[]>([]);
  const [settlements, setSettlements] = useState<Row[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [reload, setReload] = useState(0);
  const refresh = () => setReload((x) => x + 1);

  useEffect(() => {
    supabase.from("expenses").select("*, expense_shares(*)").order("expense_date", { ascending: false }).order("created_at", { ascending: false })
      .then(({ data }) => setExpenses(data ?? []));
    supabase.from("settlements").select("*").then(({ data }) => setSettlements(data ?? []));
  }, [reload]);

  // una quota è saldata se chi la deve ha registrato il pagamento a chi ha pagato (chi ha pagato è già in pari)
  const paidShare = (e: Row, s: Row) => s.user_id === e.paid_by || Number(s.amount) === 0
    || settlements.some((x) => x.expense_id === e.id && x.from_user === s.user_id && x.to_user === e.paid_by);
  const shares = (e: Row) => (e.expense_shares ?? []) as Row[];
  const closed = (e: Row) => shares(e).every((s) => paidShare(e, s));
  const open = expenses.filter((e) => !closed(e));
  const done = expenses.filter(closed);

  // quote che devo pagare io
  const myDue = open.flatMap((e) => shares(e).filter((s) => s.user_id === me && !paidShare(e, s)).map((s) => ({ e, s })));

  const settle = async (e: Row, s: Row) => {
    if (!confirm(`Confermi di aver dato ${eur(s.amount)} a ${nameOf(e.paid_by)} per «${e.description}»?`)) return;
    const { error } = await supabase.from("settlements").insert({
      from_user: s.user_id, to_user: e.paid_by, amount: Number(s.amount), method: "altro", expense_id: e.id,
      confirmed: true, confirmed_at: new Date().toISOString(), notes: `Quota di «${e.description}»`,
    });
    if (error) return alert(errMsg(error));
    refresh();
  };
  const removeExpense = async (e: Row) => {
    if (!confirm(`Eliminare la spesa «${e.description}» di ${eur(e.amount)}?`)) return;
    const linked = settlements.filter((x) => x.expense_id === e.id).map((x) => x.id);
    if (linked.length) await supabase.from("settlements").delete().in("id", linked);
    const { error } = await supabase.from("expenses").delete().eq("id", e.id);
    if (error) return alert(errMsg(error));
    refresh();
  };
  const attachReceipt = async (e: Row, f: File) => {
    try {
      const path = await uploadFile(`expenses/${me}`, f);
      const { error } = await supabase.from("expenses").update({ receipt_path: path }).eq("id", e.id);
      if (error) throw error;
      refresh();
    } catch (x) { alert(errMsg(x)); }
  };

  const Card = ({ e }: { e: Row }) => {
    const sh = shares(e);
    const toReceive = sh.filter((s) => !paidShare(e, s)).reduce((t, s) => t + Number(s.amount), 0);
    const canEdit = e.paid_by === me || isAdmin;
    return (
      <div className={"xp-card" + (closed(e) ? " closed" : "")}>
        <div className="xp-head">
          <div>
            <strong>{e.description}</strong>
            <div className="muted small">{date(e.expense_date)} · pagata da <b>{nameOf(e.paid_by)}{e.paid_by === me ? " (tu)" : ""}</b></div>
          </div>
          <strong className="xp-amount">{eur(e.amount)}</strong>
        </div>
        <ul className="xp-shares">
          {sh.filter((s) => s.user_id !== e.paid_by).map((s) => {
            const ok = paidShare(e, s);
            return (
              <li key={s.user_id} className={ok ? "ok" : "due"}>
                {ok ? <Check size={16} /> : <Hourglass size={16} />}
                <span>{nameOf(s.user_id)}{s.user_id === me ? " (tu)" : ""}</span>
                <span className="xp-q">{eur(s.amount)}</span>
                <span className="xp-st">{ok ? "saldato" : "da pagare"}</span>
              </li>
            );
          })}
        </ul>
        {!closed(e) && e.paid_by === me && <p className="xp-recv">Da ricevere: <strong>{eur(toReceive)}</strong></p>}
        <div className="xp-actions">
          {e.receipt_path && <button className="mini-btn" onClick={() => openFile(e.receipt_path)}><Paperclip size={14} /> <span>Scontrino</span></button>}
          {!e.receipt_path && canEdit && (
            <label className="mini-btn"><Paperclip size={14} /> <span>Aggiungi scontrino</span>
              <input type="file" accept="image/*,application/pdf" hidden onChange={(ev) => ev.target.files?.[0] && attachReceipt(e, ev.target.files[0])} /></label>
          )}
          {canEdit && <button className="mini-btn" onClick={() => removeExpense(e)}><Trash2 size={14} /> <span>Elimina</span></button>}
        </div>
      </div>
    );
  };

  return (
    <div>
      <div className="page-head"><h1>Spese condivise</h1></div>
      <button className="btn primary btn-wide" onClick={() => setShowNew(true)}><Receipt size={20} /> Ho fatto una spesa</button>

      {myDue.length > 0 && (
        <>
          <h2>Da pagare</h2>
          <div className="xp-due">
            {myDue.map(({ e, s }) => (
              <div key={e.id} className="xp-due-row">
                <div>
                  <strong>{e.description}</strong>
                  <div className="muted small">a {nameOf(e.paid_by)} · {date(e.expense_date)}</div>
                </div>
                <strong className="xp-amount">{eur(s.amount)}</strong>
                <button className="btn primary" onClick={() => settle(e, s)}>Ho saldato</button>
              </div>
            ))}
          </div>
        </>
      )}

      <h2>Spese in corso</h2>
      {open.length ? <div className="xp-list">{open.map((e) => <Card key={e.id} e={e} />)}</div>
        : <p className="muted">Nessuna spesa in sospeso: siete tutti in pari 🍻</p>}

      {done.length > 0 && (
        <>
          <button className="xp-hist-btn" onClick={() => setShowHistory(!showHistory)}>
            {showHistory ? <ChevronDown size={18} /> : <ChevronRight size={18} />} Storico ({done.length} saldate)
          </button>
          {showHistory && <div className="xp-list">{done.map((e) => <Card key={e.id} e={e} />)}</div>}
        </>
      )}

      {showNew && <NewExpense profiles={profiles as Row[]} me={me} isAdmin={isAdmin} onClose={() => setShowNew(false)} onSaved={refresh} />}
    </div>
  );
}

function NewExpense({ profiles, me, isAdmin, onClose, onSaved }: { profiles: Row[]; me: string; isAdmin: boolean; onClose: () => void; onSaved: () => void }) {
  const [type, setType] = useState(TYPES[0]);
  const [other, setOther] = useState("");
  const [amount, setAmount] = useState("");
  const [day, setDay] = useState(new Date().toISOString().slice(0, 10));
  const [paidBy, setPaidBy] = useState(me);
  const [participants, setParticipants] = useState<string[]>(profiles.map((p) => p.id));
  const [mode, setMode] = useState<"equal" | "custom">("equal");
  const [custom, setCustom] = useState<Record<string, string>>({});
  const [receipt, setReceipt] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const total = Number(amount.replace(",", ".")) || 0;
  const n = participants.length || 1;
  const each = Math.floor((total / n) * 100) / 100;

  const save = async (ev: React.FormEvent) => {
    ev.preventDefault(); setError("");
    const description = type === "Altro" ? other.trim() : type;
    if (!description) return setError("Scrivi cos'è la spesa");
    if (!total) return setError("Inserisci l'importo");
    if (!participants.length) return setError("Scegli chi partecipa");
    if (mode === "custom") {
      const sum = participants.reduce((t, id) => t + (Number((custom[id] ?? "0").replace(",", ".")) || 0), 0);
      if (Math.abs(sum - total) > 0.01) return setError(`Le quote sommano ${eur(sum)} invece di ${eur(total)}`);
    }
    setBusy(true);
    try {
      const receipt_path = receipt ? await uploadFile(`expenses/${me}`, receipt) : null;
      const { data, error } = await supabase.from("expenses").insert({ description, amount: total, expense_date: day, paid_by: paidBy, receipt_path }).select().single();
      if (error) throw error;
      // parti uguali (i centesimi di resto li prende chi ha pagato) oppure divisione personalizzata
      const rest = Math.round((total - each * n) * 100) / 100;
      const restTo = participants.includes(paidBy) ? paidBy : participants[0];
      const rows = participants.map((id) => ({ expense_id: data.id, user_id: id,
        amount: mode === "custom" ? Math.round((Number((custom[id] ?? "0").replace(",", ".")) || 0) * 100) / 100 : Math.round((each + (id === restTo ? rest : 0)) * 100) / 100 }));
      const { error: e2 } = await supabase.from("expense_shares").insert(rows);
      if (e2) throw e2;
      onSaved(); onClose();
    } catch (x) { setError(errMsg(x)); }
    setBusy(false);
  };

  return (
    <div className="modal-backdrop">
      <form className="modal" onSubmit={save}>
        <h2>🧾 Nuova spesa</h2>
        <span className="nb-label">Tipologia</span>
        <div className="xp-types">
          {TYPES.map((t) => <button key={t} type="button" className={"pay-method" + (type === t ? " on" : "")} onClick={() => setType(t)}>{t}</button>)}
        </div>
        {type === "Altro" && <label className="block"><span>Cosa?</span><input autoFocus value={other} onChange={(e) => setOther(e.target.value)} placeholder="es. tappi, detergenti, pentola…" /></label>}
        <div className="form-grid">
          <label><span>Importo €</span><input required inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" /></label>
          <label><span>Data</span><input type="date" value={day} onChange={(e) => setDay(e.target.value)} /></label>
          {isAdmin && (
            <label><span>Chi l'ha pagata</span>
              <select value={paidBy} onChange={(e) => setPaidBy(e.target.value)}>{profiles.map((p) => <option key={p.id} value={p.id}>{p.display_name}{p.id === me ? " (tu)" : ""}</option>)}</select>
            </label>
          )}
        </div>
        <span className="nb-label">Divisione</span>
        <div className="xp-types two">
          <button type="button" className={"pay-method" + (mode === "equal" ? " on" : "")} onClick={() => setMode("equal")}>Parti uguali</button>
          <button type="button" className={"pay-method" + (mode === "custom" ? " on" : "")} onClick={() => setMode("custom")}>Personalizzata</button>
        </div>
        {/* una riga per persona: spunta, nome e quota (calcolata con parti uguali, da scrivere con personalizzata) */}
        <div className="xp-rows">
          {profiles.map((p) => {
            const on = participants.includes(p.id);
            const share = !on ? "" : mode === "equal" ? (total ? eur(each) : "—") : null;
            return (
              <div key={p.id} className={"xp-row" + (on ? " on" : "")}>
                <label className="xp-row-name">
                  <input type="checkbox" checked={on} onChange={(e) => setParticipants(e.target.checked ? [...participants, p.id] : participants.filter((x) => x !== p.id))} />
                  <span className="xp-row-who">{p.display_name}{p.id === paidBy && <small className="muted">ha pagato</small>}</span>
                </label>
                {share !== null ? <span className="xp-row-amt">{share}</span> : (
                  <span className="xp-row-in"><input inputMode="decimal" value={custom[p.id] ?? ""} placeholder="0,00" onChange={(e) => setCustom({ ...custom, [p.id]: e.target.value })} /> €</span>
                )}
              </div>
            );
          })}
        </div>
        {mode === "custom" && total > 0 && (() => {
          const sum = participants.reduce((t, id) => t + (Number((custom[id] ?? "0").replace(",", ".")) || 0), 0);
          const diff = Math.round((total - sum) * 100) / 100;
          return <p className={"small " + (Math.abs(diff) < 0.01 ? "ok" : "warn")}>{Math.abs(diff) < 0.01 ? "✓ Le quote tornano" : diff > 0 ? `Mancano ${eur(diff)}` : `Ci sono ${eur(-diff)} in più`}</p>;
        })()}
        <span className="nb-label">Scontrino (facoltativo)</span>
        {receipt ? (
          <div className="xp-receipt">
            {receipt.type.startsWith("image/") ? <img src={URL.createObjectURL(receipt)} alt="Scontrino" /> : <span className="xp-receipt-pdf">📄</span>}
            <span className="xp-receipt-name">{receipt.name}</span>
            <button type="button" className="mini-btn" onClick={() => setReceipt(null)}>Togli</button>
          </div>
        ) : (
          <label className="xp-drop">
            <Camera size={26} />
            <span><strong>Aggiungi lo scontrino</strong><small>foto, immagine o PDF</small></span>
            <input type="file" accept="image/*,application/pdf" hidden onChange={(e) => setReceipt(e.target.files?.[0] ?? null)} />
          </label>
        )}
        {error && <p className="error">{error}</p>}
        <div className="qe-sheet-btns">
          <button type="button" className="btn" onClick={onClose}>Annulla</button>
          <button className="btn primary" disabled={busy}>{busy ? "Salvo…" : "Salva spesa"}</button>
        </div>
      </form>
    </div>
  );
}
