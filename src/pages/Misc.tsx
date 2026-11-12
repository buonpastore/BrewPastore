import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase, errMsg, configured, date, eur, sg, STATUS_LABELS, TABLE_LABELS, MASCOT_PATH, loadMascot, prepareMascot, FACE_IMG, type Row } from "../lib";
import { useAuth } from "../auth";
import { ChatPanel } from "../components/ChatPanel";
import { HistoryList } from "../components/HistoryList";
import { QuoteCard, useQuoteOfTheDay } from "../components/QuoteOfTheDay";

export function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  const login = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setError("");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) setError(error.message === "Invalid login credentials" ? "Email o password errati" : error.message);
  };
  const reset = async () => {
    if (!email) return setError("Scrivi prima la tua email");
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + window.location.pathname });
    if (error) setError(error.message); else setResetSent(true);
  };

  return (
    <div className="login sunburst">
      <form className="modal login-card" onSubmit={login}>
        <img className="login-mascot" src={FACE_IMG} alt="La pecora del Buon Pastore" />
        <h1 className="login-title">BREW<br />PASTORE</h1>
        <div className="ribbon">birra da pascolo</div>
        {!configured && <p className="error">Configura VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY (vedi README).</p>}
        <label><span>Email</span><input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" /></label>
        <label><span>Password</span><input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" /></label>
        {error && <p className="error">{error}</p>}
        {resetSent && <p className="ok">Ti ho mandato un'email per reimpostare la password.</p>}
        <button className="btn primary" disabled={busy}>{busy ? "Entro…" : "Entra"}</button>
        <button type="button" className="link small" onClick={reset}>Password dimenticata?</button>
      </form>
    </div>
  );
}

export function SetPassword() {
  const [pw, setPw] = useState("");
  const [msg, setMsg] = useState("");
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await supabase.auth.updateUser({ password: pw });
    setMsg(error ? errMsg(error) : "Password aggiornata ✓");
  };
  return (
    <form onSubmit={save} className="inline-form">
      <label><span>Nuova password</span><input type="password" minLength={8} required value={pw} onChange={(e) => setPw(e.target.value)} /></label>
      <button className="btn small">Cambia password</button>
      {msg && <span className="small">{msg}</span>}
    </form>
  );
}

export function Dashboard() {
  const { profile } = useAuth();
  const quote = useQuoteOfTheDay();
  const [shown, setShown] = useState<Row | null>(null);
  const [active, setActive] = useState<Row[]>([]);
  const [recent, setRecent] = useState<Row[]>([]);
  const [myBalance, setMyBalance] = useState<number | null>(null);
  const [pending, setPending] = useState(0);

  useEffect(() => {
    supabase.from("batches").select("*, recipes(name)").not("status", "eq", "finito").order("brew_date", { ascending: false })
      .then(({ data }) => setActive(data ?? []));
    supabase.from("messages").select("*").order("created_at", { ascending: false }).limit(5).then(({ data }) => setRecent(data ?? []));
    if (profile) {
      supabase.from("member_balances").select("balance").eq("user_id", profile.id).single().then(({ data }) => setMyBalance(data?.balance ?? null));
      supabase.from("settlements").select("id", { count: "exact", head: true }).eq("to_user", profile.id).eq("confirmed", false)
        .then(({ count }) => setPending(count ?? 0));
    }
  }, [profile?.id]);

  const another = async () => {
    const { data } = await supabase.rpc("random_quote");
    setShown(Array.isArray(data) ? data[0] : data);
  };
  const { nameOf } = useAuth();
  const q = shown ?? quote;

  const days = (d: string | null) => (d ? Math.floor((Date.now() - new Date(d).getTime()) / 86400000) : null);

  return (
    <div>
      <div className="hero sunburst">
        <img className="hero-mascot" src={FACE_IMG} alt="" />
        <div>
          <h1>Ciao {profile?.display_name}!</h1>
          <div className="ribbon">bentornato al pascolo</div>
        </div>
      </div>
      {q && <div className="panel quote-panel"><QuoteCard quote={q} onAnother={another} /></div>}

      {(myBalance != null && Math.abs(myBalance) > 0.005) || pending > 0 ? (
        <div className="panel">
          {myBalance != null && Math.abs(myBalance) > 0.005 && (
            <p>💶 Spese condivise: {myBalance > 0 ? <>devi ricevere <strong>{eur(myBalance)}</strong></> : <>devi dare <strong>{eur(-myBalance)}</strong></>}. <Link to="/spese">Vai alle spese</Link></p>
          )}
          {pending > 0 && <p>📬 Hai {pending} rimborso/i da confermare. <Link to="/spese">Conferma</Link></p>}
        </div>
      ) : null}

      <h2>Batch in corso</h2>
      <div className="cards">
        {active.map((b) => {
          const ref = b.bottling_date ?? b.fermentation_start ?? b.brew_date;
          const d = days(ref);
          return (
            <Link key={b.id} to={`/batch/${b.id}`} className="card">
              <h3>{b.code}</h3>
              <div className="muted">{b.recipes?.name}</div>
              <div><span className={"badge st-" + b.status}>{STATUS_LABELS[b.status]}</span> {d != null && <span className="muted small">da {d} giorni</span>}</div>
              <div className="stats"><span>OG {sg(b.original_gravity)}</span><span>FG {sg(b.final_gravity)}</span>{b.bottles_count && <span>{b.bottles_count} bott.</span>}</div>
              <div className="muted small">Cotta {date(b.brew_date)}</div>
            </Link>
          );
        })}
        {!active.length && <p className="muted">Nessun batch in corso. <Link to="/ricette">Scegli una ricetta</Link> e cotta!</p>}
      </div>

      <h2>Ultimi messaggi</h2>
      <div className="panel">
        {recent.map((m) => (
          <div key={m.id} className="small"><strong>{nameOf(m.user_id)}</strong>: {m.body.slice(0, 140)}</div>
        ))}
        {!recent.length && <p className="muted">Nessun messaggio.</p>}
        <Link to="/chat" className="small">Apri la chat →</Link>
      </div>
    </div>
  );
}

export function ChatPage() {
  return (
    <div>
      <h1>Chat</h1>
      <p className="muted">Chat generale. Ogni ricetta e ogni batch hanno anche una chat dedicata nella loro scheda.</p>
      <div className="panel"><ChatPanel /></div>
    </div>
  );
}

/** Storico versioni: pagina intera (/storico) o sezione dentro Impostazioni. */
export function HistoryPage({ embedded = false }: { embedded?: boolean }) {
  const [table, setTable] = useState("");
  const [limit, setLimit] = useState(embedded ? 30 : 100);
  return (
    <div>
      {embedded ? (
        <h2 id="storico">🕓 Storico versioni</h2>
      ) : (
        <div className="page-head">
          <h1>Storico versioni</h1>
        </div>
      )}
      <p className="muted">Ogni modifica crea una nuova versione: tocca una riga per vedere cosa è cambiato{embedded ? "" : " e, se sei admin, ripristinare la versione precedente"}.</p>
      <div className="toolbar">
        <select value={table} onChange={(e) => setTable(e.target.value)}>
          <option value="">Tutte le modifiche</option>
          {Object.entries(TABLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>
      <div className="panel">
        <HistoryList tableFilter={table || undefined} limit={limit} />
        <button className="btn small" style={{ marginTop: 12 }} onClick={() => setLimit(limit + 50)}>Mostra altre</button>
      </div>
    </div>
  );
}

export function Settings() {
  const { isAdmin, profiles, profile } = useAuth();
  const [settings, setSettings] = useState<Row[]>([]);
  const [name, setName] = useState(profile?.display_name ?? "");
  const [msg, setMsg] = useState("");

  useEffect(() => { supabase.from("settings").select("*").neq("key", "gas_price_m3").order("key").then(({ data }) => setSettings(data ?? [])); }, []);

  const saveSetting = async (s: Row, value: string) => {
    const { error } = await supabase.from("settings").update({ value: Number(value.replace(",", ".")) }).eq("key", s.key);
    setMsg(error ? errMsg(error) : `${s.label} salvato ✓`);
  };
  const saveName = async () => {
    const { error } = await supabase.from("profiles").update({ display_name: name }).eq("id", profile!.id);
    setMsg(error ? errMsg(error) : "Nome aggiornato ✓ (ricarica la pagina)");
  };

  return (
    <div>
      <div className="page-head">
        <h1>Impostazioni</h1>
        <a className="btn small" href="#/impostazioni" onClick={(e) => { e.preventDefault(); document.getElementById("storico")?.scrollIntoView({ behavior: "smooth" }); }}>🕓 Vai allo storico versioni</a>
      </div>
      {msg && <p className="ok">{msg}</p>}
      <div className="panel">
        <h2>Il mio profilo</h2>
        <div className="inline-form">
          <label><span>Nome visualizzato</span><input value={name} onChange={(e) => setName(e.target.value)} /></label>
          <button className="btn small" onClick={saveName}>Salva</button>
        </div>
        <SetPassword />
        <button className="btn danger" style={{ marginTop: 8 }} onClick={() => supabase.auth.signOut()}>Esci da BrewPastore</button>
      </div>
      {isAdmin && <MascotUpload />}
      <div className="panel">
        <h2>Prezzi utenze (per il costo dei batch)</h2>
        <table>
          <tbody>
            {settings.map((s) => (
              <tr key={s.key}>
                <td>{s.label}</td>
                <td>{isAdmin
                  ? <input defaultValue={s.value} inputMode="decimal" style={{ width: 100 }} onBlur={(e) => e.target.value !== String(s.value) && saveSetting(s, e.target.value)} />
                  : s.value} {s.unit}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="panel">
        <h2>Utenti</h2>
        <table>
          <thead><tr><th>Nome</th><th>Ruolo</th></tr></thead>
          <tbody>{profiles.map((p) => <tr key={p.id}><td>{p.display_name}</td><td>{p.role === "admin" ? "Amministratore" : "Consultazione"}</td></tr>)}</tbody>
        </table>
        <p className="muted small">Gli utenti si aggiungono da Supabase → Authentication → Users. Il ruolo si cambia dalla tabella <code>profiles</code>.</p>
      </div>
      <HistoryPage embedded />
    </div>
  );
}

// posizione della pecora nell'etichetta "Buon Pastore" (frazioni di larghezza/altezza)
const LABEL_SHEEP_CROP: [number, number, number, number] = [0.33, 0.26, 0.37, 0.54];

function MascotUpload() {
  const [file, setFile] = useState<File | null>(null);
  const [cropLabel, setCropLabel] = useState(true);
  const [preview, setPreview] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!file) return;
    let url = "";
    prepareMascot(file, cropLabel ? LABEL_SHEEP_CROP : undefined).then((b) => { url = URL.createObjectURL(b); setPreview(url); });
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [file, cropLabel]);

  const save = async () => {
    if (!file) return;
    setBusy(true); setMsg("");
    try {
      const blob = await prepareMascot(file, cropLabel ? LABEL_SHEEP_CROP : undefined);
      const { error } = await supabase.storage.from("documents").upload(MASCOT_PATH, blob, { upsert: true, contentType: "image/png" });
      if (error) throw error;
      await loadMascot();
      setMsg("Immagine salvata ✓ La vedrete tutti in trasparenza sullo sfondo.");
      setFile(null); setPreview("");
    } catch (e) { setMsg(errMsg(e)); }
    setBusy(false);
  };

  return (
    <div className="panel">
      <h2>🐑 Immagine della pecora</h2>
      <p className="muted">Lo sfondo usa già la pecora dell'etichetta Buon Pastore. Se vuoi cambiarla carica un'altra immagine (es. l'etichetta di una nuova birra).</p>
      <label className="btn primary">
        Scegli immagine
        <input type="file" accept="image/*" hidden onChange={(e) => { setFile(e.target.files?.[0] ?? null); e.target.value = ""; }} />
      </label>
      {file && (
        <>
          <label className="check" style={{ margin: "14px 0" }}>
            <input type="checkbox" checked={cropLabel} onChange={(e) => setCropLabel(e.target.checked)} />
            È l'etichetta intera: ritaglia solo la pecora con il boccale
          </label>
          {preview && <div className="mascot-preview"><img src={preview} alt="Anteprima" /></div>}
          <div className="row-actions">
            <button className="btn primary" disabled={busy} onClick={save}>{busy ? "Salvo…" : "Usa questa immagine"}</button>
            <button className="btn" onClick={() => { setFile(null); setPreview(""); }}>Annulla</button>
          </div>
        </>
      )}
      {msg && <p className="ok">{msg}</p>}
    </div>
  );
}
