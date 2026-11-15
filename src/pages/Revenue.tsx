import { useEffect, useMemo, useState } from "react";
import { Hourglass } from "lucide-react";
import { supabase, eur, num, errMsg, type Row } from "../lib";
import { useAuth } from "../auth";
import { CapDot, useCapColors } from "../components/CapColor";
import { Stepper } from "../components/Stepper";
import { isProduced, loadTasted } from "../cellar";
import { ingredientCost, neededTotals } from "../costs";
import { useCostData, beersOf } from "./BeerCosts";

const NEED_0022 = "Per salvare il prezzo di vendita esegui 0022_prezzo_vendita.sql su Supabase (intanto lo ricordo su questo telefono)";
const LKEY = "pastorizia-prezzi-vendita";
const KKEY = "pastorizia-bottiglie-tenute";

/** Prezzo tipico di vendita di una bottiglia da 66 cl di birra artigianale, per famiglia di stile. */
const STYLE_PRICES: { rx: RegExp; label: string; min: number; max: number }[] = [
  { rx: /tripel|quadrupel|dubbel|strong|barley|imperial|doppel|eisbock|belgian/i, label: "birre forti e belghe", min: 5, max: 7 },
  { rx: /ipa|pale ale|apa|neipa|hazy/i, label: "IPA e pale ale", min: 4.5, max: 6 },
  { rx: /stout|porter|schwarz/i, label: "scure (stout e porter)", min: 4.5, max: 6 },
  { rx: /saison|farmhouse|sour|gose|berliner/i, label: "saison e acide", min: 4.5, max: 6 },
  { rx: /weiss|weizen|blanche|wit|hefe/i, label: "di frumento", min: 4, max: 5 },
  { rx: /bock|amber|red|ros|bitter|altbier|m[aä]rzen|vienna|scotch/i, label: "ambrate e bock", min: 4, max: 5.5 },
  { rx: /pils|lager|helles|k[oö]lsch|blonde|golden/i, label: "chiare e lager", min: 3.5, max: 4.5 },
];

/** Economia → Ricavi: a quanto vendere una birra, quante bottiglie servono per andare in pari e quanto si guadagna. */
export function Revenue() {
  useCapColors();
  const { profiles, isAdmin } = useAuth();
  const soci = Math.max(1, profiles.length || 3);
  const data = useCostData();
  const [tasted, setTasted] = useState<Set<string> | null>(null);
  const [pick, setPick] = useState<string | null>(null);
  const [prices, setPrices] = useState<Record<string, number>>(() => { try { return JSON.parse(localStorage.getItem(LKEY) ?? "{}"); } catch { return {}; } });
  const [keeps, setKeeps] = useState<Record<string, number>>(() => { try { return JSON.parse(localStorage.getItem(KKEY) ?? "{}"); } catch { return {}; } });
  const [sold, setSold] = useState<number | null>(null);
  const [note, setNote] = useState("");
  useEffect(() => { loadTasted().then(setTasted); }, []);

  // birre in vendita: imbottigliate o degustate (le esaurite sono nello storico)
  const beers = useMemo(() => {
    if (!data || !tasted) return [];
    return beersOf(data).filter((x) => x.all.some((b) => isProduced(b, tasted)) && x.list.length > 0).map((x) => {
      const key = (b: Row) => String(b.bottling_date ?? b.brew_date ?? "");
      const batch = [...x.all].filter((b) => isProduced(b, tasted)).sort((a, b) => key(b).localeCompare(key(a)))[0];
      return { ...x, batch };
    });
  }, [data, tasted]);

  useEffect(() => { if (!pick && beers.length) setPick(beers[0].recipe.id); }, [beers, pick]);
  useEffect(() => { setSold(null); }, [pick]);
  const beer = beers.find((x) => x.recipe.id === pick);

  if (!data || !tasted) return <div><h1>Ricavi</h1><p className="muted">Caricamento…</p></div>;
  if (!beers.length) return <div><h1>Ricavi</h1><p className="note">Non ci sono birre imbottigliate o degustate da mettere in vendita.</p></div>;

  const perBottle = beer?.sum.perBottle ?? 0;
  const bottles = Math.max(0, Math.round(beer?.sum.bottles ?? 0));
  const totalCost = beer?.sum.total ?? 0;
  const saved = beer ? (prices[beer.recipe.id] ?? (beer.recipe.sale_price != null ? Number(beer.recipe.sale_price) : null)) : null;
  const price = saved ?? Math.max(1, Math.ceil(perBottle * 2 * 2) / 2);    // di partenza: circa il doppio del costo
  const keepEach = beer ? (keeps[beer.recipe.id] ?? Math.min(6, Math.floor(bottles / soci / 2))) : 0;
  const kept = Math.min(bottles, keepEach * soci);
  const sellable = Math.max(0, bottles - kept);
  const n = Math.min(sold ?? sellable, sellable);
  const margin = price - perBottle;
  const breakEven = price > 0 ? Math.ceil(totalCost / price) : Infinity;
  const evenOk = isFinite(breakEven) && breakEven <= sellable;
  const minPrice = sellable ? totalCost / sellable : null;
  const revenue = n * price;
  const profit = revenue - totalCost;
  const each = profit / soci;
  // quanto costa davvero a ciascuno ogni bottiglia che si tiene (dopo aver venduto le altre)
  const keptCostEach = keepEach > 0 ? Math.max(0, -each) / keepEach : null;

  const setPrice = async (v: number) => {
    if (!beer) return;
    const next = { ...prices, [beer.recipe.id]: v };
    setPrices(next);
    try { localStorage.setItem(LKEY, JSON.stringify(next)); } catch { /* niente */ }
    if (!isAdmin) return;
    const { error } = await supabase.from("recipes").update({ sale_price: v }).eq("id", beer.recipe.id);
    setNote(error ? (/sale_price/i.test(error.message) ? NEED_0022 : errMsg(error)) : "");
  };
  const setKeep = (v: number) => {
    if (!beer) return;
    const next = { ...keeps, [beer.recipe.id]: v };
    setKeeps(next); setSold(null);
    try { localStorage.setItem(KKEY, JSON.stringify(next)); } catch { /* niente */ }
  };

  // ---------- analisi ----------
  const analysis: { label: string; value: string; note: string; tone: "ok" | "warn" | "bad" | "info" }[] = [];
  if (beer) {
    const parts: [string, number][] = [["Materie prime", beer.sum.ingredients], ["Bottiglie e tappi", beer.sum.packaging], ["Corrente", beer.sum.energy], ["Acqua", beer.sum.water], ["Altro", beer.sum.other]];
    const top = [...parts].sort((a, b) => b[1] - a[1])[0];
    if (totalCost > 0 && top[1] > 0) {
      const pct = Math.round((top[1] / totalCost) * 100);
      analysis.push({ label: "Costo che pesa di più", value: `${top[0]} · ${pct}%`, note: `${eur(top[1])} su ${eur(totalCost)}`, tone: pct > 70 ? "warn" : "info" });
    }
    // ingrediente più caro
    const needed = neededTotals(beer.ings, data.mats);
    const ingCosts = beer.ings.map((i: Row) => ({ name: i.name as string, cost: ingredientCost(i, data.mats, needed).cost ?? 0 })).filter((x: { cost: number }) => x.cost > 0)
      .sort((a: { cost: number }, b: { cost: number }) => b.cost - a.cost);
    if (ingCosts.length && beer.sum.ingredients > 0) {
      const t = ingCosts[0], pct = Math.round((t.cost / beer.sum.ingredients) * 100);
      analysis.push({ label: "Ingrediente più caro", value: `${t.name} · ${eur(t.cost)}`, note: `${pct}% delle materie prime${pct >= 40 ? ": vale la pena cercarlo a meno" : ""}`, tone: pct >= 40 ? "warn" : "info" });
    }
    // costo a bottiglia (66 cl fatta in casa: di solito 0,8–1,5 €)
    analysis.push({ label: "Costo a bottiglia", value: eur(perBottle),
      note: perBottle > 1.6 ? "alto per una birra fatta in casa (di solito 0,80–1,50 €)" : perBottle < 0.6 ? "molto basso: controlla che ci siano tutti i costi" : "nella norma per una birra fatta in casa",
      tone: perBottle > 1.6 ? "bad" : perBottle < 0.6 ? "warn" : "ok" });
    // prezzo tipico per lo stile
    const st = STYLE_PRICES.find((x) => x.rx.test(`${beer.recipe.style ?? ""} ${beer.recipe.name ?? ""}`));
    if (st) {
      const tone = price < st.min ? "warn" : price > st.max ? "warn" : "ok";
      analysis.push({ label: "Prezzo tipico dello stile", value: `${eur(st.min)} – ${eur(st.max)}`, note: `per le ${st.label}: ${price < st.min ? "state chiedendo poco, potete alzarlo" : price > st.max ? "il vostro prezzo è sopra la media" : "il vostro prezzo è in linea"}`, tone });
    }
    // guadagnare 50 € a testa
    if (margin > 0) {
      const goal = 50 * soci;
      const need = Math.ceil((totalCost + goal) / price);
      if (need <= sellable) analysis.push({ label: "Per guadagnare 50 € a testa", value: `vendere ${need} bottiglie`, note: `su ${sellable} che avete da vendere`, tone: "ok" });
      else {
        // producendo di più: il costo cresce con le bottiglie, il guadagno arriva dal margine
        const more = Math.ceil(goal / margin) + kept;
        analysis.push({ label: "Per guadagnare 50 € a testa", value: `servono ${more} bottiglie`, note: `producendone di più (circa ${num(more * 0.66, 0)} L), oppure alzando il prezzo`, tone: "warn" });
      }
    } else analysis.push({ label: "Margine", value: eur(margin), note: "il prezzo non copre il costo della bottiglia: va alzato", tone: "bad" });
    if (!beer.sum.complete) analysis.push({ label: "Dati", value: "in parte stimati", note: "completa i dati in Costi birre per numeri più precisi", tone: "warn" });
  }

  return (
    <div>
      <h1>Ricavi</h1>

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
          <div className="ut-steppers">
            <Stepper label="Prezzo di vendita a bottiglia" value={price} step={0.5} digits={2} onChange={setPrice} unit="€" />
            <Stepper label={`Bottiglie che si tiene ognuno (${soci} soci)`} value={keepEach} step={1} digits={0} onChange={setKeep} max={Math.floor(bottles / soci)} />
          </div>
          {note && <p className="muted small">{note}</p>}

          <h3 className="rv-h">Andare in pari</h3>
          <table className="rv-table">
            <tbody>
              <tr><td>Costo totale della birra{!beer.sum.complete && <Hourglass size={13} className="rv-hg" />}</td><td>{eur(totalCost)}</td></tr>
              <tr><td>Costo a bottiglia</td><td>{eur(perBottle)}</td></tr>
              <tr><td>Bottiglie prodotte</td><td>{bottles || "—"}</td></tr>
              <tr><td>Bottiglie che vi tenete</td><td>{kept} <small>({keepEach} a testa)</small></td></tr>
              <tr><td>Bottiglie da vendere</td><td><strong>{sellable}</strong></td></tr>
              <tr><td>Prezzo di vendita</td><td>{eur(price)}</td></tr>
              <tr><td>Margine a bottiglia</td><td className={margin >= 0 ? "pos" : "neg"}>{margin >= 0 ? "+" : "−"}{eur(Math.abs(margin))}</td></tr>
              <tr className="rv-key"><td>Da vendere per andare in pari</td><td className={evenOk ? "pos" : "neg"}>{isFinite(breakEven) ? <>{breakEven} <small>{sellable ? `(${Math.round((breakEven / sellable) * 100)}% di quelle da vendere)` : ""}</small></> : "—"}</td></tr>
              {minPrice != null && <tr><td>Prezzo minimo per rientrare vendendole tutte</td><td>{eur(Math.ceil(minPrice * 10) / 10)}</td></tr>}
            </tbody>
          </table>

          {sellable > 0 && (
            <div className="ut-co2">
              <div className="ut-co2-head"><span>Bottiglie vendute</span><strong>{n} su {sellable}</strong></div>
              <input type="range" min={0} max={sellable} step={1} value={n} onChange={(e) => setSold(Number(e.target.value))} />
              <div className="ut-co2-range"><span>0</span>{evenOk && <span className="muted small">pari a {breakEven}</span>}<span>tutte</span></div>
            </div>
          )}

          <h3 className="rv-h">Netto</h3>
          <table className="rv-table">
            <tbody>
              <tr><td>Incasso ({n} bottiglie)</td><td>{eur(revenue)}</td></tr>
              <tr><td>Costo di tutta la birra</td><td>−{eur(totalCost)}</td></tr>
              <tr className="rv-key"><td>{profit >= 0 ? "Guadagno" : "Ancora da recuperare"}</td><td className={profit >= 0 ? "pos" : "neg"}>{eur(Math.abs(profit))}</td></tr>
              <tr><td>A testa ({soci} soci)</td><td className={profit >= 0 ? "pos" : "neg"}>{profit >= 0 ? "+" : "−"}{eur(Math.abs(each))}</td></tr>
              {keepEach > 0 && <tr><td>Bottiglie che si tiene ognuno</td><td>{keepEach} <small>{keptCostEach != null && keptCostEach > 0 ? `· gli costano ${eur(keptCostEach)} l'una` : "· gratis, pagate dalle vendite"}</small></td></tr>}
              {sellable > 0 && n < sellable && <tr><td>Se le vendete tutte ({sellable})</td><td>{eur(sellable * price - totalCost)} <small>· {eur((sellable * price - totalCost) / soci)} a testa</small></td></tr>}
            </tbody>
          </table>

          {analysis.length > 0 && (
            <>
              <h3 className="rv-h">Analisi</h3>
              <table className="rv-table rv-analysis">
                <tbody>
                  {analysis.map((a, i) => (
                    <tr key={i} className={"tone-" + a.tone}>
                      <td><span className="rv-dot" />{a.label}</td>
                      <td><strong>{a.value}</strong><small>{a.note}</small></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </>
      )}
    </div>
  );
}
