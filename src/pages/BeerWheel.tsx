import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { supabase, type Row } from "../lib";
import { isBottled } from "../costs";
import { CapDot, capInfo, useCapColors } from "../components/CapColor";

const FALLBACK = ["#eda512", "#14b8b0", "#d63384", "#c98a0c", "#0f8f89", "#a8286a"];
const SPIN_MS = 5200;

/** Ruota della birra: tra le birre imbottigliate (non finite) sceglie lei cosa bere stasera. */
export function BeerWheel() {
  useCapColors();
  const [beers, setBeers] = useState<Row[] | null>(null);
  const [angle, setAngle] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [winner, setWinner] = useState<Row | null>(null);
  const timer = useRef<number>();

  useEffect(() => {
    supabase.from("batches").select("id, code, status, bottling_date, bottles_count, volume_bottled_l, first_tasting_date, cap_color, brew_date, recipe_id, recipes(name, style)")
      .order("brew_date", { ascending: false, nullsFirst: false })
      .then(({ data }) => {
        // una fetta per birra (ricetta), col batch imbottigliato più recente; le finite no
        const seen = new Set<string>();
        const out: Row[] = [];
        for (const b of data ?? []) {
          if (!isBottled(b) || b.status === "finito") continue;
          const k = b.recipe_id ?? b.id;
          if (seen.has(k)) continue;
          seen.add(k); out.push(b);
        }
        setBeers(out);
      });
    return () => window.clearTimeout(timer.current);
  }, []);

  const n = beers?.length ?? 0;
  const seg = n ? 360 / n : 360;
  const baseColor = (b: Row, i: number) => capInfo(b.cap_color)?.hex ?? FALLBACK[i % FALLBACK.length];
  // due fette vicine dello stesso colore: la seconda un po' più scura, per distinguerle
  const colors = useMemo(() => {
    const out: string[] = [];
    (beers ?? []).forEach((b, i) => {
      const c = baseColor(b, i);
      const prev = out[i - 1], first = out[0];
      const clash = (prev && baseColor(beers![i - 1], i - 1) === c) || (i === (beers!.length - 1) && i > 0 && baseColor(beers![0], 0) === c && first === c);
      out.push(clash ? `color-mix(in srgb, ${c} 72%, #000)` : c);
    });
    return out;
  }, [beers]);
  const colorOf = (_b: Row, i: number) => colors[i];
  const nameOf = (b: Row) => b.recipes?.name ?? b.code ?? "Birra";

  const slices = useMemo(() => (beers ?? []).map((b, i) => {
    const a0 = (i * seg - 90) * Math.PI / 180, a1 = ((i + 1) * seg - 90) * Math.PI / 180;
    const r = 100;
    const large = seg > 180 ? 1 : 0;
    const d = n === 1 ? "M 0 -100 A 100 100 0 1 1 -0.01 -100 Z"
      : `M 0 0 L ${r * Math.cos(a0)} ${r * Math.sin(a0)} A ${r} ${r} 0 ${large} 1 ${r * Math.cos(a1)} ${r * Math.sin(a1)} Z`;
    return { b, i, d, mid: i * seg + seg / 2 };
  }), [beers, seg, n]);

  const spin = () => {
    if (!n || spinning) return;
    const pick = Math.floor(Math.random() * n);
    const center = pick * seg + seg / 2;
    const jitter = (Math.random() - 0.5) * seg * 0.6;            // non sempre al centro della fetta
    const base = Math.ceil((angle + 360 * 5) / 360) * 360;          // almeno 5 giri
    setWinner(null); setSpinning(true);
    setAngle(base + (360 - center) + jitter);
    timer.current = window.setTimeout(() => {
      setSpinning(false); setWinner(beers![pick]);
      try { navigator.vibrate?.([60, 40, 120]); } catch { /* niente */ }
    }, SPIN_MS + 100);
  };

  const light = (hex: string) => { const h = hex.replace("#", ""); const v = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16); return ((v >> 16) * 299 + ((v >> 8) & 255) * 587 + (v & 255) * 114) / 1000 > 150; };

  return (
    <div>
      <h1>Ruota della birra</h1>
      <p className="muted">Non sai cosa bere stasera? Gira la ruota e decide lei, tra le birre imbottigliate.</p>
      {beers == null ? <p>Caricamento…</p> : !n ? (
        <p className="note">Non ci sono ancora birre imbottigliate da far girare sulla ruota.</p>
      ) : (
        <div className="wheel-wrap">
          <div className="wheel-stage">
            <svg className="wheel-pointer" viewBox="0 0 40 46" aria-hidden><path d="M20 44 L4 8 Q20 -4 36 8 Z" /></svg>
            <div className="wheel-disc">
            <svg className="wheel" viewBox="-104 -104 208 208" role="img" aria-label="Ruota delle birre"
              style={{ transform: `rotate(${angle}deg)`, transition: spinning ? `transform ${SPIN_MS}ms cubic-bezier(.12,.72,.1,1)` : "none" }}>
              <circle r="103" className="wheel-rim" />
              {slices.map(({ b, i, d, mid }) => {
                const c = colorOf(b, i);
                const name = nameOf(b);
                const label = name.length > 22 ? name.slice(0, 21) + "…" : name;
                // il nome sta fra il bordo e il pulsante centrale, e dentro la fetta
                const fs = Math.max(5.5, Math.min(13, 72 / (0.6 * Math.max(label.length, 4)), (2 * Math.PI * 62 * seg / 360) * 0.55));
                return (
                  <g key={b.id}>
                    <path d={d} fill={c} className="wheel-slice" />
                    <g transform={`rotate(${mid - 90})`}>
                      <text x="95" y="0.5" textAnchor="end" dominantBaseline="middle" fontSize={fs}
                        fill={light(baseColor(b, i)) && !c.startsWith("color-mix") ? "#1f1500" : "#fff"} className="wheel-text">{label}</text>
                    </g>
                  </g>
                );
              })}
              <circle r="20" className="wheel-hub" />
            </svg>
            </div>
            <button className="wheel-spin" onClick={spin} disabled={spinning}>{spinning ? "…" : "GIRA"}</button>
          </div>
          <div className={"wheel-result" + (winner ? " show" : "")} aria-live="polite">
            {winner ? (
              <>
                <span className="muted small">Stasera si beve</span>
                <strong><CapDot color={winner.cap_color} size={22} /> {nameOf(winner)}</strong>
                {winner.recipes?.style && <span className="muted">{winner.recipes.style}</span>}
                <span className="wheel-links">
                  <Link to={`/batch/${winner.id}`}>Apri il batch</Link>
                  <Link to="/degustazioni">Fai la degustazione</Link>
                </span>
              </>
            ) : <span className="muted">{spinning ? "Gira, gira…" : `${n} ${n === 1 ? "birra" : "birre"} sulla ruota`}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
