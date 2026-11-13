/** Caratteristiche tipiche degli stili (valori indicativi, ispirati alle linee guida BJCP). */
export interface StyleInfo {
  og?: [number, number]; fg?: [number, number]; abv?: [number, number]; ibu?: [number, number]; ebc?: [number, number];
  ferm: string; origin: string; look: string; aroma: string; taste: string;
}

const S = (og: [number, number] | undefined, fg: [number, number] | undefined, abv: [number, number] | undefined, ibu: [number, number] | undefined, ebc: [number, number] | undefined,
  ferm: string, origin: string, look: string, aroma: string, taste: string): StyleInfo => ({ og, fg, abv, ibu, ebc, ferm, origin, look, aroma, taste });
const ALTA = "Alta fermentazione (ale)", BASSA = "Bassa fermentazione (lager)", SPONT = "Fermentazione spontanea / acida";

export const STYLE_GUIDE: Record<string, StyleInfo> = {
  "IPA": S([1.056, 1.070], [1.008, 1.014], [5.5, 7.5], [40, 70], [12, 28], ALTA, "Stati Uniti (nata in Inghilterra)",
    "Da dorata ad ambrata, limpida, schiuma bianca persistente.", "Luppolo intenso: agrumi, frutta tropicale, resina, pino.", "Amaro deciso ma pulito, base di malto leggera, finale secco."),
  "Weiss": S([1.044, 1.053], [1.008, 1.014], [4.3, 5.6], [8, 15], [4, 12], ALTA, "Baviera (Germania)",
    "Dorata chiara, velata per il lievito, schiuma alta e cremosa.", "Banana e chiodo di garofano dal lievito, note di frumento.", "Morbida e frizzante, amaro bassissimo, finale rinfrescante."),
  "Blanche": S([1.044, 1.052], [1.008, 1.012], [4.5, 5.5], [8, 20], [4, 8], ALTA, "Belgio",
    "Paglierina chiarissima, torbida, schiuma bianca e densa.", "Coriandolo e scorza d'arancia, note di frumento e speziate.", "Leggera, frizzante, leggermente acidula, finale secco."),
  "Dubbel": S([1.062, 1.075], [1.008, 1.018], [6.0, 7.6], [15, 25], [20, 33], ALTA, "Belgio (abbazie trappiste)",
    "Ambrata scura o ramata, schiuma color crema.", "Caramello, frutta secca, uvetta, prugna, note speziate.", "Maltata e morbida, poco amara, finale abbastanza secco."),
  "APA": S([1.045, 1.060], [1.010, 1.015], [4.5, 6.2], [30, 50], [10, 20], ALTA, "Stati Uniti",
    "Da dorata pallida ad ambrata chiara, limpida.", "Luppoli americani: agrumi, pompelmo, note floreali.", "Equilibrata, amaro medio, malto leggero tipo biscotto."),
  "English Ale": S([1.040, 1.048], [1.008, 1.012], [3.8, 4.6], [25, 40], [16, 32], ALTA, "Inghilterra",
    "Da dorata a ramata, limpida, schiuma moderata.", "Malto tipo biscotto e caramello, luppolo terroso e floreale, frutta dal lievito.", "Equilibrata, beverina, amaro medio, poca carbonazione."),
  "Winter Ale": S([1.060, 1.090], [1.012, 1.025], [6.0, 9.0], [20, 40], [25, 60], ALTA, "Tradizione nord europea (birre di Natale)",
    "Ambrata scura o marrone, riflessi rubino.", "Caramello, frutta secca, spezie (cannella, chiodi di garofano, scorza).", "Corposa e calda, alcol avvertibile, dolcezza maltata."),
  "Bock": S([1.064, 1.072], [1.013, 1.019], [6.3, 7.2], [20, 27], [28, 43], BASSA, "Germania (Einbeck, Baviera)",
    "Da ramata chiara a marrone, limpida, schiuma persistente.", "Malto ricco e tostato leggero, pane, nocciola.", "Maltata, morbida, poco amara, pulita."),
  "Doppelbock": S([1.072, 1.112], [1.016, 1.024], [7.0, 10.0], [16, 26], [12, 50], BASSA, "Baviera (monaci di Monaco)",
    "Da dorata scura a marrone scuro, limpida.", "Malto intenso, pane tostato, caramello, frutta scura.", "Ricca e dolce, corpo pieno, alcol caldo ma morbido."),
  "Saison": S([1.048, 1.065], [1.002, 1.008], [5.0, 7.0], [20, 35], [10, 28], ALTA, "Vallonia (Belgio), birra delle fattorie",
    "Da dorata pallida ad arancio, schiuma bianca abbondante.", "Speziato e pepato dal lievito, fruttato, note di agrumi.", "Molto secca e frizzante, amaro medio, finale asciutto e dissetante."),
  "Pilsner": S([1.044, 1.050], [1.008, 1.013], [4.4, 5.2], [22, 40], [4, 8], BASSA, "Germania / Boemia",
    "Paglierina chiara, brillante, schiuma bianca compatta.", "Luppolo nobile floreale e speziato, malto delicato.", "Secca, pulita, amaro deciso e netto."),
  "Helles": S([1.044, 1.048], [1.006, 1.012], [4.7, 5.4], [16, 22], [6, 10], BASSA, "Monaco di Baviera",
    "Dorata chiara, limpida.", "Malto dolce tipo pane fresco, luppolo leggero.", "Morbida e maltata, amaro basso, molto beverina."),
  "Lager": S([1.042, 1.050], [1.008, 1.012], [4.6, 6.0], [18, 25], [4, 12], BASSA, "Diffusione internazionale",
    "Paglierina, molto limpida, molto frizzante.", "Neutro, leggere note di cereale.", "Leggera, pulita, rinfrescante, amaro basso."),
  "Märzen": S([1.054, 1.060], [1.010, 1.014], [5.6, 6.3], [18, 24], [16, 33], BASSA, "Baviera (Oktoberfest)",
    "Ambrata o arancio ramato, limpida.", "Malto ricco tipo crosta di pane tostato.", "Maltata ma secca nel finale, amaro basso."),
  "Dunkel": S([1.048, 1.056], [1.010, 1.016], [4.5, 5.6], [18, 28], [33, 55], BASSA, "Baviera",
    "Marrone ramato scuro, limpida.", "Malto Monaco, crosta di pane, nocciola, cacao leggero.", "Maltata e morbida, poco amara, non tostata."),
  "Schwarzbier": S([1.046, 1.052], [1.010, 1.016], [4.4, 5.4], [20, 35], [37, 59], BASSA, "Turingia e Sassonia (Germania)",
    "Molto scura, quasi nera, riflessi rubino.", "Tostato leggero, cioccolato, caffè delicato.", "Secca e pulita, tostatura morbida senza asprezza."),
  "Vienna Lager": S([1.048, 1.055], [1.010, 1.014], [4.7, 5.5], [18, 30], [18, 30], BASSA, "Vienna (Austria)",
    "Ambrata rossastra, limpida.", "Malto tostato leggero, biscotto.", "Equilibrata, maltata ma secca."),
  "Rauchbier": S([1.050, 1.057], [1.012, 1.016], [4.8, 6.0], [20, 30], [24, 43], BASSA, "Bamberga (Germania)",
    "Ambrata scura o ramata, limpida.", "Affumicato di legno di faggio, malto tostato.", "Maltata, affumicata, finale abbastanza secco."),
  "Bitter": S([1.030, 1.039], [1.007, 1.011], [3.2, 3.8], [25, 35], [16, 28], ALTA, "Inghilterra",
    "Da ambrata chiara a ramata.", "Malto tipo biscotto, luppolo terroso inglese.", "Leggera, amara, poco carbonata, molto beverina."),
  "Golden Ale": S([1.038, 1.053], [1.006, 1.012], [3.8, 5.0], [20, 45], [4, 12], ALTA, "Regno Unito",
    "Dorata chiara, limpida.", "Luppolo floreale o agrumato, malto leggero.", "Secca, rinfrescante, amaro medio."),
  "Brown Ale": S([1.040, 1.052], [1.008, 1.013], [4.2, 5.4], [20, 30], [24, 43], ALTA, "Inghilterra",
    "Marrone ramato, limpida.", "Caramello, nocciola, cioccolato leggero.", "Maltata, morbida, amaro moderato."),
  "Irish Red Ale": S([1.036, 1.046], [1.010, 1.014], [3.8, 5.0], [18, 28], [18, 28], ALTA, "Irlanda",
    "Ramata con riflessi rossi, limpida.", "Caramello leggero, toffee, punta di tostato.", "Morbida, finale secco e leggermente tostato."),
  "Porter": S([1.040, 1.052], [1.008, 1.014], [4.0, 5.4], [18, 35], [39, 59], ALTA, "Londra",
    "Marrone scuro, riflessi rubino.", "Cioccolato, caramello, tostato leggero.", "Maltata e tostata, morbida, amaro medio."),
  "Stout": S([1.036, 1.044], [1.007, 1.011], [3.8, 5.0], [25, 45], [49, 79], ALTA, "Irlanda",
    "Nera, schiuma color nocciola densa.", "Caffè, orzo tostato, cioccolato amaro.", "Secca, tostata, amaro deciso, corpo leggero-medio."),
  "Imperial Stout": S([1.075, 1.115], [1.018, 1.030], [8.0, 12.0], [50, 90], [59, 79], ALTA, "Inghilterra / Russia imperiale",
    "Nera e impenetrabile, schiuma marrone.", "Tostato intenso, caffè, cioccolato, frutta scura, alcol.", "Corpo pieno, ricca e calda, amaro e tostatura importanti."),
  "Barley Wine": S([1.080, 1.120], [1.018, 1.030], [8.0, 12.0], [35, 70], [16, 43], ALTA, "Inghilterra",
    "Da ambrata a marrone ramato.", "Malto intenso, caramello, frutta secca, alcol.", "Ricca, dolce e calda, adatta all'invecchiamento."),
  "Scotch Ale": S([1.070, 1.130], [1.018, 1.040], [6.5, 10.0], [17, 35], [28, 49], ALTA, "Scozia",
    "Ramata scura o marrone, riflessi rubino.", "Caramello intenso, toffee, malto ricco.", "Dolce e maltata, corpo pieno, amaro basso."),
  "American Amber Ale": S([1.045, 1.060], [1.010, 1.015], [4.5, 6.2], [25, 40], [20, 33], ALTA, "Stati Uniti",
    "Ambrata o ramata, limpida.", "Caramello e luppoli americani agrumati.", "Equilibrio tra malto caramellato e amaro."),
  "Session IPA": S([1.038, 1.050], [1.006, 1.012], [3.7, 5.0], [30, 50], [6, 16], ALTA, "Stati Uniti",
    "Dorata chiara, limpida.", "Luppolo intenso: agrumi e frutta tropicale.", "Leggera e secca, amaro marcato, molto beverina."),
  "Double IPA": S([1.065, 1.085], [1.008, 1.018], [7.5, 10.0], [60, 100], [12, 28], ALTA, "Stati Uniti",
    "Da dorata ad arancio ramato.", "Luppolo esplosivo: resina, agrumi, tropicale.", "Amara e intensa, alcol presente ma ben nascosto."),
  "NEIPA": S([1.060, 1.085], [1.010, 1.015], [6.0, 9.0], [25, 60], [6, 14], ALTA, "New England (Stati Uniti)",
    "Gialla opaca, molto torbida (\"succo\").", "Frutta tropicale, pesca, mango, agrumi.", "Morbida e vellutata, amaro basso per una IPA."),
  "Black IPA": S([1.050, 1.085], [1.010, 1.018], [5.5, 9.0], [50, 90], [49, 79], ALTA, "Stati Uniti",
    "Nera o marrone molto scuro.", "Luppolo resinoso e agrumato con tostato leggero.", "Amara e secca, tostatura delicata."),
  "Cream Ale": S([1.042, 1.055], [1.006, 1.012], [4.2, 5.6], [8, 20], [5, 10], ALTA, "Stati Uniti",
    "Paglierina chiara, brillante.", "Cereale leggero, a volte mais dolce.", "Leggera, secca, frizzante."),
  "Tripel": S([1.075, 1.085], [1.008, 1.014], [7.5, 9.5], [20, 40], [9, 14], ALTA, "Belgio (abbazie trappiste)",
    "Dorata intensa, limpida, schiuma bianca abbondante.", "Speziato e fruttato dal lievito, note di agrumi.", "Secca nonostante l'alcol, frizzante, amaro medio."),
  "Quadrupel": S([1.075, 1.110], [1.010, 1.024], [8.0, 12.0], [20, 35], [24, 43], ALTA, "Belgio",
    "Da ambrata scura a marrone.", "Frutta scura, uvetta, caramello, spezie.", "Ricca e calda, corpo pieno, finale morbido."),
  "Belgian Strong Ale": S([1.070, 1.095], [1.005, 1.016], [7.5, 10.5], [22, 35], [6, 12], ALTA, "Belgio",
    "Dorata, limpida, schiuma bianca abbondante.", "Fruttato (pera, agrumi) e speziato, alcol.", "Molto secca e frizzante, alcol ben nascosto."),
  "Belgian Blonde": S([1.062, 1.075], [1.008, 1.018], [6.0, 7.5], [15, 30], [8, 12], ALTA, "Belgio",
    "Dorata, limpida.", "Malto dolce leggero, fruttato e speziato dal lievito.", "Morbida, leggermente dolce, finale secco."),
  "Kölsch": S([1.044, 1.050], [1.007, 1.011], [4.4, 5.2], [18, 30], [7, 10], ALTA, "Colonia (Germania)",
    "Paglierina chiara, brillante.", "Malto delicato, leggero fruttato.", "Pulita, secca, delicata, molto beverina."),
  "Altbier": S([1.044, 1.052], [1.008, 1.014], [4.3, 5.5], [25, 50], [18, 33], ALTA, "Düsseldorf (Germania)",
    "Da ambrata a ramata scura, limpida.", "Malto ricco tipo pane, luppolo speziato.", "Amara e maltata, finale secco."),
  "Dunkelweizen": S([1.044, 1.057], [1.008, 1.014], [4.3, 5.6], [10, 18], [28, 45], ALTA, "Baviera",
    "Marrone ramato, velata.", "Banana, chiodo di garofano, pane scuro, caramello.", "Morbida e frizzante, maltata, poco amara."),
  "Weizenbock": S([1.064, 1.090], [1.015, 1.022], [6.5, 9.0], [15, 30], [12, 49], ALTA, "Baviera",
    "Da dorata a marrone scuro, velata.", "Banana, frutta scura, malto ricco.", "Corposa, morbida, alcol caldo."),
  "Berliner Weisse": S([1.028, 1.032], [1.003, 1.006], [2.8, 3.8], [3, 8], [4, 6], SPONT, "Berlino",
    "Paglierina chiarissima, velata.", "Acido lattico pulito, frumento.", "Molto acida, leggerissima, frizzante."),
  "Gose": S([1.036, 1.056], [1.006, 1.010], [4.2, 4.8], [5, 12], [6, 8], SPONT, "Lipsia / Goslar (Germania)",
    "Paglierina, velata.", "Coriandolo, limone, acidità leggera.", "Acidula e sapida (con sale), rinfrescante."),
  "Lambic": S([1.040, 1.054], [1.001, 1.010], [5.0, 6.5], [0, 10], [6, 12], SPONT, "Bruxelles (Belgio)",
    "Dorata, da velata a limpida, poco frizzante.", "Acido, rustico, \"stalla\", frutta.", "Acida e secca, complessa, amaro quasi assente."),
  "Sour Ale": S([1.040, 1.060], [1.002, 1.012], [4.0, 7.0], [0, 15], [4, 40], SPONT, "Varie (Belgio, Stati Uniti)",
    "Variabile, spesso velata.", "Acidità, frutta, note di lieviti selvaggi.", "Acida e rinfrescante, finale secco."),
  "Italian Grape Ale": S([1.043, 1.090], [1.004, 1.015], [4.8, 10.0], [10, 30], [10, 59], ALTA, "Italia",
    "Dal dorato al rosso intenso, secondo l'uva.", "Uva e mosto, frutta, note vinose.", "Secca e vinosa, amaro basso, acidità leggera."),
  "Birra alla frutta": S(undefined, undefined, undefined, undefined, undefined, ALTA, "Varie",
    "Riprende il colore della frutta usata.", "La frutta deve sentirsi bene ma in armonia con la birra base.", "Dipende dallo stile di base: la frutta non deve coprire tutto."),
};

const ALIASES: Record<string, string> = {
  "american ipa": "IPA", "english ipa": "IPA", "india pale ale": "IPA", "weizen": "Weiss", "hefeweizen": "Weiss", "weissbier": "Weiss", "weisse": "Weiss",
  "witbier": "Blanche", "wit": "Blanche", "american pale ale": "APA", "pale ale": "APA", "english pale ale": "English Ale", "best bitter": "English Ale",
  "christmas": "Winter Ale", "natale": "Winter Ale", "bibock": "Doppelbock", "pils": "Pilsner", "oktoberfest": "Märzen", "marzen": "Märzen",
  "hazy ipa": "NEIPA", "new england ipa": "NEIPA", "dipa": "Double IPA", "imperial ipa": "Double IPA", "quad": "Quadrupel", "golden strong": "Belgian Strong Ale",
  "irish stout": "Stout", "dry stout": "Stout", "russian imperial stout": "Imperial Stout", "wee heavy": "Scotch Ale", "farmhouse": "Saison", "iga": "Italian Grape Ale",
  "amber ale": "American Amber Ale", "red ale": "Irish Red Ale", "kolsch": "Kölsch", "alt": "Altbier",
};

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

/** Trova lo stile anche se scritto in modo diverso (es. "American IPA", "Hefeweizen"). */
export function findStyle(style: string | null | undefined): { name: string; info: StyleInfo } | null {
  if (!style) return null;
  const s = ` ${norm(style)} `;
  const cands: [string, string][] = [...Object.keys(STYLE_GUIDE).map((k) => [norm(k), k] as [string, string]), ...Object.entries(ALIASES).map(([a, k]) => [norm(a), k] as [string, string])];
  const exact = cands.find(([n]) => ` ${n} ` === s);
  const best = exact ?? cands.filter(([n]) => s.includes(` ${n} `)).sort((a, b) => b[0].length - a[0].length)[0];
  return best ? { name: best[1], info: STYLE_GUIDE[best[1]] } : null;
}

/** Volumi di CO₂ tipici di ogni stile (indicativi). */
export const STYLE_CO2: Record<string, [number, number]> = {
  "IPA": [2.2, 2.7], "Weiss": [3.3, 4.0], "Blanche": [2.8, 3.3], "Dubbel": [2.4, 2.9], "APA": [2.3, 2.8], "English Ale": [1.8, 2.3],
  "Winter Ale": [2.0, 2.5], "Bock": [2.2, 2.6], "Doppelbock": [2.2, 2.6], "Saison": [2.8, 3.5], "Pilsner": [2.4, 2.7], "Helles": [2.3, 2.6],
  "Lager": [2.5, 2.8], "Märzen": [2.2, 2.6], "Dunkel": [2.2, 2.6], "Schwarzbier": [2.2, 2.6], "Vienna Lager": [2.3, 2.6], "Rauchbier": [2.2, 2.6],
  "Bitter": [1.5, 2.0], "Golden Ale": [2.0, 2.4], "Brown Ale": [1.8, 2.3], "Irish Red Ale": [2.0, 2.4], "Porter": [1.8, 2.4], "Stout": [1.8, 2.3],
  "Imperial Stout": [1.8, 2.3], "Barley Wine": [1.6, 2.2], "Scotch Ale": [1.6, 2.2], "American Amber Ale": [2.2, 2.6], "Session IPA": [2.3, 2.7],
  "Double IPA": [2.2, 2.6], "NEIPA": [2.3, 2.6], "Black IPA": [2.2, 2.6], "Cream Ale": [2.5, 2.8], "Tripel": [2.8, 3.5], "Quadrupel": [2.3, 2.9],
  "Belgian Strong Ale": [2.8, 3.5], "Belgian Blonde": [2.4, 2.9], "Kölsch": [2.4, 2.8], "Altbier": [2.3, 2.6], "Dunkelweizen": [3.3, 4.0],
  "Weizenbock": [3.2, 3.8], "Berliner Weisse": [3.0, 3.5], "Gose": [2.8, 3.2], "Lambic": [2.0, 2.8], "Sour Ale": [2.5, 3.0],
  "Italian Grape Ale": [2.4, 3.0], "Birra alla frutta": [2.4, 2.8],
};

/** CO₂ obiettivo: dalla ricetta se è scritta (es. «Carbonazione: 2,5–3,0 volumi»), altrimenti media dello stile. */
export function recipeCo2(recipe?: { procedure?: string | null; notes?: string | null; description?: string | null; style?: string | null } | null): { value: number; from: "ricetta" | "stile" } | null {
  const txt = [recipe?.procedure, recipe?.notes, recipe?.description].filter(Boolean).join("\n");
  const m = txt.match(/carbonazion[ea][^\d\n]{0,40}(\d(?:[.,]\d+)?)(?:\s*[–—-]\s*(\d(?:[.,]\d+)?))?/i) ?? txt.match(/(\d(?:[.,]\d+)?)(?:\s*[–—-]\s*(\d(?:[.,]\d+)?))?\s*vol(?:umi)?\s*(?:di\s*)?co/i);
  if (m) {
    const a = Number(m[1].replace(",", ".")), b = m[2] ? Number(m[2].replace(",", ".")) : a;
    const v = (a + b) / 2;
    if (v >= 1 && v <= 5) return { value: Math.round(v * 10) / 10, from: "ricetta" };
  }
  const st = findStyle(recipe?.style);
  const r = st ? STYLE_CO2[st.name] : null;
  return r ? { value: Math.round(((r[0] + r[1]) / 2) * 10) / 10, from: "stile" } : null;
}
