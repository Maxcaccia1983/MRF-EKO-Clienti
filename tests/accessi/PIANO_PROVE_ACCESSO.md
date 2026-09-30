# Prove di accesso Supabase — piano

## Due livelli distinti

| Livello | Cosa dimostra | Stato |
|---|---|---|
| **A. Configurazione** (5 query nel SQL Editor, 30/09/2026) | Come sono *scritte* RLS, policy e bucket | ✅ Eseguite da Max |
| **B. Accessi effettivi** (`verifica-accessi.mjs`) | Cosa *ottiene davvero* ciascun profilo tramite la stessa API dell'app | ⏳ Da eseguire |

Il livello A non sostituisce il livello B: una policy scritta correttamente può comunque avere un effetto diverso da quello previsto.

### Esito del livello A (riportato da Max)
- RLS attiva su `public.admin_users` e `public.cte_offerte`.
- 9 policy in totale:
  - lettura del proprio stato admin;
  - 4 operazioni su `cte_offerte` riservate agli utenti presenti in `admin_users`;
  - 4 operazioni Storage riservate agli admin e limitate al bucket `cte-mrf`;
  - l'INSERT su `cte_offerte` richiede anche `uploaded_by = auth.uid()`.
- Bucket `cte-mrf` privato, limite 20.971.520 byte, MIME ammesso solo `application/pdf`.
- `cte_offerte`: 40 colonne. Dei 78 record, 54 sono da verificare, 13 hanno fornitore NULL, 26 hanno codice_offerta NULL, e i codici distinti sono 9.

**Chiarito il 30/09/2026 (confermato da Max):**
- `uploaded_by` è `uuid NOT NULL` con default `auth.uid()`. La INSERT dell'app (index.html r.2393-2409) non lo invia, e la policy `uploaded_by = auth.uid()` è comunque soddisfatta dal valore predefinito. Nessuna modifica necessaria.
- `da_verificare` è `NOT NULL` con default `false`. Il valore `false` **non** è una conferma di verifica.
- Il CSV delle 40 colonne non è ancora arrivato: finora è arrivata solo la riga d'intestazione. Da allegare come file per archiviarlo.

## Livello B — prove previste (tutte in sola lettura)

| # | Profilo | Prova | Esito atteso |
|---|---|---|---|
| B1 | chiunque | URL pubblico di un PDF del bucket | negato (bucket privato) |
| B2 | visitatore | lettura `cte_offerte` | 0 righe o negato |
| B3 | visitatore | lettura `admin_users` | 0 righe o negato |
| B4 | visitatore | elenco file del bucket `cte-mrf` | 0 file o negato |
| B5 | visitatore | download autenticato di un PDF | negato |
| B6-B9 | autenticato **non admin** | come B2-B5 | come B2-B5 |
| B10 | admin | conteggio `cte_offerte` | > 0 (78) |
| B11 | admin | lettura `admin_users` | solo la propria riga |
| B12 | admin | elenco file del bucket | consentito |
| B13 | admin | download di un PDF | consentito |

### Cosa serve per eseguirle
**Stato: NON ESEGUITE. Da pianificare separatamente.** Non è stato creato nessun utente e l'autenticazione di produzione non è stata modificata.

1. **Un utente di test non admin.** Crearlo in Supabase Auth è una modifica al progetto di produzione, quindi **non va fatto ora**. Si deciderà nel piano dedicato, preferibilmente su un progetto o branch di staging.
2. Le credenziali di test (non admin e admin) **passate solo come variabili d'ambiente**. Non vanno mai scritte nei file né nel repository.
3. Il percorso di un PDF esistente nel bucket (`MRF_TEST_STORAGE_PATH`), letto dalla colonna `storage_path`.
4. Un ambiente con accesso di rete a supabase.co. Da questa sessione cloud la rete verso Supabase è bloccata. Le opzioni sono un computer con Node 20 oppure un workflow manuale con i segreti di GitHub, da approvare a parte.

```
cd tests/runner
MRF_TEST_NONADMIN_EMAIL=... MRF_TEST_NONADMIN_PASSWORD=... \
MRF_TEST_ADMIN_EMAIL=... MRF_TEST_ADMIN_PASSWORD=... \
MRF_TEST_STORAGE_PATH=... npm run accessi
```

### Prove di scrittura negative (escluse)
Le prove "un visitatore o un non admin **non** riesce a inserire, modificare o cancellare" sono le più significative, ma su un database di produzione con RLS difettosa **creerebbero o altererebbero dati reali**. Per questo:
- sono **escluse** dallo script;
- si eseguono solo su un ambiente di **staging** (branch Supabase o progetto di prova), con approvazione esplicita;
- in alternativa si verificano leggendo le policy (livello A), che è già stato fatto.

## Nota sui 78 record
- I record di `cte_offerte` sono un **riferimento diagnostico**. Nessuna cancellazione, nessuna correzione automatica, e **mai** usati come tabella di ricerca dal parser. Il controllo di universalità blocca qualsiasi riferimento a `cte_offerte` o Supabase nel codice del parser.
- `da_verificare = false` **non certifica** che il record sia corretto: è il valore di default e significa solo che il parser dell'epoca non ha segnalato campi mancanti. La correttezza si stabilisce solo con un expected verificato sul PDF.
