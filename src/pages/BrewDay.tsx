import { Droplets, Wheat, ShowerHead, Flame, Wind, Snowflake, FlaskConical, ScrollText } from "lucide-react";
import type { ReactNode } from "react";
import { num, type Row } from "../lib";

interface Props {
  ingredients: Row[];
  mashTemp?: number | null;
  mashTime?: number | null;
  boilTime?: number | null;
  mashWater?: number | null;
  spargeWater?: number | null;
  volume?: number | null;
  waterAdjustments?: Row[];
  procedure?: string | null;
}

const qty = (i: Row) => `${num(Number(i.quantity), 3)} ${i.unit === "pz" ? (i.category === "lievito" ? (Number(i.quantity) === 1 ? "bustina" : "bustine") : "pz") : i.unit}`;
const minutesOf = (step?: string | null) => {
  if (!step) return null;
  const m = String(step).toLowerCase().match(/(\d{1,3})\s*(?:min|'|’)/);
  return m ? Number(m[1]) : /flame\s?out|fine bollitura|^0$/.test(String(step).toLowerCase()) ? 0 : null;
};
const isWhirlpool = (s?: string | null) => /whirlpool|hop\s?stand|flame\s?out|fuoco spento/i.test(s ?? "");
const isDryHop = (s?: string | null) => /dry\s?hop|a freddo|fermentator|fermentazione/i.test(s ?? "");
const isFirstWort = (s?: string | null) => /first wort|fwh/i.test(s ?? "");
const isMash = (s?: string | null) => /mash|ammostament/i.test(s ?? "");
const dayOf = (s?: string | null) => { const m = (s ?? "").match(/giorno\s*(\d+)/i); return m ? Number(m[1]) : 999; };

function Step({ icon, color, title, sub, children }: { icon: ReactNode; color: string; title: string; sub?: string; children?: ReactNode }) {
  return (
    <li className="bd-step" style={{ ["--c" as string]: color }}>
      <span className="bd-dot">{icon}</span>
      <div className="bd-body">
        <div className="bd-title"><strong>{title}</strong>{sub && <span className="muted small"> · {sub}</span>}</div>
        {children}
      </div>
    </li>
  );
}

function Items({ list, showStep }: { list: Row[]; showStep?: boolean }) {
  if (!list.length) return null;
  return (
    <ul className="bd-items">
      {list.map((i) => (
        <li key={i.id ?? i.name + i.step}>
          <span className={"bd-cat c-" + i.category} />
          <strong>{i.name}</strong> <span className="muted">{qty(i)}</span>
          {showStep && i.step && <span className="badge">{i.step}</span>}
        </li>
      ))}
    </ul>
  );
}

/** Piano di cotta: tutti gli step in ordine, con le aggiunte di luppolo minuto per minuto. */
export function BrewDay(p: Props) {
  const ing = p.ingredients;
  const boil = p.boilTime ? Number(p.boilTime) : null;

  const waterSalts = ing.filter((i) => i.category === "sali_acqua" && !isMash(i.step) && minutesOf(i.step) == null);
  const mashItems = ing.filter((i) => (i.category === "malto" || isMash(i.step)) && !isDryHop(i.step) && !isWhirlpool(i.step) && minutesOf(i.step) == null);
  const firstWort = ing.filter((i) => isFirstWort(i.step));
  const boilItems = ing
    .filter((i) => minutesOf(i.step) != null && !isWhirlpool(i.step) && !isDryHop(i.step))
    .sort((a, b) => (minutesOf(b.step) ?? 0) - (minutesOf(a.step) ?? 0));
  const whirl = ing.filter((i) => isWhirlpool(i.step));
  const yeast = ing.filter((i) => i.category === "lievito");
  const dry = ing.filter((i) => isDryHop(i.step) && i.category !== "lievito").sort((a, b) => dayOf(a.step) - dayOf(b.step));
  const placed = new Set([...waterSalts, ...mashItems, ...firstWort, ...boilItems, ...whirl, ...yeast, ...dry]);
  const others = ing.filter((i) => !placed.has(i));

  // raggruppa le aggiunte in bollitura per minuto
  const byMinute = new Map<number, Row[]>();
  for (const i of boilItems) { const m = minutesOf(i.step)!; byMinute.set(m, [...(byMinute.get(m) ?? []), i]); }
  const hopTotal = ing.filter((i) => i.category === "luppolo").reduce((s, i) => s + (i.unit === "g" ? Number(i.quantity) : i.unit === "kg" ? Number(i.quantity) * 1000 : 0), 0);

  if (!ing.length && !p.mashTemp && !boil) return <p className="muted">Inserisci ingredienti e parametri (mash, bollitura) per vedere il piano di cotta.</p>;

  return (
    <div>
      <div className="bd-summary">
        {p.volume ? <span>🍺 {num(p.volume, 1)} L</span> : null}
        {p.mashTemp ? <span>🌾 Mash {num(p.mashTemp, 1)} °C × {p.mashTime ?? "?"} min</span> : null}
        {boil ? <span>🔥 Bollitura {boil} min</span> : null}
        {hopTotal > 0 && <span>🌿 Luppoli {num(hopTotal, 0)} g{p.volume ? ` (${num(hopTotal / Number(p.volume), 1)} g/L)` : ""}</span>}
      </div>
      <ol className="brewday">
        <Step icon={<Droplets size={18} />} color="var(--teal)" title="Preparazione acqua"
          sub={[p.mashWater && `mash ${num(p.mashWater, 1)} L`, p.spargeWater && `sparge ${num(p.spargeWater, 1)} L`].filter(Boolean).join(" · ") || undefined}>
          {(p.waterAdjustments ?? []).length > 0 && (
            <ul className="bd-items">
              {p.waterAdjustments!.map((w) => <li key={w.id}><span className="bd-cat c-sali_acqua" /><strong>{w.additive}</strong> <span className="muted">{num(w.amount, 2)} {w.unit}</span> <span className="badge">{w.target}</span></li>)}
            </ul>
          )}
          <Items list={waterSalts} />
        </Step>
        <Step icon={<Wheat size={18} />} color="var(--gold)" title="Ammostamento (mash)"
          sub={p.mashTemp ? `${num(p.mashTemp, 1)} °C per ${p.mashTime ?? "?"} min` : undefined}>
          <Items list={mashItems} />
        </Step>
        <Step icon={<ShowerHead size={18} />} color="var(--teal)" title="Mash out e sparge" sub={p.spargeWater ? `${num(p.spargeWater, 1)} L a 76–78 °C` : "risciacquo a 76–78 °C"}>
          <Items list={firstWort} showStep />
        </Step>
        <Step icon={<Flame size={18} />} color="var(--orange)" title="Bollitura" sub={boil ? `${boil} minuti` : undefined}>
          {byMinute.size > 0 ? (
            <div className="hop-timeline">
              {[...byMinute.entries()].map(([m, list]) => (
                <div key={m} className="hop-slot">
                  <div className="hop-time">
                    <strong>{m === 0 ? "fine" : `${m}'`}</strong>
                    <span className="muted small">{m === 0 ? "a fuoco spento" : boil ? (boil - m <= 0 ? "a inizio bollitura" : `dopo ${boil - m} min`) : "alla fine"}</span>
                  </div>
                  <Items list={list} />
                </div>
              ))}
            </div>
          ) : <p className="muted small">Nessuna aggiunta in bollitura.</p>}
        </Step>
        {whirl.length > 0 && (
          <Step icon={<Wind size={18} />} color="var(--hop)" title="Whirlpool" sub={whirl[0].step && /\d/.test(whirl[0].step) ? whirl[0].step : undefined}>
            <Items list={whirl} />
          </Step>
        )}
        <Step icon={<Snowflake size={18} />} color="#7fd9c8" title="Raffreddamento e inoculo">
          <Items list={yeast} />
        </Step>
        <Step icon={<FlaskConical size={18} />} color="var(--magenta)" title="Fermentazione" sub={dry.length ? "con dry hop" : undefined}>
          <Items list={dry} showStep />
        </Step>
        {others.length > 0 && (
          <Step icon={<ScrollText size={18} />} color="var(--muted)" title="Altri ingredienti" sub="momento non indicato">
            <Items list={others} showStep />
          </Step>
        )}
      </ol>
      {p.procedure && (
        <div className="panel-sub">
          <h3>Procedimento</h3>
          <p className="pre">{p.procedure}</p>
        </div>
      )}
    </div>
  );
}
