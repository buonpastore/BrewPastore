import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Play, Pause, RotateCcw, Bell, Minus, Plus } from "lucide-react";
import { supabase, errMsg, num, PRIMING_FACTORS, residualCo2, type Row } from "../lib";
import { useAuth } from "../auth";
import { STYLE_CO2, findStyle } from "../styleGuide";

/** Utilità: conta bottiglie, carbonazione, correzione del pH, timer dei luppoli. */
export function Utilities() {
  const { tool } = useParams();
  if (tool === "carbonazione") return <Carbonation />;
  if (tool === "ph") return <PhAdjust />;
  if (tool === "timer") return <HopTimer />;
  return <BottleCount />;
}

/** Ultimo batch in corso (per proporre litri, stile, ecc.). */
function useCurrentBatch() {
  const [b, setB] = useState<Row | null>(null);
  useEffect(() => {
    supabase.from("batches").select("*, recipes(*)").then(({ data }) => {
      const key = (x: Row) => String(x.brew_date ?? x.created_at ?? "");
      const list = (data ?? []).filter((x) => x.status !== "finito").sort((a, c) => key(c).localeCompare(key(a)));
      setB(list.find((x) => x.status === "cotta") ?? list[0] ?? null);
    });
  }, []);
  return b;
}

/* ------------------------------------------------------------------ */
/* Conta bottiglie                                                     */
/* ------------------------------------------------------------------ */
function BottleCount() {
  const { profiles, profile, isAdmin } = useAuth();
  const current = useCurrentBatch();
  const [rows, setRows] = useState<Record<string, { b33: number; b66: number }>>({});
  const [err, setErr] = useState("");
  const [target, setTarget] = useState<string>("");
  useEffect(() => {
    supabase.from("bottle_stock").select("*").then(({ data, error }) => {
      if (error) return setErr(/bottle_stock|relation|schema cache/i.test(error.message) ? "Manca un aggiornamento del database: esegui su Supabase il file 0012_conta_bottiglie.sql." : errMsg(error));
      setRows(Object.fromEntries((data ?? []).map((r) => [r.user_id, { b33: r.b33, b66: r.b66 }])));
    });
  }, []);
  const liters = Number(target.replace(",", ".")) || Number(current?.volume_fermenter_l ?? current?.recipes?.batch_size_l ?? 23);

  const save = async (uid: string, v: { b33: number; b66: number }) => {
    setRows((r) => ({ ...r, [uid]: v }));
    const { error } = await supabase.from("bottle_stock").upsert({ user_id: uid, ...v, updated_at: new Date().toISOString() });
    if (error) setErr(errMsg(error));
  };
  const tot33 = Object.values(rows).reduce((t, r) => t + r.b33, 0), tot66 = Object.values(rows).reduce((t, r) => t + r.b66, 0);
  const covered = tot33 * 0.33 + tot66 * 0.66;
  const missing = Math.max(0, liters - covered);

  return (
    <div>
      <h1>Conta bottiglie</h1>
      <p className="muted">Ognuno segna quante bottiglie vuote ha per la prossima cotta.</p>
      {err && <p className="error">{err}</p>}
      <div className="ut-people">
        {profiles.map((p) => {
          const v = rows[p.id] ?? { b33: 0, b66: 0 };
          const mine = p.id === profile?.id || isAdmin;
          return (
            <div key={p.id} className="ut-person">
              <strong>{p.display_name}{p.id === profile?.id ? " (tu)" : ""}</strong>
              <Counter label="da 33 cl" value={v.b33} disabled={!mine} onChange={(n) => save(p.id, { ...v, b33: n })} />
              <Counter label="da 66 cl" value={v.b66} disabled={!mine} onChange={(n) => save(p.id, { ...v, b66: n })} />
              <span className="muted small">{num(v.b33 * 0.33 + v.b66 * 0.66, 1)} L</span>
            </div>
          );
        })}
      </div>
      <div className="ut-result">
        <div><small>Bottiglie</small><strong>{tot33} × 33 cl · {tot66} × 66 cl</strong></div>
        <div><small>Litri coperti</small><strong>{num(covered, 1)} L</strong></div>
        <label className="ut-target"><small>Litri della prossima cotta</small>
          <input inputMode="decimal" value={target} placeholder={num(liters, 1)} onChange={(e) => setTarget(e.target.value)} /></label>
        <div className={missing > 0 ? "ut-miss" : "ut-ok"}>
          {missing > 0
            ? <>Mancano <strong>{num(missing, 1)} L</strong>: servono ancora <strong>{Math.ceil(missing / 0.66)}</strong> bottiglie da 66 cl oppure <strong>{Math.ceil(missing / 0.33)}</strong> da 33 cl.</>
            : <>✓ Bottiglie sufficienti, ne avanzano per {num(covered - liters, 1)} L.</>}
        </div>
      </div>
      <button className="btn btn-wide ut-reset" onClick={async () => {
        const who = isAdmin ? profiles.map((p) => p.id) : profile ? [profile.id] : [];
        if (!confirm(isAdmin ? "Azzerare i contatori delle bottiglie di tutti?" : "Azzerare i tuoi contatori delle bottiglie?")) return;
        for (const id of who) await save(id, { b33: 0, b66: 0 });
      }}><RotateCcw size={18} /> {isAdmin ? "Azzera tutti i contatori" : "Azzera i miei contatori"}</button>
    </div>
  );
}

function Counter({ label, value, onChange, disabled }: { label: string; value: number; onChange: (n: number) => void; disabled?: boolean }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const set = (n: number) => { const v = Math.max(0, Math.round(n)); setText(String(v)); onChange(v); };
  return (
    <div className="ut-counter">
      <small>{label}</small>
      <div className="bf-row">
        <button type="button" className="bf-btn" disabled={disabled} onClick={() => set(value - 1)}><Minus size={20} /></button>
        <div className="bf-input"><input inputMode="numeric" value={text} disabled={disabled} onChange={(e) => setText(e.target.value)} onBlur={() => set(Number(text) || 0)} /></div>
        <button type="button" className="bf-btn" disabled={disabled} onClick={() => set(value + 1)}><Plus size={20} /></button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Carbonazione                                                        */
/* ------------------------------------------------------------------ */
function Carbonation() {
  const current = useCurrentBatch();
  const styles = useMemo(() => Object.keys(STYLE_CO2).sort((a, b) => a.localeCompare(b, "it")), []);
  const [style, setStyle] = useState("");
  const [co2, setCo2] = useState<number | null>(null);
  const [temp, setTemp] = useState("20");
  const [sugar, setSugar] = useState("saccarosio");
  const [liters, setLiters] = useState("");
  useEffect(() => {
    if (style || !current) return;
    const st = findStyle(current.recipes?.style);
    if (st && STYLE_CO2[st.name]) setStyle(st.name);
  }, [current, style]);
  const range = STYLE_CO2[style] ?? [2.2, 2.8];
  const vol = co2 ?? Math.round(((range[0] + range[1]) / 2) * 10) / 10;
  const t = Number(temp.replace(",", ".")) || 20;
  const perL = Math.max(0, vol - residualCo2(t)) * (PRIMING_FACTORS[sugar] ?? PRIMING_FACTORS.saccarosio);
  const L = Number(liters.replace(",", ".")) || Number(current?.volume_bottled_l ?? current?.volume_fermenter_l ?? 0);

  return (
    <div>
      <h1>Carbonazione</h1>
      <div className="form-grid">
        <label><span>Stile</span>
          <select value={style} onChange={(e) => { setStyle(e.target.value); setCo2(null); }}>
            <option value="">— scegli lo stile —</option>
            {styles.map((s) => <option key={s} value={s}>{s} ({num(STYLE_CO2[s][0], 1)}–{num(STYLE_CO2[s][1], 1)} vol)</option>)}
          </select>
        </label>
        <label><span>Zucchero</span>
          <select value={sugar} onChange={(e) => setSugar(e.target.value)}>
            <option value="saccarosio">Zucchero bianco (saccarosio)</option>
            <option value="destrosio">Destrosio</option>
            <option value="miele">Miele</option>
            <option value="dme">Estratto di malto secco</option>
          </select>
        </label>
        <label><span>Temperatura massima della birra in fermentazione (°C)</span><input inputMode="decimal" value={temp} onChange={(e) => setTemp(e.target.value)} /></label>
        <label><span>Litri da imbottigliare (facoltativo)</span><input inputMode="decimal" value={liters} placeholder={L ? num(L, 1) : "es. 20"} onChange={(e) => setLiters(e.target.value)} /></label>
      </div>
      <div className="ut-co2">
        <div className="ut-co2-head"><span>Carbonazione voluta</span><strong>{num(vol, 1)} vol</strong></div>
        <input type="range" min={Math.max(1, range[0] - 0.4)} max={range[1] + 0.4} step={0.1} value={vol} onChange={(e) => setCo2(Number(e.target.value))} />
        <div className="ut-co2-range"><span>più piatta</span><span className="muted small">tipico dello stile {num(range[0], 1)}–{num(range[1], 1)}</span><span>più frizzante</span></div>
      </div>
      <div className="ut-result">
        <div><small>Bottiglia da 33 cl</small><strong>{num(perL * 0.33, 1)} g</strong></div>
        <div><small>Bottiglia da 66 cl</small><strong>{num(perL * 0.66, 1)} g</strong></div>
        <div><small>Per litro</small><strong>{num(perL, 1)} g/L</strong></div>
        {L > 0 && <div><small>Per {num(L, 1)} L (priming in tanica)</small><strong>{num(perL * L, 0)} g</strong></div>}
      </div>
      <p className="muted small">Stima: la CO₂ già presente dipende dalla temperatura più alta raggiunta a fine fermentazione. Valori indicativi.</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Correzione del pH del mash                                          */
/* ------------------------------------------------------------------ */
function PhAdjust() {
  const current = useCurrentBatch();
  const [liters, setLiters] = useState("");
  const [ph, setPh] = useState("");
  const [target, setTarget] = useState("5,4");
  const L = Number(liters.replace(",", ".")) || Number(current?.mash_water_l ?? current?.recipes?.mash_water_l ?? 0);
  const now = Number(ph.replace(",", ".")), want = Number(target.replace(",", "."));
  const diff = now && want ? now - want : 0;
  // regole pratiche (mash di malto chiaro): acido lattico 80% ≈ 1,1 ml ogni 19 L per abbassare di 0,1;
  // bicarbonato di sodio ≈ 1,5 g ogni 19 L per alzare di 0,1. Il potere tampone dei malti cambia molto: è una stima.
  const lactic = diff > 0 ? (diff / 0.1) * (L / 19) * 1.1 : 0;
  const bicarb = diff < 0 ? (-diff / 0.1) * (L / 19) * 1.5 : 0;
  return (
    <div>
      <h1>Correzione del pH</h1>
      <div className="form-grid">
        <label><span>Litri di acqua nel mash</span><input inputMode="decimal" value={liters} placeholder={L ? num(L, 1) : "es. 16"} onChange={(e) => setLiters(e.target.value)} /></label>
        <label><span>pH misurato adesso</span><input inputMode="decimal" value={ph} placeholder="es. 5,8" onChange={(e) => setPh(e.target.value)} /></label>
        <label><span>pH che vuoi</span><input inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} /></label>
      </div>
      <div className="row-actions">{["5,2", "5,3", "5,4", "5,5"].map((v) => <button key={v} className={"mini-btn" + (target === v ? " on" : "")} onClick={() => setTarget(v)}>{v}</button>)}</div>
      {!now || !L ? <p className="muted">Inserisci litri e pH misurato.</p> : Math.abs(diff) < 0.03 ? (
        <div className="ut-result"><div className="ut-ok">✓ Il pH va già bene.</div></div>
      ) : (
        <div className="ut-result">
          {diff > 0 ? (
            <>
              <div><small>Per abbassare di {num(diff, 2)}</small><strong>{num(lactic, 1)} ml di acido lattico 80%</strong></div>
              <div><small>in alternativa</small><strong>{num(lactic * 0.6, 1)} g di acido citrico</strong></div>
            </>
          ) : (
            <>
              <div><small>Per alzare di {num(-diff, 2)}</small><strong>{num(bicarb, 1)} g di bicarbonato di sodio</strong></div>
              <div><small>in alternativa</small><strong>{num(bicarb * 0.9, 1)} g di carbonato di calcio</strong></div>
            </>
          )}
          <div className="ut-miss">Metti <strong>metà</strong> della dose, mescola, aspetta 5 minuti e rimisura: poi aggiungi il resto se serve.</div>
        </div>
      )}
      <p className="muted small">Il bicarbonato <strong>alza</strong> il pH, l'acido lattico lo <strong>abbassa</strong>. Dosi indicative per mash di malti chiari: con malti scuri serve meno acido.</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Timer dei luppoli                                                   */
/* ------------------------------------------------------------------ */
interface TimerState { batchId: string; boil: number; start: number | null; pausedLeft: number | null }
const TKEY = "pastorizia-timer";

function HopTimer() {
  const current = useCurrentBatch();
  const [adds, setAdds] = useState<Row[]>([]);
  const [st, setSt] = useState<TimerState | null>(() => { try { return JSON.parse(localStorage.getItem(TKEY) ?? "null"); } catch { return null; } });
  const [, tick] = useState(0);
  const fired = useRef<Set<string>>(new Set());
  const audio = useRef<AudioContext | null>(null);
  const wake = useRef<{ release: () => Promise<void> } | null>(null);

  const boil = Number(current?.recipes?.boil_time_min ?? 60);
  useEffect(() => {
    if (!current) return;
    const load = async () => {
      const own = await supabase.from("batch_ingredients").select("*").eq("batch_id", current.id);
      let list = own.data ?? [];
      if (!list.length && current.recipe_id) list = (await supabase.from("recipe_ingredients").select("*").eq("recipe_id", current.recipe_id)).data ?? [];
      const min = (s: string | null) => { const m = String(s ?? "").match(/(\d{1,3})\s*(?:min|'|’)/i); return m && !/dry|whirl/i.test(s ?? "") ? Number(m[1]) : null; };
      setAdds(list.map((i) => ({ ...i, at: min(i.step) })).filter((i) => i.at != null && i.at <= Number(current.recipes?.boil_time_min ?? 60)).sort((a, b) => b.at - a.at));
    };
    load();
  }, [current]);
  useEffect(() => { try { localStorage.setItem(TKEY, JSON.stringify(st)); } catch { /* niente */ } }, [st]);
  useEffect(() => { const id = window.setInterval(() => tick((x) => x + 1), 500); return () => window.clearInterval(id); }, []);

  const total = (st?.boil ?? boil) * 60;
  const left = st ? (st.start != null ? Math.max(0, total - (Date.now() - st.start) / 1000) : st.pausedLeft ?? total) : total;
  const running = Boolean(st?.start != null && left > 0);

  // avvisi: quando il tempo rimasto arriva al minuto dell'aggiunta
  useEffect(() => {
    if (!running) return;
    for (const a of adds) {
      const k = `${a.id}`;
      if (!fired.current.has(k) && left <= a.at * 60 && left > a.at * 60 - 30) { fired.current.add(k); alarm(`${a.name} ${num(a.quantity, 1)} ${a.unit}`); }
    }
    if (left <= 0 && !fired.current.has("fine")) { fired.current.add("fine"); alarm("Fine bollitura!"); }
  });

  const beep = () => {
    const ctx = audio.current; if (!ctx) return;
    [0, 0.35, 0.7].forEach((d) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = 880; o.connect(g); g.connect(ctx.destination);
      g.gain.setValueAtTime(0.0001, ctx.currentTime + d); g.gain.exponentialRampToValueAtTime(0.4, ctx.currentTime + d + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + d + 0.3);
      o.start(ctx.currentTime + d); o.stop(ctx.currentTime + d + 0.32);
    });
  };
  const alarm = (msg: string) => {
    beep();
    navigator.vibrate?.([400, 200, 400, 200, 400]);
    try { if ("Notification" in window && Notification.permission === "granted") new Notification("🌿 Aggiungi ora", { body: msg }); } catch { /* niente */ }
  };
  const start = async () => {
    audio.current ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    await audio.current.resume();
    try { if ("Notification" in window && Notification.permission === "default") await Notification.requestPermission(); } catch { /* niente */ }
    try { wake.current = await (navigator as unknown as { wakeLock?: { request: (t: string) => Promise<{ release: () => Promise<void> }> } }).wakeLock?.request("screen") ?? null; } catch { /* niente */ }
    const b = st?.boil ?? boil;
    const resumeLeft = st?.pausedLeft ?? b * 60;
    setSt({ batchId: current?.id ?? "", boil: b, start: Date.now() - (b * 60 - resumeLeft) * 1000, pausedLeft: null });
  };
  const pause = () => { setSt((s) => (s ? { ...s, start: null, pausedLeft: left } : s)); wake.current?.release().catch(() => undefined); };
  const reset = () => { setSt(null); fired.current.clear(); wake.current?.release().catch(() => undefined); };

  const mm = Math.floor(left / 60), ss = Math.floor(left % 60);
  return (
    <div>
      <h1>Timer dei luppoli</h1>
      {current ? (
        <p className="muted">Bollitura di <Link to={`/batch/${current.id}`}>{current.code}</Link>: {st?.boil ?? boil} minuti.</p>
      ) : <p className="muted">Nessun batch in corso: il timer usa 60 minuti.</p>}
      <div className={"ut-timer" + (running ? " run" : "")}>
        <span className="ut-time">{String(mm).padStart(2, "0")}:{String(ss).padStart(2, "0")}</span>
        <span className="muted small">alla fine della bollitura</span>
      </div>
      <div className="ut-timer-btns">
        {running ? <button className="btn" onClick={pause}><Pause size={20} /> Pausa</button>
          : <button className="btn primary" onClick={start}><Play size={20} /> {st ? "Riprendi" : "Avvia bollitura"}</button>}
        <button className="btn" onClick={() => { if (confirm("Azzerare il timer?")) reset(); }}><RotateCcw size={20} /> Azzera</button>
        <button className="btn" onClick={() => { audio.current ??= new AudioContext(); audio.current.resume().then(beep); }}><Bell size={20} /> Prova suono</button>
      </div>
      <h3>Aggiunte</h3>
      {adds.length ? (
        <ul className="ut-adds">
          {adds.map((a) => {
            const done = st != null && left <= a.at * 60;
            const inMin = Math.ceil((left - a.at * 60) / 60);
            return (
              <li key={a.id} className={done ? "done" : ""}>
                <strong>{a.at}'</strong>
                <span>{a.name} · {num(a.quantity, 1)} {a.unit}</span>
                <span className="muted small">{done ? "✓ aggiunto" : st ? `tra ${inMin} min` : ""}</span>
              </li>
            );
          })}
        </ul>
      ) : <p className="muted small">Nessuna aggiunta in bollitura trovata negli ingredienti (servono i minuti nel «quando», es. «60 min»).</p>}
      <p className="muted small">Tieni la pagina aperta: il telefono suona e vibra a ogni aggiunta. Con lo schermo bloccato l'iPhone può non suonare.</p>
    </div>
  );
}
