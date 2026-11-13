# Pastorizia (ex BrewPastore) — istruzioni per le modifiche

- **Versione beta**: a OGNI modifica pubblicata aggiungere una voce IN CIMA a `CHANGELOG` in `src/version.ts`,
  con versione precedente + 0,001 (es. 0.045 → 0.046), data e ora italiane (gg/mm/aaaa hh:mm) e una descrizione
  breve in italiano, comprensibile a chi usa l'app. Alla 1.0 si esce dalla beta.
- Lingua dell'interfaccia e dei testi: italiano.
- Colori: solo giallo (`--gold`), ciano (`--teal`), magenta (`--magenta`) come accenti, su tema scuro.
  Eccezione: le categorie di ingredienti hanno colori propri (`src/categories.ts`, variabili `--cat-*`):
  malti giallino, luppoli verdino, lieviti rosso, bottiglie verde scuro, ecc.
- Le modifiche al database vanno in un nuovo file `supabase/migrations/00NN_*.sql` (mai modificare quelli già eseguiti),
  e l'utente lo deve eseguire a mano nello SQL Editor di Supabase.
- Prima di pubblicare: `npx tsc --noEmit -p .` e `npm run build` senza errori.
