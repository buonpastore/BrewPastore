import { useEffect, useMemo, useState } from "react";
import { Hourglass, TrendingUp } from "lucide-react";
import { supabase, eur, num, errMsg, type Row } from "../lib";
import { useAuth } from "../auth";
import { CapDot, useCapColors } from "../components/CapColor";
import { Stepper } from "../components/Stepper";
import { isProduced, loadTasted } from "../cellar";
import { useCostData, beersOf } from "./BeerCosts";

const NEED_0022 = "Per salvare il prezzo di vendita esegui 0022_prezzo_vendita.sql su Supabase (intanto lo ricordo su questo telefono)";
const LKEY = "pastorizia-prezzi-vendita";

/** Economia → Ricavi: a quanto vendere una birra, quante bottiglie servono per andare in pari e quanto si guadagna. */
export function Revenue() {
  useCapColors();
  const { profiles, isAdmin } = useAuth();
  const soci = Math.max(1, profiles.length || 3);
  const data = useCostData();
  const [tasted, setTasted] = useState<Set<string> | null>(null);
  const [pick, setPick] = useState<string | null>(null);
  const [prices, setPrices] = useState<Record<string, number>>(() => { try { return JSON.parse(localStorage.getItem(LKEY) ?? "{}"); } catch { return {}; } });
  const [sold, setSold] = useState<number | null>(null);
  const [note, setNote] = useState("");
  useEffect(() => { loadTasted().then(setTasted); }, []);

  // birre in vendita: imbottigliate o degustate (le esaurite sono nello storico)
  const beers = useMemo(() => {
    if (!data || !tasted) return [];
    return beersOf(data).filter((x) => {
      const bs = x.all.filter((b) => isProduced(b, tasted));
      return bs.length > 0 && x.list.length > 0;
    }).map((x) => {
      const key = (b: Row) => String(b.bottling_date ?? b.brew_date ?? "");
      const batch = [...x.all].filter((b) => isProduced(b, tasted)).sort((a, b) => key(b).localeCompare(key(a)))[0];
      return { ...x, batch };
    });
  }, [data, tasted]);

  useEffect(() => { if (!pick && beers.length) setPick(beers[0].recipe.id); }, [beers, pick]);
  const beer = beers.find((x) => x.recipe.id === pick);
  useEffect(() => { setSold(null); }, [pick]);

  if (!data || !tasted) return <div><h1>Ricavi</h1><p className="muted">Caricamento…</p></div>;
  if (!beers.length) return <div><h1>Ricavi</h1><p className="note">Non ci sono birre imbottigliate o degustate da mettere in vendita.</p></div>;

  const perBottle = beer?.sum.perBottle ?? 0;
  const bottles = Math.max(0, Math.round(beer?.sum.bottles ?? 0));
  const totalCost = beer?.sum.total ?? 0;
  const saved = beer ? (prices[beer.recipe.id] ?? (beer.recipe.sale_price != null ? Number(beer.recipe.sale_price) : null)) : null;
  const price = saved ?? Math.max(1, Math.ceil(perBottle * 2 * 2) / 2);    // di partenza: circa il doppio del costo
  const n = Math.min(sold ?? bottles, bottles || Infinity);
  const breakEven = price > 0 ? Math.ceil(totalCost / price) : Infinity;
  const revenue = n * price;
  const profit = revenue - totalCost;
  const margin = price - perBottle;

  const setPrice = async (v: number) => {
    if (!beer) return;
    const next = { ...prices, [beer.recipe.id]: v };
    setPrices(next);
    try { localStorage.setItem(LKEY, JSON.stringify(next)); } catch { /* niente */ }
    if (!isAdmin) return;
    const { error } = await supabase.from("recipes").update({ sale_price: v }).eq("id", beer.recipe.id);
    setNote(error ? (/sale_price/i.test(error.message) ? NEED_0022 : errMsg(error)) : "");
  };

  return (
    <div>
      <h1>Ricavi</h1>
      <p className="muted">Scegli una birra, mettici il prezzo di vendita e guarda quante bottiglie servono per rientrare dei costi e quanto si guadagna.</p>

      <div className="rv-pick">
        {beers.map((x) => (
          <button key={x.recipe.id} className={"rv-beer" + (x.recipe.id === pick ? " on" : "")} onClick={() => setPick(x.recipe.id)}>
            <CapDot color={x.batch?.cap_color} size={22} />
            <span><strong>{x.recipe.name}</strong><small>{x.recipe.style ?? ""}</small></span>
          </button>
        ))}
      </div>

      {beer && (
        <>
          <div className="ut-result rv-cost">
            <div><small>Costo a bottiglia</small><strong>{eur(perBottle)}</strong></div>
            <div><small>Bottiglie prodotte</small><strong>{bottles || "—"}</strong></div>
            <div className="ut-total"><small>Costo totale della birra</small><strong>{eur(totalCost)}</strong>
              {!beer.sum.complete && <span className="muted small rv-est"><Hourglass size={13} /> in parte stimato: completa i dati in Costi birre</span>}</div>
          </div>

          <div className="ut-steppers">
            <Stepper label="Prezzo di vendita a bottiglia" value={price} step={0.5} digits={2} onChange={setPrice} unit="€" />
          </div>
          {note && <p className="muted small">{note}</p>}

          <div className={"rv-even" + (breakEven > bottles && bottles ? " bad" : "")}>
            <TrendingUp size={20} />
            {!isFinite(breakEven) ? <span>Metti un prezzo per sapere quando rientrate.</span>
              : breakEven > bottles && bottles
                ? <span>Anche vendendole tutte e {bottles} non rientrate: servirebbe un prezzo di almeno <strong>{eur(Math.ceil((totalCost / bottles) * 10) / 10)}</strong>.</span>
                : <span>Per andare in pari bisogna venderne <strong>{breakEven}</strong>{bottles ? ` su ${bottles}` : ""}. Ogni bottiglia vi lascia <strong>{eur(margin)}</strong> oltre al suo costo.</span>}
          </div>

          {bottles > 0 && (
            <div className="ut-co2">
              <div className="ut-co2-head"><span>Bottiglie vendute</span><strong>{n} su {bottles}</strong></div>
              <input type="range" min={0} max={bottles} step={1} value={n} onChange={(e) => setSold(Number(e.target.value))} />
              <div className="ut-co2-range"><span>0</span>{isFinite(breakEven) && breakEven <= bottles && <span className="muted small">pari a {breakEven}</span>}<span>tutte</span></div>
            </div>
          )}

          <div className="ut-result">
            <div><small>Incasso</small><strong>{eur(revenue)}</strong></div>
            <div className={profit >= 0 ? "rv-pos" : "rv-neg"}><small>{profit >= 0 ? "Guadagno" : "Ancora da recuperare"}</small><strong>{eur(Math.abs(profit))}</strong></div>
            <div className="ut-total"><small>A testa ({soci} soci)</small><strong className={profit >= 0 ? "rv-pos-t" : "rv-neg-t"}>{profit >= 0 ? "+" : "−"}{eur(Math.abs(profit) / soci)}</strong></div>
            {bottles > 0 && n < bottles && <div className="ut-total"><small>Se le vendete tutte</small><strong>{eur(bottles * price)} di incasso · {eur(bottles * price - totalCost)} di guadagno</strong></div>}
          </div>
          <p className="muted small">I costi sono quelli di Economia → Costi birre (materie prime, bottiglie, tappi, corrente e acqua). Il guadagno è l'incasso meno il costo di tutta la birra prodotta.</p>
        </>
      )}
    </div>
  );
}
