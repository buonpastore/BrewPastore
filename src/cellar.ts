import { supabase, type Row } from "./lib";

/** Una birra è «prodotta» quando il batch è imbottigliato (o finito). */
export const isProduced = (b: Row) => b.status === "imbottigliato" || b.status === "finito";

/** Batch prodotti, dal più recente, con nome e stile della ricetta. */
export async function loadProduced(): Promise<Row[]> {
  const { data } = await supabase.from("batches").select("id, code, status, bottling_date, cap_color, brew_date, recipe_id, recipes(name, style)")
    .order("bottling_date", { ascending: false, nullsFirst: false });
  return (data ?? []).filter(isProduced);
}

/** Bottiglie in cantina di tutti (null se la tabella non c'è ancora: manca 0018). */
export async function loadCellar(): Promise<Row[] | null> {
  const { data, error } = await supabase.from("cellar_bottles").select("*");
  if (error) return null;
  return data ?? [];
}

export const NEED_0018 = "Per la cantina esegui prima 0018_cantina.sql su Supabase";
