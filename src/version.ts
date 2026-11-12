/**
 * Versione di BrewPastore.
 * Fase beta: ogni modifica pubblicata aumenta la versione di 0,001 fino ad arrivare alla 1.0.
 * Per una nuova versione aggiungere una voce IN CIMA all'elenco.
 */
export interface Release { version: string; date: string; text: string }

export const CHANGELOG: Release[] = [
  { version: "0.055", date: "13/11/2026 02:35", text: "Nuovo batch anche dalla sezione Batch con scelta della ricetta; i pulsanti di stato aprono solo la fase interessante" },
  { version: "0.054", date: "13/11/2026 02:20", text: "Scheda ricetta: riquadri ordinati (3+3 e 4), riassunto del procedimento e passi a schede con i dettagli in elenco" },
  { version: "0.053", date: "13/11/2026 02:05", text: "Ingredienti a riquadri con icona, nome colorato per categoria e quantità in evidenza" },
  { version: "0.052", date: "13/11/2026 01:55", text: "Scheda ricetta più bella: profilo della birra e processo con icone, descrizione a voci, procedimento a passi" },
  { version: "0.051", date: "13/11/2026 01:40", text: "Ingredienti colorati per categoria: malti giallino, luppoli verdino, lieviti rosso, bottiglie verde scuro e altri" },
  { version: "0.050", date: "13/11/2026 01:30", text: "Batch: pulsanti Salva ed Elimina in fondo all'inserimento dati, cestino nell'elenco batch; su telefono pulsanti e caselle grandi in tutta l'app" },
  { version: "0.049", date: "13/11/2026 01:15", text: "Batch: pulsanti Cotta / Fermentata / Imbottigliata / Bevuta oggi grandi, uno per riga, con la data quando fatto" },
  { version: "0.048", date: "13/11/2026 01:05", text: "Ricette: nelle schede stile, gradazione, amaro (IBU) e colore (EBC); ordini: solo data, fornitore, prezzo e articoli" },
  { version: "0.047", date: "13/11/2026 00:55", text: "Materie prime: «Rileggi tutti gli ordini salvati» sistema le righe importate male; nascoste le voci senza acquisti (create dalle ricette)" },
  { version: "0.046", date: "13/11/2026 00:40", text: "Spese: «Ho mandato soldi» mostra le tue quote non ancora pagate, le selezioni e scegli solo il metodo" },
  { version: "0.045", date: "13/11/2026 00:24", text: "Numero di versione beta (+0,001 a ogni modifica) e registro delle versioni in Impostazioni" },
  { version: "0.044", date: "13/11/2026 00:23", text: "Spese: 'Ho fatto una spesa' e 'Ho mandato soldi' sulla stessa riga, larghi uguali" },
  { version: "0.043", date: "13/11/2026 00:22", text: "Materie prime: elimina acquisto dall'elenco, elimina singole righe d'acquisto e materie prime create per errore" },
  { version: "0.042", date: "13/11/2026 00:21", text: "Materie prime: prima l'elenco acquisti, sotto l'importazione" },
  { version: "0.041", date: "13/11/2026 00:21", text: "Spese: aggiungi/vedi scontrino anche sulle spese già inserite; motto 'birre da pascolo'" },
  { version: "0.040", date: "13/11/2026 00:20", text: "Spese: pulsante 'Elimina spesa' evidente; eliminando una spesa si cancellano anche i pagamenti delle quote (0007)" },
  { version: "0.039", date: "13/11/2026 00:19", text: "Spese: per ogni spesa ogni socio segna 'Ho pagato' scegliendo solo il metodo; stato delle quote per spesa" },
  { version: "0.038", date: "13/11/2026 00:16", text: "Nuovo batch: niente finestra per il nome, si apre subito in modifica (nome, data cotta, stato)" },
  { version: "0.037", date: "13/11/2026 00:14", text: "Batch: scheda 'Inserisci dati' con caselle grandi, pulsanti +/-, salvataggio automatico e diario rapido" },
  { version: "0.036", date: "12/11/2026 23:00", text: "Ingredienti in primo piano divisi per tipo (colori della cottura), import in fondo; riassunto del procedimento e descrizione dalla ricetta importata" },
  { version: "0.035", date: "12/11/2026 21:00", text: "Import ricetta: salva anche se il database non ha ancora i campi dell'acqua" },
  { version: "0.034", date: "12/11/2026 20:55", text: "Avviso 'nuova versione disponibile' e numero di versione in Impostazioni" },
  { version: "0.033", date: "12/11/2026 19:51", text: "Import ricetta da testo: ignora le righe di procedimento (usate solo per il momento di aggiunta), nomi luppoli puliti, mash a step, intervalli OG/FG/IBU/EBC al valore medio" },
  { version: "0.032", date: "12/11/2026 19:13", text: "Ricetta: scheda Acqua (mash e sparge) con calcolatore; acqua copiata nei nuovi batch e letta dall'import" },
  { version: "0.031", date: "12/11/2026 19:11", text: "Solo tre colori: giallo, ciano, magenta per schede di sezione, riquadri e indicatori" },
  { version: "0.030", date: "12/11/2026 19:06", text: "Pubblicazione degli aggiornamenti più affidabile" },
  { version: "0.029", date: "12/11/2026 19:02", text: "Pulisci nomi ingredienti (ricetta e batch) con anteprima; reimport ricetta che sostituisce gli ingredienti" },
  { version: "0.028", date: "12/11/2026 19:00", text: "Ricetta: tolte le schede Chat e Storico versioni" },
  { version: "0.027", date: "12/11/2026 19:00", text: "Tema dall'etichetta Buon Pastore: icona app e favicon con la faccia della pecora, logo, pecora sfumata sullo sfondo, palette con i colori esatti dell'etichetta" },
  { version: "0.026", date: "12/11/2026 18:56", text: "Scheda Cottura (ricetta e batch), scheda Valori chimici (pH e 4 gravity), nomi ingredienti puliti nell'import, parametri modificabili nel riepilogo import" },
  { version: "0.025", date: "12/11/2026 18:50", text: "Menu: colori per sezione (Produzione gialla, Conti verde acqua, Chat magenta)" },
  { version: "0.024", date: "12/11/2026 18:48", text: "Ricette da testo senza AI; avena di nuovo tra i malti; pulsanti di import compatti (Screenshot, File, Testo)" },
  { version: "0.023", date: "12/11/2026 18:44", text: "Costi medi: prezzo ultimo acquisto; malti €/kg, luppoli €/g, lieviti €/unità; avena in 'altro'" },
  { version: "0.022", date: "12/11/2026 18:41", text: "Eliminazione: tolta la conferma con il nome, basta un clic" },
  { version: "0.021", date: "12/11/2026 18:38", text: "Elimina ricetta (con batch e dati collegati) ed elimina batch, con riepilogo e conferma" },
  { version: "0.020", date: "12/11/2026 18:36", text: "Saison tra gli stili principali" },
  { version: "0.019", date: "12/11/2026 18:11", text: "Acquisti: codice articolo letto, mostrato in verifica e salvato con la riga" },
  { version: "0.018", date: "12/11/2026 18:10", text: "Acquisti da testo letti senza AI (formato ordini Mr Malt e righe singole) + verifica a schede su telefono" },
  { version: "0.017", date: "12/11/2026 18:06", text: "Costi medi solo in consultazione: l'import resta in Acquisti e fatture" },
  { version: "0.016", date: "12/11/2026 18:05", text: "Import acquisti e ingredienti anche da testo incollato o scritto" },
  { version: "0.015", date: "12/11/2026 18:01", text: "Riquadro 'Incolla qui lo screenshot' sempre visibile in ingredienti ricetta e acquisti" },
  { version: "0.014", date: "12/11/2026 18:00", text: "Ricette: stile da menu a tendina (stili del gruppo + stili famosi + personalizzato), filtro per stile" },
  { version: "0.013", date: "12/11/2026 17:58", text: "Batch: scheda Valutazioni con calcoli (ABV, efficienza, attenuazione, calorie, confronto obiettivi) e assaggi" },
  { version: "0.012", date: "12/11/2026 17:41", text: "Rimosso il gas dai costi" },
  { version: "0.011", date: "12/11/2026 17:40", text: "Acquisti e Materie prime unificati in un'unica scheda" },
  { version: "0.010", date: "12/11/2026 17:31", text: "Navigazione a sezioni (Produzione, Conti) e nuova sezione Degustazioni" },
  { version: "0.009", date: "12/11/2026 17:27", text: "Incolla screenshot (Ctrl+V, pulsante Incolla, tieni premuto su telefono) in tutte le importazioni" },
  { version: "0.008", date: "12/11/2026 17:22", text: "Grafica rinnovata e navigazione stile app su telefono" },
  { version: "0.007", date: "12/11/2026 17:16", text: "Nuova grafica ispirata all'etichetta Buon Pastore" },
  { version: "0.006", date: "12/11/2026 17:12", text: "Acquisti: più screenshot per ordine, incolla con Ctrl+V, import anche da Materie prime" },
  { version: "0.005", date: "12/11/2026 17:10", text: "Icona e manifest per installare l'app sulla schermata Home del telefono" },
  { version: "0.004", date: "12/11/2026 17:06", text: "Configurazione del database sempre corretta sul sito pubblicato" },
  { version: "0.003", date: "12/11/2026 17:04", text: "Corretto l'indirizzo del database (errore al login)" },
  { version: "0.002", date: "12/11/2026 16:58", text: "Collegamento al database Supabase" },
  { version: "0.001", date: "12/11/2026 16:40", text: "BrewPastore: prima versione della web app" },
];

export const VERSION = CHANGELOG[0].version;
export const IS_BETA = Number(VERSION) < 1;
export const VERSION_LABEL = `v${VERSION.replace(".", ",")}${IS_BETA ? " beta" : ""}`;
