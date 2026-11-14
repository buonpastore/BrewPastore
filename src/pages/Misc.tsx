import { LogIn, Minus, Plus } from "lucide-react";
import { loginAs } from "../impersonate";
import { Tabs } from "../components/Layout";
import { CapColorsSettings } from "../components/CapColor";
import { CapGallery, CapDot } from "../components/CapColor";
import { lastStep } from "../components/PreviousBatches";
import { getThemePref, setThemePref, sunTimes, type ThemePref } from "../theme";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { supabase, errMsg, configured, date, eur, sg, STATUS_LABELS, TABLE_LABELS, MASCOT_PATH, loadMascot, prepareMascot, FACE_IMG, type Row } from "../lib";
import { useAuth } from "../auth";
import { ChatPanel } from "../components/ChatPanel";
import { HistoryList } from "../components/HistoryList";
import { QuoteCard, useQuoteOfTheDay } from "../components/QuoteOfTheDay";
import { CHANGELOG, VERSION_LABEL, IS_BETA } from "../version";

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
        <h1 className="login-title">PASTORIZIA</h1>
        <div className="ribbon">birre da pascolo</div>
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
    // per ogni ricetta solo il batch più recente, con il suo stato attuale
    supabase.from("batches").select("*, recipes(name, archived)")
      .then(({ data }) => {
        const key = (b: Row) => String(b.brew_date ?? b.created_at ?? "") + String(b.created_at ?? "");
        const latest: Record<string, Row> = {};
        for (const b of data ?? []) {
          if (b.recipes?.archived) continue;
          const k = b.recipe_id ?? b.id;
          if (!latest[k] || key(b) > key(latest[k])) latest[k] = b;
        }
        // batch in corso: i terminati (finiti) non si mostrano
        setActive(Object.values(latest).filter((b) => b.status !== "finito").sort((a, b) => key(b).localeCompare(key(a))));
      });
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

      {myBalance != null && Math.abs(myBalance) > 0.005 ? (
        <div className="panel">
          {myBalance != null && Math.abs(myBalance) > 0.005 && (
            <p>💶 Spese condivise: {myBalance > 0 ? <>devi ricevere <strong>{eur(myBalance)}</strong></> : <>devi dare <strong>{eur(-myBalance)}</strong></>}. <Link to="/spese">Vai alle spese</Link></p>
          )}
        </div>
      ) : null}

      {recent.length > 0 && (
        <>
          <h2>Ultimi messaggi</h2>
          <div className="panel">
            {recent.map((m) => (
              <div key={m.id} className="small"><strong>{nameOf(m.user_id)}</strong>: {m.body.slice(0, 140)}</div>
            ))}
            <Link to="/chat" className="small">Apri la chat →</Link>
          </div>
        </>
      )}

      <h2>Batch in corso</h2>
      <div className="cards">
        {active.map((b) => {
          const ref = b.first_tasting_date ?? b.bottling_date ?? b.fermentation_start ?? b.brew_date;
          const d = days(ref);
          return (
            <Link key={b.id} to={`/batch/${b.id}`} className="card">
              <h3>{b.code} <CapDot color={b.cap_color} /></h3>
              <div className="muted">{b.recipes?.name}</div>
              <div><span className={"badge st-" + b.status}>{STATUS_LABELS[b.status]}</span> {d != null && <span className="muted small">{d === 0 ? "da oggi" : d === 1 ? "da 1 giorno" : `da ${d} giorni`}</span>}</div>
              <div className="stats"><span>OG {sg(b.original_gravity)}</span><span>FG {sg(b.final_gravity)}</span>{b.bottles_count && <span>{b.bottles_count} bott.</span>}</div>
              <div className="muted small">{lastStep(b).replace(/^./, (c) => c.toUpperCase())}</div>
            </Link>
          );
        })}
        {!active.length && <p className="muted">Nessun batch in corso. <Link to="/batch">Fai un nuovo batch</Link> e cotta!</p>}
      </div>

      <CapGallery />
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

function ThemePicker() {
  const [pref, setPref] = useState<ThemePref>(getThemePref());
  const { rise, set } = sunTimes();
  const hm = (d: Date) => d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
  const choose = (p: ThemePref) => { setPref(p); setThemePref(p); };
  const opts: [ThemePref, string, string][] = [["scuro", "🌙", "Scuro"], ["chiaro", "☀️", "Chiaro"], ["auto", "🌅", "Automatico"]];
  return (
    <div className="panel">
      <h2>Tema</h2>
      <div className="theme-opts">
        {opts.map(([k, ico, label]) => (
          <button key={k} className={"theme-opt" + (pref === k ? " on" : "")} onClick={() => choose(k)}>
            <span className="theme-ico">{ico}</span>{label}
          </button>
        ))}
      </div>
      <p className="muted small theme-note">
        {pref === "auto" ? `Chiaro di giorno, scuro dal tramonto: oggi chiaro dalle ${hm(rise)} alle ${hm(set)}.` : "La scelta vale per questo telefono o computer."}
      </p>
    </div>
  );
}

export function Settings() {
  const { isAdmin, profiles, profile } = useAuth();
  const [settingsTab, setSettingsTab] = useState(() => (/versioni|storico/.test(window.location.hash) ? "app" : "utente"));
  const [settings, setSettings] = useState<Row[]>([]);
  const [name, setName] = useState(profile?.display_name ?? "");
  // il profilo arriva dopo il primo disegno: riempio il nome appena è pronto
  useEffect(() => { if (profile?.display_name) setName((n) => n || profile.display_name); }, [profile?.display_name]);
  const [msg, setMsg] = useState("");

  useEffect(() => { supabase.from("settings").select("*").neq("key", "gas_price_m3").order("key").then(({ data }) => setSettings(data ?? [])); }, []);

  const saveSetting = async (s: Row, value: string) => {
    const { error } = await supabase.from("settings").update({ value: Number(value.replace(",", ".")) }).eq("key", s.key);
    setMsg(error ? errMsg(error) : "");
    if (!error) setSettings((all) => all.map((x) => (x.key === s.key ? { ...x, value: Number(value.replace(",", ".")) } : x)));
  };
  const saveName = async () => {
    const { error } = await supabase.from("profiles").update({ display_name: name }).eq("id", profile!.id);
    setMsg(error ? errMsg(error) : "Nome aggiornato ✓ (ricarica la pagina)");
  };

  const tab = settingsTab;
  return (
    <div>
      <div className="page-head">
        <h1>Impostazioni</h1>
      </div>
      <Tabs grid active={tab} onChange={(k) => setSettingsTab(k)} tabs={[
        ["utente", "Utente"], ["aspetto", "Aspetto"], ["costi", "Costi fissi"],
        ["tappi", "Tappi"], ["utenti", "Soci"], ["app", "App e storico"],
      ]} />
      {msg && <p className="ok">{msg}</p>}
      {tab === "utente" && (
        <div className="panel">
          <h2>Il mio profilo</h2>
          <div className="inline-form">
            <label><span>Nome visualizzato</span><input value={name} onChange={(e) => setName(e.target.value)} /></label>
            <button className="btn small" onClick={saveName}>Salva</button>
          </div>
          <SetPassword />
          <button className="btn danger" style={{ marginTop: 8 }} onClick={() => supabase.auth.signOut()}>Esci da Pastorizia</button>
        </div>
      )}
      {tab === "aspetto" && (
        <>
          <ThemePicker />
          {isAdmin && <MascotUpload />}
        </>
      )}
      {tab === "costi" && (() => {
        const get = (k: string) => settings.find((x) => x.key === k);
        const val = (k: string) => Number(get(k)?.value ?? 0);
        const field = (k: string, label: string, step: number, dec: number, unit: string) => {
          const st = get(k);
          return st ? <PriceField key={k} label={label} value={Number(st.value)} step={step} decimals={dec} unit={unit} disabled={!isAdmin} onSave={(v) => saveSetting(st, String(v))} /> : null;
        };
        const bottle = (f: "66" | "33") => {
          const price = val(`bottle_${f}_pack_price`), qty = val(`bottle_${f}_pack_qty`);
          return (
            <div className="cf-card" key={f}>
              <h3>Bottiglie da {f} cl</h3>
              {get(`bottle_${f}_pack_price`) ? (
                <>
                  <div className="cf-two">
                    {field(`bottle_${f}_pack_price`, "Prezzo del pacco", 0.5, 2, "€")}
                    {field(`bottle_${f}_pack_qty`, "Bottiglie nel pacco", 1, 0, "pz")}
                  </div>
                  <div className="cf-result">{price > 0 && qty > 0 ? <>= <strong>{eur(price / qty)}</strong> a bottiglia</> : <span className="muted">inserisci prezzo e numero di bottiglie</span>}</div>
                </>
              ) : <p className="muted small">Esegui su Supabase il file <code>0008_prezzo_bottiglie.sql</code> per poterle impostare (intanto uso 11 € per 24 bottiglie).</p>}
            </div>
          );
        };
        return (
          <>
            {bottle("66")}
            {bottle("33")}
            <div className="cf-card">
              <h3>Corrente e acqua</h3>
              <div className="cf-two">
                {field("energy_price_kwh", "Corrente", 0.01, 2, "€/kWh")}
                {field("water_price_l", "Acqua", 0.001, 3, "€/L")}
              </div>
            </div>
            <p className="muted small">Nei costi delle birre per ora si usa la bottiglia da 66 cl.</p>
          </>
        );
      })()}
      {tab === "tappi" && <CapColorsSettings canEdit={isAdmin} />}
      {tab === "utenti" && (
        <div className="panel">
          <h2>Soci</h2>
          <div className="soci">
            {profiles.map((p) => {
              const me = p.id === profile?.id;
              return (
                <div key={p.id} className={"socio" + (me ? " me" : "")}>
                  <span className="socio-av">{(p.display_name ?? "?").split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase()}</span>
                  <span className="socio-txt">
                    <strong>{p.display_name}{me && <span className="muted"> (tu)</span>}</strong>
                    <span className={"badge " + (p.role === "admin" ? "socio-admin" : "socio-view")}>{p.role === "admin" ? "Amministratore" : "Consultazione"}</span>
                  </span>
                  {isAdmin && !me && (
                    <button className="socio-go" title={`Entra nell'app come ${p.display_name}`} aria-label={`Entra come ${p.display_name}`} onClick={async () => {
                      if (!confirm(`Entrare nella app come ${p.display_name}? Vedrai e farai tutto come lui; per tornare tocca «Torna a ${profile?.display_name}» in alto.`)) return;
                      try { await loginAs(p.id, profile?.display_name ?? "amministratore"); } catch (e) { alert(errMsg(e)); }
                    }}><LogIn size={20} /></button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
      {tab === "app" && (
        <>
          <Releases />
          <HistoryPage embedded />
          <p className="muted small version">Pastorizia {VERSION_LABEL} · pubblicata il {__BUILD_TIME__}</p>
        </>
      )}
    </div>
  );
}

/** Casella grande con − e +, come nei dati del batch: salva da sola. */
function PriceField({ label, value, step, decimals, unit, disabled, onSave }: { label: string; value: number; step: number; decimals: number; unit: string; disabled?: boolean; onSave: (v: number) => void }) {
  const fmt = (n: number) => n.toFixed(decimals).replace(".", ",");
  const [text, setText] = useState(fmt(value));
  const t = useRef<number>();
  useEffect(() => setText(fmt(value)), [value]); // eslint-disable-line react-hooks/exhaustive-deps
  const commit = (v: number) => { window.clearTimeout(t.current); t.current = window.setTimeout(() => onSave(v), 600); };
  const bump = (d: 1 | -1) => { const cur = Number(text.replace(",", ".")) || 0; const v = Math.max(0, Math.round((cur + d * step) * 1000) / 1000); setText(fmt(v)); commit(v); };
  return (
    <div className="big-field">
      <div className="bf-head"><span>{label}</span></div>
      <div className="bf-row">
        <button type="button" className="bf-btn" disabled={disabled} onClick={() => bump(-1)}><Minus size={22} /></button>
        <div className="bf-input">
          <input inputMode="decimal" value={text} disabled={disabled} onChange={(e) => { setText(e.target.value); const v = Number(e.target.value.replace(",", ".")); if (!isNaN(v)) commit(v); }} />
          <span className="bf-unit">{unit}</span>
        </div>
        <button type="button" className="bf-btn" disabled={disabled} onClick={() => bump(1)}><Plus size={22} /></button>
      </div>
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

/** Registro delle versioni dell'app (beta: +0,001 a ogni modifica, fino alla 1.0). */
function Releases() {
  const [all, setAll] = useState(false);
  const list = all ? CHANGELOG : CHANGELOG.slice(0, 8);
  const progress = Math.min(100, Number(CHANGELOG[0].version) * 100);
  return (
    <div className="panel" id="versioni">
      <h2>📦 Versioni dell'app</h2>
      <div className="rel-head">
        <div>
          <div className="rel-ver">{VERSION_LABEL}</div>
          <div className="muted small">{IS_BETA ? "Siamo in beta: ogni modifica aggiunge 0,001. Alla 1.0 si esce dalla beta." : "Versione stabile"}</div>
        </div>
        {IS_BETA && (
          <div className="rel-progress" title={`${progress.toFixed(1)}% verso la 1.0`}>
            <div className="rel-bar"><span style={{ width: `${Math.max(2, progress)}%` }} /></div>
            <span className="muted small">verso la 1.0</span>
          </div>
        )}
      </div>
      <ol className="rel-list">
        {list.map((r, i) => (
          <li key={r.version} className={i === 0 ? "latest" : ""}>
            <span className="rel-num">{r.version.replace(".", ",")}</span>
            <span className="rel-text">{r.text}</span>
            <span className="rel-date muted small">{r.date}</span>
          </li>
        ))}
      </ol>
      {CHANGELOG.length > 8 && (
        <button className="btn small" onClick={() => setAll(!all)}>{all ? "Mostra solo le ultime" : `Mostra tutte le ${CHANGELOG.length} versioni`}</button>
      )}
    </div>
  );
}
