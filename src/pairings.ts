/* Abbinamenti birra–cibo per famiglia di stile, divisi per portata, con il motivo dell'abbinamento.
   (Regole classiche: affinità di aromi, contrasto, la carbonazione e l'amaro che puliscono il grasso,
   l'intensità della birra pari a quella del piatto.) */
import { findStyle } from "./styleGuide";

export type Course = "antipasto" | "primo" | "secondo" | "dolce";
export interface Dish { name: string; emoji: string; why: string }
export interface Pairing { family: string; intro: string; dishes: Record<Course, Dish[]> }

export const COURSES: { key: Course; label: string; emoji: string }[] = [
  { key: "antipasto", label: "Antipasti", emoji: "🥖" },
  { key: "primo", label: "Primi", emoji: "🍝" },
  { key: "secondo", label: "Secondi", emoji: "🍖" },
  { key: "dolce", label: "Dolci", emoji: "🍰" },
];

const D = (name: string, emoji: string, why: string): Dish => ({ name, emoji, why });

const FAMILIES: Record<string, Pairing> = {
  chiare: {
    family: "Chiare e lager", intro: "Birre leggere, secche e dissetanti: accompagnano piatti delicati senza coprirli e puliscono la bocca.",
    dishes: {
      antipasto: [
        D("Fritto misto di verdure", "🥦", "Le bollicine sgrassano la frittura e la bocca resta pulita a ogni boccone."),
        D("Prosciutto crudo e melone", "🍈", "Il malto leggero e dolce richiama il melone, l'amaro delicato bilancia il sale del prosciutto."),
      ],
      primo: [
        D("Spaghetti alle vongole", "🍝", "Birra secca e poco amara: non copre il sapore del mare e rinfresca."),
        D("Risotto agli asparagi", "🌱", "Le note erbacee dei luppoli nobili si sposano con l'asparago."),
      ],
      secondo: [
        D("Pizza margherita", "🍕", "L'abbinamento più classico: la birra pulisce mozzarella e olio, il malto richiama la pasta."),
        D("Frittura di pesce", "🐟", "Carbonazione vivace e finale secco tolgono l'unto senza coprire il pesce."),
      ],
      dolce: [
        D("Crostata di frutta fresca", "🥧", "Un dolce leggero e poco zuccherato non sovrasta una birra delicata."),
        D("Sorbetto al limone", "🍋", "Freschezza con freschezza: chiude il pasto in modo leggero."),
      ],
    },
  },
  frumento: {
    family: "Birre di frumento", intro: "Morbide e frizzanti, con note di banana, chiodo di garofano o agrumi e coriandolo: amano piatti freschi e speziati.",
    dishes: {
      antipasto: [
        D("Insalata di mare", "🦐", "La scorza d'arancia e il coriandolo esaltano i crostacei come un filo di agrume."),
        D("Mozzarella di bufala", "🧀", "La morbidezza del frumento accompagna la cremosità, le bollicine puliscono."),
      ],
      primo: [
        D("Pasta zucchine e gamberi", "🍤", "Piatto delicato e fresco come la birra: nessuno dei due copre l'altro."),
        D("Risotto al limone", "🍋", "Gli agrumi del piatto richiamano le note fruttate e speziate della birra."),
      ],
      secondo: [
        D("Weisswurst e bretzel", "🥨", "L'abbinamento bavarese di tradizione: salsiccia delicata e pane salato."),
        D("Pollo al curry", "🍛", "Le spezie del curry trovano eco nel chiodo di garofano e nel coriandolo della birra."),
      ],
      dolce: [
        D("Banana split", "🍌", "La banana richiama gli esteri fruttati del lievito delle weiss."),
        D("Torta allo yogurt e agrumi", "🍰", "Dolce soffice e acidulo, perfetto con una birra morbida e frizzante."),
      ],
    },
  },
  luppolate: {
    family: "IPA e pale ale", intro: "Luppolo protagonista: agrumi, resina, frutta tropicale e un amaro deciso che taglia grassi e piccante.",
    dishes: {
      antipasto: [
        D("Nachos con guacamole e salsa piccante", "🌶️", "L'amaro e gli agrumi del luppolo reggono il piccante e rinfrescano."),
        D("Formaggi stagionati (cheddar, pecorino)", "🧀", "L'amaro taglia il grasso e la sapidità del formaggio, gli aromi resistono al sapore forte."),
      ],
      primo: [
        D("Pasta al ragù piccante (all'arrabbiata)", "🍝", "Piatto saporito e piccante: serve una birra con carattere e amaro deciso."),
        D("Pad thai o noodles speziati", "🍜", "Lime, coriandolo e peperoncino si sposano con il luppolo agrumato."),
      ],
      secondo: [
        D("Hamburger con cheddar", "🍔", "L'amaro pulisce il grasso della carne e del formaggio, il malto richiama la crosta grigliata."),
        D("Pollo piccante alla griglia (alette)", "🍗", "Il piccante esalta l'amaro e il luppolo rinfresca il palato."),
      ],
      dolce: [
        D("Carrot cake", "🥕", "Le spezie e la crema al formaggio stanno bene con il luppolo fruttato e la base di malto."),
        D("Cheesecake al frutto della passione", "🥭", "I frutti tropicali del dolce richiamano i luppoli americani."),
      ],
    },
  },
  ambrate: {
    family: "Ambrate e maltate", intro: "Malto in evidenza (caramello, pane tostato, biscotto) e amaro moderato: perfette con carni e cucina di tradizione.",
    dishes: {
      antipasto: [
        D("Tagliere di salumi umbri", "🥓", "Il malto caramellato addolcisce il sale e le spezie dei salumi."),
        D("Bruschetta con fegatini", "🍞", "Il pane tostato della birra richiama la bruschetta, il corpo regge il fegato."),
      ],
      primo: [
        D("Strangozzi al tartufo", "🍄", "Le note tostate e di nocciola accompagnano il profumo terroso del tartufo."),
        D("Lasagne al forno", "🍝", "Corpo e caramello reggono il ragù e la besciamella senza appesantire."),
      ],
      secondo: [
        D("Porchetta", "🐖", "Il malto richiama la crosta croccante, le bollicine sgrassano la carne."),
        D("Arrosto di maiale con patate", "🥔", "Il caramello della birra fa da salsa alla carne arrosto."),
      ],
      dolce: [
        D("Crostata di mele e cannella", "🍎", "Mele cotte e cannella trovano eco nel caramello e nel biscotto del malto."),
        D("Torcolo umbro", "🍩", "Dolce semplice con uvetta e pinoli, accompagnato dalla morbidezza maltata."),
      ],
    },
  },
  scure: {
    family: "Scure e tostate", intro: "Caffè, cioccolato e tostato: abbinamenti per affinità con sapori intensi, affumicati e dolci al cacao.",
    dishes: {
      antipasto: [
        D("Ostriche", "🦪", "Abbinamento classico irlandese: la sapidità delle ostriche esalta il tostato della stout."),
        D("Formaggi erborinati (gorgonzola)", "🧀", "Il tostato e il dolce del malto bilanciano la forza e la sapidità dell'erborinato."),
      ],
      primo: [
        D("Pappardelle al ragù di cinghiale", "🐗", "Sapore selvatico e intenso che regge il corpo e il tostato della birra."),
        D("Risotto ai funghi porcini", "🍄", "Le note terrose e tostate si richiamano a vicenda."),
      ],
      secondo: [
        D("Costine di maiale BBQ", "🍖", "L'affumicato e la salsa dolce si sposano con le note di caffè e caramello bruciato."),
        D("Stufato di manzo alla birra", "🥘", "Cotto nella birra scura, ne condivide gli aromi: affinità perfetta."),
      ],
      dolce: [
        D("Torta al cioccolato fondente", "🍫", "Cioccolato con cioccolato: il tostato della birra esalta il cacao."),
        D("Tiramisù", "☕", "Caffè e cacao del dolce sono gli stessi aromi della stout."),
      ],
    },
  },
  belghe: {
    family: "Belghe e forti", intro: "Corpose e alcoliche, con frutta secca, spezie e caramello: vogliono piatti ricchi e formaggi importanti.",
    dishes: {
      antipasto: [
        D("Formaggi stagionati a crosta lavata", "🧀", "Birra potente per formaggi potenti: l'alcol e le spezie reggono il sapore deciso."),
        D("Paté di fegato con crostini", "🍞", "Il corpo morbido e le note di frutta secca accompagnano il paté come un vino passito."),
      ],
      primo: [
        D("Tagliatelle al ragù d'anatra", "🦆", "Carne grassa e saporita: il corpo e la frutta scura della birra la valorizzano."),
        D("Gnocchi al gorgonzola e noci", "🧀", "La dolcezza maltata e le noci si richiamano, l'alcol pulisce la crema."),
      ],
      secondo: [
        D("Carbonade fiamminga", "🥘", "Il piatto belga per eccellenza, stufato nella birra scura: abbinamento di casa."),
        D("Cosciotto di agnello alle erbe", "🍖", "Le spezie e gli esteri del lievito belga stanno bene con l'agnello."),
      ],
      dolce: [
        D("Panettone o pandoro", "🎄", "Uvetta, canditi e burro trovano eco nella frutta secca e nel caramello delle birre forti."),
        D("Tarte tatin", "🍎", "Mele caramellate e birra caramellata: dolce con dolce, intensità pari."),
      ],
    },
  },
  saison: {
    family: "Saison", intro: "Secche, speziate e molto frizzanti: tra le birre più versatili a tavola, dal pesce alle carni bianche.",
    dishes: {
      antipasto: [
        D("Caprino alle erbe", "🌿", "Le note pepate e erbacee della saison si sposano con il formaggio di capra."),
        D("Tartare di salmone", "🐟", "Secca e frizzante, pulisce il grasso del salmone e lo rinfresca."),
      ],
      primo: [
        D("Risotto allo zafferano", "🌼", "Lo speziato della birra accompagna lo zafferano senza coprirlo."),
        D("Pasta pesto e patate", "🌱", "Le erbe del pesto richiamano le note erbacee del lievito."),
      ],
      secondo: [
        D("Pollo arrosto alle erbe", "🍗", "Carne delicata e erbe aromatiche: la saison è come un vino bianco secco."),
        D("Cozze alla marinara", "🦪", "Abbinamento belga classico: secchezza e bollicine per i molluschi."),
      ],
      dolce: [
        D("Torta di ricotta e limone", "🍋", "Dolce fresco e poco zuccherato, adatto a una birra secca."),
        D("Biscotti allo zenzero", "🍪", "Lo zenzero richiama le spezie della saison."),
      ],
    },
  },
  acide: {
    family: "Acide e alla frutta", intro: "Acidità e frutta: funzionano come un vino frizzante, con piatti grassi da sgrassare e dolci alla frutta.",
    dishes: {
      antipasto: [
        D("Burrata con pomodorini", "🍅", "L'acidità taglia la cremosità della burrata come un filo di aceto."),
        D("Salmone affumicato", "🐟", "Acido e affumicato si bilanciano, le bollicine puliscono il grasso."),
      ],
      primo: [
        D("Risotto ai frutti di bosco", "🫐", "La frutta del piatto e della birra si richiamano."),
        D("Insalata di farro con feta", "🥗", "Piatto fresco e sapido, l'acidità della birra fa da condimento."),
      ],
      secondo: [
        D("Anatra all'arancia", "🦆", "Carne grassa e salsa agrumata: l'acidità la sgrassa e la frutta la accompagna."),
        D("Capesante scottate", "🐚", "Acidità e freschezza esaltano la dolcezza delle capesante."),
      ],
      dolce: [
        D("Cheesecake ai frutti rossi", "🍓", "Frutta rossa con frutta rossa (kriek, framboise): abbinamento per affinità."),
        D("Panna cotta con coulis di lamponi", "🍮", "L'acidità alleggerisce la panna e la frutta si richiama."),
      ],
    },
  },
  affumicate: {
    family: "Affumicate", intro: "Fumo di legno di faggio e malto: si abbinano a carni affumicate e cucina di montagna.",
    dishes: {
      antipasto: [
        D("Speck e formaggio affumicato", "🥓", "Affumicato con affumicato: gli aromi si fondono."),
        D("Scamorza alla piastra", "🧀", "Il fumo della birra richiama quello della scamorza."),
      ],
      primo: [
        D("Canederli allo speck", "🥟", "Cucina di montagna con speck: il fumo della birra lo esalta."),
        D("Pasta alla carbonara", "🥚", "Il guanciale e il pepe reggono una birra affumicata e maltata."),
      ],
      secondo: [
        D("Würstel e crauti", "🌭", "Tradizione di Bamberga: salsicce e cavolo acido con la Rauchbier."),
        D("Grigliata mista", "🔥", "La brace della carne e il fumo della birra si richiamano."),
      ],
      dolce: [
        D("Strudel di mele", "🍎", "Mela e cannella addolciscono e bilanciano il fumo."),
        D("Cioccolato fondente al sale", "🍫", "Fumo, cacao e sale: un abbinamento sorprendente per affinità."),
      ],
    },
  },
};

const FAMILY_OF: Record<string, string> = {
  "Pilsner": "chiare", "Helles": "chiare", "Lager": "chiare", "Kölsch": "chiare", "Cream Ale": "chiare", "Golden Ale": "chiare", "Belgian Blonde": "chiare",
  "Weiss": "frumento", "Blanche": "frumento", "Dunkelweizen": "frumento",
  "IPA": "luppolate", "APA": "luppolate", "Session IPA": "luppolate", "Double IPA": "luppolate", "NEIPA": "luppolate", "Black IPA": "luppolate",
  "Märzen": "ambrate", "Vienna Lager": "ambrate", "Bock": "ambrate", "American Amber Ale": "ambrate", "Irish Red Ale": "ambrate", "Altbier": "ambrate",
  "Bitter": "ambrate", "English Ale": "ambrate", "Scotch Ale": "ambrate", "Dunkel": "ambrate", "Brown Ale": "ambrate",
  "Porter": "scure", "Stout": "scure", "Imperial Stout": "scure", "Schwarzbier": "scure",
  "Dubbel": "belghe", "Tripel": "belghe", "Quadrupel": "belghe", "Belgian Strong Ale": "belghe", "Barley Wine": "belghe", "Winter Ale": "belghe",
  "Weizenbock": "belghe", "Doppelbock": "belghe",
  "Saison": "saison",
  "Berliner Weisse": "acide", "Gose": "acide", "Lambic": "acide", "Sour Ale": "acide", "Birra alla frutta": "acide", "Italian Grape Ale": "acide",
  "Rauchbier": "affumicate",
};

/** Abbinamenti per lo stile di una birra (se lo stile non si riconosce, quelli delle ambrate, i più versatili). */
export function pairingFor(style?: string | null): Pairing & { styleName: string | null } {
  const found = findStyle(style);
  const fam = (found && FAMILY_OF[found.name]) || "ambrate";
  return { ...FAMILIES[fam], styleName: found?.name ?? null };
}

/** Foto del piatto: ricerca per immagini (si apre nel browser). */
export const dishPhotoUrl = (dish: string) => `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(`${dish} piatto`)}`;
