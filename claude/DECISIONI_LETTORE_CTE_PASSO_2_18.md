# MRF EKO Clienti — Decisioni D-A–D-E (PASSO 2.18)

**Ambito autorizzato:** progettazione/fixture di lettura CTE e configurazione CI in sola preparazione. Nessun intervento su app pubblica, `main`, Supabase, `index.html`, `CONFIG.campiAttivi`; nessun commit/push.

## D-A — Listino, sconti, prezzo applicabile
Conservare separatamente:
- **prezzo_listino:** corrispettivo contrattuale di riferimento, con unità, commodity e documentazione;
- **prezzo_scontato_dichiarato:** valore esplicitamente presente nelle condizioni, con durata e condizioni;
- **prezzo_applicabile:** valorizzare solo se le condizioni pertinenti sono documentate e soddisfatte; altrimenti `null` / `Da verificare`.

Preservare il significato dei campi legacy fino a una migrazione esplicitamente autorizzata. Nuovi qualificatori solo in `lettoreUniversaleCTE.risultato`; non cambiare il prezzo legacy assumendo automaticamente che sia scontato.

## D-B — Lordo/netto perdite di rete
Distinguere **lordo di perdite** da **netto di perdite**, separati per fascia/monorario. Se il documento non chiarisce la base, `base_perdite: "da_verificare"`. Vietato confrontare due valori con basi incompatibili.

## D-C — Quote fisse in documenti dual
Associare la quota a luce/gas solo da unità (`POD`/`PDR`), intestazione locale o altra evidenza non ambigua. La mera classificazione globale del PDF non prevale sulla sezione. Quota davvero comune/non attribuibile -> valore separato + stato `Da verificare`, senza duplicazione luce/gas.

## D-D — PDF dual-03
Il file originale è stato acquisito come allegato utente. Memorizzati byte, SHA-256, metadati, data di ricezione e intervallo di validità offerta. URL pubblico *non identificato*: `source_url: null` e non inventare collegamenti. Non inserire il PDF in produzione e non pubblicarlo automaticamente.

## D-E — Golden truth solo dal documento
Popolare soltanto i campi dimostrati esplicitamente nel fac-simile; altri restano facoltativi o `Da verificare`. Se un campo è una misura computata equivalente (es. 144/12) contrassegnarne l'origine e lasciare evidenza. Distinguere test sul documento da test sul comportamento corrente del parser: il nuovo set dual-03 non deve essere presentato come superato finché non è realmente eseguito.

## D-F — PASSO 0 CI
Nuovo workflow **staged**, non pubblicato: testa `node --test tests/*.test.mjs` con Node 20; PDF.js bloccato alla versione 3.11.174 e `RICHIEDI_PDF_REALI=1`, impedendo falsi "verde" quando mancano i 4 PDF fixture. Il trigger ascolta `mrf-cte-lettore.js`, l'intera cartella `tests/**`, `index.html` e il workflow. Si avvia nel branch autorizzato e su PR verso il branch; non agisce su `main`.

> **Nota di sicurezza:** l'aggiunta di un workflow a GitHub necessita di un commit. Il commit resta esplicitamente fuori dall'autorizzazione autonoma, quindi il file qui preparato non è stato caricato su GitHub. Il test reale di Actions richiederà in futuro approvazione al commit e alla sua esecuzione.
