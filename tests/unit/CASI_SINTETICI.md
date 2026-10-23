# Casi sintetici — scheda di revisione

> **Stato: DA RIVEDERE.** Nessun caso è approvato. Ogni esito calcolato su questi casi è **provvisorio**.
> File generato da `tests/runner/genera-schede-casi.mjs` a partire da `tests/unit/*.cases.json`: non modificarlo a mano.

**49 casi, 103 campi valutati.**

## Cosa è cambiato in questa revisione

Dei 49 casi, **36 sono invariati** rispetto alla versione precedente (45 casi), **9 sono stati corretti** e **4 sono nuovi**. Nessuno è stato approvato: per tutti serve la tua decisione.

| Caso | Tipo | Cosa è cambiato |
|---|---|---|
| N07 | corretto | Prima la motivazione si appoggiava al solo contesto 'consumo'. Ora il caso dichiara la convenzione italiana e il testo che la prova. |
| N08 | corretto | Prima la motivazione citava il contesto 'consumo'. Ora si basa sulla struttura del numero e sulla convenzione dichiarata. |
| N09 | corretto | Prima la motivazione si appoggiava al solo contesto 'consumo'. Ora il caso dichiara la convenzione italiana e il testo che la prova. |
| N15 | corretto | Il caso ambiguo resta. La motivazione ora dice esplicitamente che l'ambiguita' nasce dall'assenza di convenzione dichiarata. |
| N16 | integrato | Caso nuovo: dimostra che 'consumo' da solo non decide. Accanto a N15 (prezzo) copre l'ambiguita' in contesto consumo. |
| U12 | corretto | Prima si verificava solo il valore mensile. Ora il test richiede anche il riferimento POD e l'originale. |
| U13 | corretto | Prima si verificava solo la conversione mensile e l'originale. Ora il test richiede anche il riferimento PDR. |
| F02 | corretto | Aggiunto il controllo del testo originale 'PUN Index GME' (prima c'era solo la variante). |
| F08 | corretto | Aggiunto il controllo del testo originale 'PSV Day Ahead' (prima c'era solo la variante). |
| F13 | corretto | Prima si verificava solo che lo sconto non diventasse un prezzo. Ora si verifica anche il riconoscimento dello sconto, del suo valore e della durata. |
| F16 | integrato | Caso nuovo: copre una variante dell'indice elencata nella regola 7 che non aveva ancora un caso. |
| F17 | integrato | Caso nuovo: copre una variante dell'indice elencata nella regola 7 che non aveva ancora un caso. |
| F18 | integrato | Caso nuovo: copre una variante dell'indice elencata nella regola 7 che non aveva ancora un caso. |

Come leggere le colonne:
- **Atteso**: il valore corretto secondo la proposta. `—` significa che il parser NON deve restituire alcun valore.
- **Stato atteso**: `presente` (deve trovarlo), `non_presente` / `non_applicabile` (non deve inventarlo), `ambiguo` (non deve darlo per certo).
- **Parser attuale**: solo per informazione (è la baseline, **non** la verità).
- **Esito provvisorio**: `estratto` = il parser ha letto il valore giusto; `vuoto giusto` = il parser ha correttamente lasciato vuoto un dato che doveva restare vuoto (non prova alcuna capacità di lettura).
- **Da conservare**: oltre al valore, il test controlla variante e nome originale dell'indice, valore originale prima della conversione, riferimento POD/PDR, durata dello sconto. Se il parser li perde, il campo è ERRATO. Non sono solo descritti qui: li verifica il classificatore (vedi sezione A del report, autotest).

Per approvare un caso: impostare `stato_revisione` a `approvato` nel JSON. Per contestarlo: `contestato` con una nota.

## Numeri (regola 25) — 16 casi

Quando il punto può essere sia separatore delle migliaia sia decimale (`2.423`), il caso **dichiara la convenzione numerica** e riporta il testo di contesto che la prova:

- `it`: convenzione italiana dichiarata (punto = migliaia, virgola = decimali), con un testo di contesto che la dimostra (es. un altro numero scritto con la virgola decimale);
- `en`: convenzione inglese (punto = decimali);
- `non_dichiarata`: nessun elemento per decidere. Il caso resta **ambiguo**: il parser non deve scegliere, nemmeno se il contesto è un consumo.

La convenzione è un dato del caso: il futuro normalizzatore dovrà riceverla, perché il parser attuale vede solo la stringa e non può usarla.

### N01 · da_rivedere
- **Testo:** `0,145`  ·  **Contesto:** prezzo
- **Motivazione:** Formato italiano: la virgola e' il separatore decimale.

| Campo | Stato atteso | Atteso | Unità | Da conservare | Parser attuale | Esito provvisorio |
|---|---|---|---|---|---|---|
| valore | presente | 0,145 | — | — | 0,145 | CORRETTO · estratto |

### N02 · da_rivedere
- **Testo:** `0,140`  ·  **Contesto:** prezzo
- **Motivazione:** Virgola decimale; lo zero finale non cambia il valore (0,140 = 0,14).

| Campo | Stato atteso | Atteso | Unità | Da conservare | Parser attuale | Esito provvisorio |
|---|---|---|---|---|---|---|
| valore | presente | 0,14 | — | — | 0,14 | CORRETTO · estratto |

### N03 · da_rivedere
- **Testo:** `0,0250`  ·  **Contesto:** prezzo
- **Motivazione:** Virgola decimale con zeri finali: 0,0250 = 0,025.

| Campo | Stato atteso | Atteso | Unità | Da conservare | Parser attuale | Esito provvisorio |
|---|---|---|---|---|---|---|
| valore | presente | 0,025 | — | — | 0,025 | CORRETTO · estratto |

### N04 · da_rivedere
- **Testo:** `1.234,56`  ·  **Contesto:** importo
- **Motivazione:** Formato italiano completo: punto per le migliaia, virgola per i decimali.

| Campo | Stato atteso | Atteso | Unità | Da conservare | Parser attuale | Esito provvisorio |
|---|---|---|---|---|---|---|
| valore | presente | 1234,56 | — | — | 1234,56 | CORRETTO · estratto |

### N05 · da_rivedere
- **Testo:** `1234,56`  ·  **Contesto:** importo
- **Motivazione:** Virgola decimale senza separatore delle migliaia.

| Campo | Stato atteso | Atteso | Unità | Da conservare | Parser attuale | Esito provvisorio |
|---|---|---|---|---|---|---|
| valore | presente | 1234,56 | — | — | 1234,56 | CORRETTO · estratto |

### N06 · da_rivedere
- **Testo:** `10.000,00`  ·  **Contesto:** importo
- **Motivazione:** Punto per le migliaia e virgola per i decimali: diecimila.

| Campo | Stato atteso | Atteso | Unità | Da conservare | Parser attuale | Esito provvisorio |
|---|---|---|---|---|---|---|
| valore | presente | 10000 | — | — | 10000 | CORRETTO · estratto |

### N07 · da_rivedere · MODIFICATO (corretto)
- **Testo:** `2.423`  ·  **Contesto:** consumo
- **Convenzione numerica:** it  ·  **Testo di contesto:** `Consumo annuo stimato: 2.423 kWh. Prezzo energia: 0,145 €/kWh.`
- **Motivazione:** Convenzione numerica ITALIANA dichiarata nel caso (punto = migliaia, virgola = decimali). La prova e' nel testo di contesto: lo stesso documento scrive 0,145 con la virgola decimale. In questa convenzione '2.423' e' duemilaquattrocentoventitre. Il contesto 'consumo' da solo NON basta a decidere: senza convenzione dichiarata il caso e' ambiguo (vedi N16). Difetto C1.
- **Modifica:** Prima la motivazione si appoggiava al solo contesto 'consumo'. Ora il caso dichiara la convenzione italiana e il testo che la prova.

| Campo | Stato atteso | Atteso | Unità | Da conservare | Parser attuale | Esito provvisorio |
|---|---|---|---|---|---|---|
| valore | presente | 2423 | — | — | 2,423 | ERRATO |

### N08 · da_rivedere · MODIFICATO (corretto)
- **Testo:** `12.345.678`  ·  **Contesto:** consumo
- **Convenzione numerica:** it  ·  **Testo di contesto:** nessuno
- **Motivazione:** Con piu' gruppi da 3 cifre separati da punti il punto non puo' essere un separatore decimale in nessuna convenzione (un numero ha un solo decimale): sono migliaia. Convenzione italiana dichiarata. Non dipende dal contesto 'consumo'.
- **Modifica:** Prima la motivazione citava il contesto 'consumo'. Ora si basa sulla struttura del numero e sulla convenzione dichiarata.

| Campo | Stato atteso | Atteso | Unità | Da conservare | Parser attuale | Esito provvisorio |
|---|---|---|---|---|---|---|
| valore | presente | 12345678 | — | — | nessun valore | MANCANTE |

### N09 · da_rivedere · MODIFICATO (corretto)
- **Testo:** `1.500`  ·  **Contesto:** consumo
- **Convenzione numerica:** it  ·  **Testo di contesto:** `Consumo annuo: 1.500 kWh. Quota fissa: 7,50 €/mese.`
- **Motivazione:** Convenzione numerica ITALIANA dichiarata: '1.500' con il punto e' millecinquecento (non 1,5). La prova e' nel testo di contesto, dove 7,50 usa la virgola decimale. Gli zeri finali rendono l'errore piu' grave (1,5 invece di 1500). Il contesto 'consumo' da solo non basta: vedi N16.
- **Modifica:** Prima la motivazione si appoggiava al solo contesto 'consumo'. Ora il caso dichiara la convenzione italiana e il testo che la prova.

| Campo | Stato atteso | Atteso | Unità | Da conservare | Parser attuale | Esito provvisorio |
|---|---|---|---|---|---|---|
| valore | presente | 1500 | — | — | 1,5 | ERRATO |

### N10 · da_rivedere
- **Testo:** `144`  ·  **Contesto:** importo
- **Motivazione:** Intero senza separatori.

| Campo | Stato atteso | Atteso | Unità | Da conservare | Parser attuale | Esito provvisorio |
|---|---|---|---|---|---|---|
| valore | presente | 144 | — | — | 144 | CORRETTO · estratto |

### N11 · da_rivedere
- **Testo:** `1,234.56`  ·  **Contesto:** importo
- **Motivazione:** Formato internazionale: se compaiono entrambi i separatori, l'ultimo e' il decimale (1,234.56 = 1234,56).

| Campo | Stato atteso | Atteso | Unità | Da conservare | Parser attuale | Esito provvisorio |
|---|---|---|---|---|---|---|
| valore | presente | 1234,56 | — | — | 1234,56 | CORRETTO · estratto |

### N12 · da_rivedere
- **Testo:** `0.145`  ·  **Contesto:** prezzo
- **Motivazione:** Contesto PREZZO: con lo zero iniziale il punto non puo' separare le migliaia (non esiste '0 migliaia'), quindi e' decimale.

| Campo | Stato atteso | Atteso | Unità | Da conservare | Parser attuale | Esito provvisorio |
|---|---|---|---|---|---|---|
| valore | presente | 0,145 | — | — | 0,145 | CORRETTO · estratto |

### N13 · da_rivedere
- **Testo:** `7,50`  ·  **Contesto:** importo
- **Motivazione:** Virgola decimale.

| Campo | Stato atteso | Atteso | Unità | Da conservare | Parser attuale | Esito provvisorio |
|---|---|---|---|---|---|---|
| valore | presente | 7,5 | — | — | 7,5 | CORRETTO · estratto |

### N14 · da_rivedere
- **Testo:** `abc`  ·  **Contesto:** prezzo
- **Motivazione:** Testo non numerico: il parser non deve produrre alcun valore.

| Campo | Stato atteso | Atteso | Unità | Da conservare | Parser attuale | Esito provvisorio |
|---|---|---|---|---|---|---|
| valore | non_presente | — | — | — | nessun valore | CORRETTO · vuoto giusto |

### N15 · da_rivedere · MODIFICATO (corretto)
- **Testo:** `1.234`  ·  **Contesto:** prezzo
- **Convenzione numerica:** non_dichiarata  ·  **Testo di contesto:** nessuno
- **Motivazione:** Convenzione numerica NON dichiarata e nessun testo di contesto che la provi (nessuna unita', nessun altro numero). '1.234' puo' essere 1234 (convenzione italiana, migliaia) o 1,234 (punto decimale all'inglese). Mancano elementi sufficienti: il parser NON deve scegliere; il valore va lasciato vuoto o segnalato da verificare.
- **Modifica:** Il caso ambiguo resta. La motivazione ora dice esplicitamente che l'ambiguita' nasce dall'assenza di convenzione dichiarata.

| Campo | Stato atteso | Atteso | Unità | Da conservare | Parser attuale | Esito provvisorio |
|---|---|---|---|---|---|---|
| valore | ambiguo | — | — | — | 1,234 | INVENTATO · certezza_non_giustificata |

### N16 · da_rivedere · NUOVO (integrato)
- **Testo:** `2.423`  ·  **Contesto:** consumo
- **Convenzione numerica:** non_dichiarata  ·  **Testo di contesto:** `Consumo annuo: 2.423`
- **Motivazione:** Stesso testo di N07 ('2.423' in contesto consumo), ma qui non c'e' alcuna convenzione dichiarata ne' altri numeri che la provino. Il solo contesto 'consumo' non impone che il punto separi le migliaia: non si deve scegliere tra 2423 e 2,423. Il valore va lasciato vuoto o segnalato da verificare. E' il caso che distingue N16 (ambiguo) da N07 (convenzione italiana dichiarata).
- **Modifica:** Caso nuovo: dimostra che 'consumo' da solo non decide. Accanto a N15 (prezzo) copre l'ambiguita' in contesto consumo.

| Campo | Stato atteso | Atteso | Unità | Da conservare | Parser attuale | Esito provvisorio |
|---|---|---|---|---|---|---|
| valore | ambiguo | — | — | — | 2,423 | INVENTATO · certezza_non_giustificata |

## Unita' di misura (regole 9, 26, 27) — 15 casi

### U01 · da_rivedere
- **Testo:** `Prezzo energia: 0,145 €/kWh`  ·  **Fornitura:** luce
- **Motivazione:** Caso base: €/kWh gia' nell'unita' normalizzata.

| Campo | Stato atteso | Atteso | Unità | Da conservare | Parser attuale | Esito provvisorio |
|---|---|---|---|---|---|---|
| prezzo_energia | presente | 0,145 | €/kWh | — | 0,145 €/kWh | CORRETTO · estratto |

### U02 · da_rivedere
- **Testo:** `Prezzo energia: 145 €/MWh`  ·  **Fornitura:** luce
- **Motivazione:** €/MWh -> €/kWh: divisione per 1000, conversione esplicita.

| Campo | Stato atteso | Atteso | Unità | Da conservare | Parser attuale | Esito provvisorio |
|---|---|---|---|---|---|---|
| prezzo_energia | presente | 0,145 | €/kWh | — | 0,145 €/kWh | CORRETTO · estratto |

### U03 · da_rivedere
- **Testo:** `Prezzo energia: 14,5 c€/kWh`  ·  **Fornitura:** luce
- **Motivazione:** c€/kWh (centesimi) -> €/kWh: divisione per 100.

| Campo | Stato atteso | Atteso | Unità | Da conservare | Parser attuale | Esito provvisorio |
|---|---|---|---|---|---|---|
| prezzo_energia | presente | 0,145 | €/kWh | — | nessun valore | MANCANTE |

### U04 · da_rivedere
- **Testo:** `Prezzo energia: 14,5 cent€/kWh`  ·  **Fornitura:** luce
- **Motivazione:** Variante testuale 'cent€/kWh' dei centesimi.

| Campo | Stato atteso | Atteso | Unità | Da conservare | Parser attuale | Esito provvisorio |
|---|---|---|---|---|---|---|
| prezzo_energia | presente | 0,145 | €/kWh | — | nessun valore | MANCANTE |

### U05 · da_rivedere
- **Testo:** `Prezzo energia: € 0,145/kWh`  ·  **Fornitura:** luce
- **Motivazione:** Simbolo € prima del numero e unita' dopo: formulazione frequente nei documenti.

| Campo | Stato atteso | Atteso | Unità | Da conservare | Parser attuale | Esito provvisorio |
|---|---|---|---|---|---|---|
| prezzo_energia | presente | 0,145 | €/kWh | — | nessun valore | MANCANTE |

### U06 · da_rivedere
- **Testo:** `Prezzo energia (€/kWh) 0,145`  ·  **Fornitura:** luce
- **Motivazione:** Unita' nell'intestazione e valore dopo, tipico delle tabelle delle CTE.

| Campo | Stato atteso | Atteso | Unità | Da conservare | Parser attuale | Esito provvisorio |
|---|---|---|---|---|---|---|
| prezzo_energia | presente | 0,145 | €/kWh | — | nessun valore | MANCANTE |

### U07 · da_rivedere
- **Testo:** `Prezzo energia: 0,145 euro/kWh`  ·  **Fornitura:** luce
- **Motivazione:** 'euro' scritto per esteso al posto del simbolo.

| Campo | Stato atteso | Atteso | Unità | Da conservare | Parser attuale | Esito provvisorio |
|---|---|---|---|---|---|---|
| prezzo_energia | presente | 0,145 | €/kWh | — | 0,145 €/kWh | CORRETTO · estratto |

### U08 · da_rivedere
- **Testo:** `Prezzo gas naturale: 0,62 €/Smc`  ·  **Fornitura:** gas
- **Motivazione:** Caso base gas: €/Smc gia' normalizzato.

| Campo | Stato atteso | Atteso | Unità | Da conservare | Parser attuale | Esito provvisorio |
|---|---|---|---|---|---|---|
| prezzo_energia | presente | 0,62 | €/Smc | — | 0,62 €/Smc | CORRETTO · estratto |

### U09 · da_rivedere
- **Testo:** `Prezzo gas naturale: 62 c€/Smc`  ·  **Fornitura:** gas
- **Motivazione:** c€/Smc -> €/Smc: divisione per 100.

| Campo | Stato atteso | Atteso | Unità | Da conservare | Parser attuale | Esito provvisorio |
|---|---|---|---|---|---|---|
| prezzo_energia | presente | 0,62 | €/Smc | — | nessun valore | MANCANTE |

### U10 · da_rivedere
- **Testo:** `Commercializzazione: 144 €/anno`  ·  **Fornitura:** luce
- **Motivazione:** Quota fissa annuale: 144 €/anno = 12 €/mese, conservando l'originale (regola 9). Non deve mai diventare prezzo dell'energia (regola 27).

| Campo | Stato atteso | Atteso | Unità | Da conservare | Parser attuale | Esito provvisorio |
|---|---|---|---|---|---|---|
| quota_fissa_mensile | presente | 12 | €/mese | originale 144 €/anno | nessun valore | MANCANTE |
| prezzo_energia | non_presente | — | — | — | nessun valore | CORRETTO · vuoto giusto |

### U11 · da_rivedere
- **Testo:** `Quota fissa di commercializzazione: 12 €/mese`  ·  **Fornitura:** luce
- **Motivazione:** Quota fissa gia' mensile; non e' un prezzo dell'energia.

| Campo | Stato atteso | Atteso | Unità | Da conservare | Parser attuale | Esito provvisorio |
|---|---|---|---|---|---|---|
| quota_fissa_mensile | presente | 12 | €/mese | — | nessun valore | MANCANTE |
| prezzo_energia | non_presente | — | — | — | nessun valore | CORRETTO · vuoto giusto |

### U12 · da_rivedere · MODIFICATO (corretto)
- **Testo:** `PCV: 7,50 €/POD/mese`  ·  **Fornitura:** luce
- **Motivazione:** PCV espressa per punto di prelievo al mese: 7,50 €/mese. Il riferimento 'per POD' va conservato (campo 'per'), insieme al valore originale e alla periodicita' originale (regola 9).
- **Modifica:** Prima si verificava solo il valore mensile. Ora il test richiede anche il riferimento POD e l'originale.

| Campo | Stato atteso | Atteso | Unità | Da conservare | Parser attuale | Esito provvisorio |
|---|---|---|---|---|---|---|
| quota_fissa_mensile | presente | 7,5 | €/mese | originale 7,5 €/mese, riferimento POD | nessun valore | MANCANTE |
| prezzo_energia | non_presente | — | — | — | nessun valore | CORRETTO · vuoto giusto |

### U13 · da_rivedere · MODIFICATO (corretto)
- **Testo:** `CCV gas: 96 €/PDR/anno`  ·  **Fornitura:** gas
- **Motivazione:** CCV gas annuale: 96 €/anno = 8 €/mese. Vanno conservati l'originale (96 €/anno) e il riferimento 'per PDR' (punto di riconsegna del gas), distinto dal POD della luce.
- **Modifica:** Prima si verificava solo la conversione mensile e l'originale. Ora il test richiede anche il riferimento PDR.

| Campo | Stato atteso | Atteso | Unità | Da conservare | Parser attuale | Esito provvisorio |
|---|---|---|---|---|---|---|
| quota_fissa_mensile | presente | 8 | €/mese | originale 96 €/anno, riferimento PDR | nessun valore | MANCANTE |
| prezzo_energia | non_presente | — | — | — | nessun valore | CORRETTO · vuoto giusto |

### U14 · da_rivedere
- **Testo:** `Consumo annuo stimato 2.700 kWh`  ·  **Fornitura:** luce
- **Motivazione:** Un consumo in kWh non contiene il simbolo €: non deve diventare un prezzo.

| Campo | Stato atteso | Atteso | Unità | Da conservare | Parser attuale | Esito provvisorio |
|---|---|---|---|---|---|---|
| prezzo_energia | non_presente | — | — | — | nessun valore | CORRETTO · vuoto giusto |

### U15 · da_rivedere
- **Testo:** `Prezzo materia gas: 45 €/MWh`  ·  **Fornitura:** gas
- **Motivazione:** Gas in €/MWh: la conversione in €/Smc richiede il potere calorifico (PCS) del documento; senza di esso si conserva l'unita' originale invece di inventare un fattore.

| Campo | Stato atteso | Atteso | Unità | Da conservare | Parser attuale | Esito provvisorio |
|---|---|---|---|---|---|---|
| prezzo_energia | presente | 45 | €/MWh | — | nessun valore | MANCANTE |

## Formule, indici e spread (regole 5-8, 10, 11) — 18 casi

### F01 · da_rivedere
- **Testo:** `Prezzo energia: PUN + 0,025 €/kWh`  ·  **Fornitura:** luce
- **Motivazione:** Formula canonica: il numero dopo 'PUN +' e' lo spread; il valore del PUN non e' scritto nella CTE.

| Campo | Stato atteso | Atteso | Unità | Da conservare | Parser attuale | Esito provvisorio |
|---|---|---|---|---|---|---|
| luce.price_type | presente | indicizzato | — | — | nessun valore | MANCANTE |
| luce.index | presente | PUN | — | — | nessun valore | MANCANTE |
| luce.spread | presente | 0,025 | €/kWh | — | nessun valore | MANCANTE |
| luce.fixed_price | non_applicabile | — | — | — | nessun valore | CORRETTO · vuoto giusto |
| luce.valore_indice_nel_documento | non_presente | — | — | — | 0,025 €/kWh | INVENTATO · attribuzione_errata |

### F02 · da_rivedere · MODIFICATO (corretto)
- **Testo:** `Corrispettivo energia pari al PUN Index GME maggiorato di uno spread di 0,018 €/kWh`  ·  **Fornitura:** luce
- **Motivazione:** Variante 'PUN Index GME' (variante e testo originale conservati) e parola esplicita 'spread'.
- **Modifica:** Aggiunto il controllo del testo originale 'PUN Index GME' (prima c'era solo la variante).

| Campo | Stato atteso | Atteso | Unità | Da conservare | Parser attuale | Esito provvisorio |
|---|---|---|---|---|---|---|
| luce.price_type | presente | indicizzato | — | — | nessun valore | MANCANTE |
| luce.index | presente | PUN | — | variante index_gme, nome originale «PUN Index GME» | nessun valore | MANCANTE |
| luce.spread | presente | 0,018 | €/kWh | — | 0,018 €/kWh | CORRETTO · estratto |
| luce.fixed_price | non_applicabile | — | — | — | nessun valore | CORRETTO · vuoto giusto |
| luce.valore_indice_nel_documento | non_presente | — | — | — | nessun valore | CORRETTO · vuoto giusto |

### F03 · da_rivedere
- **Testo:** `Al valore del PUN sarà applicato un corrispettivo pari a 0,025 €/kWh`  ·  **Fornitura:** luce
- **Motivazione:** Frase della regola 14: lo spread e' descritto come corrispettivo aggiunto al PUN.

| Campo | Stato atteso | Atteso | Unità | Da conservare | Parser attuale | Esito provvisorio |
|---|---|---|---|---|---|---|
| luce.price_type | presente | indicizzato | — | — | nessun valore | MANCANTE |
| luce.index | presente | PUN | — | — | nessun valore | MANCANTE |
| luce.spread | presente | 0,025 | €/kWh | — | nessun valore | MANCANTE |
| luce.valore_indice_nel_documento | non_presente | — | — | — | 0,025 €/kWh | INVENTATO · attribuzione_errata |

### F04 · da_rivedere
- **Testo:** `Prezzo energia: PUN + 2,5 c€/kWh`  ·  **Fornitura:** luce
- **Motivazione:** Spread in c€/kWh: 2,5 c€/kWh = 0,025 €/kWh.

| Campo | Stato atteso | Atteso | Unità | Da conservare | Parser attuale | Esito provvisorio |
|---|---|---|---|---|---|---|
| luce.index | presente | PUN | — | — | nessun valore | MANCANTE |
| luce.spread | presente | 0,025 | €/kWh | — | nessun valore | MANCANTE |
| luce.valore_indice_nel_documento | non_presente | — | — | — | nessun valore | CORRETTO · vuoto giusto |

### F05 · da_rivedere
- **Testo:** `Prezzo energia: PUN x 1,05 + 0,010 €/kWh`  ·  **Fornitura:** luce
- **Motivazione:** Formula con moltiplicatore: 1,05 e' un coefficiente, 0,010 lo spread.

| Campo | Stato atteso | Atteso | Unità | Da conservare | Parser attuale | Esito provvisorio |
|---|---|---|---|---|---|---|
| luce.index | presente | PUN | — | — | nessun valore | MANCANTE |
| luce.multiplier | presente | 1,05 | — | — | nessun valore | MANCANTE |
| luce.spread | presente | 0,01 | €/kWh | — | nessun valore | MANCANTE |
| luce.valore_indice_nel_documento | non_presente | — | — | — | 0,01 €/kWh | INVENTATO · attribuzione_errata |

### F06 · da_rivedere
- **Testo:** `Prezzo energia fisso e invariabile per 12 mesi: 0,140 €/kWh`  ·  **Fornitura:** luce
- **Motivazione:** Prezzo fisso: niente indice e niente spread.

| Campo | Stato atteso | Atteso | Unità | Da conservare | Parser attuale | Esito provvisorio |
|---|---|---|---|---|---|---|
| luce.price_type | presente | fisso | — | — | nessun valore | MANCANTE |
| luce.fixed_price | presente | 0,14 | €/kWh | — | 0,14 €/kWh | CORRETTO · estratto |
| luce.index | non_applicabile | — | — | — | nessun valore | CORRETTO · vuoto giusto |
| luce.spread | non_applicabile | — | — | — | nessun valore | CORRETTO · vuoto giusto |

### F07 · da_rivedere
- **Testo:** `Prezzo gas: PSV + 0,10 €/Smc`  ·  **Fornitura:** gas
- **Motivazione:** Formula gas canonica PSV + spread.

| Campo | Stato atteso | Atteso | Unità | Da conservare | Parser attuale | Esito provvisorio |
|---|---|---|---|---|---|---|
| gas.price_type | presente | indicizzato | — | — | nessun valore | MANCANTE |
| gas.index | presente | PSV | — | — | nessun valore | MANCANTE |
| gas.spread | presente | 0,1 | €/Smc | — | nessun valore | MANCANTE |
| gas.fixed_price | non_applicabile | — | — | — | nessun valore | CORRETTO · vuoto giusto |
| gas.valore_indice_nel_documento | non_presente | — | — | — | 0,1 €/Smc | INVENTATO · attribuzione_errata |

### F08 · da_rivedere · MODIFICATO (corretto)
- **Testo:** `Corrispettivo materia gas pari al PSV Day Ahead maggiorato di 0,08 €/Smc`  ·  **Fornitura:** gas
- **Motivazione:** Variante PSV Day Ahead (regola 7), con variante e testo originale conservati.
- **Modifica:** Aggiunto il controllo del testo originale 'PSV Day Ahead' (prima c'era solo la variante).

| Campo | Stato atteso | Atteso | Unità | Da conservare | Parser attuale | Esito provvisorio |
|---|---|---|---|---|---|---|
| gas.index | presente | PSV | — | variante day_ahead, nome originale «PSV Day Ahead» | nessun valore | MANCANTE |
| gas.spread | presente | 0,08 | €/Smc | — | nessun valore | MANCANTE |
| gas.valore_indice_nel_documento | non_presente | — | — | — | 0,08 €/Smc | INVENTATO · attribuzione_errata |

### F09 · da_rivedere
- **Testo:** `Prezzo gas naturale fisso: 0,62 €/Smc`  ·  **Fornitura:** gas
- **Motivazione:** Prezzo gas fisso.

| Campo | Stato atteso | Atteso | Unità | Da conservare | Parser attuale | Esito provvisorio |
|---|---|---|---|---|---|---|
| gas.price_type | presente | fisso | — | — | nessun valore | MANCANTE |
| gas.fixed_price | presente | 0,62 | €/Smc | — | 0,62 €/Smc | CORRETTO · estratto |
| gas.index | non_applicabile | — | — | — | nessun valore | CORRETTO · vuoto giusto |
| gas.spread | non_applicabile | — | — | — | nessun valore | CORRETTO · vuoto giusto |

### F10 · da_rivedere
- **Testo:** `Prezzo materia gas: TTF + 1,50 €/MWh`  ·  **Fornitura:** gas
- **Motivazione:** Indice TTF in €/MWh: unita' originale conservata.

| Campo | Stato atteso | Atteso | Unità | Da conservare | Parser attuale | Esito provvisorio |
|---|---|---|---|---|---|---|
| gas.index | presente | TTF | — | — | nessun valore | MANCANTE |
| gas.spread | presente | 1,5 | €/MWh | — | nessun valore | MANCANTE |
| gas.valore_indice_nel_documento | non_presente | — | — | — | nessun valore | CORRETTO · vuoto giusto |

### F11 · da_rivedere
- **Testo:** `Prezzo gas: indice ZXGAS-M + 0,05 €/Smc`  ·  **Fornitura:** gas
- **Motivazione:** Indice sconosciuto: ALTRO con testo originale, mai perso (regola 7).

| Campo | Stato atteso | Atteso | Unità | Da conservare | Parser attuale | Esito provvisorio |
|---|---|---|---|---|---|---|
| gas.index | presente | ALTRO | — | nome originale «ZXGAS-M» | nessun valore | MANCANTE |
| gas.spread | presente | 0,05 | €/Smc | — | nessun valore | MANCANTE |

### F12 · da_rivedere
- **Testo:** `Energia elettrica: PUN + 0,020 €/kWh. Gas naturale: PSV + 0,08 €/Smc.`  ·  **Fornitura:** dual
- **Motivazione:** DUAL: spread luce e spread gas non vanno mescolati (regola 10).

| Campo | Stato atteso | Atteso | Unità | Da conservare | Parser attuale | Esito provvisorio |
|---|---|---|---|---|---|---|
| luce.index | presente | PUN | — | — | nessun valore | MANCANTE |
| luce.spread | presente | 0,02 | €/kWh | — | nessun valore | MANCANTE |
| gas.index | presente | PSV | — | — | nessun valore | MANCANTE |
| gas.spread | presente | 0,08 | €/Smc | — | nessun valore | MANCANTE |

### F13 · da_rivedere · MODIFICATO (corretto)
- **Testo:** `Sconto di 0,010 €/kWh sul prezzo energia per i primi 12 mesi`  ·  **Fornitura:** luce
- **Motivazione:** Uno sconto in €/kWh e' un incentivo commerciale (regola 11): va ESTRATTO come sconto (tipo, valore 0,010 €/kWh, durata 12 mesi, senza alterare il prezzo dell'energia) e NON deve diventare ne' il prezzo dell'energia ne' uno spread. Il test controlla entrambe le cose: il riconoscimento dello sconto e l'assenza di prezzo/spread.
- **Modifica:** Prima si verificava solo che lo sconto non diventasse un prezzo. Ora si verifica anche il riconoscimento dello sconto, del suo valore e della durata.

| Campo | Stato atteso | Atteso | Unità | Da conservare | Parser attuale | Esito provvisorio |
|---|---|---|---|---|---|---|
| luce.spread | non_presente | — | — | — | nessun valore | CORRETTO · vuoto giusto |
| luce.fixed_price | non_presente | — | — | — | 0,01 €/kWh | INVENTATO · attribuzione_errata |
| luce.sconti | presente | sconto 0,01 €/kWh, durata 12 mesi, non altera il prezzo dell'energia: si | — | — | nessuno sconto | MANCANTE |

### F14 · da_rivedere
- **Testo:** `A titolo informativo, il PUN medio di agosto 2026 è stato pari a 0,108 €/kWh.`  ·  **Fornitura:** luce
- **Motivazione:** Un valore del PUN citato a titolo informativo non e' la condizione economica del cliente.

| Campo | Stato atteso | Atteso | Unità | Da conservare | Parser attuale | Esito provvisorio |
|---|---|---|---|---|---|---|
| luce.spread | non_presente | — | — | — | nessun valore | CORRETTO · vuoto giusto |
| luce.fixed_price | non_presente | — | — | — | nessun valore | CORRETTO · vuoto giusto |

### F15 · da_rivedere
- **Testo:** `Quota fissa: 12 €/mese`  ·  **Fornitura:** luce
- **Motivazione:** 12 €/mese e' una quota fissa, non il prezzo dell'energia (regola 27).

| Campo | Stato atteso | Atteso | Unità | Da conservare | Parser attuale | Esito provvisorio |
|---|---|---|---|---|---|---|
| luce.fixed_price | non_presente | — | — | — | nessun valore | CORRETTO · vuoto giusto |
| luce.spread | non_presente | — | — | — | nessun valore | CORRETTO · vuoto giusto |

### F16 · da_rivedere · NUOVO (integrato)
- **Testo:** `Prezzo energia: PUN medio mensile + 0,015 €/kWh`  ·  **Fornitura:** luce
- **Motivazione:** Variante 'PUN medio mensile' (regola 7): indice PUN, variante e testo originale conservati; 0,015 e' lo spread, non il valore del PUN.
- **Modifica:** Caso nuovo: copre una variante dell'indice elencata nella regola 7 che non aveva ancora un caso.

| Campo | Stato atteso | Atteso | Unità | Da conservare | Parser attuale | Esito provvisorio |
|---|---|---|---|---|---|---|
| luce.price_type | presente | indicizzato | — | — | nessun valore | MANCANTE |
| luce.index | presente | PUN | — | variante medio_mensile, nome originale «PUN medio mensile» | nessun valore | MANCANTE |
| luce.spread | presente | 0,015 | €/kWh | — | nessun valore | MANCANTE |
| luce.fixed_price | non_applicabile | — | — | — | nessun valore | CORRETTO · vuoto giusto |
| luce.valore_indice_nel_documento | non_presente | — | — | — | 0,015 €/kWh | INVENTATO · attribuzione_errata |

### F17 · da_rivedere · NUOVO (integrato)
- **Testo:** `Prezzo gas: PSV mensile + 0,07 €/Smc`  ·  **Fornitura:** gas
- **Motivazione:** Variante 'PSV mensile' (regola 7): indice PSV, variante e testo originale conservati; 0,07 e' lo spread.
- **Modifica:** Caso nuovo: copre una variante dell'indice elencata nella regola 7 che non aveva ancora un caso.

| Campo | Stato atteso | Atteso | Unità | Da conservare | Parser attuale | Esito provvisorio |
|---|---|---|---|---|---|---|
| gas.price_type | presente | indicizzato | — | — | nessun valore | MANCANTE |
| gas.index | presente | PSV | — | variante mensile, nome originale «PSV mensile» | nessun valore | MANCANTE |
| gas.spread | presente | 0,07 | €/Smc | — | nessun valore | MANCANTE |
| gas.fixed_price | non_applicabile | — | — | — | nessun valore | CORRETTO · vuoto giusto |
| gas.valore_indice_nel_documento | non_presente | — | — | — | 0,07 €/Smc | INVENTATO · attribuzione_errata |

### F18 · da_rivedere · NUOVO (integrato)
- **Testo:** `Prezzo energia: PUN per fascia + 0,020 €/kWh`  ·  **Fornitura:** luce
- **Motivazione:** Variante 'PUN per fascia' (regola 7): indice PUN, variante e testo originale conservati; 0,020 e' lo spread.
- **Modifica:** Caso nuovo: copre una variante dell'indice elencata nella regola 7 che non aveva ancora un caso.

| Campo | Stato atteso | Atteso | Unità | Da conservare | Parser attuale | Esito provvisorio |
|---|---|---|---|---|---|---|
| luce.price_type | presente | indicizzato | — | — | nessun valore | MANCANTE |
| luce.index | presente | PUN | — | variante per_fascia, nome originale «PUN per fascia» | nessun valore | MANCANTE |
| luce.spread | presente | 0,02 | €/kWh | — | nessun valore | MANCANTE |
| luce.fixed_price | non_applicabile | — | — | — | nessun valore | CORRETTO · vuoto giusto |
| luce.valore_indice_nel_documento | non_presente | — | — | — | 0,02 €/kWh | INVENTATO · attribuzione_errata |

