// Adattatori: traducono l'output del parser ATTUALE nello schema v1, cosi'
// possiamo misurarlo con gli stessi criteri che useremo per il nuovo motore.
// Un campo che il parser attuale NON produce viene restituito come null
// (quindi risulta MANCANTE, mai CORRETTO per caso).
//
// Quando esistera' il nuovo motore (FASE 4+) si aggiungera' un secondo
// adattatore con la stessa interfaccia; i casi di test non cambiano.

function v(value, extra = {}) {
  if (value == null || value === "" || (typeof value === "number" && !Number.isFinite(value))) return null;
  return { value, ...extra };
}

const TIPO = {
  luce: { codice: "electricity" },
  gas: { codice: "gas" },
};

// ---------- test unitari ----------

export function sondaNumeri(parser, caso) {
  return { valore: v(parser.sonda.normalizzaNumero(caso.input)) };
}

export function sondaUnita(parser, caso) {
  const testo = parser.sonda.normalizzaTesto(caso.input);
  const tipo = TIPO[caso.commodity] || { codice: "unknown" };
  const r = parser.sonda.estraiPrezzoEnergia(testo, tipo);
  return {
    prezzo_energia: r && r.numero != null ? v(r.numero, { unit: "€/" + r.unita }) : null,
    // Il parser attuale non estrae le quote fisse (le riconosce solo per escluderle).
    quota_fissa_mensile: null,
  };
}

export function sondaFormule(parser, caso) {
  const testo = parser.sonda.normalizzaTesto(caso.input);
  const uscita = {};
  const commodities = caso.commodity === "dual" ? ["luce", "gas"] : [caso.commodity];
  for (const c of commodities) {
    const r = parser.sonda.estraiPrezzoEnergia(testo, TIPO[c]);
    // Il parser attuale non classifica fisso/indicizzato ne' nomina l'indice.
    uscita[c + ".price_type"] = null;
    uscita[c + ".index"] = null;
    uscita[c + ".multiplier"] = null;
    uscita[c + ".spread"] = r.spread ? v(r.spread.prezzo, { unit: "€/" + r.spread.unita }) : null;
    uscita[c + ".fixed_price"] = r.numero != null ? v(r.numero, { unit: "€/" + r.unita }) : null;
    // Il parser attuale non estrae sconti ne' bonus (nessun campo dedicato):
    // lista vuota, quindi MANCANTE quando l'atteso ne prevede uno.
    uscita[c + ".sconti"] = [];
    // Valore numerico che il parser attuale etichetta come "indice di mercato".
    // In una CTE il valore dell'indice non e' scritto: se compare, e' quasi
    // sempre lo spread scambiato per indice (difetto C2).
    uscita[c + ".valore_indice_nel_documento"] = r.indiceMercato ? v(r.indiceMercato.prezzo, { unit: "€/" + r.indiceMercato.unita }) : null;
  }
  return uscita;
}

export const SONDE = { numeri: sondaNumeri, unita: sondaUnita, "formule-indice": sondaFormule };

// ---------- CTE completa ----------

/**
 * Output di analizzaTestoCTEMRF -> campi piatti dello schema v1.
 * "supplier" replica cio' che l'app salva in cte_offerte: il fornitore solo se
 * fornitoreAffidabile, altrimenti null (index.html r.2396).
 */
export function adattaCTE(datiCTE) {
  const d = datiCTE || {};
  const nulli = [
    "document.market", "document.document_date",
    "validity.duration_months", "validity.renewal",
  ];
  const campiCommodity = ["enabled", "price_type", "fixed_price", "band_prices", "index", "spread", "multiplier", "formula_text", "fixed_fee"];
  const out = {
    "document.supplier": d.fornitoreAffidabile ? v(d.fornitore) : null,
    "document.offer_name": v(d.nomeOfferta),
    "document.offer_code": v(d.codiceOfferta),
    "document.supply_type": v(d.commodity),
    "document.customer_segment": v(d.segmento),
    "validity.from": v(d.validitaDa),
    "validity.to": v(d.validitaAl),
  };
  for (const n of nulli) out[n] = null;
  for (const c of ["electricity", "gas"]) for (const k of campiCommodity) out[c + "." + k] = null;
  out["electricity.other_recurring_fees"] = [];
  out["gas.other_recurring_fees"] = [];
  out["discounts"] = [];
  return out;
}

/** Appiattisce un expected v1 in { percorso: campoAtteso }. */
export function appiattisciExpected(exp) {
  const piatto = {};
  for (const sezione of ["document", "validity", "electricity", "gas"]) {
    for (const [k, campo] of Object.entries(exp[sezione] || {})) {
      piatto[sezione + "." + k] = campo;
    }
  }
  piatto["discounts"] = exp.discounts;
  return piatto;
}

export function eLista(percorso) {
  return percorso === "discounts" || percorso.endsWith(".other_recurring_fees") || percorso.endsWith(".sconti");
}
