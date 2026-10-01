# Piano degli insiemi di test — sviluppo, holdout, fornitori nuovi

> **Stato: DEFINITO PRIMA dello sviluppo (30/09/2026).** Nessun PDF è ancora nel repository. Queste assegnazioni non si cambiano dopo aver visto i risultati del parser: se servono modifiche, si registrano qui con data e motivo, e il documento coinvolto cambia insieme.
> Regole di riferimento: `00_REGOLE_INDEROGABILI_MRF_EKO` (regola 1: il lettore deve funzionare su CTE di qualsiasi fornitore) e `tests/README.md`.

## Definizioni

| Termine | Significato |
|---|---|
| **Sviluppo** | CTE che Claude può leggere e usare per costruire e correggere il parser. |
| **Holdout** | CTE che **nessuno legge durante lo sviluppo**, Claude compreso. Servono solo per misurare il parser su documenti mai visti. Il runner ne mostra i conteggi, non i dettagli (`--dettagli-holdout` solo per la valutazione finale). |
| **Fornitore nuovo** (`fornitore_nuovo: true`) | Il fornitore non compare **né** nei documenti di sviluppo **né** tra i 78 record di `cte_offerte`. È la prova più dura della regola 1. |

Un documento holdout usato per correggere il parser passa a `sviluppo` (con `data_passaggio_sviluppo`) e va sostituito da una nuova holdout. Un documento di sviluppo non diventa mai holdout.

## Insieme di sviluppo (fissato)

| ID | Categoria | Fornitore | Fornitore nuovo | Finestra di sottoscrizione letta il 30/09/2026 | Rischio di sparire |
|---|---|---|---|---|---|
| `luce-fisso-01` | luce · fisso | Alperia | no | 01/04/2026 – 10/07/2026 (chiusa) | alto |
| `luce-indicizzato-01` | luce · indicizzato | Enel Energia | no | fino al 22/10/2026 | medio (scade tra 3 settimane) |
| `gas-fisso-01` | gas · fisso | Enel Energia | no | fino al 15/09/2026 (chiusa) | alto |
| `gas-indicizzato-01` | gas · indicizzato | Sorgenia | no | durata indeterminata | basso |
| `complessa-01` | luce · indicizzato · complessa | Pulsee | no | 12–18/01/2026 (chiusa) | alto |
| `ocr-01` | gas · indicizzato · ocr | MET Energia | no | durata indeterminata | basso |
| `misto-01` (extra) | luce, trappola DUAL | Pulsee | no | da verificare al download | da verificare |

Le date vengono dalla lettura di un riassunto automatico di ciascun PDF (sola verifica che il link risponda e di quale offerta si tratti). **Non sono valori attesi** e non sostituiscono la lettura del PDF.

Nessun documento di sviluppo è `fornitore_nuovo`: il fornitore di sviluppo non è "nuovo" per definizione.

## Insieme holdout (fissato per posti, da riempire senza leggere i documenti)

Le quattro posizioni sono definite ora. Il PDF specifico lo sceglie e lo scarica Max dal sito ufficiale; Claude non lo apre.

| Posto | Categoria richiesta | Fornitore assegnato (primo della lista) | Fornitore nuovo | Motivo |
|---|---|---|---|---|
| `H1` | luce · indicizzato | Edison Energia | **sì** (assente dai 78 record, verificato il 01/10/2026) | verifica la formula indice + spread su un fornitore mai visto |
| `H2` | gas · fisso oppure indicizzato | Hera Comm | **sì** (assente dai 78 record, verificato il 01/10/2026) | verifica la separazione luce/gas e prezzo/spread su un fornitore mai visto |
| `H3` | struttura diversa da quelle di sviluppo: luce a fasce, oppure offerta con sconto o bonus ben visibili | A2A Energia | **sì** (assente dai 78 record, verificato il 01/10/2026) | verifica sconti e fasce su un layout nuovo (regola 11) |
| `H4` | DUAL in **un solo documento**, se esiste | da cercare (vedi sotto) | da decidere | copre la categoria oggi scoperta |

**Come si assegnano i fornitori.** Il primo fornitore della lista per ogni posto è la proposta. Se compare tra i 78 record di `cte_offerte`, il posto passa al successivo **nello stesso ordine**, senza guardare i documenti:

- `H1` (luce indicizzato): Edison Energia → A2A Energia → Iren Mercato → Acea Energia
- `H2` (gas): Hera Comm → Eni Plenitude → E.ON Energia → Axpo
- `H3` (struttura diversa): A2A Energia → Illumia → Dolomiti Energia → Estra

Scegliendo il fornitore sulla base di questa lista e non del contenuto dei documenti, nessuna holdout è stata letta da chi sviluppa. Non ho verificato che questi fornitori pubblichino documenti adatti: se un PDF non è adatto (per esempio luce e gas fusi in modo atipico) si passa al fornitore successivo e si annota qui il motivo.

**Condizione per `fornitore_nuovo`.** Serve l'elenco dei fornitori presenti nei 78 record. Query di sola lettura da eseguire nello SQL Editor di Supabase:

```sql
select fornitore, count(*) as record
from public.cte_offerte
group by fornitore
order by fornitore nulls last;
```

I fornitori NULL (13 record) non contano come presenti. Il risultato va in `riferimento/fornitori-noti.txt` (un nome per riga): il controllo di universalità lo usa anche per cercare nomi dentro le condizioni del parser.

### Risultato della query (01/10/2026, 78 record)

| Valore della colonna `fornitore` | Record | Nota |
|---|---|---|
| Duferco Energia Spa | 12 | fornitore plausibile |
| EUREKA GAS & POWER S.R.L. | 24 | fornitore plausibile |
| Sorgenia S.p.A. | 14 | fornitore plausibile; è anche in sviluppo (`gas-indicizzato-01`) |
| Eko 360 Srl | 6 | fornitore plausibile |
| Eko | 1 | variante del precedente? |
| Plenitude | 2 | fornitore plausibile |
| Profilati S.p.A. | 3 | probabile errore di lettura (non è un fornitore di energia noto) |
| un frammento di frase del contratto | 3 | **errore di estrazione**: una frase presa come nome del fornitore |
| NULL | 13 | fornitore non riconosciuto |

Conseguenze:
- Edison, Hera Comm e A2A non compaiono: **H1, H2 e H3 restano assegnate come sopra e sono `fornitore_nuovo: true`**. Se si dovesse ricorrere al fornitore successivo di `H2`, attenzione: Eni Plenitude **è** tra i 78 record e non sarebbe nuova.
- Su 78 record, 19 hanno il fornitore mancante o con ogni probabilità sbagliato: 13 NULL, 3 frasi di contratto e 3 "Profilati S.p.A." (quest'ultimo è un'ipotesi mia, da confermare aprendo i documenti). Il campo non è quindi affidabile come riferimento.
- Nel file `fornitori-noti.txt` sono entrati solo i nomi plausibili (6 righe). "Eko" ha 3 lettere: il controllo di universalità ignora i token sotto le 4 lettere, quindi quel nome non è coperto in automatico (verificato a mano: nel parser compare solo in un commento di intestazione).

## Registro modifiche all'insieme di sviluppo

### 01/10/2026 (sera): documenti ricevuti da Max, aggiunti allo sviluppo
Max ha allegato quattro PDF (il quinto allegato, `CE_DUAL_BASE_LTCASAV-GTCASA.pdf`, è arrivato due volte con hash identico). **Non sono quelli indicati nelle decisioni del mattino** (Enel Fix Gas, Pulsee Limit.e, Alperia), che restano da fornire: `gas-fisso-01`, `complessa-01` e `luce-fisso-01` rimangono liberi e invariati. Per non toccare quelle assegnazioni, i nuovi documenti hanno identificativi con suffisso `-02` oppure `dual-`.

| ID | Documento (nome file originale) | Categoria | Pagine | Nota |
|---|---|---|---|---|
| `luce-fisso-02` | Enel Fix Web Luce (`enel-fix-web-luce-cte.pdf`) | luce · fisso | 4 | Sconto 7% condizionato al gas Enel: trappola per il prezzo base |
| `dual-01` | WindTre Luce&Gas powered by Acea, Eco Smart Pro (`CONDIZIONI-ECONOMICHE-ECO-SMART-PRO.pdf`) | dual · indicizzato (da confermare) | 3 | Uso non domestico. Luce e gas nello stesso file |
| `dual-02` | Eni Plenitude, Trend Casa (`CE_DUAL_BASE_LTCASAV-GTCASA.pdf`) | dual · indicizzato (da confermare) | 3 | Fac-simile. Luce e gas nello stesso file |
| `luce-indicizzato-02` | Sorgenia, Next Energy Sunlight (`NEXTENERGYSunlightDUAL_LUCE_080825.pdf`) | luce · indicizzato (da confermare) | 18 | Contratto con molte clausole. Il titolo cita luce e gas: va verificato se la parte economica copre entrambe le forniture |

- **Motivo:** sono i documenti che Max ha fornito per primi, e coprono la categoria `dual`, finora scoperta (decisione 2 del 01/10/2026).
- **Tutti sviluppo.** Claude li ha letti, quindi nessuno può fare da holdout. `H4` (DUAL) resta da coprire con un altro documento, scelto da Max senza mostrarlo.
- **`fornitore_nuovo: false`** per tutti, come da regola di questo piano per i documenti di sviluppo. Eni Plenitude è inoltre tra i 78 record.
- **URL e data di download: da integrare** (`campi_da_integrare` nel MANIFEST). Non sono stati inventati. L'SHA-256 è calcolato dal file ricevuto.

### 01/10/2026 (sera): estrazione del testo
pdf.js 3.11.174 **non è installabile** nell'ambiente di lavoro (registro npm e CDN rispondono 403). Le cartelle ufficiali `baseline/` e `testo/` restano quindi **vuote** e verranno popolate con `npm run baseline` appena la versione corretta è disponibile (anche in CI). Nel frattempo esistono due cartelle **provvisorie**, separate:
- `baseline-provvisoria/` e `testo-provvisorio/`, generate con **pdf.js 6.2.108**, con avviso e versione dichiarati in ogni file;
- il runner di regressione non le legge.

Differenza già osservata: in pdf.js 6.2.108 il valore `0,01249` di `luce-fisso-02` compare come `0,01 2 4 9`. Va riconfermato con la 3.11.174, perché potrebbe cambiare il comportamento del parser.

### 01/10/2026 (notte): conferme di Max su `luce-fisso-02`
Max ha confrontato le schermate delle pagine originali dell'Enel Fix Web Luce. `expected/luce-fisso-02.expected.json` passa da `bozza` a `in_revisione`.
- **Verificati (10 campi):** `supplier` (Enel Energia, con la ragione sociale `Enel Energia S.p.A.` conservata nella nota), `offer_name`, `supply_type`, `market`, `customer_segment`, `validity.duration_months` (36 mesi dall'attivazione), `electricity.price_type`, `electricity.fixed_price` (0,17849 €/kWh, perdite di rete incluse), `electricity.fixed_fee` (144 €/POD/anno = 12 €/POD/mese) e `discounts` (7% = 0,01249 €/kWh, prezzo scontato 0,16600, con tutte le condizioni gas e Placet, separato dal prezzo base).
- **`validity.to`:** la data 01/10/2026 è confermata come **termine di adesione** e non è né assente né ambigua nel documento (`status: presente`). La sua collocazione nello schema resta da chiarire: nel frattempo il campo è `non_verificato`, quindi **escluso dal punteggio**, con data e significato conservati nella nota.
- **`renewal`:** testo precisato (proroga tacita solo in assenza della comunicazione di nuove condizioni, art. 7.2 CGF, esclusi sconti e bonus; non è un rinnovo incondizionato). Resta `non_verificato` fino alla conferma esplicita.
- **`offer_code`:** resta `null`/`ambiguo`; i riferimenti del modulo (`Enel_Fix_Web_Luce_26WR12K`, `74326 ML_RedKitSwaResCteEl`) sono solo nelle note, senza una funzione attribuita.

## Come si verificano i valori attesi

1. Max apre il PDF, compila l'expected copiando il modello.
2. Ogni valore `presente` ha **`page`** (numero di pagina del PDF) e **`source_text`** (la frase esatta copiata dal documento).
3. Il runner controlla che la frase compaia davvero nel testo del documento, **alla pagina dichiarata**. Se manca la frase o la pagina, o la frase non si trova, il test si ferma con un errore bloccante (sezione A del report).
4. Un valore senza frase di supporto resta `non_verificato` e non entra nel giudizio.
5. Per i PDF scansionati (`ocr-01`) il controllo automatico non è possibile: il report lo segna come **parziale** e la verifica resta a mano.

Le holdout le compila Max **senza mostrarle a Claude** fino alla valutazione.

## Decisioni di Max (01/10/2026)

1. **Classificazione INVENTATO confermata.** Quando il parser assegna a un campo un valore che il documento non gli attribuisce (esempio: uno spread restituito come valore del PUN), l'esito è **INVENTATO, sottotipo `attribuzione_errata`**. Non diventa ERRATO.
2. **Test DUAL su un singolo documento che contenga entrambe le forniture.** Non si usa la coppia di PDF luce + gas. Al 01/10/2026 non ho trovato un documento unico verificato: Enel Fix Web Luce e Gas, per esempio, ha due CTE separate (luce e gas). Candidati non ancora verificati: il contratto Sorgenia Next Energy Sunlight DUAL (il titolo dichiara "fornitura di energia elettrica e gas naturale"), la proposta di contratto "Luce e/o Gas" di WindTre (clientela professionale), la pagina Eni Plenitude "Trend Casa Gas e Luce". La categoria `dual` resta scoperta finché un documento unico non viene scelto e controllato.
3. **Primi tre documenti di sviluppo:** `gas-fisso-01` (Enel Fix Gas), `complessa-01` (Pulsee Luce Limit.e), `luce-fisso-01` (Alperia). Testo ed expected in bozza si preparano subito, senza attendere le altre decisioni.

## Cosa resta da decidere

1. Quale documento unico luce + gas usare per `dual`, e se come sviluppo o come `H4` holdout.
2. Se la trappola `misto-01` (Pulsee, "Luce e Gas" ma solo luce) entra nello sviluppo: proposta sì.
3. Se il risultato della query dei fornitori cambia l'assegnazione di `H1`, `H2` o `H3`.
