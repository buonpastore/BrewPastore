/* Fondo cassa: i soldi in comune (entrate dalle vendite, uscite per acquisti e spese, versamenti e prelievi). */
import { supabase, type Row } from "./lib";

export const NEED_0030 = "Per il fondo cassa esegui 0030_fondo_cassa.sql nello SQL Editor di Supabase.";
export const isCashMissing = (m: string) => /cash_movements|giver_id|sales_split_check|schema cache/i.test(m);

export async function loadCash(): Promise<{ rows: Row[]; error: string }> {
  const { data, error } = await supabase.from("cash_movements").select("*").order("moved_on", { ascending: false }).order("created_at", { ascending: false });
  if (error) return { rows: [], error: isCashMissing(error.message) ? NEED_0030 : error.message };
  return { rows: data ?? [], error: "" };
}
export const cashBalance = (rows: Row[]) => Math.round(rows.reduce((t, r) => t + Number(r.amount), 0) * 100) / 100;

type Link = { sale_id?: string; purchase_id?: string; expense_id?: string };

/** Il movimento collegato a una vendita/acquisto/spesa: lo sostituisce (o lo toglie se l'importo è 0). */
export async function setLinkedCash(link: Link, o: { amount: number; kind: string; description: string; day: string }) {
  const [k, v] = Object.entries(link)[0] as [string, string];
  const del = await supabase.from("cash_movements").delete().eq(k, v);
  if (del.error) throw del.error;
  const amount = Math.round(o.amount * 100) / 100;
  if (!amount) return;
  const { error } = await supabase.from("cash_movements").insert({ ...link, amount, kind: o.kind, description: o.description, moved_on: o.day });
  if (error) throw error;
}

/** Movimento a mano (versamento dei soci, prelievo, correzione). */
export async function addCash(o: { amount: number; kind: string; description: string; day: string }) {
  const { error } = await supabase.from("cash_movements").insert({ amount: Math.round(o.amount * 100) / 100, kind: o.kind, description: o.description, moved_on: o.day });
  if (error) throw error;
}
