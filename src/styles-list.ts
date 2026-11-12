/** Stili di birra per il menu a tendina delle ricette. */
export const OUR_STYLES = [
  "IPA", "Weiss", "Blanche", "Dubbel", "APA", "English Ale", "Winter Ale", "Bock", "Doppelbock",
];

export const FAMOUS_STYLES = [
  // basse fermentazioni
  "Pilsner", "Helles", "Lager", "Märzen", "Dunkel", "Schwarzbier", "Vienna Lager", "Rauchbier",
  // ale inglesi e irlandesi
  "Bitter", "Golden Ale", "Brown Ale", "Irish Red Ale", "Porter", "Stout", "Imperial Stout", "Barley Wine", "Scotch Ale",
  // americane
  "American Amber Ale", "Session IPA", "Double IPA", "NEIPA", "Black IPA", "Cream Ale",
  // belghe
  "Tripel", "Quadrupel", "Belgian Strong Ale", "Saison", "Belgian Blonde",
  // tedesche ad alta fermentazione
  "Kölsch", "Altbier", "Dunkelweizen", "Weizenbock",
  // acide e speciali
  "Berliner Weisse", "Gose", "Lambic", "Sour Ale", "Italian Grape Ale", "Birra alla frutta",
];

export const STYLE_OPTIONS: { value: string; label: string; disabled?: boolean }[] = [
  ...OUR_STYLES.map((s) => ({ value: s, label: s })),
  { value: "__sep__", label: "──── altri stili famosi ────", disabled: true },
  ...FAMOUS_STYLES.map((s) => ({ value: s, label: s })),
];
