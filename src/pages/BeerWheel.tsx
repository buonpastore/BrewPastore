import { useEffect, useMemo, useRef, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { Link } from "react-router-dom";
import { type Row } from "../lib";
import { useAuth } from "../auth";
import { CapDot, CapIcon, capInfo, useCapColors } from "../components/CapColor";
import { loadCellar, loadProduced } from "../cellar";

// fette coi colori del sito, ammorbiditi
const SITE = ["var(--gold)", "var(--teal)", "var(--magenta)"];
const soft = (c: string) => `color-mix(in srgb, ${c} 42%, #1d1712)`;
const MUTE_KEY = "pastorizia-ruota-muta";

/** Suoni della ruota (Web Audio, niente file): tic a ogni fetta e un «ding» alla fine. */
let actx: AudioContext | null = null;
function audio() {
  try {
    const A = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    actx ??= new A();
    if (actx.state === "suspended") actx.resume();
    return actx;
  } catch { return null; }
}
function tick(vol = 0.18) {
  const a = audio(); if (!a) return;
  const o = a.createOscillator(), g = a.createGain();
  o.type = "triangle"; o.frequency.setValueAtTime(1100, a.currentTime); o.frequency.exponentialRampToValueAtTime(500, a.currentTime + 0.04);
  g.gain.setValueAtTime(vol, a.currentTime); g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + 0.05);
  o.connect(g).connect(a.destination); o.start(); o.stop(a.currentTime + 0.06);
}
function ding() {
  const a = audio(); if (!a) return;
  [[784, 0], [1175, 0.12], [1568, 0.24]].forEach(([f, t]) => {
    const o = a.createOscillator(), g = a.createGain();
    o.type = "sine"; o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, a.currentTime + t); g.gain.exponentialRampToValueAtTime(0.22, a.currentTime + t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + t + 0.6);
    o.connect(g).connect(a.destination); o.start(a.currentTime + t); o.stop(a.currentTime + t + 0.65);
  });
}
const SPIN_MS = 5200;
const KEY = "pastorizia-ruota-escluse";

/** Ruota della birra: tra le birre prodotte che avete, sceglie lei cosa bere stasera. */
export function BeerWheel() {
  useCapColors();
  const { session } = useAuth();
  const [all, setAll] = useState<Row[] | null>(null);
  const [mineIds, setMineIds] = useState<Set<string> | null>(null);
  const [excluded, setExcludedRaw] = useState<Set<string>>(() => { try { return new Set(JSON.parse(localStorage.getItem(KEY) ?? "[]")); } catch { return new Set(); } });
  const setExcluded = (s: Set<string>) => { setExcludedRaw(s); try { localStorage.setItem(KEY, JSON.stringify([...s])); } catch { /* niente */ } };
  const [angle, setAngle] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [winner, setWinner] = useState<Row | null>(null);
  const [choosing, setChoosing] = useState(false);
  const timer = useRef<number>();
  const raf = useRef<number>();
  const wheelRef = useRef<SVGSVGElement>(null);
  const [muted, setMutedRaw] = useState(() => { try { return localStorage.getItem(MUTE_KEY) === "1"; } catch { return false; } });
  const setMuted = (m: boolean) => { setMutedRaw(m); try { localStorage.setItem(MUTE_KEY, m ? "1" : "0"); } catch { /* niente */ } };

  useEffect(() => {
    Promise.all([loadProduced(), loadCellar()]).then(([bs, cellar]) => {
      // una sola voce per ricetta (il batch imbottigliato più recente)
      const seen = new Set<string>(); const out: Row[] = [];
      for (const b of bs) { const k = b.recipe_id ?? b.id; if (!seen.has(k)) { seen.add(k); out.push(b); } }
      setAll(out);
      // se hai segnato la tua cantina, di partenza sulla ruota ci sono le birre che hai
      const mine = (cellar ?? []).filter((c) => c.user_id === session?.user.id && c.bottles > 0);
      if (mine.length) {
        const recipesMine = new Set(mine.map((c) => bs.find((b) => b.id === c.batch_id)?.recipe_id).filter(Boolean));
        setMineIds(new Set(out.filter((b) => recipesMine.has(b.recipe_id)).map((b) => b.id)));
      } else setMineIds(null);
    });
    return () => { window.clearTimeout(timer.current); if (raf.current) cancelAnimationFrame(raf.current); };
  }, [session?.user.id]);

  const beers = useMemo(() => (all ?? []).filter((b) => !excluded.has(b.id) && (mineIds == null || mineIds.has(b.id) || excluded.has("+" + b.id))), [all, excluded, mineIds]);
  const onWheel = (b: Row) => beers.some((x) => x.id === b.id);
  const toggle = (b: Row) => {
    const s = new Set(excluded);
    if (onWheel(b)) { s.delete("+" + b.id); s.add(b.id); }
    else { s.delete(b.id); if (mineIds && !mineIds.has(b.id)) s.add("+" + b.id); }
    setExcluded(s); setWinner(null);
  };

  const n = beers.length;
  const seg = n ? 360 / n : 360;
  const nameOf = (b: Row) => b.recipes?.name ?? b.code ?? "Birra";
  const fills = useMemo(() => beers.map((_, i) => {
    let c = i % 3;
    if (i === beers.length - 1 && i > 0 && c === 0) c = 1;   // l'ultima non uguale alla prima
    return soft(SITE[c]);
  }), [beers]);

  const slices = useMemo(() => beers.map((b, i) => {
    const a0 = (i * seg - 90) * Math.PI / 180, a1 = ((i + 1) * seg - 90) * Math.PI / 180, r = 100;
    const d = n === 1 ? "M 0 -100 A 100 100 0 1 1 -0.01 -100 Z"
      : `M 0 0 L ${r * Math.cos(a0)} ${r * Math.sin(a0)} A ${r} ${r} 0 ${seg > 180 ? 1 : 0} 1 ${r * Math.cos(a1)} ${r * Math.sin(a1)} Z`;
    return { b, i, d, mid: i * seg + seg / 2 };
  }), [beers, seg, n]);


  // tic a ogni fetta che passa sotto la freccia
  const follow = (until: number) => {
    let last = -1;
    const step = () => {
      const el = wheelRef.current;
      if (el && !muted) {
        const m = getComputedStyle(el).transform;
        const v = m && m !== "none" ? m.match(/matrix\(([^)]+)\)/)?.[1].split(",").map(Number) : null;
        if (v) {
          const deg = (Math.atan2(v[1], v[0]) * 180 / Math.PI + 360) % 360;
          const idx = Math.floor(((360 - deg) % 360) / seg);
          if (last >= 0 && idx !== last) tick();
          last = idx;
        }
      }
      if (performance.now() < until) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
  };

  const spin = () => {
    if (!n || spinning) return;
    const pick = Math.floor(Math.random() * n);
    const jitter = (Math.random() - 0.5) * seg * 0.6;
    const base = Math.ceil((angle + 360 * 5) / 360) * 360;
    setWinner(null); setSpinning(true);
    if (!muted) audio();   // sblocca l'audio col tocco (iPhone)
    setAngle(base + (360 - (pick * seg + seg / 2)) + jitter);
    follow(performance.now() + SPIN_MS);
    timer.current = window.setTimeout(() => {
      setSpinning(false); setWinner(beers[pick]);
      if (!muted) ding();
      try { navigator.vibrate?.([60, 40, 120]); } catch { /* niente */ }
    }, SPIN_MS + 100);
  };

  if (all == null) return <p>Caricamento…</p>;
  return (
    <div>
      <div className="wheel-title"><h1>Ruota della birra</h1>
        <button className="icon-btn" title={muted ? "Suono spento" : "Suono acceso"} aria-label={muted ? "Accendi il suono" : "Spegni il suono"} onClick={() => setMuted(!muted)}>{muted ? <VolumeX size={20} /> : <Volume2 size={20} />}</button>
      </div>
      {!all.length ? <p className="note">Non c'è ancora nessuna birra imbottigliata da mettere sulla ruota.</p> : (
        <div className="wheel-wrap">
          <div className="wheel-stage">
            <svg className="wheel-pointer" viewBox="0 0 24 20" aria-hidden><path d="M12 19 L2 2 H22 Z" /></svg>
            <div className="wheel-disc">
              <svg ref={wheelRef} className="wheel" viewBox="-102 -102 204 204" role="img" aria-label="Ruota delle birre"
                style={{ transform: `rotate(${angle}deg)`, transition: spinning ? `transform ${SPIN_MS}ms cubic-bezier(.12,.72,.1,1)` : "none" }}>
                <circle r="100" className="wheel-base" />
                {slices.map(({ b, i, d, mid }) => {
                  const name = nameOf(b);
                  const label = name.length > 22 ? name.slice(0, 21) + "…" : name;
                  const fs = Math.max(5.5, Math.min(10.5, 50 / (0.58 * Math.max(label.length, 4)), (2 * Math.PI * 55 * seg / 360) * 0.5));
                  const cap = capInfo(b.cap_color)?.hex;
                  return (
                    <g key={b.id}>
                      <path d={d} className={"wheel-slice" + (i % 2 ? " alt" : "")} />
                      <g transform={`rotate(${mid - 90})`}>
                        {cap && <g transform="translate(77 -8) rotate(90 8 8)"><CapIcon hex={cap} size={16} /></g>}
                        <text x={cap ? 73 : 88} y="0.5" textAnchor="end" dominantBaseline="middle" fontSize={fs} className="wheel-text">{label}</text>
                      </g>
                    </g>
                  );
                })}
                <circle r="22" className="wheel-hub" />
              </svg>
            </div>
            <button className="wheel-spin" onClick={spin} disabled={spinning || !n}>{spinning ? "…" : "Gira"}</button>
          </div>

          <div className={"wheel-result" + (winner ? " show" : "")} aria-live="polite">
            {winner ? (
              <>
                <span className="muted small">Stasera si beve</span>
                <strong><CapDot color={winner.cap_color} size={22} /> {nameOf(winner)}</strong>
                {winner.recipes?.style && <span className="muted">{winner.recipes.style}</span>}
                <span className="wheel-links"><Link to={`/batch/${winner.id}`}>Apri il batch</Link><Link to="/degustazioni">Fai la degustazione</Link></span>
              </>
            ) : <span className="muted">{spinning ? "Gira, gira…" : n ? `${n} ${n === 1 ? "birra" : "birre"} sulla ruota` : "Scegli almeno una birra qui sotto"}</span>}
          </div>

          <div className="wheel-choose">
            <button className="wheel-choose-head" onClick={() => setChoosing(!choosing)}>
              <span>Birre sulla ruota <b>{n}/{all.length}</b></span><span className="muted small">{choosing ? "chiudi" : "cambia"}</span>
            </button>
            {choosing && (
              <>
                {mineIds && <p className="muted small">Di partenza ci sono le birre che hai nella tua cantina.</p>}
                <div className="wheel-chips">
                  {all.map((b) => (
                    <button key={b.id} className={"wheel-chip" + (onWheel(b) ? " on" : "")} onClick={() => toggle(b)} disabled={spinning}>
                      <CapDot color={b.cap_color} size={18} /> {nameOf(b)}
                    </button>
                  ))}
                </div>
                <div className="wheel-quick">
                  <button className="btn small" onClick={() => { setExcluded(new Set(all.filter((b) => mineIds && !mineIds.has(b.id)).map((b) => "+" + b.id))); }}>Tutte</button>
                  {mineIds && <button className="btn small" onClick={() => setExcluded(new Set())}>Solo quelle in cantina</button>}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
