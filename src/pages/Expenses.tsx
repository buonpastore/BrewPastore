import { useEffect, useState } from "react";
import { supabase, uploadFile, parseDocument, openFile, errMsg, eur, date, type Row } from "../lib";
import { useAuth } from "../auth";
import { FilePicker } from "../components/FilePicker";

const METHODS: Record<string, string> = { bonifico: "🏦 Bonifico", paypal: "💙 PayPal", contanti: "💵 Contanti (a mano)", altro: "Altro" };

export function Expenses() {
  const { session, profiles, nameOf, isAdmin } = useAuth();
  const me = session!.user.id;
  const [expenses, setExpenses] = useState<Row[]>([]);
  const [settlements, setSettlements] = useState<Row[]>([]);
  const [balances, setBalances] = useState<Row[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [showPay, setShowPay] = useState<{ to?: string; amount?: number; expense_id?: string } | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    supabase.from("expenses").select("*, expense_shares(*)").order("expense_date", { ascending: false }).then(({ data }) => setExpenses(data ?? []));
    supabase.from("settlements").select("*").order("paid_on", { ascending: false }).then(({ data }) => setSettlements(data ?? []));
    supabase.from("member_balances").select("*").then(({ data }) => setBalances(data ?? []));
  }, [reload]);
  const refresh = () => setReload((x) => x + 1);

  // suggerimento: chi deve a chi (algoritmo greedy)
  const debts: { from: string; to: string; amount: number }[] = [];
  const pos = balances.filter((b) => b.balance > 0.005).map((b) => ({ id: b.user_id, v: Number(b.balance) }));
  const neg = balances.filter((b) => b.balance < -0.005).map((b) => ({ id: b.user_id, v: -Number(b.balance) }));
  for (const n of neg) for (const p of pos) {
    const a = Math.min(n.v, p.v);
    if (a > 0.005) { debts.push({ from: n.id, to: p.id, amount: Math.round(a * 100) / 100 }); n.v -= a; p.v -= a; }
  }

  const confirmReceived = async (s: Row) => {
    const { error } = await supabase.from("settlements").update({ confirmed: true, confirmed_at: new Date().toISOString() }).eq("id", s.id);
    if (error) return alert(errMsg(error));
    refresh();
  };
  const removeSettlement = async (s: Row) => {
    if (!confirm("Eliminare questo rimborso?")) return;
    const { error } = await supabase.from("settlements").delete().eq("id", s.id);
    if (error) return alert(errMsg(error));
    refresh();
  };
  const removeExpense = async (e: Row) => {
    if (!confirm(`Eliminare la spesa "${e.description}"?`)) return;
    if (e.receipt_path) await supabase.storage.from("documents").remove([e.receipt_path]);
    const { error } = await supabase.from("expenses").delete().eq("id", e.id);
    if (error) return alert(errMsg(error));
    refresh();
  };

  return (
    <div>
      <div className="page-head">
        <h1>Spese condivise</h1>
        <div className="row-actions">
          <button className="btn primary" onClick={() => setShowNew(true)}>🧾 Ho fatto una spesa</button>
          <button className="btn" onClick={() => setShowPay({})}>💸 Ho mandato soldi</button>
        </div>
      </div>

      <div className="kpis">
        {balances.map((b) => (
          <div key={b.user_id} className={"kpi " + (b.balance > 0.005 ? "pos" : b.balance < -0.005 ? "neg" : "")}>
            <span>{b.display_name}{b.user_id === me ? " (tu)" : ""}</span>
            <strong>{eur(b.balance)}</strong>
            <span className="small">{b.balance > 0.005 ? "deve ricevere" : b.balance < -0.005 ? "deve dare" : "in pari"}</span>
          </div>
        ))}
      </div>

      {debts.length > 0 && (
        <div className="panel">
          <h2>Per andare in pari</h2>
          <ul className="plain">
            {debts.map((d, i) => (
              <li key={i}>
                <strong>{nameOf(d.from)}</strong> → <strong>{nameOf(d.to)}</strong>: {eur(d.amount)}
                {d.from === me && <button className="btn small" onClick={() => setShowPay({ to: d.to, amount: d.amount })}>Segna come pagato</button>}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="panel">
        <h2>Spese</h2>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Data</th><th>Descrizione</th><th>Pagato da</th><th>Importo</th><th>Divisione</th><th>Scontrino</th><th /></tr></thead>
            <tbody>
              {expenses.map((e) => (
                <tr key={e.id}>
                  <td>{date(e.expense_date)}</td>
                  <td>{e.description}{e.notes && <div className="muted small">{e.notes}</div>}</td>
                  <td>{nameOf(e.paid_by)}</td>
                  <td><strong>{eur(e.amount)}</strong></td>
                  <td className="small">{(e.expense_shares as Row[]).map((s) => `${nameOf(s.user_id)} ${eur(s.amount)}`).join(" · ")}</td>
                  <td>{e.receipt_path ? <button className="link" onClick={() => openFile(e.receipt_path).catch((x) => alert(errMsg(x)))}>📎 apri</button> : "—"}</td>
                  <td>{(e.paid_by === me || isAdmin) && <button className="icon" onClick={() => removeExpense(e)}>🗑️</button>}</td>
                </tr>
              ))}
              {!expenses.length && <tr><td colSpan={7} className="muted">Nessuna spesa registrata.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel">
        <h2>Rimborsi</h2>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Data</th><th>Da</th><th>A</th><th>Importo</th><th>Metodo</th><th>Stato</th><th /></tr></thead>
            <tbody>
              {settlements.map((s) => (
                <tr key={s.id}>
                  <td>{date(s.paid_on)}</td>
                  <td>{nameOf(s.from_user)}</td>
                  <td>{nameOf(s.to_user)}</td>
                  <td><strong>{eur(s.amount)}</strong>{s.notes && <div className="muted small">{s.notes}</div>}</td>
                  <td>{METHODS[s.method] ?? s.method}</td>
                  <td>
                    {s.confirmed ? <span className="ok">✓ ricevuto</span>
                      : s.to_user === me ? <button className="btn small" onClick={() => confirmReceived(s)}>Confermo ricevuto</button>
                      : <span className="muted">in attesa di conferma</span>}
                  </td>
                  <td>{((s.from_user === me && !s.confirmed) || isAdmin) && <button className="icon" onClick={() => removeSettlement(s)}>🗑️</button>}</td>
                </tr>
              ))}
              {!settlements.length && <tr><td colSpan={7} className="muted">Nessun rimborso.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {showNew && <NewExpense profiles={profiles} me={me} onClose={() => setShowNew(false)} onSaved={refresh} />}
      {showPay && <NewSettlement profiles={profiles} me={me} initial={showPay} onClose={() => setShowPay(null)} onSaved={refresh} />}
    </div>
  );
}

function NewExpense({ profiles, me, onClose, onSaved }: { profiles: Row[]; me: string; onClose: () => void; onSaved: () => void }) {
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState<string>("");
  const [day, setDay] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [receipt, setReceipt] = useState<string | null>(null);
  const [participants, setParticipants] = useState<string[]>(profiles.map((p) => p.id));
  const [mode, setMode] = useState<"equal" | "custom">("equal");
  const [custom, setCustom] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const total = Number(amount.replace(",", ".")) || 0;

  const upload = async (files: File[]) => {
    const f = files[0];
    if (!f) return;
    setError(""); setBusy("Carico lo scontrino…");
    try {
      const path = await uploadFile(`expenses/${me}`, f);
      setReceipt(path);
      setBusy("Leggo lo scontrino con l'AI…");
      try {
        const r = await parseDocument(path);
        if (r.total_amount != null && !amount) setAmount(String(r.total_amount));
        if (r.date) setDay(r.date);
        if (!description) setDescription([r.supplier, r.items.slice(0, 3).map((i) => i.material_name).join(", ")].filter(Boolean).join(" – "));
      } catch { /* lettura facoltativa */ }
    } catch (e) { setError(errMsg(e)); }
    setBusy("");
  };

  const shares = (): { user_id: string; amount: number }[] => {
    if (mode === "custom") return participants.map((id) => ({ user_id: id, amount: Number((custom[id] ?? "0").replace(",", ".")) || 0 }));
    const n = participants.length;
    const base = Math.floor((total / n) * 100) / 100;
    const rest = Math.round((total - base * n) * 100) / 100;
    // il centesimo di resto lo prende chi ha pagato (se partecipa) o il primo
    const restTo = participants.includes(me) ? me : participants[0];
    return participants.map((id) => ({ user_id: id, amount: Math.round((base + (id === restTo ? rest : 0)) * 100) / 100 }));
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault(); setError("");
    if (!total || !participants.length) return setError("Inserisci importo e partecipanti");
    const sh = shares();
    const sum = sh.reduce((s, x) => s + x.amount, 0);
    if (Math.abs(sum - total) > 0.01) return setError(`Le quote sommano ${eur(sum)} invece di ${eur(total)}`);
    setBusy("Salvo…");
    const { data, error } = await supabase.from("expenses")
      .insert({ description, amount: total, expense_date: day, receipt_path: receipt, notes: notes || null }).select().single();
    if (error) { setBusy(""); return setError(errMsg(error)); }
    const { error: e2 } = await supabase.from("expense_shares").insert(sh.map((s) => ({ ...s, expense_id: data.id })));
    setBusy("");
    if (e2) return setError(errMsg(e2));
    onSaved(); onClose();
  };

  return (
    <div className="modal-backdrop">
      <form className="modal" onSubmit={save}>
        <h2>🧾 Nuova spesa</h2>
        {receipt
          ? <p className="ok small">✓ Scontrino caricato {busy ? "" : "— controlla i dati qui sotto"}</p>
          : <FilePicker onFiles={upload} multiple={false} disabled={Boolean(busy)} hint="Lo scontrino è facoltativo: l'AI prova a leggere importo e data." />}
        {busy && <p className="muted">⏳ {busy}</p>}
        <div className="form-grid">
          <label className="wide"><span>Descrizione</span><input required value={description} onChange={(e) => setDescription(e.target.value)} placeholder="es. Malti Mr Malt, bottiglie, tappi…" /></label>
          <label><span>Importo €</span><input required inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
          <label><span>Data</span><input type="date" value={day} onChange={(e) => setDay(e.target.value)} /></label>
          <label className="wide"><span>Note</span><input value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
        </div>
        <fieldset>
          <legend>Dividi tra</legend>
          <div className="row-actions">
            <label className="check"><input type="radio" checked={mode === "equal"} onChange={() => setMode("equal")} /> in parti uguali</label>
            <label className="check"><input type="radio" checked={mode === "custom"} onChange={() => setMode("custom")} /> importi personalizzati</label>
          </div>
          {profiles.map((p) => (
            <div key={p.id} className="share-row">
              <label className="check">
                <input type="checkbox" checked={participants.includes(p.id)}
                  onChange={(e) => setParticipants(e.target.checked ? [...participants, p.id] : participants.filter((x) => x !== p.id))} />
                {p.display_name}
              </label>
              {participants.includes(p.id) && (mode === "custom"
                ? <input inputMode="decimal" style={{ width: 90 }} value={custom[p.id] ?? ""} onChange={(e) => setCustom({ ...custom, [p.id]: e.target.value })} />
                : <span className="muted">{eur(shares().find((s) => s.user_id === p.id)?.amount)}</span>)}
            </div>
          ))}
        </fieldset>
        {error && <p className="error">{error}</p>}
        <div className="row-actions">
          <button className="btn primary" disabled={Boolean(busy)}>Salva spesa</button>
          <button type="button" className="btn" onClick={onClose}>Annulla</button>
        </div>
      </form>
    </div>
  );
}

function NewSettlement({ profiles, me, initial, onClose, onSaved }: {
  profiles: Row[]; me: string; initial: { to?: string; amount?: number; expense_id?: string }; onClose: () => void; onSaved: () => void;
}) {
  const others = profiles.filter((p) => p.id !== me);
  const [to, setTo] = useState(initial.to ?? others[0]?.id ?? "");
  const [amount, setAmount] = useState(initial.amount != null ? String(initial.amount) : "");
  const [method, setMethod] = useState("bonifico");
  const [day, setDay] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");

  const save = async (e: React.FormEvent) => {
    e.preventDefault(); setError("");
    const { error } = await supabase.from("settlements").insert({
      to_user: to, amount: Number(amount.replace(",", ".")), method, paid_on: day, notes: notes || null, expense_id: initial.expense_id ?? null,
    });
    if (error) return setError(errMsg(error));
    onSaved(); onClose();
  };

  return (
    <div className="modal-backdrop">
      <form className="modal" onSubmit={save}>
        <h2>💸 Ho mandato soldi</h2>
        <div className="form-grid">
          <label><span>A chi</span><select value={to} onChange={(e) => setTo(e.target.value)}>{others.map((p) => <option key={p.id} value={p.id}>{p.display_name}</option>)}</select></label>
          <label><span>Importo €</span><input required inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
          <label><span>Come</span><select value={method} onChange={(e) => setMethod(e.target.value)}>{Object.entries(METHODS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          <label><span>Data</span><input type="date" value={day} onChange={(e) => setDay(e.target.value)} /></label>
          <label className="wide"><span>Note</span><input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="es. CRO bonifico, causale…" /></label>
        </div>
        <p className="muted small">Il destinatario dovrà confermare di averli ricevuti.</p>
        {error && <p className="error">{error}</p>}
        <div className="row-actions">
          <button className="btn primary">Registra</button>
          <button type="button" className="btn" onClick={onClose}>Annulla</button>
        </div>
      </form>
    </div>
  );
}
