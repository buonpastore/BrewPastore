// Supabase Edge Function: legge una fattura/scontrino/email (PDF, immagine, .eml, testo)
// oppure una ricetta (mode: "recipe", es. screenshot di una chat AI) o un preventivo impianto (mode: "quote") e restituisce i dati strutturati. NON salva nulla: l'utente conferma nella app.
//
// Deploy:  supabase functions deploy parse-document
// Secret:  supabase secrets set ANTHROPIC_API_KEY=...
import Anthropic from "npm:@anthropic-ai/sdk";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MAX_BYTES = 20 * 1024 * 1024;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["supplier", "date", "invoice_number", "currency", "shipping_cost", "total_amount", "items", "notes"],
  properties: {
    supplier: { type: ["string", "null"], description: "Nome del fornitore/negozio" },
    date: { type: ["string", "null"], description: "Data documento in formato YYYY-MM-DD" },
    invoice_number: { type: ["string", "null"] },
    currency: { type: "string" },
    shipping_cost: { type: "number", description: "Spese di spedizione IVA inclusa, 0 se assenti" },
    total_amount: { type: ["number", "null"], description: "Totale documento IVA inclusa" },
    notes: { type: ["string", "null"], description: "Sconti, avvertenze, righe non chiare" },
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["code", "description", "material_name", "category", "quantity", "unit", "total_price"],
        properties: {
          code: { type: ["string", "null"], description: "Codice articolo del fornitore, se presente" },
          description: { type: "string", description: "Descrizione riga così come appare" },
          material_name: { type: "string", description: "Nome normalizzato breve, es. 'Malto Pilsner Weyermann', 'Luppolo Citra pellet', 'Lievito US-05'" },
          category: {
            type: "string",
            enum: ["malto", "luppolo", "lievito", "sali_acqua", "additivo", "bottiglie", "tappi", "etichette", "detergenti", "altro"],
          },
          quantity: { type: "number", description: "Quantità TOTALE della riga (confezioni x peso). Es. 2 buste da 100 g => 200" },
          unit: { type: "string", enum: ["kg", "g", "l", "ml", "pz"] },
          total_price: { type: "number", description: "Prezzo totale della riga IVA inclusa, dopo eventuali sconti di riga" },
        },
      },
    },
  },
} as const;

const RECIPE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["name", "style", "batch_size_l", "boil_time_min", "mash_temp_c", "mash_time_min",
             "target_og", "target_fg", "target_ibu", "target_ebc", "efficiency_pct", "procedure", "notes", "ingredients"],
  properties: {
    name: { type: ["string", "null"] },
    style: { type: ["string", "null"] },
    batch_size_l: { type: ["number", "null"] },
    boil_time_min: { type: ["number", "null"] },
    mash_temp_c: { type: ["number", "null"], description: "Temperatura principale di mash" },
    mash_time_min: { type: ["number", "null"] },
    target_og: { type: ["number", "null"], description: "OG come densità, es. 1.052 (converti da °Plato se serve)" },
    target_fg: { type: ["number", "null"] },
    target_ibu: { type: ["number", "null"] },
    target_ebc: { type: ["number", "null"], description: "Colore in EBC (SRM x 1.97)" },
    efficiency_pct: { type: ["number", "null"] },
    procedure: { type: ["string", "null"], description: "Passaggi di processo (step mash, fermentazione, dry hop...) come testo a punti" },
    notes: { type: ["string", "null"] },
    ingredients: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "category", "quantity", "unit", "step"],
        properties: {
          name: { type: "string", description: "Es. 'Malto Pilsner', 'Luppolo Citra (12% AA)', 'Lievito US-05'" },
          category: { type: "string", enum: ["malto", "luppolo", "lievito", "sali_acqua", "additivo", "altro"] },
          quantity: { type: "number" },
          unit: { type: "string", enum: ["kg", "g", "l", "ml", "pz"] },
          step: { type: ["string", "null"], description: "Quando si aggiunge: 'mash', '60 min', '10 min', 'whirlpool 80°C', 'dry hop giorno 4', 'inoculo'..." },
        },
      },
    },
  },
} as const;

const RECIPE_PROMPT = `Sei l'assistente di un piccolo birrificio casalingo italiano. L'immagine/documento contiene una
ricetta di birra (spesso è lo screenshot di una conversazione con un assistente AI, oppure un foglio di calcolo o una pagina web).
Estrai la ricetta completa. Regole:
- Elenca TUTTI gli ingredienti: malti, luppoli (con il momento di aggiunta), lievito, sali e acidi per l'acqua, additivi.
- Se lo stesso luppolo è usato in momenti diversi, crea una riga per ogni aggiunta.
- Mantieni le quantità e le unità della ricetta (kg/g/l/ml/pz). Lieviti a unità: una bustina = 1 pz.
- L'avena (anche in fiocchi) va nella categoria "altro", non "malto".
- Se la ricetta propone alternative, scegli la prima e segnala le alternative in notes.
- Per lo stile usa, se corrisponde, uno di questi nomi esatti: IPA, Weiss, Blanche, Dubbel, APA, English Ale, Winter Ale, Bock,
  Doppelbock, Pilsner, Helles, Lager, Märzen, Dunkel, Schwarzbier, Vienna Lager, Rauchbier, Bitter, Golden Ale, Brown Ale,
  Irish Red Ale, Porter, Stout, Imperial Stout, Barley Wine, Scotch Ale, American Amber Ale, Session IPA, Double IPA, NEIPA,
  Black IPA, Cream Ale, Tripel, Quadrupel, Belgian Strong Ale, Saison, Belgian Blonde, Kölsch, Altbier, Dunkelweizen,
  Weizenbock, Berliner Weisse, Gose, Lambic, Sour Ale, Italian Grape Ale, Birra alla frutta. Altrimenti scrivi lo stile com'è.
- Se un dato manca usa null; non inventare valori.`;

const QUOTE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["supplier", "date", "valid_until", "prices_include_vat", "shipping_cost", "notes", "items"],
  properties: {
    supplier: { type: ["string", "null"] },
    date: { type: ["string", "null"], description: "YYYY-MM-DD" },
    valid_until: { type: ["string", "null"], description: "Scadenza offerta YYYY-MM-DD" },
    prices_include_vat: { type: "boolean", description: "true se i prezzi unitari indicati sono IVA inclusa" },
    shipping_cost: { type: "number", description: "Trasporto/installazione se indicati a parte, 0 altrimenti" },
    notes: { type: ["string", "null"], description: "Condizioni, tempi di consegna, sconti globali, punti poco chiari" },
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["code", "description", "category", "quantity", "unit_price", "discount_pct", "vat_pct"],
        properties: {
          code: { type: ["string", "null"], description: "Codice articolo se presente" },
          description: { type: "string" },
          category: { type: ["string", "null"], description: "es. pentola, fermentatore, pompa, scambiatore, controllo, accessori, servizio" },
          quantity: { type: "number" },
          unit_price: { type: "number", description: "Prezzo unitario PRIMA dello sconto di riga, così come indicato" },
          discount_pct: { type: "number", description: "Sconto di riga in %, 0 se assente" },
          vat_pct: { type: "number", description: "Aliquota IVA, 22 se non indicata" },
        },
      },
    },
  },
} as const;

const QUOTE_PROMPT = `Sei l'assistente di un piccolo birrificio casalingo italiano che valuta l'ampliamento dell'impianto.
Il documento è un preventivo/offerta di un fornitore di attrezzature (screenshot, foto, PDF o email). Estrai fornitore,
date e TUTTE le righe d'offerta. Regole:
- Riporta il prezzo unitario come scritto e l'eventuale sconto di riga separatamente.
- Indica se i prezzi sono IVA inclusa o esclusa (prices_include_vat).
- Trasporto, installazione o spese accessorie indicate a parte vanno in shipping_cost, non come righe.
- Se c'è uno sconto globale, segnalalo in notes.
- Se un dato manca usa null; non inventare.`;

const PROMPT = `Sei l'assistente di un piccolo birrificio casalingo italiano. Estrai i dati da questo documento
di acquisto (fattura, conferma d'ordine, email, scontrino). Regole:
- Prezzi sempre IVA inclusa: se il documento riporta imponibile + IVA, calcola il lordo per ogni riga.
- Se c'è uno sconto sull'intero ordine, ripartiscilo proporzionalmente sulle righe e segnalalo in notes.
- Quantità: converti in quantità totale (numero confezioni x contenuto). Usa kg/g per solidi, l/ml per liquidi, pz per oggetti.
- Le spese di spedizione vanno in shipping_cost e NON come riga.
- Categorie: l'avena (anche in fiocchi) va in "altro", non in "malto". I lieviti vanno a unità: quantità = numero di bustine/confezioni, unità "pz".
- Se il documento è uno screenshot di un carrello o di un listino, usa i prezzi mostrati (IVA inclusa se è un negozio online per privati).
- Se un dato manca usa null; non inventare.`;

function b64(bytes: Uint8Array): string {
  let s = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) s += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(s);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

  try {
    const auth = req.headers.get("Authorization");
    if (!auth) return json({ error: "Non autenticato" }, 401);

    // client con il token dell'utente: rispetta le policy RLS dello storage
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: auth } },
    });
    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData.user) return json({ error: "Non autenticato" }, 401);

    const body = await req.json();
    const mode = body.mode;
    const isRecipe = mode === "recipe";
    const isQuote = mode === "quote";
    // uno o più file (es. più screenshot dello stesso ordine)
    const paths: string[] = Array.isArray(body.storage_paths) ? body.storage_paths : body.storage_path ? [body.storage_path] : [];
    if (!paths.length || paths.some((p) => typeof p !== "string" || !p)) return json({ error: "storage_path mancante" }, 400);
    if (paths.length > 10) return json({ error: "Massimo 10 file per volta" }, 400);

    // deno-lint-ignore no-explicit-any
    const docBlocks: any[] = [];
    let totalBytes = 0;
    for (const storage_path of paths) {
      const { data: file, error: dlErr } = await supabase.storage.from("documents").download(storage_path);
      if (dlErr || !file) return json({ error: "File non trovato: " + (dlErr?.message ?? storage_path) }, 404);
      totalBytes += file.size;
      if (file.size > MAX_BYTES || totalBytes > MAX_BYTES) return json({ error: "File troppo grandi (max 20 MB in totale)" }, 413);

      const bytes = new Uint8Array(await file.arrayBuffer());
      const name = storage_path.toLowerCase();
      const mime = file.type || "";
      if (mime === "application/pdf" || name.endsWith(".pdf")) {
        docBlocks.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: b64(bytes) } });
      } else if (/^image\/(png|jpeg|gif|webp)$/.test(mime) || /\.(png|jpe?g|gif|webp)$/.test(name)) {
        const ext = name.split(".").pop()!;
        const mt = mime.startsWith("image/") ? mime : `image/${ext === "jpg" ? "jpeg" : ext}`;
        docBlocks.push({ type: "image", source: { type: "base64", media_type: mt, data: b64(bytes) } });
      } else {
        // .eml, .txt, .html: passiamo il testo
        const text = new TextDecoder().decode(bytes).slice(0, 200_000);
        docBlocks.push({ type: "text", text: `Contenuto del documento (${storage_path}):\n\n${text}` });
      }
    }
    const multi = paths.length > 1
      ? `\n\nATTENZIONE: i ${paths.length} file sono parti dello STESSO documento (es. più screenshot di un unico ordine). Uniscili in un solo risultato e non duplicare le righe che compaiono in due screenshot sovrapposti.`
      : "";

    const client = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY") });
    const response = await client.beta.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { format: { type: "json_schema", schema: isRecipe ? RECIPE_SCHEMA : isQuote ? QUOTE_SCHEMA : SCHEMA } },
      messages: [{ role: "user", content: [...docBlocks, { type: "text", text: (isRecipe ? RECIPE_PROMPT : isQuote ? QUOTE_PROMPT : PROMPT) + multi }] }],
    });

    if (response.stop_reason === "refusal") return json({ error: "Il documento non può essere analizzato" }, 422);
    if (response.stop_reason === "max_tokens") return json({ error: "Documento troppo lungo da analizzare" }, 422);

    const text = response.content.find((b) => b.type === "text");
    if (!text || text.type !== "text") return json({ error: "Nessun risultato" }, 502);
    return json({ result: JSON.parse(text.text) });
  } catch (e) {
    if (e instanceof Anthropic.APIError) {
      return json({ error: `Errore servizio AI (${e.status}): ${e.message}` }, 502);
    }
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
