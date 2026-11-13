import type { ReactNode } from "react";
import {
  Beer, Target, Flag, Leaf, Palette, CupSoda, Thermometer, Flame, Droplets, ShowerHead, Wheat, Wind, Snowflake,
  FlaskConical, Sparkles, Eye, Feather, Flower2, Smile, Waves, ListOrdered, StickyNote, BookOpen, BookMarked, MapPin,
} from "lucide-react";
import { num, sg, type Row } from "../lib";
import { abvOf, ebcColor, ebcName, ibuName } from "../beerLook";
import { findStyle } from "../styleGuide";

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

  const phases = mashPhases(steps.find((x) => /^mash/i.test(x)) ?? "");
  const boilStep = steps.find((x) => /^bollitura/i.test(x)) ?? "";
  const nAdds = boilStep.includes(":") ? boilStep.split(":").slice(1).join(":").split(/,\s*/).filter((x) => x.trim()).length : 0;
  const hopAdds = nAdds ? `${nAdds} ${nAdds === 1 ? "aggiunta" : "aggiunte"} durante la bollitura` : "";

  const notes = recipe.notes && !/^Lett[ao] direttamente dal testo/i.test(recipe.notes) ? recipe.notes : null;

  return (
    <div className="overview">
      <h3 className="ov-h"><Beer size={16} /> Profilo della birra</h3>
      <div className="ov-grid cols-3">
        <Tile icon={<Beer size={20} />} label="Alcol" value={abv != null ? `${num(abv, 1)}%` : "—"} sub={abv != null ? "stimato da OG e FG" : "servono OG e FG"} />
        <Tile icon={<Leaf size={20} />} label="Amaro" value={ibu != null ? `${num(ibu, 0)} IBU` : "—"} sub={ibu != null ? ibuName(ibu) : undefined} color="var(--cat-luppolo)" />
        <Tile icon={<Palette size={20} />} label="Colore" value={ebc != null ? `${num(ebc, 0)} EBC` : "—"} sub={ebc != null ? ebcName(ebc) : undefined}
          swatch={ebc != null ? ebcColor(ebc) : undefined} color="var(--cat-malto)" />
      </div>

      <h3 className="ov-h"><Droplets size={16} /> Acqua</h3>
      <div className="ov-grid cols-2">
        <Tile icon={<Droplets size={20} />} label="Acqua di mash" value={recipe.mash_water_l != null ? `${num(recipe.mash_water_l, 1)} L` : "—"} sub="nel tino con i grani" color="var(--teal)" />
        <Tile icon={<ShowerHead size={20} />} label="Acqua di sparge" value={recipe.sparge_water_l != null ? `${num(recipe.sparge_water_l, 1)} L` : "—"} sub="a 76–78 °C" color="var(--teal)" />
      </div>

      <h3 className="ov-h"><Thermometer size={16} /> Processo</h3>
      <div className={`ov-grid cols-${Math.min(Math.max(phases.length, 1), 3)}`}>
        {phases.length ? phases.map((ph, i) => (
          <Tile key={i} icon={<Thermometer size={20} />} label={ph.name} value={`${ph.temp} °C`} sub={ph.min ? `per ${ph.min} minuti` : undefined}
            color={/out/i.test(ph.name) ? "var(--magenta)" : "var(--gold)"} />
        )) : (
          <Tile icon={<Thermometer size={20} />} label="Mash" value={recipe.mash_temp_c ? `${num(recipe.mash_temp_c, 1)} °C` : "—"}
            sub={recipe.mash_time_min ? `per ${recipe.mash_time_min} minuti` : undefined} color="var(--gold)" />
        )}
      </div>
      <div className="ov-grid cols-1" style={{ marginTop: 10 }}>
        <Tile icon={<Flame size={20} />} label="Bollitura" value={recipe.boil_time_min ? `${recipe.boil_time_min} minuti` : "—"}
          sub={hopAdds ? hopAdds : undefined} color="var(--magenta)" />
      </div>

      <h3 className="ov-h"><Target size={16} /> Densità e volume</h3>
      <div className="ov-grid cols-3">
        <Tile icon={<Target size={20} />} label="OG prevista" value={sg(recipe.target_og)} sub="densità iniziale" color="var(--teal)" />
        <Tile icon={<Flag size={20} />} label="FG prevista" value={sg(recipe.target_fg)} sub="densità finale" color="var(--teal)" />
        <Tile icon={<CupSoda size={20} />} label="Volume" value={recipe.batch_size_l ? `${num(recipe.batch_size_l, 1)} L` : "—"} sub="in fermentatore" color="var(--magenta)" />
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
          <h3 className="ov-h"><BookOpen size={16} /> Il procedimento in breve</h3>
          <div className="ov-summary">{narrate(recipe, steps).map((t, i) => <p key={i}>{t}</p>)}</div>
        </>
      )}

      {notes && (
        <>
          <h3 className="ov-h"><StickyNote size={16} /> Note</h3>
          <p className="ov-text pre">{notes}</p>
        </>
      )}
      {!steps.length && <p className="muted small">Nessun procedimento: usa «Genera riassunto del procedimento» oppure importa la ricetta da testo.</p>}
      <StyleCard recipe={recipe} abv={abv} />
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

/** Fasi del mash: "Prima fase 63 °C × 60 min → Mash out 78 °C × 10 min con …" */
function mashPhases(mash: string): { name: string; temp: string; min: string | null }[] {
  const body = mash.replace(/^mash\s*:?\s*/i, "").split(/\s+con\s+/)[0];
  const out: { name: string; temp: string; min: string | null }[] = [];
  body.split(/\s*→\s*/).forEach((part, i) => {
    const m = part.match(/^(.*?)\s*(\d{2}(?:[.,]\d)?)\s*°C(?:\s*(?:×|x|per)\s*(\d{1,3})\s*min)?/i);
    if (!m) return;
    const name = m[1].replace(/[:,]\s*$/, "").trim();
    out.push({ name: name ? name.charAt(0).toUpperCase() + name.slice(1) : `Fase ${i + 1}`, temp: m[2].replace(".", ","), min: m[3] ?? null });
  });
  return out;
}

const lc = (x: string) => (x ? x.charAt(0).toLowerCase() + x.slice(1) : x);
const after = (s: string) => s.replace(/^[^:]*:\s*/, "").replace(/\.$/, "").trim();

/** Resoconto discorsivo del procedimento, un paragrafo per fase. */
function narrate(r: Row, steps: string[]): string[] {
  const out: string[] = [];
  const abv = abvOf(r.target_og, r.target_fg);
  const ibu = r.target_ibu != null ? Number(r.target_ibu) : null;
  const ebc = r.target_ebc != null ? Number(r.target_ebc) : null;
  const lit = (x: unknown) => String(x).replace(".", ",");
  const intro = [`${r.style ? `Una ${r.style}` : "Una birra"}${r.batch_size_l ? ` da ${lit(r.batch_size_l)} litri` : ""}`];
  const traits = [
    abv != null ? `circa ${num(abv, 1)}% di alcol` : null,
    ibu != null ? `amarezza ${ibuName(ibu).toLowerCase()} (${num(ibu, 0)} IBU)` : null,
    ebc != null ? `colore ${ebcName(ebc).toLowerCase()}` : null,
  ].filter(Boolean);
  out.push(`${intro[0]}${r.target_og && r.target_fg ? `: si parte da una densità di ${sg(r.target_og)} per arrivare a ${sg(r.target_fg)}` : ""}${traits.length ? `, con ${andList(traits as string[])}` : ""}.`);

  for (const st of steps) {
    const low = st.toLowerCase();
    if (/^acqua/.test(low)) {
      const parts = after(st).split(/,\s*/);
      const waters = parts.filter((p) => /\bL per\b/.test(p));
      const salts = parts.filter((p) => !/\bL per\b/.test(p));
      out.push(`Si prepara l'acqua${waters.length ? `: ${andList(waters)}` : ""}${salts.length ? `, correggendola con ${andList(salts.map(lc))}` : ""}.`);
    } else if (/^mash/.test(low)) {
      const ph = mashPhases(st);
      const grains = st.split(/\s+con\s+/)[1]?.replace(/\.$/, "");
      const seq = ph.map((p, i) => `${i === 0 ? "" : i === ph.length - 1 ? "e infine " : "poi "}${lc(p.name)} a ${p.temp} °C${p.min ? ` per ${p.min} minuti` : ""}`);
      out.push(`${grains ? `I grani (${grains}) vanno in ammostamento` : "Si passa all'ammostamento"}${seq.length ? `: ${seq.join(", ")}` : r.mash_temp_c ? ` a ${lit(r.mash_temp_c)} °C per ${r.mash_time_min ?? "?"} minuti` : ""}. In questa fase gli enzimi trasformano gli amidi in zuccheri.`);
    } else if (/^sparge/.test(low)) {
      out.push(`Con lo sparge si risciacquano le trebbie${/con\s+([\d.,]+)\s*L/i.test(st) ? ` con ${st.match(/con\s+([\d.,]+)\s*L/i)![1]} litri d'acqua` : ""}${/a\s+([\d–-]+)\s*°C/.test(st) ? ` a ${st.match(/a\s+([\d–-]+)\s*°C/)![1]} °C` : ""}, per recuperare tutti gli zuccheri.`);
    } else if (/^bollitura/.test(low)) {
      const min = st.match(/(\d+)\s*min/)?.[1] ?? r.boil_time_min;
      const adds = st.includes(":") ? after(st).split(/,\s*/).filter(Boolean) : [];
      out.push(`Il mosto bolle per ${min ?? "?"} minuti${adds.length ? `; le aggiunte sono ${andList(adds.map((a) => a.replace(/ a (\d+)'$/, " a $1 minuti dalla fine")))}` : ""}. La bollitura dà l'amaro e sterilizza il mosto.`);
    } else if (/^whirlpool/.test(low)) {
      out.push(`A fuoco spento, nel whirlpool${st.match(/a\s+(\d+)\s*°C/) ? ` a ${st.match(/a\s+(\d+)\s*°C/)![1]} °C` : ""}, si aggiungono ${andList(after(st).split(/,\s*/))} per l'aroma.`);
    } else if (/^raffredd/.test(low)) {
      out.push(`${st.replace(/\.$/, "").replace(/^Raffreddare/, "Si raffredda il mosto").replace(/ e inoculare /, " e si inocula il lievito: ")}.`);
    } else if (/^fermentaz/.test(low)) {
      out.push(`La fermentazione segue questo profilo: ${after(st).split(/\s*→\s*/).map(lc).join(", poi ")}.`);
    } else if (/^dry hop/.test(low)) {
      out.push(`Durante la fermentazione si fa il dry hop con ${andList(after(st).split(/,\s*/))}, per dare profumo senza aggiungere amaro.`);
    } else if (/^carbonaz/.test(low)) {
      out.push(`All'imbottigliamento si punta a una carbonazione di ${after(st)}.`);
    } else {
      out.push(st.replace(/\s*$/, "").replace(/([^.])$/, "$1."));
    }
  }
  return out;
}

const andList = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(", ")} e ${xs[xs.length - 1]}` : xs[0] ?? "");

/** In fondo alla scheda: come dovrebbe essere lo stile scelto, confrontato con la ricetta. */
function StyleCard({ recipe, abv }: { recipe: Row; abv: number | null }) {
  const found = findStyle(recipe.style);
  if (!recipe.style) return null;
  if (!found) return (
    <>
      <h3 className="ov-h"><BookMarked size={16} /> Lo stile</h3>
      <p className="muted small">Non ho le caratteristiche dello stile «{recipe.style}»: sceglilo dal menu a tendina in «Modifica scheda».</p>
    </>
  );
  const { name, info } = found;
  const val = (x: unknown) => (x != null && x !== "" ? Number(x) : null);
  const rows: { label: string; range?: [number, number]; value: number | null; fmt: (n: number) => string; unit: string }[] = [
    { label: "OG", range: info.og, value: val(recipe.target_og), fmt: (n) => n.toFixed(3), unit: "" },
    { label: "FG", range: info.fg, value: val(recipe.target_fg), fmt: (n) => n.toFixed(3), unit: "" },
    { label: "Alcol", range: info.abv, value: abv, fmt: (n) => num(n, 1), unit: "%" },
    { label: "IBU", range: info.ibu, value: val(recipe.target_ibu), fmt: (n) => num(n, 0), unit: "" },
    { label: "EBC", range: info.ebc, value: val(recipe.target_ebc), fmt: (n) => num(n, 0), unit: "" },
  ];
  return (
    <>
      <h3 className="ov-h"><BookMarked size={16} /> Lo stile: {name}</h3>
      <div className="style-card">
        <div className="style-meta">
          <span><FlaskConical size={15} /> {info.ferm}</span>
          <span><MapPin size={15} /> {info.origin}</span>
        </div>
        {rows.some((r) => r.range) && (
          <div className="style-ranges">
            {rows.filter((r) => r.range).map((r) => {
              const [lo, hi] = r.range!;
              const pad = (hi - lo) * 0.4 || 1;
              const min = lo - pad, max = hi + pad;
              const pos = (x: number) => Math.min(100, Math.max(0, ((x - min) / (max - min)) * 100));
              const st = r.value == null ? "none" : r.value < lo - 1e-9 ? "low" : r.value > hi + 1e-9 ? "high" : "ok";
              return (
                <div key={r.label} className={"style-row st-" + st}>
                  <span className="sr-label">{r.label}</span>
                  <div className="sr-track">
                    <span className="sr-range" style={{ left: `${pos(lo)}%`, width: `${pos(hi) - pos(lo)}%` }} />
                    {r.value != null && <span className="sr-mark" style={{ left: `${pos(r.value)}%` }} />}
                  </div>
                  <span className="sr-text">
                    <span className="sr-span">stile {r.fmt(lo)}–{r.fmt(hi)}{r.unit}</span>
                    <span className="sr-ours">{r.value == null ? "noi —" : `noi ${r.fmt(r.value)}${r.unit} ${st === "ok" ? "✓" : st === "low" ? "↓" : "↑"}`}</span>
                  </span>
                </div>
              );
            })}
          </div>
        )}
        <div className="style-desc">
          <div><Eye size={16} /><span><strong>Aspetto</strong> {info.look}</span></div>
          <div><Flower2 size={16} /><span><strong>Aroma</strong> {info.aroma}</span></div>
          <div><Smile size={16} /><span><strong>Gusto</strong> {info.taste}</span></div>
        </div>
        <p className="muted small style-src">Valori indicativi dello stile (linee guida BJCP). ✓ dentro lo stile · ↓ sotto · ↑ sopra.</p>
      </div>
    </>
  );
}
