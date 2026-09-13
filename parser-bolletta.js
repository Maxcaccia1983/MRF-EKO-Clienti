/*
 * MRF EKO - Parser universale bollette v1
 * Analisi locale del testo estratto dal PDF.
 * Non dipende dal nome del fornitore.
 */
(function () {
  "use strict";

  const NON_RILEVATO = "Non rilevato";

  function normalizzaTesto(testo) {
  return String(testo || "")
    .replace(/\u00a0/g, " ")
    .replace(/[–—]/g, "-")

    // Correzioni tipiche OCR sulle unità
    .replace(/\bk\s*w\s*h\b/gi, "kWh")
    .replace(/\bs\s*m\s*c\b/gi, "Smc")

    // Correzioni tipiche OCR sui codici utenza
    .replace(/\bp\s*o\s*d\b/gi, "POD")
    .replace(/\bp\s*d\s*r\b/gi, "PDR")

    // Ricompone numeri spezzati dall'OCR
    .replace(/(\d)\s*,\s*(\d)/g, "$1,$2")
    .replace(/(\d)\s*\.\s*(\d)/g, "$1.$2")

    // Ricompone date con spazi
    .replace(
      /(\d{1,2})\s*[\/\-\.]\s*(\d{1,2})\s*[\/\-\.]\s*(\d{2,4})/g,
      "$1/$2/$3"
    )

    // Uniforma euro e unità
    .replace(/€\s*\/\s*kwh/gi, "€/kWh")
    .replace(/€\s*\/\s*smc/gi, "€/Smc")

    .replace(/\s+/g, " ")
    .trim();
}

  function normalizzaNumero(valore) {
    if (valore == null) return null;
    let s = String(valore).trim().replace(/\s/g, "");
    if (!s) return null;

    // Formati italiani: 1.234,56 -> 1234.56
    if (/^\d{1,3}(?:\.\d{3})+,\d+$/.test(s)) {
      s = s.replace(/\./g, "").replace(",", ".");
    } else if (/^\d{1,3}(?:,\d{3})+\.\d+$/.test(s)) {
      // Formato internazionale: 1,234.56 -> 1234.56
      s = s.replace(/,/g, "");
    } else if (s.includes(",") && !s.includes(".")) {
      s = s.replace(",", ".");
    } else if (s.includes(",") && s.includes(".")) {
      // Se l'ultima virgola e' dopo l'ultimo punto, assumiamo formato italiano.
      if (s.lastIndexOf(",") > s.lastIndexOf(".")) {
        s = s.replace(/\./g, "").replace(",", ".");
      } else {
        s = s.replace(/,/g, "");
      }
    }

    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }

  function formattaNumero(n, decimali = 2) {
    if (!Number.isFinite(n)) return NON_RILEVATO;
    return n.toLocaleString("it-IT", {
      minimumFractionDigits: 0,
      maximumFractionDigits: decimali
    });
  }

  function estraiConPattern(testo, patterns) {
    for (const p of patterns) {
      const m = testo.match(p.regex);
      if (m) return { match: m, score: p.score || 1, source: p.label || "pattern" };
    }
    return null;
  }

  function rilevaTipoFornitura(testo) {
    let luce = 0;
    let gas = 0;

    const segnaliLuce = [
      [/energia elettrica/i, 5],
      [/fornitura elettrica/i, 4],
      [/\bkwh\b/i, 4],
      [/\bpod\b/i, 3],
      [/potenza (?:impegnata|disponibile)/i, 3],
      [/fascia\s*f[123]/i, 2]
    ];

    const segnaliGas = [
      [/gas naturale/i, 5],
      [/fornitura gas/i, 4],
      [/\bsmc\b/i, 4],
      [/\bpdr\b/i, 3],
      [/potere calorifico/i, 2],
      [/coefficiente\s+c\b/i, 2]
    ];

    for (const [r, peso] of segnaliLuce) if (r.test(testo)) luce += peso;
    for (const [r, peso] of segnaliGas) if (r.test(testo)) gas += peso;

    if (luce === 0 && gas === 0) {
      return { tipo: "Non riconosciuto", codice: "unknown", confidenza: 0 };
    }

    if (luce >= gas + 2) {
      return { tipo: "⚡ Energia elettrica", codice: "electricity", confidenza: Math.min(100, 55 + luce * 5) };
    }

    if (gas >= luce + 2) {
      return { tipo: "🔥 Gas naturale", codice: "gas", confidenza: Math.min(100, 55 + gas * 5) };
    }

    return {
      tipo: luce >= gas ? "⚡ Energia elettrica" : "🔥 Gas naturale",
      codice: luce >= gas ? "electricity" : "gas",
      confidenza: 55
    };
  }

  function estraiPeriodo(testo) {

  const data =
    "\\d{1,2}[\\/\\-.]\\d{1,2}[\\/\\-.]\\d{2,4}";

  const patterns = [

    {
      label: "periodo fatturazione",
      score: 100,
      regex: new RegExp(
        "(?:periodo|periodo di)\\s+(?:oggetto\\s+di\\s+)?fatturazione" +
        ".{0,80}?(?:dal\\s*)?(" + data + ")" +
        ".{0,30}?(?:al|a|-)?\\s*(" + data + ")",
        "i"
      )
    },

    {
      label: "periodo consumi",
      score: 95,
      regex: new RegExp(
        "(?:periodo\\s+(?:dei\\s+)?consumi|consumi\\s+fatturati)" +
        ".{0,80}?(?:dal\\s*)?(" + data + ")" +
        ".{0,30}?(?:al|a|-)?\\s*(" + data + ")",
        "i"
      )
    },

    {
      label: "competenza",
      score: 90,
      regex: new RegExp(
        "(?:periodo\\s+di\\s+competenza|competenza)" +
        ".{0,80}?(" + data + ")" +
        ".{0,30}?(" + data + ")",
        "i"
      )
    },

    {
      label: "dal al",
      score: 80,
      regex: new RegExp(
        "\\bdal\\s*(" + data + ")" +
        ".{0,25}?\\b(?:al|a)\\s*(" + data + ")",
        "i"
      )
    },

    {
      label: "contesto fattura",
      score: 65,
      regex: new RegExp(
        "(?:fatturazione|fatturato|periodo|consumi)" +
        ".{0,100}?(" + data + ")" +
        ".{0,40}?(" + data + ")",
        "i"
      )
    }

  ];

  const found =
    estraiConPattern(testo, patterns);

  if (!found) {
    return {
      valore: NON_RILEVATO,
      inizio: null,
      fine: null,
      confidenza: 0
    };
  }

  const inizio =
    found.match[1].replace(/[.-]/g, "/");

  const fine =
    found.match[2].replace(/[.-]/g, "/");

  return {
    valore: inizio + " – " + fine,
    inizio: inizio,
    fine: fine,
    confidenza: found.score
  };
}
  function trovaCandidatiConsumo(testo) {

  const candidati = [];

  const regex =
    /([\d][\d.\s]*(?:,\d+)?)\s*(kwh|smc)\b/ig;

  let m;

  while ((m = regex.exec(testo)) !== null) {

    const valore =
      normalizzaNumero(m[1]);

    if (
      !Number.isFinite(valore) ||
      valore <= 0 ||
      valore > 10000000
    ) {
      continue;
    }

    const unita =
      m[2].toLowerCase() === "kwh"
        ? "kWh"
        : "Smc";

    const start =
  Math.max(0, m.index - 180);

const end =
  Math.min(
    testo.length,
    regex.lastIndex + 120
  );

const contesto =
  testo.slice(start, end).toLowerCase();

let score = 20;
    // Indicazioni molto forti
    if (
      /consumo\s+totale|totale\s+consumi|consumo\s+fatturato|consumi\s+fatturati/.test(contesto)
    ) {
      score += 80;
    }

    if (
      /consumo\s+del\s+periodo|consumi\s+del\s+periodo|consumo\s+nel\s+periodo/.test(contesto)
    ) {
      score += 75;
    }

    if (
      /energia\s+prelevata|energia\s+consumata|prelievo\s+energia/.test(contesto)
    ) {
      score += 65;
    }

    if (
      /smc\s+fatturati|kwh\s+fatturati|quantit[aà]\s+fatturata/.test(contesto)
    ) {
      score += 60;
    }

    // Indicazioni generiche
    if (/consumo|consumi/.test(contesto)) {
      score += 30;
    }

    if (/fatturat/.test(contesto)) {
      score += 20;
    }

    if (/quota\s+consumi/.test(contesto)) {
      score += 15;
    }

    // Elementi che NON rappresentano il consumo del periodo
    if (
      /consumo\s+annuo|consumi\s+annui|annuale|12\s+mesi|ultimi\s+12/.test(contesto)
    ) {
      score -= 70;
    }

    if (
      /lettura|autolettura|misura\s+precedente|misura\s+attuale|lettura\s+precedente|lettura\s+attuale/.test(contesto)
    ) {
      score -= 50;
    }

    if (
      /f1|f2|f3|fascia\s+1|fascia\s+2|fascia\s+3/.test(contesto)
    ) {
      score -= 15;
    }

    if (
      /prezzo|corrispettivo|euro|€\s*\/|costo\s+unitario/.test(contesto)
    ) {
      score -= 45;
    }

    candidati.push({
      valore,
      unita,
      score,
      contesto
    });
  }

  return candidati.sort(
    (a, b) =>
      b.score - a.score ||
      b.valore - a.valore
  );
}

  function estraiConsumo(testo, tipo) {
    const candidati = trovaCandidatiConsumo(testo)
      .filter(c => tipo.codice === "unknown" ||
        (tipo.codice === "electricity" && c.unita === "kWh") ||
        (tipo.codice === "gas" && c.unita === "Smc"));

    if (!candidati.length) return { valore: NON_RILEVATO, numero: null, unita: null, confidenza: 0 };

    const best = candidati[0];
    return {
      valore: formattaNumero(best.valore, 3) + " " + best.unita,
      numero: best.valore,
      unita: best.unita,
      confidenza: Math.max(35, Math.min(100, best.score))
    };
  }

function trovaCandidatiTotale(testo) {

  const candidati = [];

  const patterns = [

    {
      score: 100,
      regex:
        /(?:importo\s+totale\s+da\s+pagare|totale\s+da\s+pagare|totale\s+bolletta|totale\s+fattura|totale\s+documento|importo\s+da\s+pagare|totale\s+da\s+versare)\s*(?:[:=\-])?\s*(?:€|euro)?\s*([\d.]+(?:,\d{1,2})?)/ig
    },

    {
      score: 95,
      regex:
        /(?:quanto\s+devi\s+pagare|quanto\s+da\s+pagare|da\s+pagare)\s*(?:[:=\-])?\s*(?:€|euro)?\s*([\d.]+(?:,\d{1,2})?)/ig
    },

    {
      score: 90,
      regex:
        /(?:importo\s+totale|totale\s+complessivo|totale\s+dovuto)\s*(?:[:=\-])?\s*(?:€|euro)?\s*([\d.]+(?:,\d{1,2})?)/ig
    },

    {
      score: 80,
      regex:
        /(?:€|euro)\s*([\d.]+(?:,\d{1,2})?)\s*(?:totale|da\s+pagare|importo\s+totale)/ig
    }

  ];

  patterns.forEach(({ regex, score }) => {

    let m;

    while ((m = regex.exec(testo)) !== null) {

      const valore =
        normalizzaNumero(m[1]);

      if (
        !Number.isFinite(valore) ||
        valore < 0 ||
        valore > 1000000
      ) {
        continue;
      }

      const start =
        Math.max(0, m.index - 120);

      const end =
        Math.min(
          testo.length,
          regex.lastIndex + 120
        );

      const contesto =
        testo.slice(start, end).toLowerCase();

      let punteggio = score;

      // Rafforza il vero totale della bolletta
      if (
        /totale\s+da\s+pagare|importo\s+da\s+pagare|totale\s+bolletta|totale\s+fattura/.test(contesto)
      ) {
        punteggio += 20;
      }

      // Penalizza importi che normalmente non sono il totale finale
      if (
        /canone\s+rai|deposito\s+cauzionale|rata|morosit[aà]|interessi|bonus|sconto/.test(contesto)
      ) {
        punteggio -= 40;
      }

      if (
        /iva|accisa|imposta|oneri|trasporto|materia\s+energia|spesa\s+energia/.test(contesto)
      ) {
        punteggio -= 25;
      }

      candidati.push({
        valore,
        score: punteggio,
        index: m.index,
        contesto
      });
    }
  });

  return candidati.sort(
    (a, b) =>
      b.score - a.score ||
      a.index - b.index
  );
}
  function estraiTotale(testo) {
    const candidati = trovaCandidatiTotale(testo);
    if (!candidati.length) return { valore: NON_RILEVATO, numero: null, confidenza: 0 };
    const best = candidati[0];
    return { valore: "€ " + formattaNumero(best.valore, 2), numero: best.valore, confidenza: Math.max(0, Math.min(100, best.score)) };
  }

  function trovaPrezziUnitari(testo, tipo) {

  const candidati = [];

  /*
   * Un prezzo deve contenere esplicitamente
   * € oppure la parola "euro".
   *
   * Questo impedisce che:
   * 2.423 kWh
   * venga interpretato come:
   * 2,423 €/kWh
   */
  const regex =
    /([0-9]+(?:[.,][0-9]{1,8})?)\s*(?:€|euro)\s*(?:\/|per)?\s*(kwh|mwh|smc)\b/ig;

  let m;

  while ((m = regex.exec(testo)) !== null) {

    let prezzo = normalizzaNumero(m[1]);

    if (
      !Number.isFinite(prezzo) ||
      prezzo <= 0
    ) {
      continue;
    }

    const unitaOriginale =
      m[2].toLowerCase();

    let unita;

    // Prezzi elettrici eventualmente espressi in €/MWh
    // vengono convertiti automaticamente in €/kWh.
    if (unitaOriginale === "mwh") {

      prezzo = prezzo / 1000;
      unita = "kWh";

    } else if (unitaOriginale === "kwh") {

      unita = "kWh";

    } else {

      unita = "Smc";
    }

    // Scarta valori chiaramente anomali
    if (prezzo > 20) {
      continue;
    }

    // Coerenza con il tipo di fornitura
    if (
      tipo.codice === "electricity" &&
      unita !== "kWh"
    ) {
      continue;
    }

    if (
      tipo.codice === "gas" &&
      unita !== "Smc"
    ) {
      continue;
    }

    /*
     * Manteniamo un contesto relativamente stretto
     * per evitare che una voce di una riga vicina
     * influenzi la classificazione.
     */
    const start =
      Math.max(0, m.index - 110);

    const end =
      Math.min(
        testo.length,
        regex.lastIndex + 90
      );

    const contesto =
      testo.slice(start, end).toLowerCase();

    let categoria = "prezzo_generico";
    let score = 20;

    // =========================================
    // MATERIA PRIMA
    // È LA COMPONENTE CHE USEREMO
    // PER IL CONFRONTO CON GME
    // =========================================

    if (
      /materia\s+energia|materia\s+prima\s+gas|materia\s+gas|spesa\s+per\s+(?:la\s+)?materia|spesa\s+materia|spesa\s+per\s+(?:la\s+)?vendit|vendita\s+(?:di\s+)?energia|componente\s+energia|componente\s+gas|quota\s+energia|quota\s+gas|corrispettivo\s+energia|corrispettivo\s+gas|corrispettivo\s+di\s+vendita|prezzo\s+(?:dell['’]?\s*)?(?:energia|gas)|costo\s+(?:energia|gas)|approvvigionamento\s+energia|approvvigionamento\s+gas/i.test(contesto)
    ) {

      categoria = "materia_prima";
      score += 140;
    }

    /*
     * Elementi che rafforzano il candidato,
     * ma da soli non bastano a definirlo
     * materia prima.
     */
    if (
      /quota\s+per\s+consumi|prezzo\s+medio|prezzo\s+unitario|corrispettivo\s+unitario|quota\s+consumi/i.test(contesto)
    ) {
      score += 35;
    }

    // =========================================
    // INDICE DI MERCATO
    // PUN / PSV vengono tenuti separati
    // =========================================

    if (
      /\bpun\b|\bpsv\b|pun\s+index|indice\s+pun|indice\s+psv|indice\s+di\s+mercato/i.test(contesto)
    ) {

      categoria = "indice";
      score += 80;
    }

    // =========================================
    // SPREAD DEL FORNITORE
    // =========================================

    if (
      /\bspread\b|margine\s+fornitore|spread\s+commerciale|corrispettivo\s+aggiuntivo/i.test(contesto)
    ) {

      categoria = "spread";
      score += 90;
    }

    // =========================================
    // COMPONENTI DA NON CONFRONTARE CON GME
    // =========================================

    if (
      /rete|trasporto|distribuzione|misura|oneri\s+di\s+sistema|oneri\s+generali|servizi\s+di\s+rete/i.test(contesto)
    ) {

      categoria = "rete_oneri";
      score -= 150;
    }

    if (
      /accisa|iva|imposta|imposte|tributi/i.test(contesto)
    ) {

      categoria = "imposte";
      score -= 150;
    }

    if (
      /commercializzazione\s+fissa|quota\s+fissa|quota\s+potenza/i.test(contesto)
    ) {

      categoria = "quota_fissa";
      score -= 120;
    }

    /*
     * Ulteriore protezione:
     * un consumo non deve mai diventare
     * prezzo materia prima.
     */
    if (
      /consumo\s+annuo|consumi\s+annui|consumo\s+totale|totale\s+consumi|consumo\s+del\s+periodo/i.test(contesto)
    ) {

      score -= 100;
    }

    candidati.push({
      prezzo,
      unita,
      categoria,
      score,
      contesto
    });
  }

  return candidati.sort(
    (a, b) => b.score - a.score
  );
}


function estraiPrezzoEnergia(testo, tipo) {

  const candidati =
    trovaPrezziUnitari(testo, tipo);

  /*
   * Il valore che verrà confrontato con GME
   * deve provenire esclusivamente dalla
   * categoria materia_prima.
   */
  const materiaPrima =
    candidati.filter(
      c =>
        c.categoria === "materia_prima" &&
        c.score > 0
    );

  /*
   * PUN / PSV eventualmente presenti
   * vengono conservati separatamente.
   */
  const indiciMercato =
    candidati.filter(
      c =>
        c.categoria === "indice" &&
        c.score > 0
    );

  /*
   * Spread eventualmente presente
   * viene conservato separatamente.
   */
  const spread =
    candidati.filter(
      c =>
        c.categoria === "spread" &&
        c.score > 0
    );

  const indiceMercato =
    indiciMercato.length > 0
      ? indiciMercato[0]
      : null;

  const spreadFornitore =
    spread.length > 0
      ? spread[0]
      : null;

  /*
   * Se non troviamo una materia prima
   * sufficientemente identificata,
   * NON inventiamo il prezzo.
   *
   * Meglio "Non rilevato" che confrontare
   * un dato sbagliato con GME.
   */
  if (!materiaPrima.length) {

    return {
      valore: NON_RILEVATO,
      numero: null,
      unita: null,
      confidenza: 0,

      candidati:
        candidati.slice(0, 8),

      multiplo: false,

      indiceMercato:
        indiceMercato,

      spread:
        spreadFornitore
    };
  }

  const best =
    materiaPrima[0];

  /*
   * Se due prezzi materia prima hanno
   * punteggio molto simile,
   * abbassiamo l'affidabilità
   * e chiediamo verifica.
   */
  const quasiPari =
    materiaPrima.filter(
      c =>
        Math.abs(
          c.score - best.score
        ) <= 8
    );

  const valoriDistinti =
    [
      ...new Set(
        quasiPari.map(
          c => c.prezzo.toFixed(6)
        )
      )
    ];

  const multiplo =
    valoriDistinti.length > 1;

  return {

    valore:
      String(best.prezzo)
        .replace(".", ",") +
      " €/" +
      best.unita,

    numero:
      best.prezzo,

    unita:
      best.unita,

    confidenza:
      multiplo
        ? Math.max(
            0,
            Math.min(
              70,
              best.score
            )
          )
        : Math.max(
            0,
            Math.min(
              100,
              best.score
            )
          ),

    /*
     * Manteniamo tutti i candidati
     * per la diagnostica.
     */
    candidati:
      candidati.slice(0, 8),

    multiplo:
      multiplo,

    /*
     * Informazioni che utilizzeremo
     * nel futuro modulo GME.
     */
    indiceMercato:
      indiceMercato,

    spread:
      spreadFornitore
  };
}

  function estraiCodiceUtenza(testo, tipo) {
    if (tipo.codice === "electricity") {
      const m = testo.match(/\bPOD\b\s*(?:[:\-])?\s*(IT\d{3}E\d{8,})/i);
      return m ? m[1].toUpperCase() : null;
    }
    if (tipo.codice === "gas") {
      const m = testo.match(/\bPDR\b\s*(?:[:\-])?\s*(\d{10,16})/i);
      return m ? m[1] : null;
    }
    return null;
  }

  function calcolaAffidabilita(dati) {
    const pesi = [
      [dati.tipo.confidenza, 0.20],
      [dati.periodo.confidenza, 0.20],
      [dati.consumo.confidenza, 0.25],
      [dati.totale.confidenza, 0.15],
      [dati.prezzoEnergia.confidenza, 0.20]
    ];

    const score = pesi.reduce((sum, [v, p]) => sum + (v || 0) * p, 0);
    return Math.round(score);
  }

  function analizza(testoOriginale) {
    const testo = normalizzaTesto(testoOriginale);
    const tipo = rilevaTipoFornitura(testo);
    const periodo = estraiPeriodo(testo);
    const consumo = estraiConsumo(testo, tipo);

    // Se il consumo e' chiaramente espresso in unita coerente, rafforza il tipo.
    if (consumo.unita === "kWh" && tipo.codice !== "electricity") {
      tipo.tipo = "⚡ Energia elettrica";
      tipo.codice = "electricity";
      tipo.confidenza = Math.max(tipo.confidenza, 80);
    } else if (consumo.unita === "Smc" && tipo.codice !== "gas") {
      tipo.tipo = "🔥 Gas naturale";
      tipo.codice = "gas";
      tipo.confidenza = Math.max(tipo.confidenza, 80);
    }

    const totale = estraiTotale(testo);
    const prezzoEnergia = estraiPrezzoEnergia(testo, tipo);
    const codiceUtenza = estraiCodiceUtenza(testo, tipo);

    const dati = { tipo, periodo, consumo, totale, prezzoEnergia, codiceUtenza };
    const affidabilita = calcolaAffidabilita(dati);

    const avvisi = [];
    if (periodo.valore === NON_RILEVATO) avvisi.push("Periodo di fatturazione non identificato con sicurezza.");
    if (consumo.valore === NON_RILEVATO) avvisi.push("Consumo fatturato non identificato con sicurezza.");
    if (totale.valore === NON_RILEVATO) avvisi.push("Totale bolletta non identificato con sicurezza.");
    if (prezzoEnergia.valore === NON_RILEVATO) avvisi.push("Prezzo unitario della componente energia/gas non identificato.");
    if (prezzoEnergia.multiplo) avvisi.push("Sono presenti piu prezzi unitari plausibili: il valore mostrato va verificato.");

    return {
      ...dati,
      affidabilita,
      avvisi,
      testoEstrattoPresente: testo.length > 80
    };
  }

  window.MRFBollettaParser = {
    analizza,
    normalizzaTesto,
    versione: "1.0.0"
  };
})();
