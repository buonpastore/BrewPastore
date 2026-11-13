import { useState } from "react";
import { Minus, Plus, ArrowLeftRight, Wine } from "lucide-react";
import { supabase, errMsg, num, type Row } from "../lib";

const BIG = 0.66, SMALL = 0.33;

/** Quante bottiglie da 0,66 e 0,33 servono per i litri del batch (anche misto). */
export function BottleCalc({ batch, canEdit, onSaved }: { batch: Row; canEdit: boolean; onSaved: (b: Row) => void }) {
  const start = Number(batch.volume_bottled_l ?? batch.volume_fermenter_l ?? 0) || 0;
  const [liters, setLiters] = useState<string>(start ? String(start).replace(".", ",") : "");
  const [fixed, setFixed] = useState<"big" | "small">("big");   // tipologia che decido io
  const [count, setCount] = useState(0);
  const [msg, setMsg] = useState("");

  const L = Number(liters.replace(",", ".")) || 0;
  const onlyBig = Math.ceil(L / BIG - 1e-9);
  const onlySmall = Math.ceil(L / SMALL - 1e-9);
  const fixedSize = fixed === "big" ? BIG : SMALL;
  const otherSize = fixed === "big" ? SMALL : BIG;
  const maxFixed = Math.ceil(L / fixedSize - 1e-9);
  const n = Math.min(count, maxFixed);
  const rest = Math.max(0, L - n * fixedSize);
  const other = Math.ceil(rest / otherSize - 1e-9);
  const big = fixed === "big" ? n : other;
  const small = fixed === "big" ? other : n;
  const total = big + small;
  const capacity = big * BIG + small * SMALL;

  // zucchero di priming per bottiglia (g/L × capacità)
  const gPerL = batch.priming_sugar_g && L ? Number(batch.priming_sugar_g) / L : null;

  const save = async () => {
    setMsg("");
    const patch: Row = { bottles_count: total };
    if (total) patch.bottle_size_l = Math.round((capacity / total) * 1000) / 1000;
    if (L && !batch.volume_bottled_l) patch.volume_bottled_l = L;
    const { data, error } = await supabase.from("batches").update(patch).eq("id", batch.id).select().single();
    if (error) return setMsg(errMsg(error));
    onSaved(data); setMsg(`✓ Salvate ${total} bottiglie (${big} da 0,66 + ${small} da 0,33)`);
  };

  return (
    <div className="bottle-calc">
      <h3><Wine size={16} /> Calcolatore bottiglie</h3>
      <label className="block"><span>Litri da imbottigliare</span>
        <div className="bf-input"><input inputMode="decimal" value={liters} onChange={(e) => setLiters(e.target.value)} placeholder="es. 20" /><span className="bf-unit">L</span></div>
      </label>
      {L > 0 && (
        <>
          <div className="bc-only">
            <div><span className="muted small">Solo da 0,66</span><strong>{onlyBig}</strong><span className="muted small">bottiglie</span></div>
            <div><span className="muted small">Solo da 0,33</span><strong>{onlySmall}</strong><span className="muted small">bottiglie</span></div>
          </div>

          <div className="bc-mix">
            <span className="nb-label">Misto: quante ne hai da {fixed === "big" ? "0,66" : "0,33"}?</span>
            <div className="bf-row">
              <button type="button" className="bf-btn" onClick={() => setCount(Math.max(0, n - 1))} aria-label="Meno"><Minus size={22} /></button>
              <div className="bf-input"><input inputMode="numeric" value={n} onChange={(e) => setCount(Math.max(0, Math.round(Number(e.target.value) || 0)))} /><span className="bf-unit">× {fixed === "big" ? "0,66" : "0,33"}</span></div>
              <button type="button" className="bf-btn" onClick={() => setCount(Math.min(maxFixed, n + 1))} aria-label="Più"><Plus size={22} /></button>
            </div>
            <button type="button" className="mini-btn bc-swap" onClick={() => { setFixed(fixed === "big" ? "small" : "big"); setCount(0); }}>
              <ArrowLeftRight size={16} /> <span>Decido io quelle da {fixed === "big" ? "0,33" : "0,66"}</span>
            </button>
            <div className="bc-result">
              servono anche <strong>{other}</strong> bottiglie da <strong>{fixed === "big" ? "0,33" : "0,66"}</strong>
              <div className="muted small">Totale {total} bottiglie: {big} da 0,66 + {small} da 0,33 = {num(capacity, 2)} L {capacity - L > 0.005 ? `(l'ultima resta un po' vuota: ${num(capacity - L, 2)} L di margine)` : ""}</div>
            </div>
          </div>

          {gPerL != null && (
            <p className="small">🍬 Priming: <strong>{num(gPerL * BIG, 1)} g</strong> per bottiglia da 0,66 · <strong>{num(gPerL * SMALL, 1)} g</strong> per bottiglia da 0,33</p>
          )}
          {canEdit && <button className="big-action" onClick={save}>💾 Usa queste bottiglie ({total})</button>}
          {msg && <p className="ok small">{msg}</p>}
        </>
      )}
    </div>
  );
}
