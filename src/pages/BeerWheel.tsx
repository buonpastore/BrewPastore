import { useEffect, useMemo, useRef, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { Link } from "react-router-dom";
import { loadRecipeColors, type Row } from "../lib";
import { useAuth } from "../auth";
import { CapDot, CapIcon, capInfo, useCapColors } from "../components/CapColor";
import { loadCellar, loadProduced } from "../cellar";

// colori delle fette: quelli del sito e delle etichette, usati tenui come nei chip dell'app
const SITE = ["var(--gold)", "var(--teal)", "var(--magenta)", "var(--violet)", "var(--hop)"];
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
  const [recipeColors, setRecipeColors] = useState<Record<string, string>>({});
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
  const resultRef = useRef<HTMLDivElement>(null);
  const [muted, setMutedRaw] = useState(() => { try { return localStorage.getItem(MUTE_KEY) === "1"; } catch { return false; } });
  const setMuted = (m: boolean) => { setMutedRaw(m); try { localStorage.setItem(MUTE_KEY, m ? "1" : "0"); } catch { /* niente */ } };

  useEffect(() => {
    loadRecipeColors().then(setRecipeColors);
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
  const accents = useMemo(() => beers.map((_, i) => {
    const k = Math.min(beers.length, SITE.length);
    let c = i % k;
    if (i === beers.length - 1 && i > 0 && c === 0) c = 1;   // l'ultima non uguale alla prima
    return SITE[c];
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
          const idx = Math.floor(deg / seg);
          if (last >= 0 && idx !== last) tick();
          last = idx;
        }
      }
      if (performance.now() < until) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
  };

  // spicchio della corona tra due raggi
  const band = (i: number, r0: number, r1: number) => {
    if (n === 1) return `M 0 ${-r1} A ${r1} ${r1} 0 1 1 -0.01 ${-r1} Z M 0 ${-r0} A ${r0} ${r0} 0 1 0 0.01 ${-r0} Z`;
    const a0 = (i * seg - 90) * Math.PI / 180, a1 = ((i + 1) * seg - 90) * Math.PI / 180, L = seg > 180 ? 1 : 0;
    const p = (r: number, a: number) => `${(r * Math.cos(a)).toFixed(2)} ${(r * Math.sin(a)).toFixed(2)}`;
    return `M ${p(r1, a0)} A ${r1} ${r1} 0 ${L} 1 ${p(r1, a1)} L ${p(r0, a1)} A ${r0} ${r0} 0 ${L} 0 ${p(r0, a0)} Z`;
  };
  // colore della birra = lo stesso della sua ricetta in Produzione
  const colorOf = (b: Row, i: number) => recipeColors[b.recipe_id] ?? accents[i];

  // fascetta colorata sul bordo di ogni fetta
  const arc = (i: number) => {
    const a0 = (i * seg - 90) * Math.PI / 180, a1 = ((i + 1) * seg - 90) * Math.PI / 180, r = 96.5;
    return `M ${r * Math.cos(a0)} ${r * Math.sin(a0)} A ${r} ${r} 0 ${seg > 180 ? 1 : 0} 1 ${r * Math.cos(a1)} ${r * Math.sin(a1)}`;
  };

  // nome su una o due righe, per stare nello spicchio
  const splitName = (name: string) => {
    const t = name.length > 26 ? name.slice(0, 25) + "…" : name;
    if (t.length <= 11 || !t.includes(" ")) return [t];
    const words = t.split(" ");
    let best = [t], score = 1e9;
    for (let k = 1; k < words.length; k++) {
      const l1 = words.slice(0, k).join(" "), l2 = words.slice(k).join(" ");
      const sc = Math.max(l1.length, l2.length);
      if (sc < score) { score = sc; best = [l1, l2]; }
    }
    return best;
  };

  const spin = () => {
    if (!n || spinning) return;
    const pick = Math.floor(Math.random() * n);
    const jitter = (Math.random() - 0.5) * seg * 0.6;
    const base = Math.ceil((angle + 360 * 5) / 360) * 360;
    setWinner(null); setSpinning(true);
    if (!muted) audio();   // sblocca l'audio col tocco (iPhone)
    setAngle(base + pick * seg + seg / 2 + jitter);
    follow(performance.now() + SPIN_MS);
    timer.current = window.setTimeout(() => {
      setSpinning(false); setWinner(beers[pick]);
      // porta in vista il risultato sotto la bottiglia
      window.setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 120);
      if (!muted) ding();
      try { navigator.vibrate?.([60, 40, 120]); } catch { /* niente */ }
    }, SPIN_MS + 100);
  };

  if (all == null) return <p>Caricamento…</p>;
  return (
    <div>
      <div className="wheel-title"><h1>Gira la bottiglia</h1>
        <button className="icon-btn" title={muted ? "Suono spento" : "Suono acceso"} aria-label={muted ? "Accendi il suono" : "Spegni il suono"} onClick={() => setMuted(!muted)}>{muted ? <VolumeX size={20} /> : <Volume2 size={20} />}</button>
      </div>
      {!all.length ? <p className="note">Non c'è ancora nessuna birra imbottigliata da mettere intorno alla bottiglia.</p> : (
        <div className="wheel-wrap">
          <div className="bottle-stage">
            <svg className="bottle-ring" viewBox="-110 -110 220 220" role="img" aria-label="Birre intorno alla bottiglia">
              <circle r="104" className="ring-base" />
              {slices.map(({ b, i, mid }) => {
                const c = colorOf(b, i);
                const win = winner?.id === b.id;
                const a = (mid - 90) * Math.PI / 180;
                const R = n <= 2 ? 74 : 72;
                const lines = splitName(nameOf(b));
                // il nome deve stare dentro la banda colorata (raggio 90) e nello spicchio
                let fs = n <= 4 ? 9.5 : n <= 6 ? 8.5 : n <= 8 ? 7.6 : 6.8;
                const longest = Math.max(...lines.map((l) => l.length));
                const fits = (f: number) => {
                  const w = 0.56 * f * longest / 2, hh = lines.length * f * 1.1 / 2;
                  const cx = R * Math.cos(a), cy = R * Math.sin(a);
                  return [[-w, -hh], [w, -hh], [-w, hh], [w, hh]].every(([dx, dy]) => Math.hypot(cx + dx, cy + dy) <= 88);
                };
                while (fs > 5.5 && !fits(fs)) fs -= 0.3;
                const h = lines.length * fs * 1.1;
                return (
                  <g key={b.id} className={win ? "ring-win" : ""} style={{ color: c }}>
                    <path d={band(i, 92, 104)} style={{ fill: c }} className="ring-band" />
                    {n > 1 && <line x1={0} y1={-58} x2={0} y2={-104} transform={`rotate(${i * seg})`} className="ring-sep" />}
                    <g transform={`translate(${R * Math.cos(a)} ${R * Math.sin(a)})`}>
                      <text textAnchor="middle" fontSize={fs} className="ring-text" fill={win ? "var(--gold-2)" : "var(--text)"}>
                        {lines.map((l, k) => <tspan key={k} x="0" y={-h / 2 + fs * 0.85 + k * fs * 1.1}>{l}</tspan>)}
                      </text>
                    </g>
                  </g>
                );
              })}
              <circle r="58" className="ring-inner" />
            </svg>
            <button className="bottle-btn" onClick={spin} disabled={spinning || !n} aria-label="Gira la bottiglia">
              <svg ref={wheelRef} className="bottle" viewBox="-74 -74 148 148"
                style={{ transform: `rotate(${angle}deg)`, transition: spinning ? `transform ${SPIN_MS}ms cubic-bezier(.12,.72,.1,1)` : "none" }}>
                <defs>
                  <linearGradient id="glass" x1="0" x2="1" y1="0" y2="0">
                    <stop offset="0" stopColor="#3b1d06" />
                    <stop offset=".35" stopColor="#8a4a12" />
                    <stop offset=".55" stopColor="#a65d18" />
                    <stop offset="1" stopColor="#3b1d06" />
                  </linearGradient>
                </defs>
                {/* bottiglia col collo verso l'alto; il centro di rotazione è sul bollino */}
                <g transform="translate(0 -15)">
                <path className="bottle-glass" fill="url(#glass)" d="M -4.6 -47 L -4.6 -33 C -4.6 -26 -13.5 -22 -13.5 -12 L -13.5 37 C -13.5 41 -11 43.5 -7 43.5 L 7 43.5 C 11 43.5 13.5 41 13.5 37 L 13.5 -12 C 13.5 -22 4.6 -26 4.6 -33 L 4.6 -47 Z" />
                <rect className="bottle-lip" x="-5.8" y="-50.5" width="11.6" height="4" rx="1.6" />
                <path className="bottle-cap" d="M -6.4 -50.5 L -6.4 -54.6 L -5 -56 L -3.2 -54.8 L -1.6 -56 L 0 -54.8 L 1.6 -56 L 3.2 -54.8 L 5 -56 L 6.4 -54.6 L 6.4 -50.5 Z" />
                <path className="bottle-neck-label" d="M -5.2 -38 H 5.2 V -33.5 C 5.2 -32 3 -31 0 -31 C -3 -31 -5.2 -32 -5.2 -33.5 Z" />
                <path className="bottle-shine" d="M -8.5 -14 C -8.5 -18 -6 -21 -4 -23 M -9 -6 V 34" />
                </g>
                {/* il bollino «Gira» è l'etichetta della bottiglia e gira con lei */}
                <circle r="10.5" className="seal-ring" />
                <circle r="9" className="seal" />
                <text className="seal-text" textAnchor="middle" dominantBaseline="central" fontSize="5.2">{spinning ? "…" : "GIRA"}</text>
              </svg>
            </button>
          </div>
          <p className="muted small bottle-hint">{spinning ? "" : "Tocca la bottiglia per farla girare"}</p>
          <div ref={resultRef} className={"wheel-result" + (winner ? " show" : "")} aria-live="polite">
            {winner ? (
              <>
                <span className="muted small">Stasera si beve</span>
                <strong><CapDot color={winner.cap_color} size={22} /> {nameOf(winner)}</strong>
                {winner.recipes?.style && <span className="muted">{winner.recipes.style}</span>}
                <span className="wheel-links"><Link to={`/batch/${winner.id}`}>Apri il batch</Link><Link to="/degustazioni">Fai la degustazione</Link></span>
              </>
            ) : <span className="muted">{spinning ? "Gira, gira…" : n ? `${n} ${n === 1 ? "birra" : "birre"} in gioco` : "Scegli almeno una birra qui sotto"}</span>}
          </div>

          <div className="wheel-choose">
            <button className="wheel-choose-head" onClick={() => setChoosing(!choosing)}>
              <span>Birre in gioco <b>{n}/{all.length}</b></span><span className="muted small">{choosing ? "chiudi" : "cambia"}</span>
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
