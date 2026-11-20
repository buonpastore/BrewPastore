import { useState } from "react";
import { Beer, ExternalLink, X } from "lucide-react";
import { findStyle } from "../styleGuide";
import { FAMOUS_BEERS } from "../famousBeers";
import { accentAt } from "../lib";

/** Ricerca per immagini della bottiglia (si apre nel browser). */
const imagesUrl = (name: string, brewery: string) =>
  `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(`${brewery} ${name} birra bottiglia`)}`;

/** Iconcina accanto allo stile: toccandola mostra le 3 birre più famose di quello stile. */
export function FamousBeers({ style }: { style: string | null | undefined }) {
  const [open, setOpen] = useState(false);
  const found = findStyle(style);
  const list = found ? FAMOUS_BEERS[found.name] : undefined;
  if (!found || !list?.length) return null;
  return (
    <>
      <button type="button" className="famous-btn" title="Le birre più famose di questo stile" aria-label="Le birre più famose di questo stile"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(true); }}>
        <Beer size={15} />
      </button>
      {open && (
        <div className="modal-backdrop" onClick={() => setOpen(false)}>
          <div className="modal famous-modal" onClick={(e) => e.stopPropagation()}>
            <button className="icon-btn famous-x" aria-label="Chiudi" onClick={() => setOpen(false)}><X size={18} /></button>
            <h2><Beer size={20} /> {found.name}</h2>
            <p className="muted small">Le 3 birre più famose di questo stile, da assaggiare come riferimento. Tocca una birra per vedere le foto della bottiglia.</p>
            <ol className="famous-list">
              {list.map((b, i) => (
                <li key={i} style={{ ["--c" as string]: accentAt(i) }}>
                  <a href={imagesUrl(b.name, b.brewery)} target="_blank" rel="noopener noreferrer" title="Vedi le foto della bottiglia">
                    <span className="famous-n">{i + 1}</span>
                    <span className="famous-txt"><strong>{b.name}</strong><span className="muted small">{b.brewery} · {b.country}</span></span>
                    <ExternalLink size={16} className="famous-go" />
                  </a>
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </>
  );
}
