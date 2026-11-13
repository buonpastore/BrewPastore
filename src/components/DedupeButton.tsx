import { useState } from "react";
import { supabase, errMsg, type Row } from "../lib";
import { dedupeIngredients } from "../dedupe";

/** Toglie gli ingredienti doppi (stesso prodotto, quantità e momento). */
export function DedupeButton({ table, parentKey, parentId, onDone }: { table: string; parentKey: string; parentId: string; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      let q = supabase.from(table).select("*").eq(parentKey, parentId);
      if (table === "recipe_ingredients") q = q.order("sort_order");
      const { data, error } = await q;
      if (error) throw error;
      const { removed } = dedupeIngredients((data ?? []) as (Row & { name: string; category: string; quantity: number; unit: string })[]);
      if (!removed.length) { alert("Nessun ingrediente doppio 👍"); return; }
      const list = removed.map((r) => `• ${r.name} ${String(r.quantity).replace(".", ",")} ${r.unit}`).join("\n");
      if (!confirm(`Ho trovato ${removed.length} ${removed.length === 1 ? "ingrediente doppio" : "ingredienti doppi"}:\n${list}\n\nLi tolgo?`)) return;
      const del = await supabase.from(table).delete().in("id", removed.map((r) => r.id));
      if (del.error) throw del.error;
      onDone();
    } catch (e) { alert(errMsg(e)); } finally { setBusy(false); }
  };
  return <button className="mini-btn" disabled={busy} onClick={run} title="Togli gli ingredienti ripetuti">♊ <span>{busy ? "Controllo…" : "Togli doppioni"}</span></button>;
}
