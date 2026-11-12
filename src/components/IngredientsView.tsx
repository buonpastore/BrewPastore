import { useEffect, useState } from "react";
import { Wheat, Leaf, FlaskConical, Droplets, Sparkles, Package } from "lucide-react";
import type { ReactNode } from "react";
import { supabase, num, type Row } from "../lib";
import { CAT_INFO, nameColor } from "../categories";

const ORDER = ["malto", "luppolo", "lievito", "sali_acqua", "additivo", "bottiglie", "tappi", "etichette", "detergenti", "altro"];
const ICONS: Record<string, ReactNode> = {
  malto: <Wheat size={18} />, luppolo: <Leaf size={18} />, lievito: <FlaskConical size={18} />,
  sali_acqua: <Droplets size={18} />, additivo: <Sparkles size={18} />,
};
const GROUPS = ORDER.map((c) => ({ cat: [c], title: CAT_INFO[c].label, color: CAT_INFO[c].color, icon: ICONS[c] ?? <span>{CAT_INFO[c].emoji}</span> }));
const kg = (i: Row) => (i.unit === "kg" ? Number(i.quantity) : i.unit === "g" ? Number(i.quantity) / 1000 : 0);
const grams = (i: Row) => (i.unit === "g" ? Number(i.quantity) : i.unit === "kg" ? Number(i.quantity) * 1000 : 0);
const qty = (i: Row) => (i.unit === "pz"
  ? (i.category === "lievito" ? `${num(Number(i.quantity), 2)} ${Number(i.quantity) === 1 ? "bustina" : "bustine"}` : `${num(Number(i.quantity), 2)} pz`)
  : `${num(Number(i.quantity), 3)} ${i.unit}`);

/** Lista ingredienti divisa per tipo, con i colori del piano di cotta. */
export function IngredientsView({ table, parentKey, parentId, volume, reloadKey }: { table: string; parentKey: string; parentId: string; volume?: number | null; reloadKey?: unknown }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  useEffect(() => {
    let q = supabase.from(table).select("*").eq(parentKey, parentId);
    if (table === "recipe_ingredients") q = q.order("sort_order");
    q.then(({ data }) => setRows(data ?? []));
  }, [table, parentKey, parentId, reloadKey]);

  if (rows === null) return <p className="muted">Caricamento…</p>;
  if (!rows.length) return <p className="muted">Nessun ingrediente. Aggiungili con l'importazione qui sotto o con "Modifica ingredienti".</p>;

  const maltKg = rows.filter((i) => i.category === "malto").reduce((s, i) => s + kg(i), 0);
  const hopG = rows.filter((i) => i.category === "luppolo").reduce((s, i) => s + grams(i), 0);
  const known = new Set(GROUPS.flatMap((g) => g.cat));
  const groups = [...GROUPS.map((g) => (g.cat[0] === "altro" ? { ...g, cat: ["altro", ...rows.map((r) => r.category).filter((c) => !known.has(c))], icon: <Package size={18} /> } : g))];

  return (
    <div>
      <div className="bd-summary">
        {maltKg > 0 && <span>🌾 Malti {num(maltKg, 2)} kg</span>}
        {hopG > 0 && <span>🌿 Luppoli {num(hopG, 0)} g{volume ? ` · ${num(hopG / Number(volume), 1)} g/L` : ""}</span>}
        <span>{rows.length} ingredienti</span>
      </div>
      <div className="ing-groups">
        {groups.map((g) => {
          const list = rows.filter((r) => g.cat.includes(r.category));
          if (!list.length) return null;
          return (
            <section key={g.title} className="ing-group" style={{ ["--c" as string]: g.color }}>
              <h3 className="ing-title"><span className="ing-ico">{g.icon}</span>{g.title}</h3>
              <div className="ing-tiles">
                {list.map((i) => {
                  const pct = i.category === "malto" && maltKg ? (kg(i) / maltKg) * 100 : null;
                  return (
                    <div key={i.id} className="ing-tile">
                      <span className="ing-tile-ico">{g.icon}</span>
                      <div className="ing-tile-body">
                        <span className="ing-name" style={{ color: nameColor(i.category) }}>{i.name}</span>
                        <strong className="ing-amount">{qty(i)}{pct != null && <span className="ing-pct">{num(pct, 0)}%</span>}</strong>
                        {i.step && <span className="ing-step">{i.step}</span>}
                        {pct != null && <div className="ing-bar"><span style={{ width: `${pct}%` }} /></div>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
