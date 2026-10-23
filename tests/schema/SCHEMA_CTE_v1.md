# Schema expected CTE — v1

File di validazione: `expected-cte.v1.schema.json` (JSON Schema 2020-12).
Riferimento: regole 4-14, 26, 29 di `00_REGOLE_INDEROGABILI_MRF_EKO`.

## Principio
L'expected è la **golden truth**: ciò che un essere umano ha letto **sul PDF**. Non va mai compilato copiando la baseline, cioè l'output del parser attuale.

## Ogni campo ha due dimensioni indipendenti

| Dimensione | Chiave | Domanda | Valori |
|---|---|---|---|
| Contenuto del documento | `status` | *Il PDF contiene questo dato?* | `presente` · `non_presente` · `non_applicabile` · `ambiguo` · `non_valutato` |
| Verifica umana | `verification.state` | *Qualcuno ha controllato questo campo sul PDF?* | `non_verificato` · `verificato` · `contestato` |

Solo i campi con `verification.state = "verificato"` entrano nel giudizio. Un campo può essere `presente` ma `non_verificato`, e allora viene mostrato nel report senza bloccare nulla.

Analogamente, nel database `da_verificare = false` **non** equivale a "verificato".

## Forma di un campo
```json
{
  "value": 0.025,
  "unit": "€/kWh",
  "original": { "value": 2.5, "unit": "c€/kWh" },
  "variant": null,
  "original_text": null,
  "status": "presente",
  "verification": { "state": "verificato", "by": "Max", "at": "2026-10-02", "note": null },
  "source_text": "Al valore del PUN sarà applicato un corrispettivo pari a 0,025 €/kWh",
  "page": 2
}
```
Vincoli automatici:
- `presente` richiede un `value` non nullo;
- `non_presente` e `non_applicabile` richiedono `value: null`.

## Sezioni
| Sezione | Campi |
|---|---|
| `document` | supplier, offer_name, offer_code, supply_type (`luce`/`gas`/`dual`), market, customer_segment, document_date |
| `validity` | from, to (YYYY-MM-DD), duration_months, renewal |
| `electricity`, `gas` | enabled, price_type (`fisso`/`indicizzato`/`misto`), fixed_price, band_prices, index (`PUN`/`PSV`/`TTF`/`ALTRO` + variant + original_text), spread, multiplier, formula_text, fixed_fee, other_recurring_fees |
| `discounts` | status, verification e items[] (type, value, unit, duration, commodity, affects_energy_price) |
| `document_review` | stato dell'intero file: `bozza` / `in_revisione` / `verificato` |

## Normalizzazione (regola 26)
- Prezzi luce in **€/kWh**, prezzi gas in **€/Smc**. Il valore originale va in `original`.
- Le quote fisse vanno in **€/mese**, con l'originale conservato (144 €/anno → 12 €/mese).
- Il riferimento della quota fissa va in `per`: `POD` (luce) o `PDR` (gas), ad esempio `PCV 7,50 €/POD/mese` → `value 7.5`, `unit €/mese`, `per POD`. Per le quote annuali si conserva anche l'originale (`original`).
- Il gas in €/MWh **non** si converte senza PCS: si mantiene l'unità originale.

## Regole di compilazione
1. Si legge il PDF, non il testo estratto né la baseline.
2. Per ogni valore si copia la frase esatta in `source_text` e si indica la pagina.
3. Se il documento è poco chiaro si usa `ambiguo`, senza scegliere un valore.
4. Un bonus o uno sconto va in `discounts` e **mai** nel prezzo dell'energia.
5. Gli indici sconosciuti diventano `ALTRO` con `original_text` compilato.
6. Per gli indici con variante (`index_gme`, `medio_mensile`, `per_fascia`, `day_ahead`, `mensile`) si compila `variant` e, se il documento usa un nome preciso, `original_text` (es. `PUN Index GME`). Il runner li controlla: valore giusto ma variante o nome originale persi = ERRATO.

## Esiti del confronto
| Esito | Quando |
|---|---|
| CORRETTO | valore uguale (entro tolleranza), oppure nessun valore dove il documento non ne ha |
| ERRATO | valore diverso |
| MANCANTE | il documento ha il dato, il parser no |
| INVENTATO | il parser dà un valore certo dove il documento non lo contiene o è ambiguo |
| NON_VALUTATO | campo non compilato |

## Versionamento
`schema_version` è `"1.0"`. Una modifica incompatibile crea lo schema v2, e il runner continua a leggere anche la v1.
