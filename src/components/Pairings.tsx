import { useEffect, useState } from "react";
import { ExternalLink, UtensilsCrossed, X } from "lucide-react";
import { type Row } from "../lib";
import { loadProduced } from "../cellar";
import { CapDot, useCapColors } from "./CapColor";
import { COURSES, dishPhotoUrl, pairingFor } from "../pairings";

/** Degustazioni → le birre disponibili (imbottigliate e non esaurite): toccandone una si vedono i piatti da abbinare. */
export function BeerPairings() {
  useCapColors();
  const [beers, setBeers] = useState<Row[] | null>(null);
  const [open, setOpen] = useState<Row | null>(null);
  useEffect(() => { loadProduced().then(setBeers); }, []);
  if (!beers?.length) return null;
  const p = open ? pairingFor(open.recipes?.style) : null;
  return (
    <section className="pairings">
      <h2><UtensilsCrossed size={18} /> Cosa ci mangio?</h2>
      <p className="muted small">Le birre disponibili: tocca una birra per vedere con quali piatti abbinarla.</p>
      <div className="pairing-beers">
        {beers.map((b) => (
          <button key={b.id} type="button" className="pairing-beer" onClick={() => setOpen(b)}>
            <CapDot color={b.cap_color} size={22} />
            <span><strong>{b.recipes?.name ?? b.code}</strong><span className="muted small">{b.recipes?.style ?? "stile non indicato"}</span></span>
          </button>
        ))}
      </div>

      {open && p && (
        <div className="modal-backdrop" onClick={() => setOpen(null)}>
          <div className="modal pairing-modal" onClick={(e) => e.stopPropagation()}>
            <button className="icon-btn famous-x" aria-label="Chiudi" onClick={() => setOpen(null)}><X size={18} /></button>
            <h2><CapDot color={open.cap_color} size={22} /> {open.recipes?.name ?? open.code}</h2>
            <p className="muted small">{p.styleName ? `${p.styleName} · ` : ""}{p.family}. {p.intro}</p>
            {COURSES.map((c, ci) => (
              <div key={c.key} className="pairing-course" style={{ ["--c" as string]: ["var(--gold)", "var(--teal)", "var(--magenta)", "var(--violet)"][ci] }}>
                <h3>{c.emoji} {c.label}</h3>
                {p.dishes[c.key].map((d) => (
                  <a key={d.name} className="pairing-dish" href={dishPhotoUrl(d.name)} target="_blank" rel="noopener noreferrer" title="Vedi le foto del piatto">
                    <span className="pd-photo">{d.emoji}</span>
                    <span className="pd-txt"><strong>{d.name}</strong><span>{d.why}</span></span>
                    <ExternalLink size={15} className="pd-go" />
                  </a>
                ))}
              </div>
            ))}
            <p className="muted small">Tocca un piatto per vederne le foto. Gli abbinamenti seguono le regole classiche per lo stile della birra.</p>
          </div>
        </div>
      )}
    </section>
  );
}
