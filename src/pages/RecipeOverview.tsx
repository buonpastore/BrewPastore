import type { ReactNode } from "react";
import {
  Beer, Target, Flag, Leaf, Palette, CupSoda, Thermometer, Flame, Droplets, ShowerHead, Wheat, Wind, Snowflake,
  FlaskConical, Sparkles, Eye, Feather, Flower2, Smile, Waves, ListOrdered, StickyNote,
} from "lucide-react";
import { num, sg, type Row } from "../lib";
import { abvOf, ebcColor, ebcName, ibuName } from "../beerLook";

function Tile({ icon, label, value, sub, color = "var(--gold)", swatch }: { icon: ReactNode; label: string; value: ReactNode; sub?: string; color?: string; swatch?: string }) {
  return (
    <div className="ov-tile" style={{ ["--c" as string]: color }}>
      <span className="ov-ico">{icon}</span>
      <div className="ov-body">
        <span className="ov-label">{label}</span>
        <strong className="ov-value">{swatch && <i className="rc-swatch" style={{ background: swatch }} />}{value}</strong>
        {sub && <span className="ov-sub">{sub}</span>}
      </div>
    </div>
  );
}

const DESC_ICONS: Record<string, ReactNode> = {
  colore: <Palette size={16} />, schiuma: <Waves size={16} />, corpo: <Feather size={16} />, aroma: <Flower2 size={16} />,
  gusto: <Smile size={16} />, luppolo: <Leaf size={16} />, amaro: <Leaf size={16} />, finale: <Flag size={16} />, aspetto: <Eye size={16} />,
};

function stepIcon(t: string): [ReactNode, string] {
  const s = t.toLowerCase();
  if (/^acqua/.test(s)) return [<Droplets size={18} />, "var(--teal)"];
  if (/^mash/.test(s)) return [<Wheat size={18} />, "var(--gold)"];
  if (/^sparge/.test(s)) return [<ShowerHead size={18} />, "var(--teal)"];
  if (/^bollitura/.test(s)) return [<Flame size={18} />, "var(--magenta)"];
  if (/^whirlpool/.test(s)) return [<Wind size={18} />, "var(--teal)"];
  if (/^raffredd/.test(s)) return [<Snowflake size={18} />, "var(--teal)"];
  if (/^fermentaz/.test(s)) return [<FlaskConical size={18} />, "var(--gold)"];
  if (/^dry hop/.test(s)) return [<Leaf size={18} />, "var(--gold)"];
  if (/^carbonaz/.test(s)) return [<Sparkles size={18} />, "var(--magenta)"];
  return [<ListOrdered size={18} />, "var(--muted)"];
}

/** Scheda ricetta in sola lettura, pensata per essere letta. */
export function RecipeOverview({ recipe }: { recipe: Row }) {
  const abv = abvOf(recipe.target_og, recipe.target_fg);
  const ibu = recipe.target_ibu != null ? Number(recipe.target_ibu) : null;
  const ebc = recipe.target_ebc != null ? Number(recipe.target_ebc) : null;

  // descrizione: "Colore: Dorato · Aroma: Speziato" → voci con icona
  const descParts = String(recipe.description ?? "").split(/\s*·\s*|\n/).map((x) => x.trim()).filter(Boolean);
  const structured = descParts.length > 1 && descParts.every((p) => /^[A-Za-zÀ-ú ]{3,20}:\s*\S/.test(p));

  // procedimento: righe "1. Mash: …" → passaggi
  const steps = String(recipe.procedure ?? "").split(/\n+/).map((l) => l.replace(/^\s*\d+[.)]\s*/, "").trim()).filter(Boolean);

  const notes = recipe.notes && !/^Lett[ao] direttamente dal testo/i.test(recipe.notes) ? recipe.notes : null;

  return (
    <div className="overview">
      <h3 className="ov-h"><Beer size={16} /> Profilo della birra</h3>
      <div className="ov-grid cols-3">
        <Tile icon={<Beer size={20} />} label="Alcol" value={abv != null ? `${num(abv, 1)}%` : "—"} sub={abv != null ? "stimato da OG e FG" : "servono OG e FG"} />
        <Tile icon={<Target size={20} />} label="OG prevista" value={sg(recipe.target_og)} sub="densità iniziale" color="var(--teal)" />
        <Tile icon={<Flag size={20} />} label="FG prevista" value={sg(recipe.target_fg)} sub="densità finale" color="var(--teal)" />
        <Tile icon={<Leaf size={20} />} label="Amaro" value={ibu != null ? `${num(ibu, 0)} IBU` : "—"} sub={ibu != null ? ibuName(ibu) : undefined} color="var(--cat-luppolo)" />
        <Tile icon={<Palette size={20} />} label="Colore" value={ebc != null ? `${num(ebc, 0)} EBC` : "—"} sub={ebc != null ? ebcName(ebc) : undefined}
          swatch={ebc != null ? ebcColor(ebc) : undefined} color="var(--cat-malto)" />
        <Tile icon={<CupSoda size={20} />} label="Volume" value={recipe.batch_size_l ? `${num(recipe.batch_size_l, 1)} L` : "—"} sub="in fermentatore" color="var(--magenta)" />
      </div>

      <h3 className="ov-h"><Thermometer size={16} /> Processo</h3>
      <div className="ov-grid cols-4">
        <Tile icon={<Thermometer size={20} />} label="Mash" value={recipe.mash_temp_c ? `${num(recipe.mash_temp_c, 1)} °C` : "—"}
          sub={recipe.mash_time_min ? `per ${recipe.mash_time_min} minuti` : undefined} color="var(--gold)" />
        <Tile icon={<Flame size={20} />} label="Bollitura" value={recipe.boil_time_min ? `${recipe.boil_time_min} min` : "—"} color="var(--magenta)" />
        <Tile icon={<Droplets size={20} />} label="Acqua di mash" value={recipe.mash_water_l != null ? `${num(recipe.mash_water_l, 1)} L` : "—"} color="var(--teal)" />
        <Tile icon={<ShowerHead size={20} />} label="Acqua di sparge" value={recipe.sparge_water_l != null ? `${num(recipe.sparge_water_l, 1)} L` : "—"} sub="a 76–78 °C" color="var(--teal)" />
      </div>

      {descParts.length > 0 && (
        <>
          <h3 className="ov-h"><Smile size={16} /> Com'è la birra</h3>
          {structured ? (
            <div className="ov-desc">
              {descParts.map((p) => {
                const [k, ...v] = p.split(":");
                const key = k.trim().toLowerCase();
                return (
                  <div key={p} className="ov-desc-item">
                    <span className="ov-desc-ico">{DESC_ICONS[key] ?? <Sparkles size={16} />}</span>
                    <span className="ov-desc-k">{k.trim()}</span>
                    <span className="ov-desc-v">{v.join(":").trim()}</span>
                  </div>
                );
              })}
            </div>
          ) : <p className="ov-text">{recipe.description}</p>}
        </>
      )}

      {steps.length > 0 && (
        <>
          <h3 className="ov-h"><ListOrdered size={16} /> Procedimento</h3>
          <p className="ov-summary">{summarize(recipe, steps)}</p>
          <ol className="ov-steps">
            {steps.map((st, i) => {
              const [ico, color] = stepIcon(st);
              const m = st.match(/^([^:]{2,30}):\s*(.*)$/);
              const title = m ? m[1] : st.split(/\s+(?:a|con|e)\s+/)[0];
              const body = m ? m[2] : st.slice(title.length).trim();
              const items = splitDetails(body);
              return (
                <li key={i} className="ov-step" style={{ ["--c" as string]: color }}>
                  <div className="ov-step-head">
                    <span className="ov-step-num">{i + 1}</span>
                    <span className="ov-step-ico">{ico}</span>
                    <strong className="ov-step-title">{title.replace(/\.$/, "")}</strong>
                  </div>
                  {items.length > 1 ? (
                    <ul className="ov-step-items">{items.map((x, j) => <li key={j}>{x}</li>)}</ul>
                  ) : body ? <p className="ov-step-text">{body.replace(/^[,:]\s*/, "")}</p> : null}
                </li>
              );
            })}
          </ol>
        </>
      )}

      {notes && (
        <>
          <h3 className="ov-h"><StickyNote size={16} /> Note</h3>
          <p className="ov-text pre">{notes}</p>
        </>
      )}
      {!steps.length && <p className="muted small">Nessun procedimento: usa «Genera riassunto del procedimento» oppure importa la ricetta da testo.</p>}
    </div>
  );
}

/** Divide i dettagli di un passo in voci: fasi del mash (→), aggiunte (", "), ingredienti ("con …"). */
function splitDetails(body: string): string[] {
  let t = body.replace(/\.$/, "").trim();
  if (!t) return [];
  if (t.includes("→")) {
    const [phases, rest] = t.split(/\s+con\s+/);
    const out = phases.split(/\s*→\s*/).map((x) => x.trim()).filter(Boolean);
    if (rest) out.push(`Con ${rest}`);
    return out;
  }
  t = t.replace(/^con\s+/i, "");
  const parts = t.split(/,\s+(?=[A-ZÀ-Ú0-9])/).map((x) => x.trim()).filter(Boolean);
  return parts.length > 1 ? parts : [t];
}

/** Riassunto discorsivo del procedimento, dai passi e dai dati della ricetta. */
function summarize(r: Row, steps: string[]): string {
  const find = (rx: RegExp) => steps.find((s) => rx.test(s)) ?? "";
  const names = (txt: string) => [...new Set(txt.replace(/^[^:]*:\s*/, "").split(/,\s*/)
    .map((x) => x.replace(/\s+\d.*$/, "").trim()).filter((x) => x && !/^\d/.test(x)))];
  const parts: string[] = [];
  const head = `${r.style ? `${r.style}` : "Birra"}${r.batch_size_l ? ` da ${String(r.batch_size_l).replace(".", ",")} litri` : ""}`;
  const mash = find(/^mash/i);
  const temps = [...mash.matchAll(/(\d{2})\s*°C/g)].map((m) => m[1]).filter((t, i, a) => a.indexOf(t) === i);
  if (temps.length > 1) parts.push(`mash a step ${temps.filter((t) => Number(t) < 76).join(" → ")} °C${temps.some((t) => Number(t) >= 76) ? " con mash out" : ""}`);
  else if (r.mash_temp_c) parts.push(`mash a ${String(r.mash_temp_c).replace(".", ",")} °C per ${r.mash_time_min ?? "?"} minuti`);
  const boil = find(/^bollitura/i);
  if (boil) {
    const n = names(boil.split(":").slice(1).join(":") || "");
    parts.push(`bollitura di ${r.boil_time_min ?? boil.match(/(\d+)\s*min/)?.[1] ?? "?"} minuti${n.length ? ` con ${andList(n.map((x, i) => (i === 0 ? x : x.charAt(0).toLowerCase() + x.slice(1))))}` : ""}`);
  }
  const wp = find(/^whirlpool/i);
  if (wp) { const n = names(wp.split(":").slice(1).join(":")); if (n.length) parts.push(`whirlpool con ${n.join(", ")}`); }
  const cool = find(/inoculare/i);
  const yeast = cool.match(/inoculare\s+([^(.]+)/i)?.[1]?.trim();
  const ferm = find(/^fermentaz/i);
  const ft = [...ferm.matchAll(/(\d{2}(?:–\d{2})?)\s*°C/g)].map((m) => m[1]);
  if (yeast || ft.length) parts.push(`fermentazione${yeast ? ` con ${yeast}` : ""}${ft.length > 1 ? ` da ${ft[0]} °C fino a ${ft[ft.length - 1]} °C` : ft.length ? ` a ${ft[0]} °C` : ""}`);
  const dry = find(/^dry hop/i);
  if (dry) { const n = names(dry.split(":").slice(1).join(":")); if (n.length) parts.push(`dry hop con ${n.join(", ")}`); }
  const carb = find(/^carbonaz/i).replace(/^[^:]*:\s*/, "").replace(/\.$/, "");
  if (carb) parts.push(`carbonazione a ${carb}`);
  return parts.length ? `${head}: ${parts.join("; ")}.` : `${head}.`;
}

const andList = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(", ")} e ${xs[xs.length - 1]}` : xs[0] ?? "");
