import { supabase, type Row } from "./lib";

/** Una birra c'è (si beve, si degusta, va sulla ruota) dall'imbottigliamento in poi, finché non è esaurita. */
const EARLY = ["pianificato", "cotta", "fermentazione"];
export const isProduced = (b: Row, tasted?: Set<string>) => b.status !== "esaurito" && (
  ["imbottigliato", "degustato", "finito"].includes(b.status) || Boolean(tasted?.has(b.id))
  // una data di imbottigliamento conta solo se il batch non è ancora in cotta/fermentazione
  || (!EARLY.includes(b.status) && (Boolean(b.bottling_date) || Boolean(b.first_tasting_date))));

/** Id dei batch già degustati (se una birra è stata degustata, è imbottigliata). */
export async function loadTasted(): Promise<Set<string>> {
  const { data } = await supabase.from("tastings").select("batch_id");
  return new Set((data ?? []).map((t) => t.batch_id).filter(Boolean));
}

/** Batch prodotti, dall'ultimo inserito, con nome e stile della ricetta. */
export async function loadProduced(): Promise<Row[]> {
  const [{ data }, tasted] = await Promise.all([
    supabase.from("batches").select("id, code, status, bottling_date, first_tasting_date, cap_color, brew_date, created_at, recipe_id, recipes(name, style)")
      .order("created_at", { ascending: false }),
    loadTasted(),
  ]);
  return (data ?? []).filter((b) => isProduced(b, tasted));
}

/** Bottiglie in cantina di tutti (null se la tabella non c'è ancora: manca 0018). */
export async function loadCellar(): Promise<Row[] | null> {
  const { data, error } = await supabase.from("cellar_bottles").select("*");
  if (error) return null;
  return data ?? [];
}

export const NEED_0018 = "Per la cantina esegui prima 0018_cantina.sql su Supabase";
