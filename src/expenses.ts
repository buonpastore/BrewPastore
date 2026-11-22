/* Spese condivise create da altre sezioni (es. un ordine di materie prime). */
import { supabase, date } from "./lib";

export type Split = "soci" | "io";

/** Crea la spesa di un ordine: pagata da «paidBy», divisa in parti uguali tra tutti i soci oppure solo sua.
    È collegata all'ordine (purchase_id) e, se c'è, al documento dell'ordine come allegato. */
export async function expenseFromPurchase(o: {
  purchaseId: string; supplier: string; day: string; amount: number; paidBy: string; split: Split; members: string[]; receiptPath?: string | null;
}): Promise<void> {
  const total = Math.round(o.amount * 100) / 100;
  if (!(total > 0)) throw new Error("L'ordine non ha un importo: impossibile metterlo nelle spese");
  const who = o.split === "soci" ? (o.members.length ? o.members : [o.paidBy]) : [o.paidBy];
  const { data, error } = await supabase.from("expenses").insert({
    description: `Materie prime · ordine ${o.supplier} del ${date(o.day)}`, amount: total, expense_date: o.day,
    paid_by: o.paidBy, purchase_id: o.purchaseId, receipt_path: o.receiptPath ?? null,
  }).select().single();
  if (error) throw error;
  // parti uguali: i centesimi di resto li prende chi ha pagato
  const each = Math.floor((total / who.length) * 100) / 100;
  const rest = Math.round((total - each * who.length) * 100) / 100;
  const rows = who.map((id) => ({ expense_id: data.id, user_id: id, amount: Math.round((each + (id === o.paidBy || (!who.includes(o.paidBy) && id === who[0]) ? rest : 0)) * 100) / 100 }));
  const { error: e2 } = await supabase.from("expense_shares").insert(rows);
  if (e2) throw e2;
}
