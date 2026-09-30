// Classificazione di un singolo campo: output del parser vs valore atteso.
//
//   CORRETTO      valore uguale all'atteso (entro tolleranza), oppure null quando
//                 il documento non contiene il dato
//   ERRATO        il parser da' un valore diverso da quello atteso
//   MANCANTE      l'atteso ha un valore, il parser restituisce null
//   INVENTATO     l'atteso e' non_presente / non_applicabile / ambiguo ma il
//                 parser restituisce un valore come certo (regola 13)
//   NON_VALUTATO  campo non ancora compilato nell'atteso
//
// L'output del parser (dopo l'adattatore) per ogni campo e':
//   null                                  -> nessun valore
//   { value, unit?, variant?, original_text?, da_verificare? }

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

/**
 * @param atteso  { status, value, unit?, variant?, original_text? }
 * @param ottenuto null | { value, unit?, variant?, original_text?, da_verificare? }
 * @returns { esito, dettaglio }
 */
export function classificaCampo(atteso, ottenuto, tolleranza = TOLLERANZE_DEFAULT.number) {
  const status = atteso && atteso.status;

  if (!status || status === "non_valutato") {
    return { esito: "NON_VALUTATO", dettaglio: "atteso non compilato" };
  }

  if (status === "non_presente" || status === "non_applicabile") {
    if (valoreVuoto(ottenuto)) return { esito: "CORRETTO", dettaglio: "nessun valore, come atteso" };
    return { esito: "INVENTATO", dettaglio: "valore " + JSON.stringify(ottenuto.value) + " per un dato " + status };
  }

  if (status === "ambiguo") {
    if (valoreVuoto(ottenuto)) return { esito: "CORRETTO", dettaglio: "ambiguo lasciato vuoto" };
    if (ottenuto.da_verificare === true) return { esito: "CORRETTO", dettaglio: "ambiguo segnalato da verificare" };
    return { esito: "INVENTATO", dettaglio: "valore certo " + JSON.stringify(ottenuto.value) + " su dato ambiguo" };
  }

  // status === "presente"
  if (valoreVuoto(ottenuto)) return { esito: "MANCANTE", dettaglio: "atteso " + JSON.stringify(atteso.value) };
  if (!uguali(atteso.value, ottenuto.value, tolleranza)) {
    return { esito: "ERRATO", dettaglio: "atteso " + JSON.stringify(atteso.value) + ", ottenuto " + JSON.stringify(ottenuto.value) };
  }
  if (atteso.unit && ottenuto.unit && normUnita(atteso.unit) !== normUnita(ottenuto.unit)) {
    return { esito: "ERRATO", dettaglio: "unita' attesa " + atteso.unit + ", ottenuta " + ottenuto.unit };
  }
  if (atteso.unit && !ottenuto.unit) {
    return { esito: "ERRATO", dettaglio: "unita' attesa " + atteso.unit + " non dichiarata dal parser" };
  }
  if (atteso.variant && normStringa(atteso.variant) !== normStringa(ottenuto.variant || "")) {
    return { esito: "ERRATO", dettaglio: "variante attesa " + atteso.variant + ", ottenuta " + (ottenuto.variant || "nessuna") };
  }
  if (atteso.original_text && !normStringa(ottenuto.original_text || "").includes(normStringa(atteso.original_text))) {
    return { esito: "ERRATO", dettaglio: "testo originale dell'indice non conservato" };
  }
  return { esito: "CORRETTO", dettaglio: "" };
}

/** Confronto di liste (sconti, altri costi ricorrenti). */
export function classificaLista(attesoLista, ottenutoItems, tolleranza) {
  const status = attesoLista && attesoLista.status;
  const items = Array.isArray(ottenutoItems) ? ottenutoItems : [];
  if (!status || status === "non_valutato") return { esito: "NON_VALUTATO", dettaglio: "" };
  if (status === "non_presente" || status === "non_applicabile") {
    return items.length ? { esito: "INVENTATO", dettaglio: items.length + " elementi inventati" } : { esito: "CORRETTO", dettaglio: "" };
  }
  if (status === "ambiguo") return { esito: items.length ? "INVENTATO" : "CORRETTO", dettaglio: "" };
  if (!items.length) return { esito: "MANCANTE", dettaglio: (attesoLista.items || []).length + " elementi attesi" };
  const mancanti = (attesoLista.items || []).filter(
    (a) => !items.some((o) => (a.value == null || (o.value != null && Math.abs(a.value - o.value) <= tolleranza)) && (!a.type || a.type === o.type))
  );
  if (mancanti.length) return { esito: "ERRATO", dettaglio: mancanti.length + " elementi non trovati" };
  if (items.length > (attesoLista.items || []).length) return { esito: "INVENTATO", dettaglio: "elementi in piu' rispetto all'atteso" };
  return { esito: "CORRETTO", dettaglio: "" };
}
