// Classificazione di un singolo campo: output del parser vs valore atteso.
//
//   CORRETTO      valore uguale all'atteso (entro tolleranza), oppure null quando
//                 il documento non contiene il dato. Il campo "modo" distingue:
//                   estratto          il parser ha restituito il valore giusto
//                   vuoto_corretto    il parser ha correttamente lasciato vuoto
//                                     (dato non_presente / non_applicabile)
//                   ambiguo_vuoto     dato ambiguo lasciato vuoto
//                   ambiguo_segnalato dato ambiguo restituito con da_verificare
//                 Solo "estratto" prova che il parser SA leggere il dato.
//   ERRATO        il parser da' un valore diverso da quello atteso, oppure
//                 perde un attributo che il test richiede di conservare
//                 (unita', variante dell'indice, testo originale, valore
//                 originale, riferimento POD/PDR)
//   MANCANTE      l'atteso ha un valore, il parser restituisce null
//   INVENTATO     l'atteso e' non_presente / non_applicabile / ambiguo ma il
//                 parser restituisce un valore come certo (regola 13).
//                 Sottotipi (campo "sottotipo"):
//                   attribuzione_errata        il numero esiste nel testo ma il
//                                              parser lo assegna al campo sbagliato
//                   valore_assente_dal_testo   il numero non compare nel testo
//                   certezza_non_giustificata  dato ambiguo restituito come certo
//   NON_VALUTATO  campo non ancora compilato nell'atteso
//
// L'output del parser (dopo l'adattatore) per ogni campo e':
//   null                                  -> nessun valore
//   { value, unit?, variant?, original_text?, original?, per?, da_verificare? }

export const ESITI = ["CORRETTO", "ERRATO", "MANCANTE", "INVENTATO", "NON_VALUTATO"];

const TOLLERANZE_DEFAULT = { price: 0.000001, fee: 0.01, multiplier: 0.0001, number: 0.000001 };

function normStringa(v) {
  return String(v).toLowerCase().normalize("NFKC").replace(/\s+/g, " ").trim();
}

function normUnita(u) {
  if (u == null) return null;
  return String(u).toLowerCase().replace(/\s+/g, "").replace("euro", "€");
}

function valoreVuoto(out) {
  return out == null || out.value == null || out.value === "";
}

function uguali(atteso, ottenuto, tolleranza) {
  if (typeof atteso === "number" && typeof ottenuto === "number") {
    return Math.abs(atteso - ottenuto) <= tolleranza;
  }
  if (typeof atteso === "boolean" || typeof ottenuto === "boolean") {
    return atteso === ottenuto;
  }
  return normStringa(atteso) === normStringa(ottenuto);
}

export function scegliTolleranza(percorsoCampo, tolleranze = {}) {
  const t = { ...TOLLERANZE_DEFAULT, ...tolleranze };
  if (/fee|quota/i.test(percorsoCampo)) return t.fee;
  if (/multiplier/i.test(percorsoCampo)) return t.multiplier;
  if (/price|spread|prezzo|valore/i.test(percorsoCampo)) return t.price;
  return t.number;
}

/** Il valore numerico compare nel testo sorgente (anche come c€ o €/MWh)? */
export function numeroNelTesto(valore, testo) {
  if (typeof valore !== "number" || !testo) return false;
  const numeri = String(testo).match(/\d+(?:[.,]\d+)*/g) || [];
  for (const n of numeri) {
    const letture = new Set([
      Number(n.replace(",", ".")),
      Number(n.replace(/\./g, "").replace(",", ".")),
      Number(n.replace(/,/g, "")),
    ]);
    for (const x of letture) {
      if (!Number.isFinite(x)) continue;
      for (const f of [1, 0.01, 0.001]) if (Math.abs(x * f - valore) < 1e-9) return true;
    }
  }
  return false;
}

function inventato(dettaglio, sottotipo) {
  return { esito: "INVENTATO", sottotipo, dettaglio: dettaglio + " [" + sottotipo + "]" };
}

/**
 * Attributi che il parser deve CONSERVARE oltre al valore. Se l'atteso li
 * richiede e il parser non li restituisce uguali, il campo e' ERRATO:
 * un valore giusto ma senza il suo originale o il suo riferimento e' un dato perso.
 * Restituisce il primo difetto trovato, oppure null.
 */
export function difettoAttributi(atteso, ottenuto) {
  if (atteso.unit && ottenuto.unit && normUnita(atteso.unit) !== normUnita(ottenuto.unit)) {
    return "unita' attesa " + atteso.unit + ", ottenuta " + ottenuto.unit;
  }
  if (atteso.unit && !ottenuto.unit) {
    return "unita' attesa " + atteso.unit + " non dichiarata dal parser";
  }
  if (atteso.variant && normStringa(atteso.variant) !== normStringa(ottenuto.variant || "")) {
    return "variante attesa " + atteso.variant + ", ottenuta " + (ottenuto.variant || "nessuna");
  }
  if (atteso.original_text && !normStringa(ottenuto.original_text || "").includes(normStringa(atteso.original_text))) {
    return "testo originale dell'indice non conservato (atteso '" + atteso.original_text + "')";
  }
  if (atteso.original) {
    const o = ottenuto.original;
    if (!o || o.value == null) return "valore originale non conservato (atteso " + atteso.original.value + " " + atteso.original.unit + ")";
    if (!uguali(atteso.original.value, o.value, TOLLERANZE_DEFAULT.fee) || normUnita(atteso.original.unit) !== normUnita(o.unit)) {
      return "valore originale atteso " + atteso.original.value + " " + atteso.original.unit + ", ottenuto " + o.value + " " + o.unit;
    }
  }
  if (atteso.per) {
    if (!ottenuto.per) return "riferimento " + atteso.per + " non conservato";
    if (normStringa(atteso.per) !== normStringa(ottenuto.per)) return "riferimento atteso " + atteso.per + ", ottenuto " + ottenuto.per;
  }
  return null;
}

/**
 * @param atteso  { status, value, unit?, variant?, original_text?, original?, per? }
 * @param ottenuto null | { value, unit?, variant?, original_text?, original?, per?, da_verificare? }
 * @returns { esito, modo?, dettaglio, sottotipo? }
 */
export function classificaCampo(atteso, ottenuto, tolleranza = TOLLERANZE_DEFAULT.number, testoSorgente = "") {
  const status = atteso && atteso.status;

  if (!status || status === "non_valutato") {
    return { esito: "NON_VALUTATO", dettaglio: "atteso non compilato" };
  }

  if (status === "non_presente" || status === "non_applicabile") {
    if (valoreVuoto(ottenuto)) return { esito: "CORRETTO", modo: "vuoto_corretto", dettaglio: "nessun valore, come atteso" };
    const st = numeroNelTesto(ottenuto.value, testoSorgente) ? "attribuzione_errata" : "valore_assente_dal_testo";
    return inventato("valore " + JSON.stringify(ottenuto.value) + " per un dato " + status, st);
  }

  if (status === "ambiguo") {
    if (valoreVuoto(ottenuto)) return { esito: "CORRETTO", modo: "ambiguo_vuoto", dettaglio: "ambiguo lasciato vuoto" };
    if (ottenuto.da_verificare === true) return { esito: "CORRETTO", modo: "ambiguo_segnalato", dettaglio: "ambiguo segnalato da verificare" };
    return inventato("valore certo " + JSON.stringify(ottenuto.value) + " su dato ambiguo", "certezza_non_giustificata");
  }

  // status === "presente"
  if (valoreVuoto(ottenuto)) return { esito: "MANCANTE", dettaglio: "atteso " + JSON.stringify(atteso.value) };
  if (!uguali(atteso.value, ottenuto.value, tolleranza)) {
    // Denominazioni equivalenti: SOLO quelle elencate nell'expected (campo "denominations") E verificate a mano.
    // Nessuna normalizzazione globale delle forme societarie: ogni equivalenza e' un dato esplicito con frase e pagina.
    // Si ignorano solo maiuscole, spazi e punti finali; il testo ORIGINALE del parser non viene mai riscritto.
    // Questo confronto riguarda l'identita' del nome, non l'affidabilita' del ruolo: quella e' decisa dal parser
    // (fornitoreAffidabile) e l'adattatore passa al classificatore soltanto i fornitori affidabili.
    const fineRiga = (x) => String(x).toLowerCase().normalize("NFKC").replace(/\s+/g, " ").replace(/[.\s]+$/, "");
    const alt = Array.isArray(atteso.denominations)
      ? atteso.denominations.find((d) => d.verification && d.verification.state === "verificato" && fineRiga(d.value) === fineRiga(ottenuto.value))
      : null;
    if (alt && !difettoAttributi(atteso, ottenuto)) {
      return {
        esito: "CORRETTO", modo: "denominazione_verificata",
        valore_estratto: ottenuto.value,
        denominazione: { value: alt.value, kind: alt.kind },
        dettaglio: "denominazione verificata " + JSON.stringify(alt.value) + " (" + alt.kind + "); testo restituito dal parser: " + JSON.stringify(ottenuto.value),
      };
    }
    return { esito: "ERRATO", dettaglio: "atteso " + JSON.stringify(atteso.value) + ", ottenuto " + JSON.stringify(ottenuto.value) };
  }
  const difetto = difettoAttributi(atteso, ottenuto);
  if (difetto) return { esito: "ERRATO", dettaglio: difetto };
  return { esito: "CORRETTO", modo: "estratto", dettaglio: "" };
}

/** Confronto di liste (sconti, altri costi ricorrenti). */
export function classificaLista(attesoLista, ottenutoItems, tolleranza) {
  const status = attesoLista && attesoLista.status;
  const items = Array.isArray(ottenutoItems) ? ottenutoItems : [];
  if (!status || status === "non_valutato") return { esito: "NON_VALUTATO", dettaglio: "" };
  if (status === "non_presente" || status === "non_applicabile") {
    return items.length
      ? { esito: "INVENTATO", sottotipo: "valore_assente_dal_testo", dettaglio: items.length + " elementi inventati" }
      : { esito: "CORRETTO", modo: "vuoto_corretto", dettaglio: "" };
  }
  if (status === "ambiguo") {
    return items.length
      ? { esito: "INVENTATO", sottotipo: "certezza_non_giustificata", dettaglio: "elementi certi su dato ambiguo" }
      : { esito: "CORRETTO", modo: "ambiguo_vuoto", dettaglio: "" };
  }
  const attesi = attesoLista.items || [];
  if (!items.length) return { esito: "MANCANTE", dettaglio: attesi.length + " elementi attesi" };

  // Ogni elemento atteso deve trovare un elemento ottenuto che coincide su TUTTI
  // gli attributi dichiarati nell'atteso: tipo, valore, unita', durata e, se
  // indicato, il fatto che NON altera il prezzo dell'energia (regola 11).
  const difetti = [];
  for (const a of attesi) {
    let migliore = null;
    let trovato = false;
    for (const o of items) {
      const d = difettiElemento(a, o, tolleranza);
      if (!d.length) { trovato = true; break; }
      if (!migliore || d.length < migliore.length) migliore = d;
    }
    if (!trovato) difetti.push((a.type || "elemento") + ": " + (migliore || []).join(", "));
  }
  if (difetti.length) return { esito: "ERRATO", dettaglio: difetti.join(" | ") };
  if (items.length > attesi.length) return { esito: "INVENTATO", sottotipo: "valore_assente_dal_testo", dettaglio: "elementi in piu' rispetto all'atteso" };
  return { esito: "CORRETTO", modo: "estratto", dettaglio: "" };
}

function difettiElemento(a, o, tolleranza) {
  const d = [];
  if (a.type && a.type !== o.type) d.push("tipo atteso " + a.type + ", ottenuto " + (o.type || "nessuno"));
  if (a.value != null && (o.value == null || Math.abs(a.value - o.value) > tolleranza)) d.push("valore atteso " + a.value + ", ottenuto " + (o.value ?? "nessuno"));
  if (a.unit && normUnita(a.unit) !== normUnita(o.unit)) d.push("unita' attesa " + a.unit + ", ottenuta " + (o.unit || "nessuna"));
  if (a.duration && normStringa(a.duration) !== normStringa(o.duration || "")) d.push("durata attesa " + a.duration + ", ottenuta " + (o.duration || "nessuna"));
  if (typeof a.affects_energy_price === "boolean" && a.affects_energy_price !== o.affects_energy_price) {
    d.push("affects_energy_price atteso " + a.affects_energy_price + ", ottenuto " + (o.affects_energy_price ?? "non dichiarato"));
  }
  return d;
}
