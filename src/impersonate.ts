import { supabase } from "./lib";

/* L'amministratore entra nella app come un altro utente e poi torna a sé stesso.
   La sessione dell'amministratore viene messa da parte su questo dispositivo e ripristinata con «Torna». */
const KEY = "pastorizia-admin-session";

export function adminBackup(): { name: string } | null {
  try { const v = JSON.parse(localStorage.getItem(KEY) ?? "null"); return v ? { name: v.name } : null; } catch { return null; }
}

export async function loginAs(userId: string, adminName: string) {
  const { data: cur } = await supabase.auth.getSession();
  if (!cur.session) throw new Error("Sessione non valida");
  // la funzione può chiamarsi «impersonate» o «Impersonate» (il nome su Supabase distingue le maiuscole)
  let res = await supabase.functions.invoke("impersonate", { body: { user_id: userId } });
  const st = (res.error as { context?: Response } | null)?.context?.status;
  if (res.error && (st === 404 || (res.error as { name?: string }).name === "FunctionsFetchError")) res = await supabase.functions.invoke("Impersonate", { body: { user_id: userId } });
  const { data, error } = res;
  if (error) {
    const ctx = (error as { context?: Response }).context;
    let msg = "";
    try { msg = ctx ? (await ctx.json()).error : ""; } catch { /* niente */ }
    if ((error as { name?: string }).name === "FunctionsFetchError" || ctx?.status === 404 || /not found|404/i.test(String(error.message) + msg))
      throw new Error("La funzione «impersonate» non è ancora installata su Supabase .");
    throw new Error(msg || error.message);
  }
  if (!data?.token_hash) throw new Error(data?.error ?? "Risposta non valida");
  // metto da parte la mia sessione di amministratore
  if (!adminBackup()) localStorage.setItem(KEY, JSON.stringify({ name: adminName, access_token: cur.session.access_token, refresh_token: cur.session.refresh_token }));
  const { error: e2 } = await supabase.auth.verifyOtp({ token_hash: data.token_hash, type: "magiclink" });
  if (e2) { localStorage.removeItem(KEY); throw e2; }
  // ricarico l'app da zero: così ogni pagina (saldi, spese, task…) è calcolata per il nuovo utente
  window.location.hash = "#/";
  window.location.reload();
}

export async function backToAdmin() {
  const raw = localStorage.getItem(KEY);
  if (!raw) return;
  const s = JSON.parse(raw);
  localStorage.removeItem(KEY);
  await supabase.auth.signOut({ scope: "local" });
  const { error } = await supabase.auth.setSession({ access_token: s.access_token, refresh_token: s.refresh_token });
  if (error) alert("La sessione dell'amministratore è scaduta: rientra con email e password.");
  window.location.hash = "#/impostazioni";
  window.location.reload();
}
