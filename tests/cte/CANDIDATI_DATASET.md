# Dataset CTE — proposta di documenti

> **Stato: PROPOSTA.** Nessun PDF è ancora nel repository e il `MANIFEST.json` è vuoto.
> Tutti i documenti sono **pubblici**, sui siti ufficiali dei fornitori. Nessun documento di clienti.
> Ricerca eseguita il 30/09/2026. Molte CTE hanno una finestra di sottoscrizione breve: conviene scaricarle subito e registrare la data di download.

## Perché i PDF li scarichi tu
Da questo ambiente il download diretto dei file dai siti dei fornitori è bloccato dalla rete. Ho potuto solo leggere un riassunto delle CTE di **sviluppo** per verificarne la categoria. I PDF vanno scaricati da un tuo dispositivo e caricati in `tests/cte/documenti/`.

## Insieme di SVILUPPO (usato per costruire e correggere il parser)

| ID proposto | Categoria | Documento | Perché è utile |
|---|---|---|---|
| `luce-fisso-01` | luce · fisso | Alperia Smart Services — Placet Fissa Luce Domestici — [PDF](https://www.alperia.eu/wp-content/uploads/2026/06/condizioni-tecnico-economiche-it-OFF00000101568-1.pdf) | Prezzo fisso **per fasce** (F1 e F23): verifica `band_prices` e che non venga scelto un solo prezzo a caso |
| `luce-indicizzato-01` | luce · indicizzato | Enel Energia — Enel Flex Luce — [PDF](https://www.enel.it/content/dam/asset/documenti/offerte/casa/luce/enel-luce-flex/enel-flex-cte.pdf) | Formula "PUN Index GME + α" con spread esplicito: il caso centrale della regola 8 |
| `gas-fisso-01` | gas · fisso | Enel Energia — Enel Fix Gas — [PDF](https://www.enel.it/content/dam/asset/documenti/offerte/casa/gas/enel-fix-gas/enel-fix-gas-cte.pdf) | Prezzo fisso con **prezzo scontato** accanto: verifica che lo sconto non diventi il prezzo (regola 11) |
| `gas-indicizzato-01` | gas · indicizzato | Sorgenia — Next Energy Sunlight/Gas — [PDF](https://www.sorgenia.it/shared/files/2026-03/NEXTENERGYSunlightDUAL_GAS_130326.pdf) | Formula "PSV + Fee" (lo spread si chiama *fee*). È la parte gas di un'offerta dual: utile anche contro la confusione luce/gas |
| `complessa-01` | luce · indicizzato · complessa | Pulsee — Luce Limit.e — [PDF](https://pulsee.it/assets/pulsee/data/it/cte_12_01/Pulsee%20Luce%20Limit.e%20-%20Condizioni%20tecnico-economiche%20e%20Scheda%20Sintetica.pdf?_u=bd15f5b275754079d410fa052f76ae737121d43b) | PUN medio mensile × coefficiente perdite + spread, **tetto** 0,165 €/kWh per 12 mesi, CCV 180 €/POD/anno: moltiplicatore, cap e quota annuale |
| `ocr-01` | gas · indicizzato · ocr | MET Energia — MET Sicuro Gas Flex Web — [PDF](https://it.met.com/wp-content/uploads/2026/03/cte-met-sicuro-gas-flex-web-26.03.2026.pdf) | Da **stampare e riscansionare** (origine `pubblica_riscansionata`). PSV Day Ahead + 0,051 €/Smc, clienti **non domestici**: verifica anche il segmento |
| `dual-01` | dual | **Non trovato** | Vedi sotto |

Documento aggiuntivo consigliato (sviluppo, categoria `misto`):
- Pulsee — Luce e Gas RELAX Fix – P — [PDF](https://pulsee.it/assets/pulsee/data/it/cte_12_05/Pulsee%20Luce%20e%20Gas%20RELAX%20-%20Condizioni%20tecnico-economiche%20e%20Scheda%20Sintetica%20Luce.pdf?_u=c47c9652e3e0cf2d03d43391d2d40e575f5bbf4c): prezzo fisso per 24 mesi e poi PUN + 0,0099 €/kWh. È una **trappola utile**: il nome dice "Luce e Gas", ma il documento contiene solo la luce, quindi non deve risultare DUAL.

I fornitori sono 5 (Alperia, Enel, Sorgenia, Pulsee, MET), con strutture diverse. Enel compare due volte, ma con commodity e tipi di prezzo diversi.

### Il caso DUAL
Sui siti ufficiali non ho trovato una CTE **unica** con le condizioni economiche di luce e gas insieme. I fornitori consultati pubblicano un documento per la luce e uno per il gas, anche per le offerte dual. Le possibilità sono tre:
1. controllare se tra i 78 record di `cte_offerte` c'è una CTE dual in un solo documento;
2. cercarne una da altri fornitori, soprattutto locali o regionali;
3. se il formato non esiste davvero, il "DUAL" si prova sulla coppia luce + gas della stessa offerta. In quel caso va deciso come il lettore deve trattare due PDF collegati, con una decisione separata.

Finché il caso non è risolto, la categoria `dual` resta **scoperta** e il criterio di prontezza resta non soddisfatto.

## Insieme HOLDOUT (mai usato nello sviluppo)
Per essere una prova valida, il contenuto di queste CTE **non deve essere letto da chi sviluppa il parser**, me compreso. Per questo non propongo documenti specifici: se li scegliessi io, li avrei già letti.

Criteri per sceglierle tu:
1. **Almeno 3 documenti**: una luce indicizzata, un gas (fisso o indicizzato) e una con struttura diversa da quelle di sviluppo.
2. **Fornitori diversi** da Alperia, Enel, Sorgenia, Pulsee e MET. Almeno uno non deve comparire tra i 78 record di `cte_offerte`, e va marcato `fornitore_nuovo: true`.
3. Solo PDF pubblici dal sito ufficiale del fornitore.
4. Nel MANIFEST vanno registrati con `insieme: "holdout"`. Il runner ne mostra solo i conteggi e `genera-baseline` li salta.
5. L'expected lo compili tu, leggendo il PDF, senza mostrarmelo prima della valutazione.
6. Se una holdout viene usata per correggere il parser, passa a `sviluppo` (con la data) e va sostituita.

## Prima di caricare
- Registrare per ogni file: URL, data di download e hash SHA-256. Il runner rifiuta un file che non corrisponde all'hash.
- Verificare `fornitore_nuovo` confrontando con i fornitori presenti nei 78 record.
- Nome del file per categoria (es. `luce-indicizzato-01.pdf`), non per fornitore.
