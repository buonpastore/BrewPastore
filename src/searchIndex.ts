/** Indice delle sezioni dell'app per la ricerca in Impostazioni (titolo, dove si trova, parole chiave). */
export interface SearchEntry { title: string; where: string; to: string; emoji: string; keys: string }

const E = (emoji: string, title: string, where: string, to: string, keys = ""): SearchEntry => ({ emoji, title, where, to, keys });

export const SEARCH_INDEX: SearchEntry[] = [
  E("🏠", "Home", "Home", "/", "inizio benvenuto curiosità task eventi del mese ultimi messaggi batch in corso"),
  // Produzione
  E("📖", "Ricette", "Produzione", "/ricette", "ricetta nuova importa stile birre famose archiviate"),
  E("➕", "Nuova ricetta / importa da foto o testo", "Produzione → Ricette", "/ricette", "importare foto screenshot pdf testo kit"),
  E("💧", "Acqua della ricetta (mash e sparge)", "Produzione → Ricette → una ricetta → Acqua", "/ricette", "litri calcolatore acqua mash sparge"),
  E("🔥", "Piano di cotta", "Produzione → Ricette → una ricetta → Cottura", "/ricette", "cottura mash bollitura luppoli gittate whirlpool mash-out"),
  E("🍺", "Batch", "Produzione", "/batch", "cotta fermentazione imbottigliamento lotto nuovo batch"),
  E("📅", "Date del batch", "Produzione → Batch → un batch → Modifica le date", "/batch", "data cotta fermentata imbottigliata degustata esaurita"),
  E("🧪", "Acido lattico e pH dell'acqua", "Produzione → Batch → un batch → Correzione acqua del mash", "/batch", "acido lattico ph correzione acqua"),
  E("⚖️", "Densità OG FG e grado alcolico", "Produzione → Batch → un batch", "/batch", "og fg gravity densità alcol abv"),
  E("⭐", "Degustazioni", "Produzione", "/degustazioni", "voto stelle note classifica assaggio"),
  E("🍽️", "Abbinamenti con il cibo", "Produzione → Degustazioni → Abbinamenti", "/degustazioni?vista=abbinamenti", "piatti cibo antipasti primi secondi dolci ricetta foto"),
  E("🍾", "Cantina", "Produzione", "/cantina", "bottiglie mie tappi foto riconosci"),
  // Economia
  E("🧮", "Costi delle birre", "Economia", "/costi", "costo litro bottiglia ingredienti energia acqua"),
  E("🌾", "Materie prime (costi medi)", "Economia", "/materie-prime", "malti luppoli lieviti prezzi costo medio"),
  E("🧾", "Acquisti e fatture (ordini)", "Economia → Materie prime", "/materie-prime?vista=acquisti", "ordine fattura mr malt importa acquisto spedizione"),
  E("📈", "Ricavi: prezzo e andare in pari", "Economia → Ricavi → Calcolo", "/ricavi", "prezzo vendita guadagno pareggio netto"),
  E("🤝", "Vendite e clienti", "Economia → Ricavi → Vendite", "/ricavi?vista=vendite", "vendita clienti incassato pagamento paypal bonifico contanti"),
  E("🔧", "Preventivi impianto", "Economia", "/impianto", "preventivo fornitore confronto attrezzatura"),
  // Attività
  E("📋", "Task", "Attività", "/task", "cose da fare compiti importante"),
  E("💶", "Spese condivise", "Attività", "/spese", "spesa dividere soldi saldare scontrino"),
  E("💬", "Chat", "Attività", "/chat", "messaggi foto sondaggi"),
  E("📅", "Eventi a tema birra", "Attività", "/eventi", "festival corsi degustazioni umbria"),
  E("🔄", "Storico inserimenti degli eventi", "Attività → Eventi → icona dello storico", "/eventi?vista=storico", "aggiornamenti eventi aggiunti"),
  // Utilità
  E("✨", "Carbonazione (CO₂)", "Utilità → Strumenti", "/utilita/carbonazione", "priming zucchero co2 volumi"),
  E("🧪", "Correzione pH", "Utilità → Strumenti", "/utilita/ph", "acido lattico bicarbonato ph"),
  E("📏", "Correzione densità", "Utilità → Strumenti", "/utilita/densita", "zucchero og densità aggiungere"),
  E("🎚️", "Pressione bar/PSI", "Utilità → Strumenti", "/utilita/pressione", "bar psi kpa convertitore"),
  E("⏱️", "Timer dei luppoli", "Utilità → Strumenti", "/utilita/timer", "bollitura timer gittate"),
  E("🍼", "Conta bottiglie", "Utilità → Svago", "/utilita/bottiglie", "bottiglie 66 33 cl"),
  E("🎡", "Gira la bottiglia", "Utilità → Svago", "/utilita/ruota", "ruota gioco caso"),
  // Impostazioni
  E("👤", "Il mio profilo, foto e password", "Impostazioni → Utente", "/impostazioni?tab=utente", "nome foto avatar password cambiare"),
  E("🎨", "Colori e tema", "Impostazioni → Aspetto", "/impostazioni?tab=aspetto", "colori tema chiaro scuro"),
  E("💡", "Costi fissi (energia, acqua)", "Impostazioni → Costi fissi", "/impostazioni?tab=costi", "kwh energia acqua costi fissi"),
  E("⚙️", "Impianto (acqua/grani, evaporazione)", "Impostazioni → Impianto", "/impostazioni?tab=impianto", "rapporto evaporazione assorbimento perdite"),
  E("🔴", "Colori dei tappi", "Impostazioni → Tappi", "/impostazioni?tab=tappi", "tappi colori"),
  E("👥", "Soci", "Impostazioni → Soci", "/impostazioni?tab=utenti", "utenti soci ruoli"),
  E("📦", "Versioni dell'app e storico", "Impostazioni → App e storico", "/impostazioni?tab=app", "versione novità changelog storico modifiche"),
];

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Cerca: tutte le parole scritte devono comparire nel titolo, nel percorso o nelle parole chiave. */
export function searchApp(q: string): SearchEntry[] {
  const words = norm(q).split(/\s+/).filter((w) => w.length >= 2);
  if (!words.length) return [];
  return SEARCH_INDEX
    .map((e) => { const hay = norm(`${e.title} ${e.where} ${e.keys}`); const t = norm(e.title);
      return { e, ok: words.every((w) => hay.includes(w)), score: words.filter((w) => t.includes(w)).length }; })
    .filter((x) => x.ok).sort((a, b) => b.score - a.score).map((x) => x.e);
}
