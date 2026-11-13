import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase, date, STATUS_LABELS, type Row } from "../lib";

/** Data dell'ultimo passaggio fatto, per dire "a che punto è". */
export function lastStep(b: Row): string {
  if (b.first_tasting_date) return `bevuta dal ${date(b.first_tasting_date)}`;
  if (b.bottling_date) return `imbottigliata il ${date(b.bottling_date)}`;
  if (b.fermentation_start) return `in fermentatore dal ${date(b.fermentation_start)}`;
  if (b.brew_date) return `cotta il ${date(b.brew_date)}`;
  return "non ancora cotta";
}

/** Elenco compatto dei batch di una ricetta con il loro stato. */
export function BatchStatusList({ batches, linkable = true }: { batches: Row[]; linkable?: boolean }) {
  if (!batches.length) return <p className="muted small prev-none">Nessun batch precedente: è il primo.</p>;
  const sorted = [...batches].sort((a, b) => String(b.brew_date ?? b.created_at ?? "").localeCompare(String(a.brew_date ?? a.created_at ?? "")));
  return (
    <ul className="prev-batches">
      {sorted.map((b) => {
        const inner = (
          <>
            <strong>{b.code}</strong>
            <span className={"badge st-" + b.status}>{STATUS_LABELS[b.status] ?? b.status}</span>
            <span className="muted small prev-when">{lastStep(b)}</span>
          </>
        );
        return <li key={b.id}>{linkable ? <Link to={`/batch/${b.id}`}>{inner}</Link> : <div>{inner}</div>}</li>;
      })}
    </ul>
  );
}

/** Gli altri batch della stessa ricetta (per il riquadro "nuovo batch"). */
export function PreviousBatches({ recipeId, excludeId }: { recipeId: string; excludeId?: string }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  useEffect(() => {
    supabase.from("batches").select("id, code, status, brew_date, fermentation_start, bottling_date, first_tasting_date, created_at")
      .eq("recipe_id", recipeId).then(({ data }) => setRows((data ?? []).filter((b) => b.id !== excludeId)));
  }, [recipeId, excludeId]);
  if (rows === null) return null;
  return (
    <div className="block">
      <span className="nb-label">Batch precedenti di questa ricetta</span>
      <BatchStatusList batches={rows} />
    </div>
  );
}
