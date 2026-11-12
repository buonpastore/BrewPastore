import { useEffect, useState } from "react";
import { Droplets, ShowerHead, Calculator } from "lucide-react";
import { supabase, errMsg, num, type Row } from "../lib";

const KEY = "brewpastore-impianto";
interface Equip { ratio: number; boilOff: number; absorption: number; losses: number }
const DEFAULT: Equip = { ratio: 3, boilOff: 3, absorption: 1, losses: 2 };
function loadEquip(): Equip {
  try { return { ...DEFAULT, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") }; } catch { return DEFAULT; }
}

/** Scheda Acqua della ricetta: acqua di mash e di sparge, con calcolatore. */
export function RecipeWater({ recipe, canEdit, onSaved }: { recipe: Row; canEdit: boolean; onSaved: (r: Row) => void }) {
  const [malt, setMalt] = useState(0);
  const [eq, setEq] = useState<Equip>(loadEquip);
  const [mash, setMash] = useState<string>(recipe.mash_water_l ?? "");
  const [sparge, setSparge] = useState<string>(recipe.sparge_water_l ?? "");
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    supabase.from("recipe_ingredients").select("quantity, unit, category").eq("recipe_id", recipe.id).then(({ data }) => {
      setMalt((data ?? []).filter((i) => i.category === "malto")
        .reduce((s, i) => s + (i.unit === "kg" ? Number(i.quantity) : i.unit === "g" ? Number(i.quantity) / 1000 : 0), 0));
    });
  }, [recipe.id]);
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(eq)); } catch { /* ignore */ } }, [eq]);

  const vol = Number(recipe.batch_size_l) || 0;
  const boil = Number(recipe.boil_time_min) || 60;
  const evap = eq.boilOff * boil / 60;
  const absorbed = malt * eq.absorption;
  const total = vol + eq.losses + evap + absorbed;
  const calcMash = malt * eq.ratio;
  const calcSparge = Math.max(0, total - calcMash);
  const preBoil = vol + eq.losses + evap;
  const r1 = (n: number) => Math.round(n * 10) / 10;

  const save = async (m: number | null, s: number | null) => {
    setError(""); setMsg("");
    const { data, error } = await supabase.from("recipes").update({ mash_water_l: m, sparge_water_l: s }).eq("id", recipe.id).select().single();
    if (error) {
      return setError(/mash_water_l|sparge_water_l|column/i.test(error.message)
        ? "Manca un aggiornamento del database: esegui su Supabase il file 0006_acqua_ricetta.sql."
        : errMsg(error));
    }
    onSaved(data); setMash(data.mash_water_l ?? ""); setSparge(data.sparge_water_l ?? ""); setMsg("Salvato ✓");
  };

  const savedM = recipe.mash_water_l != null ? Number(recipe.mash_water_l) : null;
  const savedS = recipe.sparge_water_l != null ? Number(recipe.sparge_water_l) : null;

  return (
    <div>
      <div className="water-cards">
        <div className="water-card" style={{ ["--c" as string]: "var(--gold)" }}>
          <Droplets size={22} />
          <span className="muted small">Acqua di mash (ammostamento)</span>
          <strong>{savedM != null ? `${num(savedM, 1)} L` : "—"}</strong>
          <span className="muted small">{savedM != null && malt ? `${num(savedM / malt, 2)} L per kg di malto` : "dove metti i grani"}</span>
        </div>
        <div className="water-card" style={{ ["--c" as string]: "var(--teal)" }}>
          <ShowerHead size={22} />
          <span className="muted small">Acqua di sparge (risciacquo)</span>
          <strong>{savedS != null ? `${num(savedS, 1)} L` : "—"}</strong>
          <span className="muted small">a 76–78 °C</span>
        </div>
        <div className="water-card" style={{ ["--c" as string]: "var(--magenta)" }}>
          <span className="water-total">Σ</span>
          <span className="muted small">Acqua totale</span>
          <strong>{savedM != null || savedS != null ? `${num((savedM ?? 0) + (savedS ?? 0), 1)} L` : "—"}</strong>
          <span className="muted small">{vol ? `per ${num(vol, 1)} L di birra` : ""}</span>
        </div>
      </div>

      {canEdit && (
        <div className="inline-form">
          <label><span>Acqua di mash (L)</span><input type="number" step="0.1" value={mash} onChange={(e) => setMash(e.target.value)} /></label>
          <label><span>Acqua di sparge (L)</span><input type="number" step="0.1" value={sparge} onChange={(e) => setSparge(e.target.value)} /></label>
          <button className="btn primary" onClick={() => save(mash === "" ? null : Number(mash), sparge === "" ? null : Number(sparge))}>Salva</button>
          {msg && <span className="ok small">{msg}</span>}
        </div>
      )}
      {error && <p className="error">{error}</p>}

      <div className="calc">
        <h3><Calculator size={16} style={{ verticalAlign: -2 }} /> Calcolatore</h3>
        {!vol || !malt ? (
          <p className="muted">Per il calcolo servono i <strong>litri finali</strong> (scheda Scheda) e i <strong>malti</strong> (scheda Ingredienti).</p>
        ) : (
          <>
            <p className="muted small">Dati del vostro impianto (restano salvati su questo dispositivo):</p>
            <div className="form-grid">
              <label><span>Rapporto acqua/grani (L/kg)</span><input type="number" step="0.1" value={eq.ratio} onChange={(e) => setEq({ ...eq, ratio: Number(e.target.value) })} /></label>
              <label><span>Evaporazione (L/ora)</span><input type="number" step="0.1" value={eq.boilOff} onChange={(e) => setEq({ ...eq, boilOff: Number(e.target.value) })} /></label>
              <label><span>Assorbimento grani (L/kg)</span><input type="number" step="0.1" value={eq.absorption} onChange={(e) => setEq({ ...eq, absorption: Number(e.target.value) })} /></label>
              <label><span>Perdite (trub, tubi, fondo) L</span><input type="number" step="0.1" value={eq.losses} onChange={(e) => setEq({ ...eq, losses: Number(e.target.value) })} /></label>
            </div>
            <table className="water-calc">
              <tbody>
                <tr><td>Birra in fermentatore</td><td>{num(vol, 1)} L</td></tr>
                <tr><td>+ perdite</td><td>{num(eq.losses, 1)} L</td></tr>
                <tr><td>+ evaporazione ({boil} min × {num(eq.boilOff, 1)} L/h)</td><td>{num(evap, 1)} L</td></tr>
                <tr><td>+ assorbita dai grani ({num(malt, 2)} kg × {num(eq.absorption, 1)} L/kg)</td><td>{num(absorbed, 1)} L</td></tr>
                <tr className="tot"><td>Acqua totale</td><td>{num(total, 1)} L</td></tr>
                <tr><td>🟡 Mash: {num(malt, 2)} kg × {num(eq.ratio, 1)} L/kg</td><td><strong>{num(calcMash, 1)} L</strong></td></tr>
                <tr><td>🔵 Sparge: totale − mash</td><td><strong>{num(calcSparge, 1)} L</strong></td></tr>
                <tr><td className="muted">Volume pre-bollitura atteso</td><td className="muted">{num(preBoil, 1)} L</td></tr>
              </tbody>
            </table>
            {canEdit && <button className="btn" onClick={() => save(r1(calcMash), r1(calcSparge))}>Usa questi valori ({num(r1(calcMash), 1)} L + {num(r1(calcSparge), 1)} L)</button>}
          </>
        )}
      </div>
    </div>
  );
}
