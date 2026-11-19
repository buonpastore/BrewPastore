import { useState } from "react";
import { Trophy, X } from "lucide-react";
import { findStyle } from "../styleGuide";
import { FAMOUS_BEERS } from "../famousBeers";
import { accentAt } from "../lib";

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
        <Trophy size={15} />
      </button>
      {open && (
        <div className="modal-backdrop" onClick={() => setOpen(false)}>
          <div className="modal famous-modal" onClick={(e) => e.stopPropagation()}>
            <button className="icon-btn famous-x" aria-label="Chiudi" onClick={() => setOpen(false)}><X size={18} /></button>
            <h2><Trophy size={20} /> {found.name}</h2>
            <p className="muted small">Le 3 birre più famose di questo stile, da assaggiare come riferimento.</p>
            <ol className="famous-list">
              {list.map((b, i) => (
                <li key={i} style={{ ["--c" as string]: accentAt(i) }}>
                  <span className="famous-n">{i + 1}</span>
                  <span><strong>{b.name}</strong><span className="muted small">{b.brewery} · {b.country}</span></span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </>
  );
}
