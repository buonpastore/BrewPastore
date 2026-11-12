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
  const [payShare, setPayShare] = useState<{ expense: Row; share: Row } | null>(null);

  const payWith = async (method: string) => {
    if (!payShare) return;
    const { error } = await supabase.from("settlements").insert({
      to_user: payShare.expense.paid_by, amount: Number(payShare.share.amount), method, expense_id: payShare.expense.id,
      notes: `Quota di «${payShare.expense.description}»`,
    });
    if (error) return alert(errMsg(error));
    setPayShare(null); setReload((x) => x + 1);
  };

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
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const attachReceipt = async (e: Row, f: File) => {
    setUploadingId(e.id);
    try {
      const path = await uploadFile(`expenses/${me}`, f);
      const { error } = await supabase.from("expenses").update({ receipt_path: path }).eq("id", e.id);
      if (error) throw error;
      refresh();
    } catch (x) { alert(errMsg(x)); }
    setUploadingId(null);
  };

  const removeExpense = async (e: Row) => {
    const linked = settlements.filter((x) => x.expense_id === e.id);
    const extra = linked.length ? `\n\nVerranno cancellati anche ${linked.length} pagament${linked.length === 1 ? "o" : "i"} delle quote collegat${linked.length === 1 ? "o" : "i"}.` : "";
    if (!confirm(`Eliminare la spesa «${e.description}» di ${eur(e.amount)}?${extra}`)) return;
    // i pagamenti collegati: li cancella il database (file 0007); qui li togliamo anche nel caso non sia ancora stato eseguito
    if (linked.length) await supabase.from("settlements").delete().in("id", linked.map((x) => x.id));
    const { error } = await supabase.from("expenses").delete().eq("id", e.id);
    if (error) return alert(errMsg(error));
    if (e.receipt_path) await supabase.storage.from("documents").remove([e.receipt_path]);
    refresh();
  };

  return (
    <div>
      <div className="page-head">
        <h1>Spese condivise</h1>
        <div className="exp-actions">
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
        <div className="exp-list">
          {expenses.map((e) => (
            <article key={e.id} className="exp-card">
              <header>
                <div>
                  <strong>{e.description}</strong>
                  <div className="muted small">{date(e.expense_date)} · pagata da <strong>{nameOf(e.paid_by)}</strong></div>
                  {e.notes && <div className="muted small">{e.notes}</div>}
                </div>
                <div className="exp-amount">{eur(e.amount)}</div>
              </header>
              <ul className="exp-shares">
                {(e.expense_shares as Row[]).map((sh) => {
                  const isPayer = sh.user_id === e.paid_by;
                  const st = settlements.find((x) => x.expense_id === e.id && x.from_user === sh.user_id && x.to_user === e.paid_by);
                  return (
                    <li key={sh.user_id} className={isPayer ? "payer" : st ? (st.confirmed ? "paid" : "pending") : "due"}>
                      <span className="exp-who">{nameOf(sh.user_id)}{sh.user_id === me ? " (tu)" : ""}</span>
                      <span className="exp-share">{eur(sh.amount)}</span>
                      <span className="exp-state">
                        {isPayer ? "ha anticipato"
                          : st ? <>✓ pagato · {METHODS[st.method] ?? st.method}{st.confirmed ? " · ricevuto" : " · da confermare"}</>
                          : "da pagare"}
                      </span>
                      <span className="exp-act">
                        {!isPayer && !st && sh.user_id === me && Number(sh.amount) > 0 && (
                          <button className="btn small primary" onClick={() => setPayShare({ expense: e, share: sh })}>💸 Ho pagato</button>
                        )}
                        {st && !st.confirmed && e.paid_by === me && <button className="btn small" onClick={() => confirmReceived(st)}>Confermo ricevuto</button>}
                        {st && !st.confirmed && st.from_user === me && <button className="icon" title="Annulla" onClick={() => removeSettlement(st)}>↩️</button>}
                      </span>
                    </li>
                  );
                })}
              </ul>
              <footer>
                {e.receipt_path ? (
                  <button className="btn small" onClick={() => openFile(e.receipt_path).catch((x) => alert(errMsg(x)))}>📎 Vedi scontrino</button>
                ) : (e.paid_by === me || isAdmin) ? (
                  <label className="btn small">
                    {uploadingId === e.id ? "Carico…" : "📷 Aggiungi scontrino"}
                    <input type="file" accept="image/*,application/pdf" hidden disabled={uploadingId === e.id}
                      onChange={(ev) => { const f = ev.target.files?.[0]; ev.target.value = ""; if (f) attachReceipt(e, f); }} />
                  </label>
                ) : <span className="muted small">nessuno scontrino</span>}
                {(e.paid_by === me || isAdmin) && <button className="btn small danger" onClick={() => removeExpense(e)}>🗑️ Elimina spesa</button>}
              </footer>
            </article>
          ))}
          {!expenses.length && <p className="muted">Nessuna spesa registrata.</p>}
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

      {payShare && (
        <div className="modal-backdrop" onClick={() => setPayShare(null)}>
          <div className="modal pay-sheet" onClick={(ev) => ev.stopPropagation()}>
            <h2>💸 Come hai pagato?</h2>
            <p>La tua quota di <strong>{eur(payShare.share.amount)}</strong> a <strong>{nameOf(payShare.expense.paid_by)}</strong> per «{payShare.expense.description}».</p>
            <div className="pay-methods">
              {Object.entries(METHODS).map(([k, v]) => <button key={k} className="pay-method" onClick={() => payWith(k)}>{v}</button>)}
            </div>
            <button className="btn" style={{ width: "100%", marginTop: 10 }} onClick={() => setPayShare(null)}>Annulla</button>
          </div>
        </div>
      )}
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
          : <FilePicker onFiles={upload} multiple={false} disabled={Boolean(busy)} title="📋 Scontrino (facoltativo)" />}
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
