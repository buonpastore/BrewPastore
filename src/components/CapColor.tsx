import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase, errMsg, date, type Row } from "../lib";

/** Colori dei tappi a corona (sono colori "reali" dei tappi, non della grafica dell'app). */
export const CAP_COLORS: { key: string; label: string; hex: string }[] = [
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
export const capInfo = (k?: string | null) => CAP_COLORS.find((c) => c.key === k) ?? null;

/** Pallino con il colore del tappo. */
export function CapDot({ color, size = 18 }: { color?: string | null; size?: number }) {
  const c = capInfo(color);
  if (!c) return null;
  return <span className="cap-dot" title={`Tappo ${c.label.toLowerCase()}`} style={{ width: size, height: size, background: c.hex }} />;
}

/** Scelta del colore del tappo, nella fase di imbottigliamento. */
export function CapPicker({ batch, canEdit, onSaved }: { batch: Row; canEdit: boolean; onSaved: (b: Row) => void }) {
  const [err, setErr] = useState("");
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
        {CAP_COLORS.map((c) => (
          <button key={c.key} type="button" disabled={!canEdit} className={"cap-btn" + (batch.cap_color === c.key ? " on" : "")}
            onClick={() => pick(batch.cap_color === c.key ? null : c.key)} title={c.label}>
            <span className="cap-dot" style={{ background: c.hex, width: 30, height: 30 }} />
            <small>{c.label}</small>
          </button>
        ))}
      </div>
      {err && <p className="error">{err}</p>}
    </div>
  );
}

/** Le ultime birre imbottigliate con il colore del tappo, per riconoscerle. */
export function CapGallery({ limit = 6 }: { limit?: number }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  useEffect(() => {
    supabase.from("batches").select("*, recipes(name, style)").then(({ data }) => {
      const list = (data ?? []).filter((b) => b.cap_color)
        .sort((a, b) => String(b.bottling_date ?? b.brew_date ?? b.created_at ?? "").localeCompare(String(a.bottling_date ?? a.brew_date ?? a.created_at ?? "")));
      setRows(list.slice(0, limit));
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
              <Link key={b.id} to={`/batch/${b.id}`} className="cap-card">
                <span className="cap-dot big" style={{ background: c?.hex }} />
                <span className="cap-text">
                  <strong>{b.recipes?.name ?? b.code}</strong>
                  <span className="muted small">{[b.recipes?.style, c?.label && `tappo ${c.label.toLowerCase()}`].filter(Boolean).join(" · ")}</span>
                  {b.bottling_date && <span className="muted small">imbottigliata il {date(b.bottling_date)}</span>}
                </span>
              </Link>
            );
          })}
        </div>
      ) : <p className="muted">Nessuna birra con il colore del tappo: sceglilo nel batch, nella fase «Imbottigliamento».</p>}
    </>
  );
}
