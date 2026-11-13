import { textOf } from "../ocr";
import { sortByCat, nameColor } from "../categories";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FilePicker } from "../components/FilePicker";
import { FieldInput } from "../components/fields";
import { STYLE_OPTIONS, OUR_STYLES, FAMOUS_STYLES } from "../styles-list";
import { parseRecipeText } from "../textParser";
import { supabase, uploadFile, parseRecipe, findOrCreateMaterial, errMsg, MATERIAL_CATEGORIES, UNITS, type ParsedRecipe } from "../lib";

interface Props {
  onClose: () => void;
  /** se presente, aggiunge gli ingredienti a questa ricetta invece di crearne una nuova */
  recipeId?: string;
  onDone?: () => void;
  /** screenshot già incollati nella pagina: la lettura parte subito */
  initialFiles?: File[];
}

/** Carica uno screenshot (es. chat con un'AI) e crea/compila una ricetta. */
export function ImportRecipe({ onClose, recipeId, onDone, initialFiles }: Props) {
  const nav = useNavigate();
  const [step, setStep] = useState<"upload" | "reading" | "review" | "saving">("upload");
  const [data, setData] = useState<ParsedRecipe | null>(null);
  const [paths, setPaths] = useState<string[]>([]);
  const [picked, setPicked] = useState<File[]>(initialFiles ?? []);
  const [fillFields, setFillFields] = useState(!recipeId);
  const [existing, setExisting] = useState(0);
  const [replace, setReplace] = useState(true);
  useEffect(() => {
    if (!recipeId) return;
    supabase.from("recipe_ingredients").select("id", { count: "exact", head: true }).eq("recipe_id", recipeId)
      .then(({ count }) => setExisting(count ?? 0));
  }, [recipeId]);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState("");
  const [warn, setWarn] = useState("");

  const read = async () => {
    if (!picked.length) return;
    setError(""); setStep("reading");
    try {
      const ps: string[] = [];
      for (const f of picked) ps.push(await uploadFile("recipes/import", f));
      setPaths(ps);
      // testo e screenshot: lettura diretta sul telefono (testo così com'è, immagini con l'OCR), senza AI
      let parsed: ParsedRecipe | null = null, local: ParsedRecipe | null = null;
      const text = await textOf(picked, setProgress);
      if (text) {
        local = parseRecipeText(text, [...OUR_STYLES, ...FAMOUS_STYLES]);
        if (local.ingredients.length) parsed = local;
      }
      let got: ParsedRecipe | null = parsed;
      if (!got) {
        try { got = await parseRecipe(ps); }
        catch (e) {
          if (!local) throw e;   // PDF senza AI: niente da fare
          got = local;           // AI non attiva: apro comunque la revisione per inserire a mano
          setWarn("Non ho trovato ingredienti nel testo: controlla che si legga bene, oppure aggiungili a mano qui sotto.");
        }
      }
      setData(got ? { ...got, ingredients: sortByCat(got.ingredients ?? []) } : got);   // malti, luppoli, lieviti, resto
      setStep("review");
    } catch (e) { setError(errMsg(e)); setStep("upload"); }
  };

  const started = useRef(false);
  useEffect(() => {
    if (initialFiles?.length && !started.current) { started.current = true; read(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setIng = (i: number, k: string, v: unknown) => {
    if (!data) return;
    const ingredients = data.ingredients.map((x, j) => (j === i ? { ...x, [k]: v } : x));
    setData({ ...data, ingredients });
  };

  const save = async () => {
    let waterSkipped = false;
    if (!data) return;
    setStep("saving"); setError("");
    try {
      const { ingredients, ...fields } = data;
      if (fields.notes && /^Lett[ao] direttamente dal testo/i.test(fields.notes)) fields.notes = null;
      let id = recipeId;
      if (!id) {
        const rec = { ...fields, name: fields.name || "Ricetta importata" };
        let { data: r, error } = await supabase.from("recipes").insert(rec).select().single();
        if (error && isMissingWater(error)) {
          // database non ancora aggiornato (file 0006): salva senza i campi dell'acqua
          waterSkipped = true;
          ({ data: r, error } = await supabase.from("recipes").insert(withoutWater(rec)).select().single());
        }
        if (error) throw error;
        id = r!.id;
      } else if (fillFields) {
        const patch = Object.fromEntries(Object.entries(fields).filter(([k, v]) => v != null && k !== "name"));
        let { error } = await supabase.from("recipes").update(patch).eq("id", id);
        if (error && isMissingWater(error)) {
          waterSkipped = true;
          ({ error } = await supabase.from("recipes").update(withoutWater(patch)).eq("id", id));
        }
        if (error) throw error;
      }
      if (recipeId && replace && existing > 0) {
        const { error } = await supabase.from("recipe_ingredients").delete().eq("recipe_id", id);
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
      await supabase.from("documents").insert(paths.map((p, i) => ({ title: `Fonte ricetta (import)${paths.length > 1 ? ` ${i + 1}` : ""}`, kind: "foto", storage_path: p, recipe_id: id })));
      if (waterSkipped) alert("Ricetta salvata. L'acqua di mash e sparge non è stata salvata perché su Supabase manca ancora il file 0006_acqua_ricetta.sql: eseguilo e poi inserisci l'acqua dalla scheda Acqua.");
      onDone?.();
      onClose();
      if (!recipeId) nav(`/ricette/${id}`);
    } catch (e) { setError(errMsg(e)); setStep("review"); }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal wide">
        <h2>📸 Importa ricetta</h2>
        {step === "upload" && (
          <>
            <p>Incolla lo screenshot di una chat con un'AI (anche più screenshot se la ricetta è lunga), la foto di un foglio o un PDF. L'AI estrarrà ingredienti e parametri: potrai controllarli prima di salvare.</p>
            <FilePicker allowText textPlaceholder="Incolla qui il testo della ricetta" onFiles={(f) => setPicked((p) => [...p, ...f].slice(0, 10))} accept="image/*,application/pdf,.txt,.md" />
            <PickedList files={picked} onRemove={(i) => setPicked(picked.filter((_, j) => j !== i))} />
          </>
        )}
        {step === "reading" && <p>⏳ {progress || "Sto leggendo la ricetta…"} <span className="muted small">(la prima volta lo screenshot può richiedere qualche secondo in più)</span></p>}
        {warn && step === "review" && <p className="warn">⚠️ {warn}</p>}
        {(step === "review" || step === "saving") && data && (
          <>
            <div className="form-grid">
              {!recipeId && <label><span>Nome</span><input value={data.name ?? ""} onChange={(e) => setData({ ...data, name: e.target.value })} /></label>}
              <label><span>Stile</span><FieldInput f={{ key: "style", label: "Stile", type: "select", options: STYLE_OPTIONS, allowCustom: true }} value={data.style ?? ""} onChange={(v) => setData({ ...data, style: (v as string) || null })} /></label>
              {([
                ["batch_size_l", "Litri"], ["target_og", "OG"], ["target_fg", "FG"], ["target_ibu", "IBU"], ["target_ebc", "EBC"],
                ["mash_temp_c", "Mash °C"], ["mash_time_min", "Mash min"], ["boil_time_min", "Bollitura min"],
                ["mash_water_l", "Acqua mash L"], ["sparge_water_l", "Acqua sparge L"],
              ] as [keyof ParsedRecipe, string][]).map(([k, label]) => (
                <label key={k} className="param"><span>{label}</span>
                  <input type="number" step="any" value={(data[k] as number | null) ?? ""}
                    onChange={(e) => setData({ ...data, [k]: e.target.value === "" ? null : Number(e.target.value) })} />
                </label>
              ))}
              {recipeId && existing > 0 && (
                <label className="check wide">
                  <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} />
                  sostituisci i {existing} ingredienti attuali (se togli la spunta vengono aggiunti in fondo)
                </label>
              )}
              {recipeId && (
                <label className="check wide"><input type="checkbox" checked={fillFields} onChange={(e) => setFillFields(e.target.checked)} /> aggiorna anche i parametri della ricetta (OG, FG, IBU, mash…)</label>
              )}
            </div>
            <div className="table-wrap">
              <table className="review-table">
                <thead><tr><th>Ingrediente</th><th>Categoria</th><th>Q.tà</th><th>Unità</th><th>Quando</th><th /></tr></thead>
                <tbody>
                  {data.ingredients.map((ing, i) => (
                    <tr key={i}>
                      <td data-label="Ingrediente" className="rv-wide"><input value={ing.name} style={{ color: nameColor(ing.category), fontWeight: 600 }} onChange={(e) => setIng(i, "name", e.target.value)} /></td>
                      <td data-label="Categoria"><select value={ing.category} onChange={(e) => setIng(i, "category", e.target.value)}>{MATERIAL_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></td>
                      <td data-label="Quantità"><input type="number" step="any" value={ing.quantity} onChange={(e) => setIng(i, "quantity", e.target.value)} style={{ width: 80 }} /></td>
                      <td data-label="Unità"><select value={ing.unit} onChange={(e) => setIng(i, "unit", e.target.value)}>{UNITS.map((u) => <option key={u}>{u}</option>)}</select></td>
                      <td data-label="Quando"><input value={ing.step ?? ""} onChange={(e) => setIng(i, "step", e.target.value)} /></td>
                      <td className="rv-del"><button className="icon" onClick={() => setData({ ...data, ingredients: data.ingredients.filter((_, j) => j !== i) })}>🗑️</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button className="btn small" style={{ marginTop: 8 }} onClick={() => setData({ ...data, ingredients: [...data.ingredients, { name: "", category: "malto", quantity: 0, unit: "kg", step: null }] })}>+ Aggiungi ingrediente</button>
            {data.notes && !/^Lett[ao] direttamente dal testo/i.test(data.notes) && <p className="note">📝 {data.notes}</p>}
          </>
        )}
        {error && <p className="error">{error}</p>}
        <div className="row-actions">
          {step === "upload" && picked.length > 0 && <button className="btn primary" onClick={read}>🔎 Leggi {picked.length > 1 ? `${picked.length} screenshot` : "la ricetta"}</button>}
          {step === "review" && <button className="btn primary" onClick={save}>Salva {data?.ingredients.length} ingredienti</button>}
          {step === "saving" && <button className="btn primary" disabled>Salvo…</button>}
          <button className="btn" onClick={onClose}>Chiudi</button>
        </div>
      </div>
    </div>
  );
}

/** Miniature dei file scelti/incollati, con possibilità di toglierli. */
export function PickedList({ files, onRemove }: { files: File[]; onRemove: (i: number) => void }) {
  if (!files.length) return null;
  return (
    <ul className="thumbs">
      {files.map((f, i) => (
        <li key={i}>
          {f.type.startsWith("image/") ? <img src={URL.createObjectURL(f)} alt={f.name} /> : <span className="file-ico">📄</span>}
          <span className="small">{f.name}</span>
          <button type="button" className="icon tiny" onClick={() => onRemove(i)}>✕</button>
        </li>
      ))}
    </ul>
  );
}

const isMissingWater = (e: { message?: string }) => /mash_water_l|sparge_water_l/.test(e.message ?? "");
function withoutWater<T extends Record<string, unknown>>(o: T) {
  const { mash_water_l: _m, sparge_water_l: _s, ...rest } = o;
  void _m; void _s;
  return rest;
}
