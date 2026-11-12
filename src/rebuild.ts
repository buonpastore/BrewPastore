import { supabase, findOrCreateMaterial, type Row } from "./lib";
import { parseOrderText } from "./textParser";

export interface RebuildReport { ok: string[]; skipped: string[]; errors: string[] }

/** Rilegge gli acquisti dai documenti di testo salvati e ne sostituisce le righe. */
export async function rebuildPurchasesFromDocuments(onProgress?: (msg: string) => void): Promise<RebuildReport> {
  const rep: RebuildReport = { ok: [], skipped: [], errors: [] };
  const { data: purchases, error } = await supabase.from("purchases").select("*").order("purchase_date");
  if (error) throw error;
  for (const p of (purchases ?? []) as Row[]) {
    const label = `${p.supplier} del ${new Date(p.purchase_date).toLocaleDateString("it-IT")}`;
    onProgress?.(`Rileggo ${label}…`);
    const { data: docs } = await supabase.from("documents").select("*").eq("purchase_id", p.id);
    const textDocs = (docs ?? []).filter((d) => (d.mime_type ?? "").startsWith("text/") || /\.(txt|eml|html?)$/i.test(d.storage_path));
    if (!textDocs.length) {
      rep.skipped.push(`${label}: ${docs?.length ? "documento non di testo (PDF/foto: serve l'AI)" : "nessun documento salvato"}`);
      continue;
    }
    try {
      const texts: string[] = [];
      for (const d of textDocs) {
        const { data: blob, error: de } = await supabase.storage.from("documents").download(d.storage_path);
        if (de || !blob) throw new Error("documento non scaricabile");
        texts.push(await blob.text());
      }
      const parsed = parseOrderText(texts.join("\n"));
      if (!parsed.items.length) { rep.skipped.push(`${label}: nessuna riga riconosciuta nel testo`); continue; }
      const rows = [];
      for (const it of parsed.items) {
        const material_id = await findOrCreateMaterial(it.material_name, it.category, it.unit);
        rows.push({
          purchase_id: p.id, material_id, description: it.code ? `[${it.code}] ${it.description}` : it.description,
          quantity: it.quantity, unit: it.unit, total_price: it.total_price,
        });
      }
      const { error: delErr } = await supabase.from("purchase_items").delete().eq("purchase_id", p.id);
      if (delErr) throw delErr;
      const { error: insErr } = await supabase.from("purchase_items").insert(rows);
      if (insErr) throw insErr;
      const patch: Row = {};
      if (parsed.supplier && parsed.supplier !== p.supplier) patch.supplier = parsed.supplier;
      if (parsed.date) patch.purchase_date = parsed.date;
      if (parsed.shipping_cost && !Number(p.shipping_cost)) patch.shipping_cost = parsed.shipping_cost;
      if (Object.keys(patch).length) await supabase.from("purchases").update(patch).eq("id", p.id);
      const tot = rows.reduce((s, r) => s + r.total_price, 0);
      rep.ok.push(`${label}: ${rows.length} righe, ${tot.toLocaleString("it-IT", { style: "currency", currency: "EUR" })}`);
    } catch (e) {
      rep.errors.push(`${label}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return rep;
}

/** Elimina le materie prime senza nessun acquisto (es. create importando una ricetta o rimaste da import sbagliati). */
export async function deleteMaterialsWithoutPurchases(): Promise<number> {
  const { data: costs, error } = await supabase.from("material_costs").select("material_id, purchases_count");
  if (error) throw error;
  const ids = (costs ?? []).filter((c) => Number(c.purchases_count) === 0).map((c) => c.material_id);
  if (!ids.length) return 0;
  const { error: e2 } = await supabase.from("materials").delete().in("id", ids);
  if (e2) throw e2;
  return ids.length;
}
