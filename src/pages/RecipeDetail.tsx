import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { supabase, errMsg, date, sg, STATUS_LABELS, MATERIAL_CATEGORIES, UNITS, loadMaterials, type Row } from "../lib";
import { useAuth } from "../auth";
import { RecordForm } from "../components/RecordForm";
import { RowsEditor } from "../components/RowsEditor";
import { DocumentsPanel } from "../components/DocumentsPanel";
import { Tabs } from "../components/Layout";
import type { FieldDef } from "../components/fields";
import { ImportRecipe } from "./ImportRecipe";
import { FilePicker } from "../components/FilePicker";
import { STYLE_OPTIONS } from "../styles-list";
import { DeleteDialog } from "../components/DeleteDialog";
import { BrewDay } from "./BrewDay";
import { RecipeWater } from "./Water";
import { buildProcedure } from "../procedure";
import { CleanNamesButton } from "../components/CleanNames";
import { IngredientsView } from "../components/IngredientsView";
import { deleteRecipe, deletionSummary } from "../deleteHelpers";

export const RECIPE_SECTIONS: { title?: string; fields: FieldDef[] }[] = [
  { title: "Generale", fields: [
    { key: "name", label: "Nome", required: true },
    { key: "style", label: "Stile", type: "select", options: STYLE_OPTIONS, allowCustom: true },
    { key: "batch_size_l", label: "Volume batch (L)", type: "number" },
    { key: "description", label: "Descrizione", type: "textarea" },
  ]},
  { title: "Obiettivi", fields: [
    { key: "target_og", label: "OG", type: "number", step: "0.001", render: (v) => sg(v as number) },
    { key: "target_fg", label: "FG", type: "number", step: "0.001", render: (v) => sg(v as number) },
    { key: "target_ibu", label: "IBU", type: "number" },
    { key: "target_ebc", label: "Colore (EBC)", type: "number" },
  ]},
  { title: "Processo", fields: [
    { key: "mash_temp_c", label: "Temp. mash (°C)", type: "number" },
    { key: "mash_time_min", label: "Durata mash (min)", type: "number" },
    { key: "boil_time_min", label: "Bollitura (min)", type: "number" },
    { key: "procedure", label: "Procedimento", type: "textarea" },
    { key: "notes", label: "Note", type: "textarea" },
    { key: "archived", label: "Archiviata", type: "checkbox" },
  ]},
];

export function RecipeDetail() {
  const { id } = useParams();
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const { isAdmin } = useAuth();
  const [recipe, setRecipe] = useState<Row | null>(null);
  const [batches, setBatches] = useState<Row[]>([]);
  const [materials, setMaterials] = useState<Row[]>([]);
  const [tab, setTab] = useState("scheda");
  const [importing, setImporting] = useState(false);
  const [pasted, setPasted] = useState<File[] | undefined>();
  const [deleting, setDeleting] = useState(false);
  const [editIng, setEditIng] = useState(false);
  const [viewKey, setViewKey] = useState(0);
  const [reloadIng, setReloadIng] = useState(0);

  useEffect(() => {
    supabase.from("recipes").select("*").eq("id", id!).single().then(({ data }) => setRecipe(data));
    supabase.from("batches").select("id, code, status, brew_date, original_gravity, final_gravity, abv")
      .eq("recipe_id", id!).order("brew_date", { ascending: false, nullsFirst: true }).then(({ data }) => setBatches(data ?? []));
    loadMaterials().then(setMaterials);
  }, [id]);

  const newBatch = async () => {
    const code = `${recipe!.name} #${batches.length + 1}`;
    const { data: b, error } = await supabase.from("batches").insert({
      recipe_id: id, code, mash_water_l: recipe!.mash_water_l ?? null, sparge_water_l: recipe!.sparge_water_l ?? null,
    }).select().single();
    if (error) return alert(errMsg(error));
    // copia gli ingredienti della ricetta nel batch (poi si possono correggere)
    const { data: ings } = await supabase.from("recipe_ingredients").select("*").eq("recipe_id", id!).order("sort_order");
    if (ings?.length) {
      await supabase.from("batch_ingredients").insert(ings.map((i) => ({
        batch_id: b.id, material_id: i.material_id, name: i.name, category: i.category, quantity: i.quantity, unit: i.unit, step: i.step,
      })));
    }
    nav(`/batch/${b.id}?nuovo=1`);
  };

  const duplicate = async () => {
    const name = prompt("Nome della copia", recipe!.name + " (v2)");
    if (!name) return;
    const { id: _id, created_at, updated_at, ...rest } = recipe!;
    void _id; void created_at; void updated_at;
    const { data: r, error } = await supabase.from("recipes").insert({ ...rest, name }).select().single();
    if (error) return alert(errMsg(error));
    const { data: ings } = await supabase.from("recipe_ingredients").select("*").eq("recipe_id", id!);
    if (ings?.length) await supabase.from("recipe_ingredients").insert(ings.map(({ id: _x, ...i }) => ({ ...i, recipe_id: r.id })));
    nav(`/ricette/${r.id}`);
  };

  if (!recipe) return <p>Caricamento…</p>;

  const matOptions = materials.map((m) => ({ value: m.id, label: m.name }));
  const ingFields: FieldDef[] = [
    { key: "name", label: "Ingrediente", required: true },
    { key: "category", label: "Categoria", type: "select", options: MATERIAL_CATEGORIES, required: true },
    { key: "quantity", label: "Q.tà", type: "number", required: true },
    { key: "unit", label: "Unità", type: "select", options: UNITS, required: true },
    { key: "step", label: "Quando / step" },
    { key: "material_id", label: "Materia prima (per costi)", type: "select", options: matOptions },
    { key: "sort_order", label: "Ordine", type: "number" },
  ];

  return (
    <div>
      <div className="page-head">
        <div>
          <Link to="/ricette" className="muted small">← Ricette</Link>
          <h1>{recipe.name}</h1>
          <div className="muted">{recipe.style}</div>
        </div>
        {isAdmin && (
          <div className="row-actions">
            <button className="btn" onClick={duplicate}>⧉ Duplica</button>
            <button className="btn danger" onClick={() => setDeleting(true)}>🗑️ Elimina</button>
            <button className="btn primary" onClick={newBatch}>🍺 Nuovo batch da questa ricetta</button>
          </div>
        )}
      </div>

      {deleting && (
        <DeleteDialog title="Elimina ricetta" name={recipe.name}
          loadSummary={() => deletionSummary(recipe.id, batches.map((b) => b.id))}
          onConfirm={async () => { await deleteRecipe(recipe.id); nav("/ricette"); }}
          onClose={() => setDeleting(false)} />
      )}

      <Tabs active={tab} onChange={setTab} tabs={[
        ["scheda", "Scheda"], ["ingredienti", "Ingredienti"], ["acqua", "Acqua"], ["cottura", "Cottura"], ["batch", `Batch (${batches.length})`],
        ["documenti", "Documenti"],
      ]} />

      <div className="panel">
        {tab === "scheda" && isAdmin && (
          <div className="row-actions" style={{ margin: "0 0 14px" }}>
            <button className="mini-btn" onClick={async () => {
              const { data: ings } = await supabase.from("recipe_ingredients").select("*").eq("recipe_id", recipe.id).order("sort_order");
              const text = buildProcedure({
                mashTemp: recipe.mash_temp_c, mashTime: recipe.mash_time_min, boil: recipe.boil_time_min,
                mashWater: recipe.mash_water_l, spargeWater: recipe.sparge_water_l,
                ingredients: (ings ?? []).map((i) => ({ name: i.name, category: i.category, quantity: Number(i.quantity), unit: i.unit, step: i.step })),
              });
              if (recipe.procedure && !confirm("Sostituire il procedimento attuale con il riassunto generato dagli ingredienti e dai parametri?")) return;
              const { data, error } = await supabase.from("recipes").update({ procedure: text }).eq("id", recipe.id).select().single();
              if (error) return alert(errMsg(error));
              setRecipe(data);
            }}>📝 <span>Genera riassunto del procedimento</span></button>
          </div>
        )}
        {tab === "scheda" && (
          <RecordForm table="recipes" row={recipe} sections={RECIPE_SECTIONS} canEdit={isAdmin}
            startEditing={sp.get("edit") === "1" && isAdmin} onSaved={setRecipe} />
        )}
        {tab === "ingredienti" && (
          <>
            <IngredientsView table="recipe_ingredients" parentKey="recipe_id" parentId={recipe.id} volume={recipe.batch_size_l} reloadKey={`${reloadIng}-${viewKey}`} />
            {isAdmin && (
              <div className="ing-tools">
                <button className={"mini-btn" + (editIng ? " on" : "")} onClick={() => setEditIng(!editIng)}>✏️ <span>{editIng ? "Chiudi modifica" : "Modifica ingredienti"}</span></button>
                <CleanNamesButton table="recipe_ingredients" parentKey="recipe_id" parentId={recipe.id} onDone={() => setReloadIng((x) => x + 1)} />
              </div>
            )}
            {isAdmin && editIng && (
              <RowsEditor table="recipe_ingredients" parentKey="recipe_id" parentId={recipe.id} fields={ingFields}
                canEdit={isAdmin} orderBy={{ column: "sort_order" }} defaults={{ category: "malto", unit: "kg" }}
                reloadKey={reloadIng} onChange={() => setViewKey((x) => x + 1)} />
            )}
            {isAdmin && !importing && (
              <div className="ing-import">
                <h3>Importa ingredienti</h3>
                <FilePicker compact allowText textPlaceholder="Incolla qui il testo della ricetta (es. copiato da una chat con l'AI)" onFiles={(f) => { setPasted(f); setImporting(true); }} accept="image/*,application/pdf,.txt,.md"
                  title="📋 Incolla qui" hint="screenshot, file o testo" />
              </div>
            )}
            {importing && <ImportRecipe recipeId={recipe.id} initialFiles={pasted} onClose={() => { setImporting(false); setPasted(undefined); }}
              onDone={() => { setReloadIng((x) => x + 1); loadMaterials().then(setMaterials); supabase.from("recipes").select("*").eq("id", recipe.id).single().then(({ data }) => data && setRecipe(data)); }} />}
          </>
        )}
        {tab === "batch" && (
          <table>
            <thead><tr><th>Batch</th><th>Stato</th><th>Cotta</th><th>OG</th><th>FG</th><th>ABV</th></tr></thead>
            <tbody>
              {batches.map((b) => (
                <tr key={b.id}>
                  <td><Link to={`/batch/${b.id}`}>{b.code}</Link></td>
                  <td><span className={"badge st-" + b.status}>{STATUS_LABELS[b.status]}</span></td>
                  <td>{date(b.brew_date)}</td><td>{sg(b.original_gravity)}</td><td>{sg(b.final_gravity)}</td>
                  <td>{b.abv != null ? b.abv + "%" : "—"}</td>
                </tr>
              ))}
              {!batches.length && <tr><td colSpan={6} className="muted">Nessun batch ancora.</td></tr>}
            </tbody>
          </table>
        )}
        {tab === "acqua" && <RecipeWater recipe={recipe} canEdit={isAdmin} onSaved={setRecipe} />}
        {tab === "cottura" && <RecipeBrewDay recipe={recipe} />}
        {tab === "documenti" && <DocumentsPanel recipeId={recipe.id} />}
      </div>
    </div>
  );
}

function RecipeBrewDay({ recipe }: { recipe: Row }) {
  const [ings, setIngs] = useState<Row[]>([]);
  useEffect(() => {
    supabase.from("recipe_ingredients").select("*").eq("recipe_id", recipe.id).order("sort_order").then(({ data }) => setIngs(data ?? []));
  }, [recipe.id]);
  return (
    <BrewDay ingredients={ings} mashTemp={recipe.mash_temp_c} mashTime={recipe.mash_time_min} boilTime={recipe.boil_time_min}
      mashWater={recipe.mash_water_l} spargeWater={recipe.sparge_water_l} volume={recipe.batch_size_l} procedure={recipe.procedure} />
  );
}
