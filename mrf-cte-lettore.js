/*
 * MRF EKO — Lettore universale CTE (modulo affiancato al motore esistente)
 * -------------------------------------------------------------------------
 * Versione: 1.0.0
 *
 * Cosa fa
 *   1. Legge il PDF con pdf.js e ricostruisce pagine → righe → celle usando le
 *      coordinate (le tabelle non vengono più "appiattite" in una riga unica).
 *      Riunisce le cifre spezzate in più frammenti ("0,14" "6" "000").
 *   2. Trova tutti i VALORI CON UNITÀ (€/kWh, c€/kWh, €/MWh, €/Smc, €/anno,
 *      €/mese, €/POD/anno, €/punto di prelievo/anno, €/kW …).
 *   3. Associa a ogni valore la VOCE più vicina usando un dizionario di
 *      CONCETTI (prezzo energia, spread, quota fissa, sconto …) — mai nomi di
 *      fornitori. Stessa riga prima, poi le righe sopra.
 *   4. Assegna luce / gas dall'unità di misura o dalla sezione del documento.
 *   5. Decide: un solo valore coerente → accettato; valori diversi →
 *      null + "ambiguo" con l'elenco dei candidati. MAI inventare.
 *   6. Restituisce le stesse strutture usate oggi da index.html
 *      (classificazionePrezzoCTE, …PrezzoFissoCTE, …SpreadCTE, …CostiFissiCTE).
 *
 * Cosa NON fa (ancora)
 *   - OCR: le pagine senza testo vengono segnalate in "pagineSenzaTesto".
 *   - Associazione per intestazione di colonna nelle tabelle a matrice.
 *   - Salvataggio: il modulo non scrive nulla e non fa chiamate di rete
 *     (legge solo il file scelto dall'utente).
 *
 * Modalità
 *   CONFIG.campiAttivi = []  → modalità OMBRA: i dati esistenti NON cambiano,
 *                              il risultato è disponibile solo come diagnostica.
 *   CONFIG.campiAttivi = ["quota_fissa"] → il campo indicato viene combinato
 *                              con il motore esistente (regola in combina()).
 *
 * Funziona sia nel browser (window.MRFLettoreCTE) sia in Node per i test
 * (globalThis.MRFLettoreCTE). Nessuna dipendenza oltre a pdf.js.
 */
(function (globale) {
  "use strict";

  const VERSIONE = "1.0.0";

  const CONFIG = {
    // Campi che il nuovo lettore può modificare nei dati finali.
    // Valori ammessi: "quota_fissa", "prezzo_fisso", "spread", "indice", "tipo_prezzo".
    campiAttivi: [],
    // Caratteri minimi per considerare una pagina "con testo".
    minimoCaratteriPagina: 40
  };

  /* =======================================================================
   * DIZIONARIO DEI CONCETTI (solo dati: si estende senza toccare la logica)
   * ===================================================================== */

  const VOCABOLARIO = {
    prezzo_energia: {
      unita: ["energia"],
      sinonimi: [
        "prezzo luce", "prezzo gas", "corrispettivo luce", "corrispettivo gas",
        "prezzo energia", "prezzo dell'energia", "prezzo della componente energia",
        "componente energia", "prezzo materia prima", "prezzo della materia prima",
        "materia prima energia", "materia prima gas", "corrispettivo per il consumo",
        "corrispettivo a consumo", "corrispettivo al consumo", "prezzo fisso",
        "prezzo monorario", "prezzo unico", "prezzo del gas", "prezzo dell'energia elettrica",
        "componente materia prima", "prezzo bloccato"
      ]
    },
    spread: {
      unita: ["energia"],
      sinonimi: [
        "spread", "fee", "maggiorazione", "costi non coperti dal pun",
        "costi non coperti dal psv", "corrispettivo di commercializzazione variabile",
        "margine", "alfa", "corrispettivo aggiuntivo"
      ]
    },
    quota_fissa: {
      unita: ["periodo"],
      sinonimi: [
        "quota fissa", "contributo fisso", "ccv", "pcv",
        "commercializzazione e vendita", "corrispettivo per il servizio commerciale",
        "servizio commerciale", "componente di commercializzazione",
        "componente commercializzazione", "costo fisso", "corrispettivo annuo",
        "corrispettivo mensile", "canone", "quota commercializzazione",
        "spese di commercializzazione", "corrispettivo fisso", "quota di vendita"
      ]
    },
    sconto: {
      unita: ["energia", "periodo", "euro"],
      sinonimi: [
        "sconto", "scontato", "scontata", "bonus", "cashback", "buono",
        "promozione", "promo", "riduzione", "omaggio", "rimborso"
      ]
    }
  };

  // Parole che escludono un valore dai prezzi del venditore (componenti
  // regolate, stime di spesa, esempi, storici).
  const ESCLUSIONI = [
    "oneri", "trasporto", "dispacciamento", "asos", "arim", "accis", "iva",
    "imposta", "imposte", "perequazion", "mercato capacit", "capacità",
    "misura", "gestione del contatore", "distribuzione", "uc3", "uc6",
    "cdisp", "spesa annua", "spesa stimata", "stima della spesa", "spesa complessiva",
    "esempio", "medio", "media", "storico", "massimo", "minimo",
    "deposito", "cauzion", "una tantum", "attivazione", "voltura", "subentro",
    "mora", "penale", "recesso", "costo di", "tutela", "servizio di tutela",
    "potenza impegnata", "bolletta tipo", "valore dell'indice", "valore del pun",
    "valore del psv", "andamento"
  ];

  const INDICI = [
    { nome: "PUN", commodity: "luce", regex: /\bPUN(?:\s+Index)?(?:\s+GME)?\b|\bprezzo\s+unico\s+nazionale\b/i },
    { nome: "PSV", commodity: "gas", regex: /\bPSV(?:\s+day\s+ahead)?\b/i },
    { nome: "PSbG", commodity: "gas", regex: /\bPSbG\b|\bPSBIL\b/i },
    { nome: "TTF", commodity: "gas", regex: /\bTTF\b/i }
  ];

  const PAROLE_FASE = /\b(?:primo\s+anno|primi\s+\d+\s+mesi|primi\s+(?:dodici|dodici|sei|ventiquattro)|secondo\s+anno|dal\s+\d+°?\s+mese|successiv[io]|per\s+i\s+(?:primi\s+)?(?:\w+\s+)?\(?\d+\)?\s+mesi|anni\s+successivi)\b/i;

  /* =======================================================================
   * 1. NUMERI E UNITÀ
   * ===================================================================== */

  // Stessa logica prudente di convertiNumeroEconomicoCTEMRF (index.html):
  // "1.500" senza virgola è ambiguo → null.
  function convertiNumero(valore) {
    if (valore === null || valore === undefined) return null;
    let n = String(valore).trim().replace(/\s/g, "").replace(/[−–]/g, "-");
    if (!/^-?\d[\d.,]*$/.test(n)) return null;
    const v = n.lastIndexOf(","), p = n.lastIndexOf(".");
    if (v !== -1 && p !== -1) {
      n = v > p ? n.replace(/\./g, "").replace(",", ".") : n.replace(/,/g, "");
    } else if (v !== -1) {
      if ((n.match(/,/g) || []).length > 1) return null;
      n = n.replace(",", ".");
    } else if ((n.match(/\./g) || []).length > 1) {
      if (!/^-?\d{1,3}(\.\d{3})+$/.test(n)) return null;
      n = n.replace(/\./g, "");
    } else if (/^-?[1-9]\d{0,2}\.\d{3}$/.test(n)) {
      return null;
    }
    const r = Number(n);
    return Number.isFinite(r) ? r : null;
  }

  const RE_NUMERO = String.raw`(-?(?:0,\s\d{2,}|\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:[.,]\d+)?))`;
  const RE_VALUTA = String.raw`(c€|cent(?:esimi)?\s*(?:di\s*)?(?:€|euro)?|€|euro|eur)`;
  const RE_PUNTO = String.raw`(POD|PDR|punto\s+di\s+prelievo|punto\s+di\s+riconsegna|cliente|pdp|pdr)`;
  const RE_BASE = String.raw`(kWh|Smc|MWh|kW|mese|anno)`;

  // numero  valuta  /  [punto /]  base  [/ punto]
  const RE_VALORE = new RegExp(
    String.raw`(^|[^\w.,/])` + RE_NUMERO + String.raw`\s*` + RE_VALUTA +
    String.raw`\s*(?:\/|al|all'|per)\s*(?:` + RE_PUNTO + String.raw`\s*\/\s*)?` + RE_BASE +
    String.raw`(?:\s*\/\s*` + RE_PUNTO + String.raw`)?\b`,
    "gi"
  );

  function puntoVersoCommodity(punto) {
    if (!punto) return null;
    const p = punto.toLowerCase().replace(/\s+/g, " ");
    if (p === "pod" || p === "punto di prelievo" || p === "pdp") return "luce";
    if (p === "pdr" || p === "punto di riconsegna") return "gas";
    return null;
  }

  /**
   * Restituisce i valori con unità presenti in una stringa.
   * Ogni valore: { inizio, fine, testo, numero, valuta, base, punto, dimensione }
   * dimensione: "energia" (€/kWh, €/Smc, €/MWh) | "periodo" (€/anno, €/mese) | "potenza" (€/kW)
   */
  function trovaValori(testo) {
    const risultati = [];
    RE_VALORE.lastIndex = 0;
    // Nota: niente "lookbehind" nelle regex, per compatibilità con Safari/iOS meno recenti.
    for (const g of String(testo).matchAll(RE_VALORE)) {
      const prefisso = g[1] || "";
      const m = g.slice(1); // m[1] numero, m[2] valuta, m[3] punto, m[4] base, m[5] punto
      m.index = g.index + prefisso.length;
      m[0] = g[0].slice(prefisso.length);
      const numero = convertiNumero(m[1]);
      if (numero === null) continue;
      const valuta = m[2].toLowerCase();
      const centesimi = /^c€|^cent/.test(valuta);
      const base = m[4].toLowerCase();
      const punto = m[3] || m[5] || null;
      const dimensione =
        base === "kwh" || base === "smc" || base === "mwh" ? "energia"
          : base === "kw" ? "potenza"
            : "periodo";
      risultati.push({
        inizio: m.index,
        fine: m.index + m[0].length,
        testo: m[0].replace(/\s+/g, " ").trim(),
        numeroOriginale: numero,
        numero: centesimi ? numero / 100 : numero,
        centesimi,
        base,
        punto,
        dimensione
      });
    }
    return risultati;
  }

  /* =======================================================================
   * 2. LETTURA DEL DOCUMENTO A RIGHE
   * ===================================================================== */

  // Barre "speciali" (⁄ ∕ ／) usate da alcuni PDF al posto di "/".
  function pulisciTesto(testo) {
    return String(testo || "").replace(/[\u2044\u2215\uFF0F]/g, "/").replace(/\s+/g, " ").trim();
  }

  // Trasforma gli elementi di una pagina pdf.js in righe e celle.
  function costruisciRighe(items) {
    const elementi = [];
    for (const it of items || []) {
      if (!it || typeof it.str !== "string") continue;
      if (!it.str.trim()) continue;
      const t = it.transform || [1, 0, 0, 1, 0, 0];
      const fs = Math.hypot(t[2], t[3]) || Math.abs(t[3]) || 8;
      const x = t[4];
      const w = typeof it.width === "number" && it.width > 0 ? it.width : it.str.length * fs * 0.5;
      elementi.push({ str: it.str, x0: x, x1: x + w, y: t[5], fs });
    }

    // Raggruppa per riga (dall'alto in basso)
    elementi.sort((a, b) => b.y - a.y || a.x0 - b.x0);
    const righe = [];
    for (const el of elementi) {
      const tolleranza = Math.max(2, el.fs * 0.5);
      let riga = null;
      for (let i = righe.length - 1; i >= 0 && i >= righe.length - 3; i--) {
        if (Math.abs(righe[i].y - el.y) <= tolleranza) { riga = righe[i]; break; }
      }
      if (riga) riga.elementi.push(el);
      else righe.push({ y: el.y, elementi: [el] });
    }

    // Dentro la riga: unisce i frammenti vicini e separa le celle distanti
    return righe.map(riga => {
      riga.elementi.sort((a, b) => a.x0 - b.x0);
      const celle = [];
      let corrente = null;
      for (const el of riga.elementi) {
        if (!corrente) {
          corrente = { testo: el.str, x0: el.x0, x1: el.x1 };
          continue;
        }
        const distanza = el.x0 - corrente.x1;
        if (distanza > el.fs * 1.6) {
          celle.push(corrente);
          corrente = { testo: el.str, x0: el.x0, x1: el.x1 };
        } else {
          const unisci = distanza <= el.fs * 0.15 ||
            /\s$/.test(corrente.testo) || /^\s/.test(el.str);
          corrente.testo += (unisci ? "" : " ") + el.str;
          corrente.x1 = Math.max(corrente.x1, el.x1);
        }
      }
      if (corrente) celle.push(corrente);
      const celleTesto = celle.map(c => ({ testo: pulisciTesto(c.testo), x0: c.x0, x1: c.x1 }))
        .filter(c => c.testo);
      return {
        y: riga.y,
        celle: celleTesto,
        testo: celleTesto.map(c => c.testo).join(" | ")
      };
    }).filter(r => r.testo);
  }

  // pagineItems: [{ numero, items }]
  function costruisciDocumento(pagineItems) {
    const pagine = pagineItems.map(p => {
      const righe = costruisciRighe(p.items);
      return { numero: p.numero, righe };
    });
    const pagineSenzaTesto = pagine
      .filter(p => p.righe.map(r => r.testo).join("").length < CONFIG.minimoCaratteriPagina)
      .map(p => p.numero);
    return {
      versione: VERSIONE,
      pagine,
      pagineSenzaTesto,
      testoUnito: pagine.map(p => p.righe.map(r => r.testo).join("\n")).join("\n\n")
    };
  }

  // Per i test: crea un documento da righe di testo (" | " separa le celle).
  function documentoDaTesto(righePerPagina) {
    const elenco = Array.isArray(righePerPagina[0]) ? righePerPagina : [righePerPagina];
    const pagine = elenco.map((righe, i) => ({
      numero: i + 1,
      righe: righe.map((testo, j) => ({
        y: 1000 - j * 10,
        celle: testo.split(" | ").map(c => ({ testo: pulisciTesto(c) })),
        testo: testo.split(" | ").map(c => pulisciTesto(c)).join(" | ")
      }))
    }));
    return { versione: VERSIONE, pagine, pagineSenzaTesto: [], testoUnito: elenco.map(r => r.join("\n")).join("\n\n") };
  }

  async function leggiPdf(pdf) {
    const pagine = [];
    for (let n = 1; n <= pdf.numPages; n++) {
      const pagina = await pdf.getPage(n);
      const contenuto = await pagina.getTextContent();
      pagine.push({ numero: n, items: contenuto.items });
    }
    return costruisciDocumento(pagine);
  }

  async function leggiFile(file) {
    const pdfjsLib = globale.pdfjsLib;
    if (!pdfjsLib) throw new Error("PDF.js non disponibile.");
    if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
      pdfjsLib.GlobalWorkerOptions.workerSrc =
        "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
    }
    const buffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
    return leggiPdf(pdf);
  }

  /* =======================================================================
   * 3. ZONE E CANDIDATI
   * ===================================================================== */

  function normalizza(s) {
    return String(s || "").toLowerCase()
      .replace(/[’`]/g, "'")
      .replace(/\s+/g, " ");
  }

  function contiene(testo, parola) {
    const t = normalizza(testo);
    const p = normalizza(parola);
    if (p.length <= 4) return new RegExp("\\b" + p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b").test(t);
    return t.includes(p);
  }

  function rilevaZona(testoRiga, zonaCorrente) {
    const t = normalizza(testoRiga);
    if (t.length > 90 && !/\b(?:vendita|fornitura)\s+di\b/.test(t)) return zonaCorrente;
    const luce = /\benergia elettrica\b|\bluce\b/.test(t);
    const gas = /\bgas naturale\b|\bgas\b/.test(t);
    if (luce && !gas) return "luce";
    if (gas && !luce) return "gas";
    return zonaCorrente;
  }

  function punteggioConcetto(contesto, peso) {
    const punteggi = {};
    for (const [concetto, def] of Object.entries(VOCABOLARIO)) {
      for (const s of def.sinonimi) {
        if (contiene(contesto, s)) {
          const p = peso * (1 + Math.min(s.length, 40) / 40);
          if (!punteggi[concetto] || punteggi[concetto].punteggio < p) {
            punteggi[concetto] = { punteggio: p, voce: s };
          }
        }
      }
    }
    return punteggi;
  }

  function trovaIndiceFormula(codaContesto) {
    // "PUN Index GME + " / "PSV +" subito prima del valore
    const coda = codaContesto.slice(-70);
    const m = coda.match(/\b(PUN(?:\s+Index)?(?:\s+GME)?|PSV(?:\s+day\s+ahead)?|PSbG|PSBIL|TTF|prezzo\s+unico\s+nazionale)\b[^+\n|]{0,25}?([+\-])\s*$/i);
    if (!m) return null;
    const testo = m[1];
    const indice = INDICI.find(i => i.regex.test(testo));
    return {
      nome: indice ? indice.nome : "ALTRO",
      originale: testo.replace(/\s+/g, " ").trim(),
      segno: m[2] === "-" ? -1 : 1
    };
  }

  function raccogliCandidati(documento, commodityDocumento) {
    const candidati = [];
    const nonClassificati = [];

    for (const pagina of documento.pagine) {
      let zona = null;
      const righe = pagina.righe;
      // Testo di pagina con separatori: le unità spezzate su due righe
      // ("84 €/POD/" + "anno") vengono comunque riconosciute.
      let testoPagina = "";
      const inizioRiga = [];
      const zonaRiga = [];
      righe.forEach((r, i) => {
        zona = rilevaZona(r.testo, zona);
        zonaRiga.push(zona);
        inizioRiga.push(testoPagina.length);
        testoPagina += r.testo + (i < righe.length - 1 ? "\n" : "");
      });

      const rigaDi = pos => {
        let i = 0;
        while (i + 1 < inizioRiga.length && inizioRiga[i + 1] <= pos) i++;
        return i;
      };

      const valori = trovaValori(testoPagina);
      let fineValorePrecedente = 0;

      for (const v of valori) {
        const iRiga = rigaDi(v.inizio);
        const prima = testoPagina.slice(Math.max(fineValorePrecedente, v.inizio - 260), v.inizio);
        const ultimoA = prima.lastIndexOf("\n");
        const stessaRiga = prima.slice(ultimoA + 1);
        const righeSopra = ultimoA >= 0 ? prima.slice(0, ultimoA).split("\n").slice(-2).join(" ") : "";
        // la cella che contiene il valore: utile per tabelle "voce | valore"
        const dopo = testoPagina.slice(v.fine, v.fine + 60).split("\n")[0];
        fineValorePrecedente = v.fine;

        // Frase che contiene il valore (anche su più righe): serve per
        // sconti, periodi e indice citato senza il segno "+".
        const finestra = testoPagina.slice(Math.max(0, v.inizio - 350), v.inizio);
        let inizioFrase = 0;
        for (const m of finestra.matchAll(/[.;!?](?=\s+[A-ZÀ-Ý•])|\n\n|•/g)) inizioFrase = m.index + m[0].length;
        const frase = finestra.slice(inizioFrase).replace(/\n/g, " ");

        const pVicino = punteggioConcetto(stessaRiga, 3);
        const pSopra = punteggioConcetto(righeSopra, 1.5);
        const formula = trovaIndiceFormula(stessaRiga.length > 3 ? stessaRiga : righeSopra + " " + stessaRiga);

        const concetti = {};
        for (const fonte of [pSopra, pVicino]) {
          for (const [c, info] of Object.entries(fonte)) {
            if (!concetti[c] || concetti[c].punteggio < info.punteggio) concetti[c] = info;
          }
        }
        if (formula) concetti.spread = { punteggio: 10, voce: "formula " + formula.originale };

        // compatibilità unità ↔ concetto
        const compatibili = Object.entries(concetti)
          .filter(([c]) => VOCABOLARIO[c].unita.includes(v.dimensione))
          .sort((a, b) => b[1].punteggio - a[1].punteggio);

        const contestoBreve = (righeSopra + " " + stessaRiga).slice(-200).trim();
        const sorgente = (stessaRiga.trim() || righeSopra.trim()).slice(-140) + " " + v.testo;

        if (!compatibili.length || v.dimensione === "potenza") {
          nonClassificati.push({ pagina: pagina.numero, valore: v.testo, contesto: contestoBreve.slice(-120) });
          continue;
        }

        let [concetto, info] = compatibili[0];
        // Uno sconto nella stessa frase vince sempre: gli incentivi (e i prezzi
        // "scontati") non diventano il prezzo dell'energia.
        const scontoInFrase = VOCABOLARIO.sconto.sinonimi.find(x => contiene(frase, x));
        if (scontoInFrase && concetto !== "sconto" && !formula) {
          concetto = "sconto";
          info = { punteggio: 3, voce: scontoInFrase };
        }

        // Esclusioni (componenti regolate, stime, storici) nella stessa riga
        const testoEsclusione = stessaRiga + " " + (stessaRiga.trim().length < 25 ? righeSopra : "");
        let esclusione = ESCLUSIONI.find(e => contiene(testoEsclusione, e)) || null;
        // Riga di tabella con una cella in percentuale: composizione della
        // spesa / esempio, non un corrispettivo contrattuale.
        const rigaTabella = righe[iRiga];
        if (!esclusione && rigaTabella && rigaTabella.celle.length >= 2 &&
            rigaTabella.celle.some(c => /^-?\d+(?:[.,]\d+)?%$/.test(c.testo.replace(/\s/g, "")))) {
          esclusione = "tabella con percentuali (composizione spesa)";
        }

        // Commodity
        // Ordine: unità di energia → POD/PDR espliciti → commodity del documento
        // (se non DUAL) → sezione del documento → "punto di prelievo/riconsegna".
        let commodity = null;
        const puntoEsplicito = v.punto && /^(pod|pdr)$/i.test(v.punto.trim());
        if (v.base === "kwh") commodity = "luce";
        else if (v.base === "smc") commodity = "gas";
        else if (puntoEsplicito) commodity = puntoVersoCommodity(v.punto);
        if (!commodity && ["luce", "gas"].includes(commodityDocumento)) commodity = commodityDocumento;
        if (!commodity) {
          // DUAL: prima i segnali della frase stessa, poi la sezione.
          const segnaliLuce = /\bPUN\b|kwh|energia elettrica|\bPOD\b|\bluce\b/i.test(frase);
          const segnaliGas = /\bPSV\b|\bPSbG\b|\bsmc\b|\bgas\b|\bPDR\b|riconsegna/i.test(frase);
          if (segnaliLuce && !segnaliGas) commodity = "luce";
          else if (segnaliGas && !segnaliLuce) commodity = "gas";
        }
        if (!commodity) commodity = zonaRiga[iRiga];
        if (!commodity) commodity = puntoVersoCommodity(v.punto);
        if (formula && !commodity) commodity = (INDICI.find(i => i.nome === formula.nome) || {}).commodity || null;

        // Spread senza segno "+": indice citato nella stessa frase
        // (es. "costi non coperti dal PSV pari a 0,0965 €/Smc").
        let indice = formula;
        if (!indice && concetto === "spread") {
          const trovato = INDICI.find(i => i.regex.test(frase) && (!commodity || i.commodity === commodity));
          if (trovato) indice = { nome: trovato.nome, originale: frase.match(trovato.regex)[0], segno: 1, daContesto: true };
        }

        // Fascia oraria subito prima del valore
        const fasciaMatch = stessaRiga.slice(-18).match(/\b(F0|F1|F2|F3|F23)\b\s*[:=]?\s*$/i);

        // Normalizzazione
        let valore = v.numero;
        let unita = null;
        let originale = { valore: v.numeroOriginale, unita: v.testo.replace(/^-?[\d.,\s]+/, "").trim() };
        let nota = null;
        if (v.dimensione === "energia") {
          if (v.base === "kwh") unita = "€/kWh";
          else if (v.base === "smc") unita = "€/Smc";
          else if (v.base === "mwh") {
            if (commodity === "luce") { valore = v.numero / 1000; unita = "€/kWh"; nota = "convertito da €/MWh"; }
            else { unita = "€/MWh"; nota = "€/MWh gas: conversione in €/Smc non eseguita"; }
          }
        } else if (v.dimensione === "periodo") {
          unita = "€/mese";
          if (v.base === "anno") { valore = v.numero / 12; nota = "convertito da €/anno"; }
        }
        // "PSV - 0,02 €/Smc": spread negativo
        if (formula && formula.segno === -1 && valore > 0) valore = -valore;
        valore = Number(valore.toFixed(6));

        candidati.push({
          concetto,
          commodity,
          valore,
          unita,
          originale,
          nota,
          punteggio: info.punteggio,
          voce: info.voce,
          indice,
          fascia: fasciaMatch ? fasciaMatch[1].toUpperCase() : null,
          fase: PAROLE_FASE.test(frase + " " + dopo) ? (frase + " " + dopo).match(PAROLE_FASE)[0] : null,
          esclusione,
          pagina: pagina.numero,
          source_text: sorgente.replace(/\s+/g, " ").trim()
        });
      }
    }
    return { candidati, nonClassificati };
  }

  /* =======================================================================
   * 4. DECISIONE (mai inventare)
   * ===================================================================== */

  function campoVuoto(stato, extra) {
    return Object.assign({ value: null, unit: null, status: stato, confidence: 0, candidati: [] }, extra || {});
  }

  function decidi(lista, unitaAttesa) {
    const validi = lista.filter(c => !c.esclusione);
    if (!validi.length) {
      return campoVuoto(lista.length ? "solo_esclusi" : "non_rilevato", { candidati: lista.map(sintesi) });
    }
    const distinti = [...new Set(validi.map(c => c.valore))];
    if (distinti.length === 1) {
      const migliore = validi.slice().sort((a, b) => b.punteggio - a.punteggio)[0];
      const fasi = validi.some(c => c.fase);
      return {
        value: migliore.valore,
        unit: unitaAttesa || migliore.unita,
        original: migliore.originale,
        status: fasi ? "da_verificare" : "rilevato",
        confidence: Number(Math.min(0.99, 0.55 + migliore.punteggio / 20 + (validi.length > 1 ? 0.1 : 0)).toFixed(2)),
        page: migliore.pagina,
        source_text: migliore.source_text,
        nota: fasi ? "valore legato a un periodo (" + validi.find(c => c.fase).fase + ")" : migliore.nota,
        candidati: validi.map(sintesi)
      };
    }
    return campoVuoto(validi.some(c => c.fase) ? "a_fasi" : "ambiguo", { candidati: validi.map(sintesi) });
  }

  function sintesi(c) {
    return {
      valore: c.valore, unita: c.unita, originale: c.originale, pagina: c.pagina,
      voce: c.voce, fase: c.fase, fascia: c.fascia, esclusione: c.esclusione,
      source_text: c.source_text
    };
  }

  function analizzaCommodity(candidati, commodity) {
    const miei = candidati.filter(c => c.commodity === commodity);
    const unitaEnergia = commodity === "luce" ? "€/kWh" : "€/Smc";
    const energia = c => c.unita === unitaEnergia;

    const prezzi = miei.filter(c => c.concetto === "prezzo_energia" && energia(c) && !c.indice);
    const prezziFascia = prezzi.filter(c => c.fascia);
    const prezziSemplici = prezzi.filter(c => !c.fascia);
    const spread = miei.filter(c => c.concetto === "spread" && energia(c));
    const quote = miei.filter(c => c.concetto === "quota_fissa" && c.unita === "€/mese");
    const sconti = miei.filter(c => c.concetto === "sconto");

    const prezzoFisso = decidi(prezziSemplici, unitaEnergia);

    // Fasce: una sola cifra per fascia, altrimenti nessuna
    const fasce = {};
    let fasceIncoerenti = false;
    for (const c of prezziFascia.filter(c => !c.esclusione)) {
      if (fasce[c.fascia] !== undefined && fasce[c.fascia] !== c.valore) fasceIncoerenti = true;
      fasce[c.fascia] = c.valore;
    }

    const spreadCampo = decidi(spread, unitaEnergia);
    const indiciTrovati = [...new Set(spread.filter(c => c.indice && !c.esclusione).map(c => c.indice.nome))];
    const indice = indiciTrovati.length === 1
      ? {
          value: indiciTrovati[0],
          original_text: spread.find(c => c.indice && c.indice.nome === indiciTrovati[0]).indice.originale,
          status: "rilevato"
        }
      : campoVuoto(indiciTrovati.length ? "ambiguo" : "non_rilevato", { candidati: indiciTrovati });

    // Tipo di prezzo: solo da evidenze dirette
    const haVariabile = indice.value !== null || spread.some(c => c.indice && !c.esclusione);
    const haFisso = prezzoFisso.value !== null || (Object.keys(fasce).length > 0 && !fasceIncoerenti);
    const tipoPrezzo =
      haVariabile && !haFisso ? "variabile"
        : haFisso && !haVariabile ? "fisso"
          : null;

    return {
      abilitato: miei.length > 0,
      tipoPrezzo: { value: tipoPrezzo, status: tipoPrezzo ? "rilevato" : (haFisso && haVariabile ? "ambiguo" : "non_rilevato") },
      indice,
      prezzoFisso,
      prezziFasce: fasceIncoerenti ? {} : fasce,
      fasceIncoerenti,
      spread: spreadCampo,
      quotaFissa: decidi(quote, "€/mese"),
      sconti: sconti.map(sintesi)
    };
  }

  /**
   * Analizza un DocumentoLetto.
   * commodityDocumento: "luce" | "gas" | "dual" | "" (dal motore esistente)
   */
  function analizza(documento, commodityDocumento) {
    const { candidati, nonClassificati } = raccogliCandidati(documento, commodityDocumento);
    const luce = analizzaCommodity(candidati, "luce");
    const gas = analizzaCommodity(candidati, "gas");
    const avvisi = [];
    if (documento.pagineSenzaTesto && documento.pagineSenzaTesto.length) {
      avvisi.push("Pagine senza testo digitale (OCR non eseguito): " + documento.pagineSenzaTesto.join(", "));
    }
    for (const [nome, c] of [["luce", luce], ["gas", gas]]) {
      for (const [campo, v] of [["prezzo fisso", c.prezzoFisso], ["spread", c.spread], ["quota fissa", c.quotaFissa]]) {
        if (v.status === "ambiguo" || v.status === "a_fasi") {
          avvisi.push(nome + " – " + campo + ": valori diversi nel documento (" +
            v.candidati.map(x => x.valore + " " + (x.unita || "")).join(" / ") + "), da verificare");
        }
      }
    }
    return {
      versione: VERSIONE,
      commodityDocumento: commodityDocumento || null,
      luce,
      gas,
      avvisi,
      diagnostica: { candidati: candidati.map(c => Object.assign({ concetto: c.concetto, commodity: c.commodity }, sintesi(c))), nonClassificati }
    };
  }

  /* =======================================================================
   * 5. ADATTATORE E COMBINAZIONE CON IL MOTORE ESISTENTE
   * ===================================================================== */

  // Converte il risultato nelle strutture già usate da index.html.
  function versoStruttureEsistenti(risultato) {
    const out = {
      classificazionePrezzoCTE: {},
      classificazionePrezzoFissoCTE: {},
      classificazioneSpreadCTE: {},
      classificazioneCostiFissiCTE: {}
    };
    for (const s of ["luce", "gas"]) {
      const c = risultato[s];
      out.classificazionePrezzoCTE[s] = {
        tipoPrezzo: c.tipoPrezzo.value,
        indice: c.indice.value,
        evidenze: c.spread.source_text ? [c.spread.source_text] : (c.prezzoFisso.source_text ? [c.prezzoFisso.source_text] : [])
      };
      out.classificazionePrezzoFissoCTE[s] = {
        valore: c.prezzoFisso.value,
        unita: s === "luce" ? "€/kWh" : "€/Smc",
        prezziFasce: c.prezziFasce,
        evidenze: c.prezzoFisso.source_text ? [c.prezzoFisso.source_text] : []
      };
      out.classificazioneSpreadCTE[s] = {
        valore: c.spread.value,
        unita: c.spread.value !== null ? (s === "luce" ? "€/kWh" : "€/Smc") : null,
        evidenze: c.spread.source_text ? [c.spread.source_text] : [],
        componentiAggiuntive: [],
        maggiorazioneComplessiva: null
      };
      out.classificazioneCostiFissiCTE[s] = {
        valoreMensile: c.quotaFissa.value,
        unita: "€/mese",
        evidenze: c.quotaFissa.source_text ? [c.quotaFissa.source_text] : [],
        originale: c.quotaFissa.original || null
      };
    }
    return out;
  }

  function uguali(a, b) {
    if (a === null || a === undefined || b === null || b === undefined) return false;
    if (typeof a === "number" && typeof b === "number") return Math.abs(a - b) < 1e-6;
    return String(a) === String(b);
  }

  /**
   * Regola di combinazione per ogni campo attivo:
   *   - stesso valore           → confermato
   *   - esistente vuoto, nuovo  → si usa il nuovo
   *   - nuovo vuoto             → resta l'esistente
   *   - valori diversi          → null (il flag da_verificare scatta da solo)
   * Con CONFIG.campiAttivi vuoto (OMBRA) i dati non cambiano.
   */
  function combina(datiEsistenti, risultato, campiAttivi) {
    const attivi = campiAttivi || CONFIG.campiAttivi || [];
    const dati = JSON.parse(JSON.stringify(datiEsistenti || {}));
    const nuovo = versoStruttureEsistenti(risultato);
    const confronto = [];

    const regole = [
      { campo: "tipo_prezzo", gruppo: "classificazionePrezzoCTE", chiave: "tipoPrezzo" },
      { campo: "indice", gruppo: "classificazionePrezzoCTE", chiave: "indice" },
      { campo: "prezzo_fisso", gruppo: "classificazionePrezzoFissoCTE", chiave: "valore" },
      { campo: "spread", gruppo: "classificazioneSpreadCTE", chiave: "valore" },
      { campo: "quota_fissa", gruppo: "classificazioneCostiFissiCTE", chiave: "valoreMensile" }
    ];

    for (const s of ["luce", "gas"]) {
      for (const r of regole) {
        dati[r.gruppo] = dati[r.gruppo] || {};
        const vecchioObj = dati[r.gruppo][s] = dati[r.gruppo][s] || {};
        const nuovoObj = nuovo[r.gruppo][s];
        const vecchio = vecchioObj[r.chiave] ?? null;
        const valoreNuovo = nuovoObj[r.chiave] ?? null;

        let esito;
        if (vecchio === null && valoreNuovo === null) esito = "entrambi_vuoti";
        else if (uguali(vecchio, valoreNuovo)) esito = "confermato";
        else if (vecchio === null) esito = "solo_nuovo";
        else if (valoreNuovo === null) esito = "solo_esistente";
        else esito = "conflitto";

        confronto.push({ commodity: s, campo: r.campo, esistente: vecchio, nuovo: valoreNuovo, esito });

        if (!attivi.includes(r.campo)) continue;

        if (esito === "solo_nuovo") {
          vecchioObj[r.chiave] = valoreNuovo;
          vecchioObj.evidenze = nuovoObj.evidenze || [];
          if (r.campo === "spread") vecchioObj.unita = nuovoObj.unita;
          if (r.campo === "quota_fissa") vecchioObj.originale = nuovoObj.originale;
          if (r.campo === "prezzo_fisso") {
            vecchioObj.unita = nuovoObj.unita;
            if (!Object.keys(vecchioObj.prezziFasce || {}).length) vecchioObj.prezziFasce = nuovoObj.prezziFasce;
          }
        } else if (esito === "conflitto") {
          vecchioObj[r.chiave] = null;
          vecchioObj.evidenze = [];
          vecchioObj.conflittoLettoreUniversale = { esistente: vecchio, nuovo: valoreNuovo };
        }
      }
    }

    dati.lettoreUniversaleCTE = {
      versione: VERSIONE,
      campiAttivi: attivi.slice(),
      confronto,
      avvisi: risultato.avvisi,
      risultato
    };
    return dati;
  }

  // Comodità per index.html: legge il file, analizza e combina.
  async function arricchisci(file, datiEsistenti) {
    try {
      const documento = await leggiFile(file);
      const risultato = analizza(documento, datiEsistenti && datiEsistenti.commodity);
      return combina(datiEsistenti, risultato);
    } catch (errore) {
      // Il lettore universale non deve mai bloccare il flusso esistente.
      const dati = Object.assign({}, datiEsistenti);
      dati.lettoreUniversaleCTE = { versione: VERSIONE, errore: String(errore && errore.message || errore) };
      return dati;
    }
  }

  // Testo leggibile per la modalità ?debug=1
  function descriviDiagnostica(dati) {
    const l = dati && dati.lettoreUniversaleCTE;
    if (!l) return "";
    if (l.errore) return "LETTORE UNIVERSALE " + l.versione + ": errore — " + l.errore;
    const righe = ["", "🧪 LETTORE UNIVERSALE " + l.versione + " (campi attivi: " + (l.campiAttivi.join(", ") || "nessuno, modalità ombra") + ")"];
    for (const c of l.confronto) {
      if (c.esito === "entrambi_vuoti") continue;
      righe.push(c.commodity + " · " + c.campo + ": esistente=" + c.esistente + " | nuovo=" + c.nuovo + " → " + c.esito);
    }
    for (const a of l.avvisi || []) righe.push("⚠️ " + a);
    return righe.join("\n");
  }

  const API = {
    VERSIONE,
    CONFIG,
    VOCABOLARIO,
    ESCLUSIONI,
    convertiNumero,
    trovaValori,
    costruisciRighe,
    costruisciDocumento,
    documentoDaTesto,
    leggiPdf,
    leggiFile,
    analizza,
    versoStruttureEsistenti,
    combina,
    arricchisci,
    descriviDiagnostica
  };

  globale.MRFLettoreCTE = API;
  if (typeof module !== "undefined" && module.exports) module.exports = API;
})(typeof window !== "undefined" ? window : globalThis);
