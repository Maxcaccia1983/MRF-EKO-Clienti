# MRF EKO — Revisione indipendente post-implementazione v1.1.0

Leggi in sola lettura `mrf-cte-v11-analisi.js`, `tests/cte-v11.test.mjs`, `tests/cte-v11-pdf-reale.test.mjs`, la CI e `dual-03.proposta.json`.

- NON modificare file, NON committare, NON fare push o merge, NON toccare `index.html`, Supabase o main.
- La versione 1.0.0 (`mrf-cte-lettore.js`) deve rimanere intatta. Il nuovo modulo lavora in ombra su DocumentoLetto prodotto da `leggiFile()`/`leggiPdf()`.
- Ricontrolla: D-A listino vs scontato, D-B perdite lordo/netto, D-C attribuzione prudente quota, D-D hash/provenienza, D-E expected giustificati, D-F CI rigorosa.
- Verifica possibili bug: spezzature PDF.js di righe/celle, percentuali sconto su piu' righe, quote in colonne multiple, prezzi fasce, piu' offerte nel medesimo PDF, estrazione erronea di corrispettivi ARERA, variabili PUN/PSV, errori di classificazione.
- Controlla che il valore 'prezzoApplicabile' non venga presentato come garantito quando dipende da condizioni del cliente; verifica coerenza sconto Special Days 30% su 0,2079 e 0,87, **senza arrotondamenti inventati**.
- Proponi difetti motivati, test che li riproducono, priorita' e diff MINIMO. Non implementare senza approvazione.
- I 18 test locali e 1 test PDF.js saltato NON equivalgono a certificazione; rimane necessario test CI su 4 PDF originali + dual-03, dopo installazione autorizzata.

Rispondi con tabella `problema / evidenza / gravita / correzione proposta / test richiesto`, e conclusione `pronto per modalita ombra` oppure `bloccato`.
