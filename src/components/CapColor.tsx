import { useEffect, useId, useState } from "react";
import { Link } from "react-router-dom";
import { supabase, errMsg, date, type Row } from "../lib";

export interface CapColor { key: string; label: string; hex: string }
/** Colori disponibili all'inizio (se la tabella cap_colors non c'è ancora). */
export const DEFAULT_CAPS: CapColor[] = [
  { key: "rosso", label: "Rosso", hex: "#c62828" },
  { key: "arancio", label: "Arancione", hex: "#ef7d1a" },
  { key: "giallo", label: "Giallo", hex: "#f5d300" },
  { key: "verde", label: "Verde", hex: "#2e9d3a" },
  { key: "bianco", label: "Bianco", hex: "#f6f3ec" },
];
/** Tavolozza per riconoscere anche colori salvati in passato (sono colori "reali" dei tappi, non della grafica dell'app). */
export const CAP_COLORS: CapColor[] = [
  { key: "oro", label: "Oro", hex: "#d4a72c" },
  { key: "argento", label: "Argento", hex: "#c0c4c8" },
  { key: "bronzo", label: "Bronzo", hex: "#a0673a" },
  { key: "rosso", label: "Rosso", hex: "#c62828" },
  { key: "arancio", label: "Arancio", hex: "#ef7d1a" },
  { key: "giallo", label: "Giallo", hex: "#f5d300" },
  { key: "verde", label: "Verde", hex: "#2e9d3a" },
  { key: "celeste", label: "Celeste", hex: "#5ec3ef" },
  { key: "blu", label: "Blu", hex: "#1f4fbf" },
  { key: "viola", label: "Viola", hex: "#7b3fb5" },
  { key: "rosa", label: "Rosa", hex: "#ec6fa8" },
  { key: "marrone", label: "Marrone", hex: "#5d3a1e" },
  { key: "bianco", label: "Bianco", hex: "#f6f3ec" },
  { key: "nero", label: "Nero", hex: "#151515" },
];
// colori configurati (tabella cap_colors), caricati una volta e condivisi
let cache: CapColor[] | null = null;
const listeners = new Set<(c: CapColor[]) => void>();
export async function loadCapColors(force = false): Promise<CapColor[]> {
  if (cache && !force) return cache;
  const { data, error } = await supabase.from("cap_colors").select("key, label, hex, sort_order").order("sort_order");
  cache = error || !data?.length ? DEFAULT_CAPS : data.map((d) => ({ key: d.key, label: d.label, hex: d.hex }));
  listeners.forEach((f) => f(cache!));
  return cache;
}
export function useCapColors(): CapColor[] {
  const [list, setList] = useState<CapColor[]>(cache ?? DEFAULT_CAPS);
  useEffect(() => { listeners.add(setList); loadCapColors().then(setList); return () => { listeners.delete(setList); }; }, []);
  return list;
}
export const capInfo = (k?: string | null) => (cache ?? []).find((c) => c.key === k) ?? CAP_COLORS.find((c) => c.key === k) ?? DEFAULT_CAPS.find((c) => c.key === k) ?? null;

/** Tappo a corona stilizzato: solo il bordo esterno, appena dentellato, nel colore del tappo. */
export function CapIcon({ hex, size = 24, unknown = false, title }: { hex: string; size?: number; unknown?: boolean; title?: string }) {
  const teeth = 21, pts: string[] = [];
  for (let i = 0; i < teeth * 2; i++) {
    const a = (Math.PI * i) / teeth - Math.PI / 2, rr = i % 2 ? 43.5 : 46.5;   // dentatura leggera
    pts.push(`${(50 + rr * Math.cos(a)).toFixed(1)},${(50 + rr * Math.sin(a)).toFixed(1)}`);
  }
  const light = isLight(hex);
  return (
    <svg className="cap-icon" width={size} height={size} viewBox="0 0 100 100" role="img" aria-label={title}>
      {title && <title>{title}</title>}
      {light && <polygon points={pts.join(" ")} fill="none" stroke="rgba(0,0,0,.35)" strokeWidth="11" strokeLinejoin="round" />}
      <polygon points={pts.join(" ")} fill={hex} fillOpacity=".14" stroke={hex} strokeWidth="7" strokeLinejoin="round" />
      {unknown && <text x="50" y="61" textAnchor="middle" fontSize="30" fontWeight="700" fill={hex}>?</text>}
    </svg>
  );
}
const isLight = (hex: string) => {
  const m = hex.replace("#", "").match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) return false;
  const [r, g, b] = m.slice(1).map((x) => parseInt(x, 16));
  return 0.299 * r + 0.587 * g + 0.114 * b > 200;
};

/** Pallino con il colore del tappo. */
export function CapDot({ color, size = 18 }: { color?: string | null; size?: number }) {
  useCapColors();
  const c = capInfo(color);
  if (!c) return null;
  return <CapIcon hex={c.hex} size={size} title={`Tappo ${c.label.toLowerCase()}`} />;
}

/** Scelta del colore del tappo, nella fase di imbottigliamento. */
export function CapPicker({ batch, canEdit, onSaved }: { batch: Row; canEdit: boolean; onSaved: (b: Row) => void }) {
  const [err, setErr] = useState("");
  const colors = useCapColors();
  const pick = async (k: string | null) => {
    if (!canEdit) return;
    setErr("");
    const { data, error } = await supabase.from("batches").update({ cap_color: k }).eq("id", batch.id).select().single();
    if (error) return setErr(/cap_color|column/i.test(error.message) ? "Manca un aggiornamento del database: esegui su Supabase il file 0010_colore_tappo.sql." : errMsg(error));
    onSaved(data);
  };
  return (
    <div className="cap-picker">
      <span className="nb-label">Colore del tappo {batch.cap_color && <strong>· {capInfo(batch.cap_color)?.label}</strong>}</span>
      <div className="cap-grid">
        {colors.map((c) => (
          <button key={c.key} type="button" disabled={!canEdit} className={"cap-btn" + (batch.cap_color === c.key ? " on" : "")}
            onClick={() => pick(batch.cap_color === c.key ? null : c.key)} title={c.label}>
            <CapIcon hex={c.hex} size={36} />
            <small>{c.label}</small>
          </button>
        ))}
      </div>
      {err && <p className="error">{err}</p>}
    </div>
  );
}

/** Le ultime birre prodotte con il colore del tappo, per riconoscerle (anche quelle col tappo ancora da scegliere). */
export function CapGallery({ limit = 6 }: { limit?: number }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  useCapColors();
  useEffect(() => {
    supabase.from("batches").select("*, recipes(name, style)").then(({ data }) => {
      const when = (b: Row) => String(b.bottling_date ?? b.brew_date ?? b.created_at ?? "");
      const made = (data ?? []).filter((b) => b.cap_color || b.bottling_date || b.brew_date || b.bottles_count)
        .sort((a, b) => Number(Boolean(b.cap_color)) - Number(Boolean(a.cap_color)) || when(b).localeCompare(when(a)));
      // una per ricetta: l'ultima (prima quelle col tappo)
      const seen = new Set<string>(), out: Row[] = [];
      for (const b of made) { const k = b.recipe_id ?? b.id; if (seen.has(k)) continue; seen.add(k); out.push(b); }
      setRows(out.sort((a, b) => when(b).localeCompare(when(a))).slice(0, limit));
    });
  }, [limit]);
  if (rows === null) return null;
  return (
    <>
      <h2>🍾 Riconosci le birre dal tappo</h2>
      {rows.length ? (
        <div className="cap-gallery">
          {rows.map((b) => {
            const c = capInfo(b.cap_color);
            return (
              <Link key={b.id} to={`/batch/${b.id}`} className={"cap-card" + (c ? "" : " no-cap")}>
                {c ? <CapIcon hex={c.hex} size={52} title={`Tappo ${c.label.toLowerCase()}`} /> : <CapIcon hex="#8a8276" size={52} unknown title="Tappo da scegliere" />}
                <span className="cap-text">
                  <strong>{b.recipes?.name ?? b.code}</strong>
                  <span className="muted small">{[b.recipes?.style, c ? `tappo ${c.label.toLowerCase()}` : "tappo da scegliere"].filter(Boolean).join(" · ")}</span>
                  {b.bottling_date && <span className="muted small">imbottigliata il {date(b.bottling_date)}</span>}
                </span>
              </Link>
            );
          })}
        </div>
      ) : <p className="muted">Ancora nessuna birra prodotta: quando imbottigli, scegli il colore del tappo nel batch.</p>}
    </>
  );
}

/** Impostazioni: colori dei tappi disponibili (aggiungi / togli). */
export function CapColorsSettings({ canEdit }: { canEdit: boolean }) {
  const colors = useCapColors();
  const [label, setLabel] = useState("");
  const [hex, setHex] = useState("#1f4fbf");
  const [err, setErr] = useState("");
  const fail = (e: unknown) => setErr(/cap_colors|relation|schema cache/i.test(errMsg(e)) ? "Manca un aggiornamento del database: esegui su Supabase il file 0011_colori_tappi.sql." : errMsg(e));
  const add = async (e: React.FormEvent) => {
    e.preventDefault(); setErr("");
    const name = label.trim(); if (!name) return;
    const key = name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-");
    const { error } = await supabase.from("cap_colors").upsert({ key, label: name.charAt(0).toUpperCase() + name.slice(1), hex, sort_order: colors.length + 1 });
    if (error) return fail(error);
    setLabel(""); loadCapColors(true);
  };
  const remove = async (c: CapColor) => {
    if (!confirm(`Togliere il colore «${c.label}» dall'elenco? Le birre che lo usano lo mantengono.`)) return;
    const { error } = await supabase.from("cap_colors").delete().eq("key", c.key);
    if (error) return fail(error);
    loadCapColors(true);
  };
  return (
    <div className="panel">
      <h2>Colori dei tappi</h2>
      <div className="cap-list">
        {colors.map((c) => (
          <span key={c.key} className="cap-chip">
            <CapIcon hex={c.hex} size={24} /> {c.label}
            {canEdit && <button className="icon" title="Togli" onClick={() => remove(c)}>✕</button>}
          </span>
        ))}
      </div>
      {canEdit && (
        <form className="inline-form cap-add" onSubmit={add}>
          <label><span>Nuovo colore</span><input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="es. Blu" /></label>
          <label><span>Tinta</span><input type="color" value={hex} onChange={(e) => setHex(e.target.value)} /></label>
          <button className="btn">+ Aggiungi</button>
        </form>
      )}
      {err && <p className="error">{err}</p>}
    </div>
  );
}

/** Divisione delle bottiglie tra i soci (es. 33 → 11 a testa). */
export function BottleSplit({ bottles, people }: { bottles: number | null | undefined; people: { id: string; display_name: string }[] }) {
  const n = people.length || 3;
  if (!bottles) return <p className="muted small split-empty">Inserisci il numero di bottiglie per vedere quante ne toccano a ciascuno.</p>;
  const each = Math.floor(Number(bottles) / n), rest = Number(bottles) - each * n;
  return (
    <div className="split">
      <span className="nb-label">Divisione tra i {n} soci</span>
      <div className="split-row">
        {(people.length ? people : Array.from({ length: n }, (_, i) => ({ id: String(i), display_name: `Socio ${i + 1}` }))).map((p) => (
          <span key={p.id} className="split-item"><strong>{each}</strong><small>{p.display_name}</small></span>
        ))}
      </div>
      <p className="muted small">{bottles} bottiglie → {each} a testa{rest ? ` · ${rest} ${rest === 1 ? "avanza" : "avanzano"}` : ""}</p>
    </div>
  );
}
