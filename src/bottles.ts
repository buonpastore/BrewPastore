/* Bottiglie: cantine dei soci (cellar_bottles) e fondo birre in comune (common_bottles), con le prenotazioni delle proposte. */
import { supabase, type Row } from "./lib";

/** Chi dà le bottiglie: l'id di un socio oppure il fondo birre. */
export const FONDO = "fondo";
export const NEED_0032 = "Per il fondo birre e le proposte di vendita esegui 0032_fondo_birre_proposte.sql nello SQL Editor di Supabase.";
export const isBottlesMissing = (m: string) => /common_bottles|sale_proposal|from_fund|schema cache/i.test(m);

/** Aggiunge (delta > 0) o toglie (delta < 0) bottiglie, dalla cantina di un socio o dal fondo; mai sotto zero. */
export async function moveBottles(changes: { user: string; batch: string; delta: number }[]) {
  const sum = new Map<string, { user: string; batch: string; delta: number }>();
  for (const c of changes) {
    if (!c.batch || !c.delta) continue;
    const k = `${c.user}|${c.batch}`;
    const cur = sum.get(k) ?? { user: c.user, batch: c.batch, delta: 0 };
    cur.delta += c.delta; sum.set(k, cur);
  }
  for (const c of sum.values()) {
    if (!c.delta) continue;
    if (c.user === FONDO) {
      const { data } = await supabase.from("common_bottles").select("bottles").eq("batch_id", c.batch).maybeSingle();
      const next = Math.max(0, Number(data?.bottles ?? 0) + c.delta);
      const { error } = await supabase.from("common_bottles").upsert({ batch_id: c.batch, bottles: next, updated_at: new Date().toISOString() });
      if (error) throw error;
    } else {
      const { data } = await supabase.from("cellar_bottles").select("bottles").eq("user_id", c.user).eq("batch_id", c.batch).maybeSingle();
      const next = Math.max(0, Number(data?.bottles ?? 0) + c.delta);
      const { error } = await supabase.from("cellar_bottles").upsert({ user_id: c.user, batch_id: c.batch, bottles: next, updated_at: new Date().toISOString() });
      if (error) throw error;
    }
  }
}

/** Tutte le bottiglie: «socio|batch» e «fondo|batch» → quante. */
export async function loadStock(): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  const [{ data: c }, { data: f }] = await Promise.all([
    supabase.from("cellar_bottles").select("user_id, batch_id, bottles"),
    supabase.from("common_bottles").select("batch_id, bottles"),
  ]);
  for (const r of c ?? []) out[`${r.user_id}|${r.batch_id}`] = Number(r.bottles);
  for (const r of f ?? []) out[`${FONDO}|${r.batch_id}`] = Number(r.bottles);
  return out;
}

/** Bottiglie prenotate dalle proposte aperte (confermate da chi le dà): «socio|batch» o «fondo|batch» → quante. */
export async function loadReserved(): Promise<Record<string, number>> {
  const { data } = await supabase.from("sale_proposals").select("status, sale_proposal_items(batch_id, bottles, giver_id, from_fund, giver_status)").eq("status", "aperta");
  const out: Record<string, number> = {};
  for (const p of data ?? []) for (const i of (p.sale_proposal_items ?? []) as Row[]) {
    if (i.giver_status !== "ok" || !i.batch_id) continue;
    const k = `${i.from_fund ? FONDO : i.giver_id}|${i.batch_id}`;
    out[k] = (out[k] ?? 0) + Number(i.bottles);
  }
  return out;
}
