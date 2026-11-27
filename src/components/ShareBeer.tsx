import { useState } from "react";
import { Copy, MessageCircle, Share2, X } from "lucide-react";
import { num, type Row } from "../lib";
import { abvOf, ebcName, ibuName } from "../beerLook";
import { findStyle } from "../styleGuide";
import { COURSES, pairingFor } from "../pairings";

/** Testo da mandare a chi riceve la birra: stile, caratteristiche (10–15 righe) e abbinamenti. */
export function beerShareText(r: Row): string {
  const found = findStyle(r.style);
  const s = found?.info;
  const abv = abvOf(r.target_og, r.target_fg);
  const ibu = r.target_ibu != null ? Number(r.target_ibu) : null;
  const ebc = r.target_ebc != null ? Number(r.target_ebc) : null;
  const p = pairingFor(r.style);
  const numbers = [abv != null && `${num(abv, 1)}% vol`, ibu != null && `${num(ibu, 0)} IBU (${ibuName(ibu)})`, ebc != null && `colore ${ebcName(ebc)}`].filter(Boolean).join(" · ");
  const lines = [
    `🍺 *${r.name}*`,
    `Stile: *${found?.name ?? r.style ?? "birra artigianale"}*${numbers ? ` — ${numbers}` : ""}`,
    "",
    ...(s ? [
      `📍 ${s.origin} · ${s.ferm}`,
      `👀 Aspetto: ${s.look}`,
      `👃 Aroma: ${s.aroma}`,
      `👅 Gusto: ${s.taste}`,
    ] : []),
    "",
    `🍽️ *Con cosa abbinarla* (${p.family})`,
    ...COURSES.map((c) => `${c.emoji} ${c.label}: ${p.dishes[c.key].map((d) => d.name).join(", ")}`),
    "",
    "Prodotta in casa da Buon Pastore 🐑 — salute!",
  ];
  return lines.join("\n").replace(/\n{3,}/g, "\n\n");
}

/** Iconcina «Condividi»: apre il testo, da copiare o mandare su WhatsApp. */
export function ShareBeer({ recipe }: { recipe: Row }) {
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState("");
  const text = beerShareText(recipe);
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); setMsg("Copiato ✓ — ora incollalo dove vuoi"); }
    catch { setMsg("Non riesco a copiare: tieni premuto sul testo e copialo a mano"); }
  };
  const share = async () => {
    try { await navigator.share({ title: recipe.name, text }); } catch { /* annullato */ }
  };
  return (
    <>
      <button type="button" title="Condividi la birra" aria-label="Condividi" onClick={() => { setMsg(""); setOpen(true); }}><Share2 size={19} /></button>
      {open && (
        <div className="modal-backdrop" onClick={() => setOpen(false)}>
          <div className="modal share-modal" onClick={(e) => e.stopPropagation()}>
            <button className="icon-btn famous-x" aria-label="Chiudi" onClick={() => setOpen(false)}><X size={18} /></button>
            <h2><Share2 size={20} /> Condividi la birra</h2>
            <p className="muted small">Il testo per chi riceve la birra: stile, caratteristiche e abbinamenti.</p>
            <pre className="share-text">{text}</pre>
            <div className="share-btns">
              <a className="btn share-wa" href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener noreferrer"><MessageCircle size={20} /> Invia su WhatsApp</a>
              <button type="button" className="btn" onClick={copy}><Copy size={18} /> Copia</button>
              {typeof navigator.share === "function" && <button type="button" className="btn" onClick={share}><Share2 size={18} /> Altre app</button>}
            </div>
            {msg && <p className="ok small">{msg}</p>}
          </div>
        </div>
      )}
    </>
  );
}
