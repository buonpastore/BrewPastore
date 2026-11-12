# 🍺 BrewPastore

Web app per gestire la produzione di birra di 3 soci: ricette, log delle cotte, costi, spese condivise, preventivi impianto e chat.

## Cosa fa

| Sezione | Contenuto |
|---|---|
| **Ricette** | Scheda completa, ingredienti, duplica ricetta. Ingredienti importabili da **screenshot** (es. chat con un'AI), foto o PDF. |
| **Batch** | Log della cotta: pH acqua iniziale e corretto, correzioni acqua (sali/acidi), pH mash, gravity pre/post-sparge, OG, FG, ABV automatico. Date di cotta, fermentazione, imbottigliamento, prima bevuta. Diario di fermentazione. **Carbonazione** (metodo, zucchero, volumi CO₂) con calcolatore del priming. |
| **Costi** | Costo per batch, per bottiglia e per litro: materie prime al costo medio ponderato degli acquisti + bottiglie/tappi + energia/acqua. |
| **Acquisti** | Carichi la fattura PDF (Mr Malt o altri), uno screenshot, la foto dello scontrino o l'email `.eml`: l'AI estrae le righe e tu confermi. |
| **Materie prime** | Costo medio di ogni materia prima, storico prezzi per fornitore, unione dei doppioni. |
| **Spese condivise** | Ognuno dei 3 carica lo scontrino di una spesa e la divide; i rimborsi si registrano con metodo (bonifico / PayPal / contanti) e chi li riceve li conferma. Saldi automatici "chi deve a chi". |
| **Preventivi impianto** | Progetti di ampliamento con preventivi di più fornitori, **versioni** (v1, v2…), confronto affiancato. Import da **Excel** (.xlsx) o da **screenshot/PDF**. |
| **Documenti** | Allegati per ricetta, batch e acquisto. |
| **Chat** | Chat generale + una chat per ogni ricetta e batch, in tempo reale. |
| **Storico versioni** | Ogni modifica crea una versione con autore, data e differenze; l'admin può ripristinare. |
| **La birra del giorno** | Al login un popup con una delle 500 frasi (curiosità, storia, consigli, proverbi, battute), uguale per tutti e diversa ogni giorno. |

**Ruoli**: l'amministratore modifica tutto; gli altri due consultano, scrivono in chat e gestiscono le *proprie* spese e rimborsi. I permessi sono applicati dal database (Row Level Security), non solo dall'interfaccia.

## Architettura

- **Frontend**: React + Vite + TypeScript, pubblicato gratis su **GitHub Pages**.
- **Backend**: **Supabase** (database Postgres, login, archivio file, realtime per la chat).
- **AI**: una Supabase Edge Function (`parse-document`) che usa Claude per leggere fatture, scontrini, ricette e preventivi. La chiave API resta sul server, mai nel browser.

```
supabase/migrations/   schema del database (da eseguire in ordine)
supabase/functions/    funzione AI per leggere i documenti
supabase/seed/         sorgenti delle 500 frasi + file Excel di esempio
src/                   applicazione web
```

---

## Messa in funzione (circa 20 minuti)

### 1. Supabase

1. Crea un account su [supabase.com](https://supabase.com) e un nuovo progetto (regione Europa, es. Francoforte).
2. Vai su **SQL Editor** e incolla/esegui **in ordine** i file di `supabase/migrations/`:
   `0001_schema.sql`, `0002_spese_condivise.sql`, `0003_birra_del_giorno.sql`, `0004_preventivi_impianto.sql`.
3. **Authentication → Sign In / Providers**: disattiva "Allow new users to sign up" (così nessun estraneo può registrarsi).
4. **Authentication → Users → Add user**: crea i 3 utenti (email + password, spunta "Auto Confirm User").
5. Rendi te stesso amministratore (SQL Editor):
   ```sql
   update profiles set role = 'admin', display_name = 'Stefano'
   where id = (select id from auth.users where email = 'TUA_EMAIL');
   update profiles set display_name = 'Nome socio' where id = (select id from auth.users where email = 'EMAIL_SOCIO');
   ```
6. **Authentication → URL Configuration**: imposta come Site URL l'indirizzo GitHub Pages (passo 3), serve per il "password dimenticata".

### 2. Funzione AI (lettura documenti)

Serve una chiave API Anthropic ([console.anthropic.com](https://console.anthropic.com)). Poi, dal computer, con la [Supabase CLI](https://supabase.com/docs/guides/cli):

```bash
supabase login
```
```bash
supabase link --project-ref IL_TUO_PROJECT_REF
```
```bash
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
```
```bash
supabase functions deploy parse-document
```

Costo indicativo: pochi centesimi per documento letto.

### 3. GitHub Pages

1. Crea un repository su GitHub (anche privato) e carica questo progetto.
2. **Settings → Secrets and variables → Actions → Variables**: aggiungi
   - `VITE_SUPABASE_URL` = Project URL (Supabase → Project Settings → API)
   - `VITE_SUPABASE_ANON_KEY` = chiave `anon` / publishable (è pubblica per design: la sicurezza è nelle policy del database)
3. **Settings → Pages → Source: GitHub Actions**.
4. Ogni `push` su `main` ripubblica il sito automaticamente (workflow in `.github/workflows/deploy.yml`).

> Nota: GitHub Pages su repository **privato** richiede un piano a pagamento. Con il piano gratuito il repository deve essere pubblico (il codice è visibile, i dati no: stanno in Supabase protetti da login).

### Sviluppo in locale

```bash
cp .env.example .env.local
```
```bash
npm install
```
```bash
npm run dev
```

## Note sui calcoli

- **Costo medio** materia prima = (spesa totale + quota di spedizione) ÷ quantità acquistata, su tutti gli acquisti. La spedizione è ripartita sulle righe in proporzione al valore.
- **ABV** = (OG − FG) × 131,25.
- **Priming**: CO₂ residua stimata dalla temperatura massima di fine fermentazione; fattori indicativi g/L per volume: saccarosio 3,94 · destrosio 4,3 · miele 4,8 · DME 5,6. È una stima: verifica sempre.
- **Frase del giorno**: ordine mescolato fisso, nessuna ripetizione per 500 giorni; cambia a mezzanotte (ora italiana).
- **Preventivi**: totale = Σ (q.tà × prezzo × (1 − sconto)) + IVA se i prezzi sono "IVA esclusa" + trasporto.
