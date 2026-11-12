/** Colori e nomi delle categorie di ingredienti / materie prime (stessi in tutta l'app). */
export const CAT_INFO: Record<string, { label: string; color: string; emoji: string }> = {
  malto:      { label: "Malti",                          color: "var(--cat-malto)",      emoji: "🌾" },
  luppolo:    { label: "Luppoli",                        color: "var(--cat-luppolo)",    emoji: "🌿" },
  lievito:    { label: "Lieviti",                        color: "var(--cat-lievito)",    emoji: "🧫" },
  sali_acqua: { label: "Sali e correzioni dell'acqua",   color: "var(--cat-sali)",       emoji: "💧" },
  additivo:   { label: "Zuccheri e additivi",            color: "var(--cat-additivo)",   emoji: "🍬" },
  bottiglie:  { label: "Bottiglie",                      color: "var(--cat-bottiglie)",  emoji: "🍾" },
  tappi:      { label: "Tappi",                          color: "var(--cat-tappi)",      emoji: "🔩" },
  etichette:  { label: "Etichette",                      color: "var(--cat-etichette)",  emoji: "🏷️" },
  detergenti: { label: "Detergenti",                     color: "var(--cat-detergenti)", emoji: "🧴" },
  altro:      { label: "Altro",                          color: "var(--cat-altro)",      emoji: "📦" },
};
export const catColor = (c?: string | null) => (CAT_INFO[c ?? ""] ?? CAT_INFO.altro).color;
export const catLabel = (c?: string | null) => (CAT_INFO[c ?? ""] ?? CAT_INFO.altro).label;
