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
| `H1` | luce · indicizzato | Edison Energia | **sì**, se assente dai 78 record | verifica la formula indice + spread su un fornitore mai visto |
| `H2` | gas · fisso oppure indicizzato | Hera Comm | **sì**, se assente dai 78 record | verifica la separazione luce/gas e prezzo/spread su un fornitore mai visto |
| `H3` | struttura diversa da quelle di sviluppo: luce a fasce, oppure offerta con sconto o bonus ben visibili | A2A Energia | no (può comparire nei 78 record) | verifica sconti e fasce su un layout nuovo (regola 11) |
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

## Come si verificano i valori attesi

1. Max apre il PDF, compila l'expected copiando il modello.
2. Ogni valore `presente` ha **`page`** (numero di pagina del PDF) e **`source_text`** (la frase esatta copiata dal documento).
3. Il runner controlla che la frase compaia davvero nel testo del documento, **alla pagina dichiarata**. Se manca la frase o la pagina, o la frase non si trova, il test si ferma con un errore bloccante (sezione A del report).
4. Un valore senza frase di supporto resta `non_verificato` e non entra nel giudizio.
5. Per i PDF scansionati (`ocr-01`) il controllo automatico non è possibile: il report lo segna come **parziale** e la verifica resta a mano.

Le holdout le compila Max **senza mostrarle a Claude** fino alla valutazione.

## Cosa resta da decidere

1. Se `H4` (DUAL in un solo documento) esiste davvero o se il DUAL si prova con la coppia luce + gas della stessa offerta.
2. Se la trappola `misto-01` (Pulsee, "Luce e Gas" ma solo luce) entra nello sviluppo: proposta sì.
3. Se il risultato della query dei fornitori cambia l'assegnazione di `H1`, `H2` o `H3`.
