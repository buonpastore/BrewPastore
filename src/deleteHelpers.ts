import { supabase } from "./lib";

async function count(table: string, col: string, ids: string[]) {
  if (!ids.length) return 0;
  const { count } = await supabase.from(table).select("id", { count: "exact", head: true }).in(col, ids);
  return count ?? 0;
}

/** Riepilogo di cosa verrà eliminato insieme a una ricetta o a dei batch. */
export async function deletionSummary(recipeId: string | null, batchIds: string[]) {
  const rid = recipeId ? [recipeId] : [];
  const [ingredienti, batchIngredienti, eventi, costi, correzioni, degustazioni, msgR, msgB, docR, docB] = await Promise.all([
    count("recipe_ingredients", "recipe_id", rid),
    count("batch_ingredients", "batch_id", batchIds),
    count("batch_events", "batch_id", batchIds),
    count("batch_costs", "batch_id", batchIds),
    count("water_adjustments", "batch_id", batchIds),
    count("tastings", "batch_id", batchIds),
    count("messages", "recipe_id", rid),
    count("messages", "batch_id", batchIds),
    count("documents", "recipe_id", rid),
    count("documents", "batch_id", batchIds),
  ]);
  return {
    batch: batchIds.length, ingredienti: ingredienti + batchIngredienti, "voci di diario": eventi, costi,
    "correzioni acqua": correzioni, degustazioni, messaggi: msgR + msgB, documenti: docR + docB,
  };
}

async function removeDocuments(col: "recipe_id" | "batch_id", ids: string[]) {
  if (!ids.length) return;
  const { data: docs, error } = await supabase.from("documents").select("id, storage_path").in(col, ids);
  if (error) throw error;
  if (docs?.length) {
    await supabase.storage.from("documents").remove(docs.map((d) => d.storage_path));
    const { error: e2 } = await supabase.from("documents").delete().in("id", docs.map((d) => d.id));
    if (e2) throw e2;
  }
}

/** Elimina dei batch con tutti i dati collegati (le tabelle figlie si cancellano in cascata). */
export async function deleteBatches(batchIds: string[]) {
  if (!batchIds.length) return;
  await removeDocuments("batch_id", batchIds);
  const { error } = await supabase.from("batches").delete().in("id", batchIds);
  if (error) throw error;
}

/** Elimina una ricetta, i suoi batch e tutti i dati collegati. */
export async function deleteRecipe(recipeId: string) {
  const { data: batches, error } = await supabase.from("batches").select("id").eq("recipe_id", recipeId);
  if (error) throw error;
  await deleteBatches((batches ?? []).map((b) => b.id));
  await removeDocuments("recipe_id", [recipeId]);
  const { error: e2 } = await supabase.from("recipes").delete().eq("id", recipeId);
  if (e2) throw e2;
}
