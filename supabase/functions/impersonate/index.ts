// Supabase Edge Function «impersonate»: l'amministratore entra nella app come un altro utente.
// Controlla che chi chiama sia admin, poi genera un accesso monouso (magic link) per l'utente scelto
// e restituisce solo il codice: la app lo usa subito per cambiare sessione. Nessuna email viene inviata.
//
// Deploy: Supabase → Edge Functions → Deploy a new function → Via editor → nome «impersonate» → incolla questo file.
// SUPABASE_URL, SUPABASE_ANON_KEY e SUPABASE_SERVICE_ROLE_KEY sono già disponibili nelle Edge Functions.
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const auth = req.headers.get("Authorization") ?? "";
    // chi sta chiamando?
    const caller = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
    const { data: me } = await caller.auth.getUser();
    if (!me?.user) return json({ error: "Non autenticato" }, 401);
    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
    const { data: prof } = await admin.from("profiles").select("role").eq("id", me.user.id).single();
    if (prof?.role !== "admin") return json({ error: "Solo l'amministratore può entrare come un altro utente" }, 403);

    const { user_id } = await req.json();
    if (!user_id) return json({ error: "Manca l'utente" }, 400);
    const { data: target, error: e1 } = await admin.auth.admin.getUserById(user_id);
    if (e1 || !target?.user?.email) return json({ error: "Utente non trovato" }, 404);
    const { data: link, error: e2 } = await admin.auth.admin.generateLink({ type: "magiclink", email: target.user.email });
    if (e2) return json({ error: e2.message }, 500);
    return json({ token_hash: link.properties.hashed_token, email: target.user.email });
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});
