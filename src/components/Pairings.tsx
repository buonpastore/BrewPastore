import { useEffect, useState } from "react";
import { BookOpen, Camera } from "lucide-react";
import { type Row } from "../lib";
import { loadProduced } from "../cellar";
import { CapDot, useCapColors } from "./CapColor";
import { COURSES, dishPhotoUrl, dishRecipeUrl, pairingFor } from "../pairings";

const COURSE_COLORS = ["var(--gold)", "var(--teal)", "var(--magenta)", "var(--violet)"];

/** Degustazioni → Abbinamenti: le birre disponibili (imbottigliate e non esaurite); scegliendone una
    si vedono sotto i piatti da abbinare, divisi per portata, con il perché e le foto. */
export function BeerPairings() {
  useCapColors();
  const [beers, setBeers] = useState<Row[] | null>(null);
  const [pick, setPick] = useState<string | null>(null);
  useEffect(() => { loadProduced().then((b) => { setBeers(b); if (b.length) setPick((x) => x ?? b[0].id); }); }, []);
  if (beers == null) return <p className="muted">Carico le birre…</p>;
  if (!beers.length) return <p className="muted">Nessuna birra disponibile: compaiono qui le birre imbottigliate e non ancora esaurite.</p>;
  const open = beers.find((b) => b.id === pick) ?? beers[0];
  const p = pairingFor(open.recipes?.style);
  return (
    <section className="pairings">
      <p className="muted small">Scegli una birra: sotto trovi i piatti da abbinare, divisi per portata.</p>
      <div className="pairing-beers">
        {beers.map((b) => {
          const fam = pairingFor(b.recipes?.style).family;
          return (
            <button key={b.id} type="button" className={"pairing-beer" + (b.id === open.id ? " on" : "")} onClick={() => setPick(b.id)}>
              <CapDot batchId={b.id} color={b.cap_color} size={34} />
              <strong>{b.recipes?.name ?? b.code}</strong>
              <span className="muted small">{b.recipes?.style ?? "stile non indicato"}</span>
              <span className="pb-fam">{fam}</span>
            </button>
          );
        })}
      </div>

      <div className="pairing-detail">
        <h2><CapDot batchId={open.id} color={open.cap_color} size={24} /> {open.recipes?.name ?? open.code}</h2>
        <p className="muted small">{p.styleName ? `${p.styleName} · ` : ""}{p.family}. {p.intro}</p>
        {COURSES.map((c, ci) => (
          <div key={c.key} className="pairing-course" style={{ ["--c" as string]: COURSE_COLORS[ci] }}>
            <h3>{c.emoji} {c.label}</h3>
            {p.dishes[c.key].map((d) => (
              <div key={d.name} className="pairing-dish">
                <span className="pd-photo">{d.emoji}</span>
                <span className="pd-txt">
                  <strong>{d.name}</strong><span>{d.why}</span>
                  <span className="pd-links">
                    <a href={dishPhotoUrl(d.name)} target="_blank" rel="noopener noreferrer"><Camera size={14} /> Foto</a>
                    <a href={dishRecipeUrl(d.name)} target="_blank" rel="noopener noreferrer"><BookOpen size={14} /> Ricetta</a>
                  </span>
                </span>
              </div>
            ))}
          </div>
        ))}
        <p className="muted small">Sotto ogni piatto: «Foto» per vederlo, «Ricetta» per sapere come si prepara. Gli abbinamenti seguono le regole classiche per lo stile della birra.</p>
      </div>
    </section>
  );
}
