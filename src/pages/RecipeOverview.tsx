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
      <div className="ov-grid">
        <Tile icon={<Beer size={20} />} label="Alcol" value={abv != null ? `${num(abv, 1)}%` : "—"} sub={abv != null ? "stimato da OG e FG" : "servono OG e FG"} />
        <Tile icon={<Target size={20} />} label="OG prevista" value={sg(recipe.target_og)} sub="densità iniziale" color="var(--teal)" />
        <Tile icon={<Flag size={20} />} label="FG prevista" value={sg(recipe.target_fg)} sub="densità finale" color="var(--teal)" />
        <Tile icon={<Leaf size={20} />} label="Amaro" value={ibu != null ? `${num(ibu, 0)} IBU` : "—"} sub={ibu != null ? ibuName(ibu) : undefined} color="var(--cat-luppolo)" />
        <Tile icon={<Palette size={20} />} label="Colore" value={ebc != null ? `${num(ebc, 0)} EBC` : "—"} sub={ebc != null ? ebcName(ebc) : undefined}
          swatch={ebc != null ? ebcColor(ebc) : undefined} color="var(--cat-malto)" />
        <Tile icon={<CupSoda size={20} />} label="Volume" value={recipe.batch_size_l ? `${num(recipe.batch_size_l, 1)} L` : "—"} sub="in fermentatore" color="var(--magenta)" />
      </div>

      <h3 className="ov-h"><Thermometer size={16} /> Processo</h3>
      <div className="ov-grid">
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
          <ol className="ov-steps">
            {steps.map((st, i) => {
              const [ico, color] = stepIcon(st);
              const m = st.match(/^([^:]{2,30}):\s*(.*)$/);
              return (
                <li key={i} style={{ ["--c" as string]: color }}>
                  <span className="ov-step-ico">{ico}</span>
                  <div>
                    <span className="ov-step-n">Passo {i + 1}</span>
                    {m ? <p><strong>{m[1]}</strong> {m[2]}</p> : <p>{st}</p>}
                  </div>
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
