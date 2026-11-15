import { useState } from "react";
import { LayoutList, Rows3 } from "lucide-react";

/** Vista compatta / estesa salvata sul telefono (una chiave per pagina). */
export function useViewMode(key: string, def: "compatta" | "estesa" = "estesa") {
  const [v, setV] = useState<"compatta" | "estesa">(() => { try { const s = localStorage.getItem(key); return s === "compatta" || s === "estesa" ? s : def; } catch { return def; } });
  const set = (x: "compatta" | "estesa") => { setV(x); try { localStorage.setItem(key, x); } catch { /* niente */ } };
  return [v, set] as const;
}

/** Due iconcine: compatta (righe basse) ed estesa (con i dettagli). Non occupa una riga intera. */
export function ViewToggle({ value, onChange }: { value: "compatta" | "estesa"; onChange: (v: "compatta" | "estesa") => void }) {
  return (
    <div className="view-toggle" role="group" aria-label="Visualizzazione">
      <button type="button" className={value === "compatta" ? "on" : ""} title="Vista compatta" aria-label="Vista compatta" onClick={() => onChange("compatta")}><Rows3 size={17} /></button>
      <button type="button" className={value === "estesa" ? "on" : ""} title="Vista estesa" aria-label="Vista estesa" onClick={() => onChange("estesa")}><LayoutList size={17} /></button>
    </div>
  );
}
