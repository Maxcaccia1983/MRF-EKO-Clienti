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
    const data = "(\\d{1,2}[\\/\\-.]\\d{1,2}[\\/\\-.]\\d{2,4})";
    const patterns = [
      { label: "periodo oggetto", score: 100, regex: new RegExp("periodo\\s+(?:oggetto\\s+di\\s+)?fatturazione.{0,40}?dal\\s+" + data + "\\s+(?:al|a)\\s+" + data, "i") },
      { label: "periodo consumi", score: 95, regex: new RegExp("periodo\\s+(?:dei\\s+)?consumi.{0,40}?dal\\s+" + data + "\\s+(?:al|a)\\s+" + data, "i") },
      { label: "competenza", score: 90, regex: new RegExp("(?:periodo\\s+di\\s+competenza|competenza).{0,35}?" + data + "\\s*(?:-|al|a)\\s*" + data, "i") },
      { label: "dal al", score: 70, regex: new RegExp("\\bdal\\s+" + data + "\\s+(?:al|a)\\s+" + data, "i") },
      { label: "date pair", score: 55, regex: new RegExp(data + "\\s*(?:-|al|a)\\s*" + data, "i") }
    ];

    const found = estraiConPattern(testo, patterns);
    if (!found) return { valore: NON_RILEVATO, inizio: null, fine: null, confidenza: 0 };

    return {
      valore: found.match[1] + " – " + found.match[2],
      inizio: found.match[1],
      fine: found.match[2],
      confidenza: found.score
    };
  }

  function trovaCandidatiConsumo(testo) {
    const candidati = [];
    const regex = /([\d][\d.\s]*(?:,\d+)?)\s*(kwh|smc)\b/ig;
    let m;

    while ((m = regex.exec(testo)) !== null) {
      const valore = normalizzaNumero(m[1]);
      if (!Number.isFinite(valore) || valore <= 0) continue;

      const unita = m[2].toLowerCase() === "kwh" ? "kWh" : "Smc";
      const start = Math.max(0, m.index - 120);
      const end = Math.min(testo.length, regex.lastIndex + 80);
      const contesto = testo.slice(start, end).toLowerCase();

      let score = 20;
      if (/consumo totale|totale consumi|consumi fatturati|consumo fatturato/.test(contesto)) score += 70;
      if (/consumo|consumi/.test(contesto)) score += 30;
      if (/fatturat/.test(contesto)) score += 20;
      if (/annuo|12 mesi|ultimi 12/.test(contesto)) score -= 40;
      if (/lettura|autolettura|misura precedente|misura attuale/.test(contesto)) score -= 25;
      if (/fascia\s*f[123]/.test(contesto)) score -= 10;
      if (/quota|prezzo|corrispettivo|€/i.test(contesto)) score -= 35;

      candidati.push({ valore, unita, score, contesto });
    }

    return candidati.sort((a, b) => b.score - a.score || b.valore - a.valore);
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
    const patterns = [
      /(?:importo\s+totale\s+da\s+pagare|totale\s+da\s+pagare|totale\s+bolletta|totale\s+fattura|totale\s+documento|importo\s+da\s+pagare)\s*(?:[:=])?\s*(?:€|euro)?\s*([\d.]+(?:,\d{1,2})?)/ig,
      /(?:da\s+pagare)\s*(?:[:=])?\s*(?:€|euro)\s*([\d.]+(?:,\d{1,2})?)/ig
    ];

    const candidati = [];
    patterns.forEach((regex, idx) => {
      let m;
      while ((m = regex.exec(testo)) !== null) {
        const valore = normalizzaNumero(m[1]);
        if (!Number.isFinite(valore) || valore < 0 || valore > 1000000) continue;
        candidati.push({ valore, score: idx === 0 ? 95 : 75, index: m.index });
      }
    });

    return candidati.sort((a, b) => b.score - a.score || a.index - b.index);
  }

  function estraiTotale(testo) {
    const candidati = trovaCandidatiTotale(testo);
    if (!candidati.length) return { valore: NON_RILEVATO, numero: null, confidenza: 0 };
    const best = candidati[0];
    return { valore: "€ " + formattaNumero(best.valore, 2), numero: best.valore, confidenza: best.score };
  }

  function trovaPrezziUnitari(testo, tipo) {
    const unitaTarget = tipo.codice === "gas" ? "smc" : "kwh";
    const regex = /([0-9]+[.,][0-9]{3,8})\s*(?:€|euro)?\s*(?:\/|per)?\s*(kwh|smc)\b/ig;
    const candidati = [];
    let m;

    while ((m = regex.exec(testo)) !== null) {
      const prezzo = normalizzaNumero(m[1]);
      if (!Number.isFinite(prezzo) || prezzo <= 0 || prezzo > 20) continue;

      const unita = m[2].toLowerCase();
      if (tipo.codice !== "unknown" && unita !== unitaTarget) continue;

      const start = Math.max(0, m.index - 180);
      const end = Math.min(testo.length, regex.lastIndex + 120);
      const contesto = testo.slice(start, end).toLowerCase();

      let score = 30;
      if (/prezzo\s+(?:dell['’]?|di\s+)?energia|prezzo\s+materia|costo\s+energia|costo\s+materia/.test(contesto)) score += 55;
      if (/corrispettivo\s+energia|componente\s+energia|materia\s+energia|materia\s+prima|spesa\s+per\s+la\s+vendita/.test(contesto)) score += 45;
      if (/quota\s+energia|prezzo\s+unitario/.test(contesto)) score += 35;
      if (/pun|psv|indice|spread|perdite|trasporto|oneri|accisa|imposta|iva/.test(contesto)) score -= 30;
      if (/f1|f2|f3/.test(contesto)) score -= 5;

      candidati.push({ prezzo, unita: unita === "kwh" ? "kWh" : "Smc", score, contesto });
    }

    return candidati.sort((a, b) => b.score - a.score);
  }

  function estraiPrezzoEnergia(testo, tipo) {
    const candidati = trovaPrezziUnitari(testo, tipo);
    if (!candidati.length) {
      return { valore: NON_RILEVATO, numero: null, unita: null, confidenza: 0, candidati: [] };
    }

    const best = candidati[0];
    const quasiPari = candidati.filter(c => Math.abs(c.score - best.score) <= 8);
    const valoriDistinti = [...new Set(quasiPari.map(c => c.prezzo.toFixed(6)))];

    return {
      valore: String(best.prezzo).replace(".", ",") + " €/" + best.unita,
      numero: best.prezzo,
      unita: best.unita,
      confidenza: valoriDistinti.length > 1 ? Math.min(70, best.score) : Math.min(100, best.score),
      candidati: candidati.slice(0, 5),
      multiplo: valoriDistinti.length > 1
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
