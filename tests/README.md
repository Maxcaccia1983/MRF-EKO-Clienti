# Test del lettore CTE — MRF EKO

Questa cartella contiene **solo test**: non viene caricata dall'app, non modifica `index.html`, `parser-bolletta.js`, il service worker, il database o le policy.
Regole di riferimento: `00_REGOLE_INDEROGABILI_MRF_EKO`, in particolare le regole 13, 29, 31, 32 e 33.

## Struttura
```
tests/
├── cte/
│   ├── MANIFEST.json        registro dei documenti (fonte, hash, categoria, insieme)
│   ├── documenti/           PDF pubblici, nominati per CATEGORIA (es. luce-indicizzato-01.pdf)
│   ├── expected/            GOLDEN TRUTH verificata a mano (<id>.expected.json)
│   ├── baseline/            fotografia del parser attuale (NON verità)
│   └── testo/               testo estratto, per debug e audit
├── unit/                    casi sintetici: numeri, unità, formule indice + spread
├── schema/                  JSON Schema e documentazione (SCHEMA_CTE_v1.md)
├── riferimento/             esiti accettati, fornitori noti, eccezioni di universalità
├── accessi/                 prove di accesso Supabase (sola lettura)
└── runner/                  script Node dei test
```

## Regole del dataset
- **Solo CTE pubbliche ufficiali** scaricate dai siti dei fornitori. **Mai** documenti di clienti.
- Il test OCR usa una CTE pubblica stampata e riscansionata (`origine: pubblica_riscansionata`).
- Il nome del file indica la **categoria**. Il fornitore compare solo in `MANIFEST.json` e il parser non lo legge mai.
- `sha256` blocca la sostituzione accidentale di un PDF.
- Set iniziale minimo:
  - luce fisso;
  - luce PUN + spread;
  - gas fisso;
  - gas PSV + spread;
  - dual;
  - una CTE complessa;
  - un PDF difficile per l'OCR.

## Holdout e fornitori nuovi (prova di universalità)
- `insieme: "holdout"`: CTE **mai usata durante lo sviluppo**. Il report ne mostra solo i conteggi, e `genera-baseline` la salta. Se la si usa per correggere il parser, passa a `"sviluppo"` (con `data_passaggio_sviluppo`) e va sostituita da una nuova holdout.
- `fornitore_nuovo: true`: il fornitore non era presente in `cte_offerte` né nei documenti di sviluppo al momento dell'aggiunta.
- Il controllo statico (`controllo-universalita.mjs`) distingue due cose che **non sono la stessa**:
  - **riconoscere il nome** del fornitore per compilare il campo `fornitore`: è ammesso. Un nome noto nel codice fuori da una condizione viene segnalato come *menzione* da rivedere a mano;
  - **cambiare il parsing in base al fornitore** (`if (fornitore === "X")`, `regole[fornitore]`, un nome noto dentro un `if` o un `.test()`): è una **violazione** della regola 1.
- Il controllo statico è necessario ma **non basta**: la prova vera è il risultato su holdout e fornitori nuovi.
- Proposta dei documenti e criteri per le holdout: `cte/CANDIDATI_DATASET.md`.

## Aggiungere una CTE
1. Scaricare il PDF dal sito del fornitore e rinominarlo per categoria in `cte/documenti/`.
2. Aggiungere una voce in `cte/MANIFEST.json` (schema: `schema/manifest.v1.schema.json`).
3. `npm run baseline` genera `baseline/` e `testo/` (tranne che per le holdout).
4. Copiare `expected/_MODELLO.expected.json` in `expected/<id>.expected.json` e compilarlo **leggendo il PDF**.
5. Portare a `verificato` i campi controllati; lasciare `non_verificato` gli altri.

## Eseguire i test
```
cd tests/runner
npm install          # solo pdfjs-dist 3.11.174 e ajv 8.17.1, dipendenze di test
npm test
```
Su ogni Pull Request che tocca `tests/`, `parser-bolletta.js` o `index.html` i test girano da soli con il workflow **"Test regressione lettore CTE"**. Il workflow ha permessi di sola lettura: nessun deploy, nessun APK, nessun segreto. Il report compare nel riepilogo dell'Action.

## Come leggere il report
Il report ha quattro sezioni indipendenti:
- **A. Controlli del runner**: integrità del materiale di test. Non dice nulla sulla qualità del parser.
- **B. Regressione**: il comportamento è peggiorato rispetto al riferimento? Misura il cambiamento, non la correttezza.
- **C. Correttezza del parser**: confronto con i valori attesi. È **provvisoria** finché i casi non sono approvati o i campi verificati. Gli INVENTATI hanno un sottotipo:
  - `attribuzione_errata`: il numero esiste nel testo ma è assegnato al campo sbagliato;
  - `valore_assente_dal_testo`: il numero non compare nel testo;
  - `certezza_non_giustificata`: un dato ambiguo viene restituito come certo.
- **D. Prontezza**: l'unico punto che può dichiarare il lettore pronto.

Il codice di uscita (CI verde o rossa) dipende solo da A e B. **Una CI verde non significa lettore pronto.**

## Quando una modifica al parser è accettabile
1. Nessun campo che prima era CORRETTO peggiora.
2. **Ogni** nuovo campo INVENTATO viene segnalato e blocca la modifica, anche se il totale non aumenta.
3. Integrità: schema valido, hash corretti, nessuna violazione di universalità.

**Superare i test non significa che il lettore sia pronto.** Il lettore è pronto solo quando il report indica "Criterio di prontezza: SODDISFATTO":
- 7 categorie coperte da expected verificati;
- **zero** campi inventati nei test verificati;
- struttura economica corretta su CTE holdout;
- struttura economica corretta su CTE di fornitori nuovi.

## Riferimento degli esiti
`riferimento/stato-accettato.json` congela gli esiti accettati. Lo aggiorna solo `node esegui-test.mjs --aggiorna-riferimento`, **dopo approvazione di Max**. Non è la verità: registra solo da dove partiamo.

## Limiti attuali (FASE 0)
- **OCR effettivo: INCOMPLETO.** Il runner non esegue l'OCR: registra soltanto se l'app lo avvierebbe.
- I 45 casi unitari sono proposte sintetiche in stato `da_rivedere`: vedi `unit/CASI_SINTETICI.md`, rigenerabile con `npm run schede`.
- Le prove di accesso reali richiedono credenziali di test e rete verso Supabase (vedi `accessi/PIANO_PROVE_ACCESSO.md`).
