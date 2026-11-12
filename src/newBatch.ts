import { supabase, type Row } from "./lib";

/** Crea un batch da una ricetta: copia acqua e ingredienti. Restituisce l'id del nuovo batch. */
export async function createBatchFromRecipe(recipe: Row): Promise<string> {
  const { count } = await supabase.from("batches").select("id", { count: "exact", head: true }).eq("recipe_id", recipe.id);
  const code = `${recipe.name} #${(count ?? 0) + 1}`;
  const { data: b, error } = await supabase.from("batches").insert({
    recipe_id: recipe.id, code, mash_water_l: recipe.mash_water_l ?? null, sparge_water_l: recipe.sparge_water_l ?? null,
  }).select().single();
  if (error) throw error;
  const { data: ings } = await supabase.from("recipe_ingredients").select("*").eq("recipe_id", recipe.id).order("sort_order");
  if (ings?.length) {
    await supabase.from("batch_ingredients").insert(ings.map((i) => ({
      batch_id: b.id, material_id: i.material_id, name: i.name, category: i.category, quantity: i.quantity, unit: i.unit, step: i.step,
    })));
  }
  return b.id;
}
