import { createClient } from "@supabase/supabase-js";

// URL e chiave "publishable" sono pubblici per design: la sicurezza è nelle policy del database (RLS).
// Le variabili d'ambiente VITE_SUPABASE_* hanno la precedenza (utile per sviluppo/test).
const rawUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() || "https://yfinekpfymzpfhrlfpkz.supabase.co";
// accetta anche ".../rest/v1/" incollato per sbaglio
const url = rawUrl.replace(/\/(rest|auth)\/v1\/?$/, "").replace(/\/+$/, "");
const key = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() || "sb_publishable_7sKoSMI-AYzOWKgDx6nz4w_ko447jxG";
export const configured = Boolean(url && key);
export const supabase = createClient(url ?? "http://localhost", key ?? "missing");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Row = Record<string, any>;

export interface Profile {
  id: string;
  display_name: string;
  role: "admin" | "viewer";
}

export const STATUS_LABELS: Record<string, string> = {
  pianificato: "Pianificato",
  cotta: "In cotta",
  fermentazione: "In fermentazione",
  maturazione: "In maturazione",
  imbottigliato: "Imbottigliato",
  finito: "Finito",
};

export const MATERIAL_CATEGORIES = [
  "malto", "luppolo", "lievito", "sali_acqua", "additivo",
  "bottiglie", "tappi", "etichette", "detergenti", "altro",
];
export const UNITS = ["kg", "g", "l", "ml", "pz"];

export const TABLE_LABELS: Record<string, string> = {
  recipes: "Ricetta",
  recipe_ingredients: "Ingrediente ricetta",
  batches: "Batch",
  water_adjustments: "Correzione acqua",
  batch_ingredients: "Ingrediente batch",
  batch_events: "Diario batch",
  batch_costs: "Costo batch",
  materials: "Materia prima",
  purchases: "Acquisto",
  purchase_items: "Riga acquisto",
  documents: "Documento",
  expenses: "Spesa",
  expense_shares: "Quota spesa",
  settlements: "Rimborso",
  equipment_projects: "Progetto impianto",
  equipment_quotes: "Preventivo",
  equipment_quote_items: "Riga preventivo",
};

const eurFmt = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });
export const eur = (n: number | null | undefined) => (n == null || isNaN(Number(n)) ? "—" : eurFmt.format(Number(n)));
export const num = (n: number | null | undefined, d = 2) =>
  n == null ? "—" : Number(n).toLocaleString("it-IT", { maximumFractionDigits: d });
export const sg = (n: number | null | undefined) => (n == null ? "—" : Number(n).toFixed(3));
export const date = (s: string | null | undefined) => (s ? new Date(s).toLocaleDateString("it-IT") : "—");
export const dateTime = (s: string | null | undefined) =>
  s ? new Date(s).toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" }) : "—";

export function errMsg(e: unknown): string {
  if (!e) return "Errore sconosciuto";
  if (typeof e === "string") return e;
  if (typeof e === "object" && "message" in e) return String((e as { message: unknown }).message);
  return String(e);
}

/** Carica un file nel bucket "documents" e restituisce il path. */
export async function uploadFile(folder: string, file: File): Promise<string> {
  const safe = file.name.normalize("NFKD").replace(/[^\w.-]+/g, "_");
  const path = `${folder}/${Date.now()}_${safe}`;
  const { error } = await supabase.storage.from("documents").upload(path, file, { contentType: file.type || undefined });
  if (error) throw error;
  return path;
}

export async function openFile(path: string) {
  const { data, error } = await supabase.storage.from("documents").createSignedUrl(path, 300);
  if (error) throw error;
  window.open(data.signedUrl, "_blank", "noopener");
}

export interface ParsedItem {
  description: string;
  material_name: string;
  category: string;
  quantity: number;
  unit: string;
  total_price: number;
}
export interface ParsedDocument {
  supplier: string | null;
  date: string | null;
  invoice_number: string | null;
  currency: string;
  shipping_cost: number;
  total_amount: number | null;
  notes: string | null;
  items: ParsedItem[];
}

export interface ParsedRecipe {
  name: string | null;
  style: string | null;
  batch_size_l: number | null;
  boil_time_min: number | null;
  mash_temp_c: number | null;
  mash_time_min: number | null;
  target_og: number | null;
  target_fg: number | null;
  target_ibu: number | null;
  target_ebc: number | null;
  efficiency_pct: number | null;
  procedure: string | null;
  notes: string | null;
  ingredients: { name: string; category: string; quantity: number; unit: string; step: string | null }[];
}

/** Chiede alla Edge Function di leggere il documento con l'AI. */
export async function parseDocument(storagePath: string): Promise<ParsedDocument> {
  return invokeParser(storagePath, "purchase") as Promise<ParsedDocument>;
}
export async function parseRecipe(storagePath: string): Promise<ParsedRecipe> {
  return invokeParser(storagePath, "recipe") as Promise<ParsedRecipe>;
}

export interface ParsedQuote {
  supplier: string | null;
  date: string | null;
  valid_until: string | null;
  prices_include_vat: boolean;
  shipping_cost: number;
  notes: string | null;
  items: { code: string | null; description: string; category: string | null; quantity: number; unit_price: number; discount_pct: number; vat_pct: number }[];
}
export async function parseQuote(storagePath: string): Promise<ParsedQuote> {
  return invokeParser(storagePath, "quote") as Promise<ParsedQuote>;
}

async function invokeParser(storagePath: string, mode: string): Promise<unknown> {
  const { data, error } = await supabase.functions.invoke("parse-document", { body: { storage_path: storagePath, mode } });
  if (error) {
    // prova a leggere il messaggio d'errore restituito dalla funzione
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === "function") {
      const body = await ctx.json().catch(() => null);
      if (body?.error) throw new Error(body.error);
    }
    throw error;
  }
  return data.result;
}

/** Zucchero di priming suggerito (stima). T in °C, volume in litri. */
export const PRIMING_FACTORS: Record<string, number> = {
  // grammi per litro per 1 volume di CO2
  saccarosio: 3.94,
  destrosio: 4.3,
  miele: 4.8,
  dme: 5.6,
};
export function residualCo2(tempC: number) {
  const f = tempC * 9 / 5 + 32;
  return 3.0378 - 0.050062 * f + 0.00026555 * f * f;
}
export function primingGrams(volumeL: number, targetVol: number, tempC: number, sugar: string) {
  const factor = PRIMING_FACTORS[sugar] ?? PRIMING_FACTORS.saccarosio;
  const needed = Math.max(0, targetVol - residualCo2(tempC));
  return needed * factor * volumeL;
}

export function baseUnitFor(unit: string): "kg" | "l" | "pz" {
  const u = unit.toLowerCase();
  if (["l", "ml", "cl"].includes(u)) return "l";
  if (u === "pz") return "pz";
  return "kg";
}

/** Trova una materia prima per nome (case-insensitive) o la crea. Restituisce l'id. */
export async function findOrCreateMaterial(name: string, category: string, unit: string): Promise<string> {
  const clean = name.trim();
  const { data: found } = await supabase.from("materials").select("id").ilike("name", clean).limit(1);
  if (found?.length) return found[0].id;
  const cat = MATERIAL_CATEGORIES.includes(category) ? category : "altro";
  const { data, error } = await supabase.from("materials")
    .insert({ name: clean, category: cat, base_unit: baseUnitFor(unit) }).select("id").single();
  if (error) throw error;
  return data.id;
}

export async function loadMaterials(): Promise<Row[]> {
  const { data } = await supabase.from("materials").select("id, name, category, base_unit").order("name");
  return data ?? [];
}
