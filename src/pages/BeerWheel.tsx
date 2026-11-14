import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { type Row } from "../lib";
import { useAuth } from "../auth";
import { CapDot, capInfo, useCapColors } from "../components/CapColor";
import { loadCellar, loadProduced } from "../cellar";

const FALLBACK = ["#eda512", "#14b8b0", "#d63384", "#c98a0c", "#0f8f89", "#a8286a"];
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
    return () => window.clearTimeout(timer.current);
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
  const hexOf = (b: Row, i: number) => capInfo(b.cap_color)?.hex ?? FALLBACK[i % FALLBACK.length];
  const fills = useMemo(() => beers.map((b, i) => {
    const same = i > 0 && hexOf(beers[i - 1], i - 1) === hexOf(b, i);
    return `color-mix(in srgb, ${hexOf(b, i)} ${same ? 38 : 55}%, #140d07)`;   // colori del tappo, scuriti
  }), [beers]);

  const slices = useMemo(() => beers.map((b, i) => {
    const a0 = (i * seg - 90) * Math.PI / 180, a1 = ((i + 1) * seg - 90) * Math.PI / 180, r = 88;
    const d = n === 1 ? "M 0 -88 A 88 88 0 1 1 -0.01 -88 Z"
      : `M 0 0 L ${r * Math.cos(a0)} ${r * Math.sin(a0)} A ${r} ${r} 0 ${seg > 180 ? 1 : 0} 1 ${r * Math.cos(a1)} ${r * Math.sin(a1)} Z`;
    return { b, i, d, mid: i * seg + seg / 2 };
  }), [beers, seg, n]);

  // lucine sul bordo e dentelli del tappo al centro
  const bulbs = Array.from({ length: 24 }, (_, i) => { const a = (i * 15 - 90) * Math.PI / 180; return { x: 95 * Math.cos(a), y: 95 * Math.sin(a), on: i % 2 === 0 }; });
  const crown = Array.from({ length: 42 }, (_, i) => { const a = (i * (360 / 42) - 90) * Math.PI / 180, r = i % 2 ? 19 : 22.5; return `${r * Math.cos(a)},${r * Math.sin(a)}`; }).join(" ");

  const spin = () => {
    if (!n || spinning) return;
    const pick = Math.floor(Math.random() * n);
    const jitter = (Math.random() - 0.5) * seg * 0.6;
    const base = Math.ceil((angle + 360 * 5) / 360) * 360;
    setWinner(null); setSpinning(true);
    setAngle(base + (360 - (pick * seg + seg / 2)) + jitter);
    timer.current = window.setTimeout(() => {
      setSpinning(false); setWinner(beers[pick]);
      try { navigator.vibrate?.([60, 40, 120]); } catch { /* niente */ }
    }, SPIN_MS + 100);
  };

  if (all == null) return <p>Caricamento…</p>;
  return (
    <div>
      <h1>Ruota della birra</h1>
      {!all.length ? <p className="note">Non c'è ancora nessuna birra imbottigliata da mettere sulla ruota.</p> : (
        <div className="wheel-wrap">
          <div className="wheel-stage">
            <svg className="wheel-pointer" viewBox="0 0 40 46" aria-hidden><path d="M20 44 L4 8 Q20 -4 36 8 Z" /></svg>
            <div className="wheel-disc">
              <svg className="wheel" viewBox="-104 -104 208 208" role="img" aria-label="Ruota delle birre"
                style={{ transform: `rotate(${angle}deg)`, transition: spinning ? `transform ${SPIN_MS}ms cubic-bezier(.12,.72,.1,1)` : "none" }}>
                <defs>
                  <radialGradient id="wh-shade"><stop offset="55%" stopColor="#000" stopOpacity="0" /><stop offset="100%" stopColor="#000" stopOpacity=".45" /></radialGradient>
                </defs>
                <circle r="104" className="wheel-rim" />
                {bulbs.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r="2.3" className={"wheel-bulb" + (p.on ? " on" : "")} />)}
                {n === 0 && <circle r="88" className="wheel-empty" />}
                {slices.map(({ b, i, d, mid }) => {
                  const name = nameOf(b);
                  const label = name.length > 22 ? name.slice(0, 21) + "…" : name;
                  const fs = Math.max(5.5, Math.min(12, 58 / (0.6 * Math.max(label.length, 4)), (2 * Math.PI * 55 * seg / 360) * 0.55));
                  return (
                    <g key={b.id}>
                      <path d={d} fill={fills[i]} className="wheel-slice" />
                      <g transform={`rotate(${mid - 90})`}>
                        <text x="82" y="0.5" textAnchor="end" dominantBaseline="middle" fontSize={fs} className="wheel-text">{label}</text>
                      </g>
                    </g>
                  );
                })}
                <circle r="88" fill="url(#wh-shade)" pointerEvents="none" />
                <circle r="88" className="wheel-inner-ring" />
                <polygon points={crown} className="wheel-crown" />
              </svg>
            </div>
            <button className="wheel-spin" onClick={spin} disabled={spinning || !n}>{spinning ? "…" : "GIRA"}</button>
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
