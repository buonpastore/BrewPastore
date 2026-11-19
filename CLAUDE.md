# Pastorizia (ex BrewPastore) — istruzioni per le modifiche

- **Versione beta**: a OGNI modifica pubblicata aggiungere una voce IN CIMA a `CHANGELOG` in `src/version.ts`,
  con versione precedente + 0,001 (es. 0.045 → 0.046), data e ora italiane (gg/mm/aaaa hh:mm) e una descrizione
  breve in italiano, comprensibile a chi usa l'app. Alla 1.0 si esce dalla beta.
- Lingua dell'interfaccia e dei testi: italiano.
- Colori: giallo (`--gold`), ciano (`--teal`), magenta (`--magenta`), viola lavanda (`--violet`) e verde luppolo (`--hop`)
  come accenti, su tema scuro. Nelle serie (menu, pulsanti, stati, schede, birre) l'ordine è sempre giallo, ciano, magenta,
  viola, verde luppolo; dalla sesta voce si ricomincia (vedi `ACCENTS` in `src/lib.ts`).
  Eccezione: le categorie di ingredienti hanno colori propri (`src/categories.ts`, variabili `--cat-*`):
  malti giallino, luppoli verdino, lieviti rosso, bottiglie verde scuro, ecc.
- Le modifiche al database vanno in un nuovo file `supabase/migrations/00NN_*.sql` (mai modificare quelli già eseguiti),
  e l'utente lo deve eseguire a mano nello SQL Editor di Supabase.
- Prima di pubblicare: `npx tsc --noEmit -p .` e `npm run build` senza errori.
- Eventi (Attività → Eventi): l'elenco è nel file `public/eventi.json`, aggiornato ogni giorno da un'attività pianificata
  che cerca eventi a tema birra in Umbria e Centro Italia. Il solo aggiornamento di `public/eventi.json` non richiede
  una voce nel `CHANGELOG` né il cambio di versione.
