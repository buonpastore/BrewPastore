import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase, uploadFile, parseRecipe, findOrCreateMaterial, errMsg, MATERIAL_CATEGORIES, UNITS, type ParsedRecipe } from "../lib";

interface Props {
  onClose: () => void;
  /** se presente, aggiunge gli ingredienti a questa ricetta invece di crearne una nuova */
  recipeId?: string;
  onDone?: () => void;
}

/** Carica uno screenshot (es. chat con un'AI) e crea/compila una ricetta. */
export function ImportRecipe({ onClose, recipeId, onDone }: Props) {
  const nav = useNavigate();
  const [step, setStep] = useState<"upload" | "reading" | "review" | "saving">("upload");
  const [data, setData] = useState<ParsedRecipe | null>(null);
  const [path, setPath] = useState("");
  const [fillFields, setFillFields] = useState(!recipeId);
  const [error, setError] = useState("");

  const read = async (files: FileList | null) => {
    if (!files?.length) return;
    setError(""); setStep("reading");
    try {
      const p = await uploadFile("recipes/import", files[0]);
      setPath(p);
      setData(await parseRecipe(p));
      setStep("review");
    } catch (e) { setError(errMsg(e)); setStep("upload"); }
  };

  const setIng = (i: number, k: string, v: unknown) => {
    if (!data) return;
    const ingredients = data.ingredients.map((x, j) => (j === i ? { ...x, [k]: v } : x));
    setData({ ...data, ingredients });
  };

  const save = async () => {
    if (!data) return;
    setStep("saving"); setError("");
    try {
      const { ingredients, ...fields } = data;
      let id = recipeId;
      if (!id) {
        const { data: r, error } = await supabase.from("recipes").insert({ ...fields, name: fields.name || "Ricetta importata" }).select().single();
        if (error) throw error;
        id = r.id;
      } else if (fillFields) {
        const patch = Object.fromEntries(Object.entries(fields).filter(([k, v]) => v != null && k !== "name"));
        const { error } = await supabase.from("recipes").update(patch).eq("id", id);
        if (error) throw error;
      }
      const { count } = await supabase.from("recipe_ingredients").select("id", { count: "exact", head: true }).eq("recipe_id", id);
      const rows = [];
      for (const [i, ing] of ingredients.entries()) {
        const material_id = await findOrCreateMaterial(ing.name, ing.category, ing.unit);
        rows.push({ recipe_id: id, material_id, name: ing.name, category: ing.category, quantity: Number(ing.quantity),
                    unit: ing.unit, step: ing.step, sort_order: (count ?? 0) + i });
      }
      if (rows.length) {
        const { error } = await supabase.from("recipe_ingredients").insert(rows);
        if (error) throw error;
      }
      await supabase.from("documents").insert({ title: "Fonte ricetta (import)", kind: "foto", storage_path: path, recipe_id: id });
      onDone?.();
      onClose();
      if (!recipeId) nav(`/ricette/${id}`);
    } catch (e) { setError(errMsg(e)); setStep("review"); }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal wide">
        <h2>📸 Importa ricetta da screenshot</h2>
        {step === "upload" && (
          <>
            <p>Carica lo screenshot di una chat con un'AI, la foto di un foglio o un PDF con la ricetta. L'AI estrarrà ingredienti e parametri: potrai controllarli prima di salvare.</p>
            <label className="btn primary">
              Scegli file
              <input type="file" accept="image/*,application/pdf,.txt,.md" hidden onChange={(e) => read(e.target.files)} />
            </label>
          </>
        )}
        {step === "reading" && <p>⏳ Sto leggendo la ricetta… (può volerci fino a un minuto)</p>}
        {(step === "review" || step === "saving") && data && (
          <>
            <div className="form-grid">
              {!recipeId && <label><span>Nome</span><input value={data.name ?? ""} onChange={(e) => setData({ ...data, name: e.target.value })} /></label>}
              <label><span>Stile</span><input value={data.style ?? ""} onChange={(e) => setData({ ...data, style: e.target.value })} /></label>
              <div className="muted small wide">
                Batch {data.batch_size_l ?? "?"} L · OG {data.target_og ?? "?"} · FG {data.target_fg ?? "?"} · IBU {data.target_ibu ?? "?"} · Mash {data.mash_temp_c ?? "?"}°C × {data.mash_time_min ?? "?"} min
              </div>
              {recipeId && (
                <label className="check wide"><input type="checkbox" checked={fillFields} onChange={(e) => setFillFields(e.target.checked)} /> aggiorna anche i parametri della ricetta (OG, FG, IBU, mash…)</label>
              )}
            </div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Ingrediente</th><th>Categoria</th><th>Q.tà</th><th>Unità</th><th>Quando</th><th /></tr></thead>
                <tbody>
                  {data.ingredients.map((ing, i) => (
                    <tr key={i}>
                      <td><input value={ing.name} onChange={(e) => setIng(i, "name", e.target.value)} /></td>
                      <td><select value={ing.category} onChange={(e) => setIng(i, "category", e.target.value)}>{MATERIAL_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></td>
                      <td><input type="number" step="any" value={ing.quantity} onChange={(e) => setIng(i, "quantity", e.target.value)} style={{ width: 80 }} /></td>
                      <td><select value={ing.unit} onChange={(e) => setIng(i, "unit", e.target.value)}>{UNITS.map((u) => <option key={u}>{u}</option>)}</select></td>
                      <td><input value={ing.step ?? ""} onChange={(e) => setIng(i, "step", e.target.value)} /></td>
                      <td><button className="icon" onClick={() => setData({ ...data, ingredients: data.ingredients.filter((_, j) => j !== i) })}>🗑️</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {data.notes && <p className="note">📝 {data.notes}</p>}
          </>
        )}
        {error && <p className="error">{error}</p>}
        <div className="row-actions">
          {step === "review" && <button className="btn primary" onClick={save}>Salva {data?.ingredients.length} ingredienti</button>}
          {step === "saving" && <button className="btn primary" disabled>Salvo…</button>}
          <button className="btn" onClick={onClose}>Chiudi</button>
        </div>
      </div>
    </div>
  );
}
