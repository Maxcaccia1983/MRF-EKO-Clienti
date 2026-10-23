// Autotest del CLASSIFICATORE (non del parser).
//
// Perche' esiste: il parser attuale non restituisce mai indice, variante, testo
// originale, valore originale o riferimento POD/PDR. Quindi, sui casi unitari,
// quei controlli del classificatore non vengono mai attraversati (il campo
// risulta MANCANTE prima di arrivarci). Senza questo autotest potrebbero essere
// rotti o assenti senza che nessuno se ne accorga, e la scheda dei casi
// descriverebbe controlli che non esistono.
//
// Qui si danno al classificatore output SIMULATI del parser e si verifica che
// giudichi come deve. Un fallimento e' un problema bloccante del runner (A).

import { classificaCampo, classificaLista } from "./classifica.mjs";
import { verificaFonte } from "./fonti.mjs";

const T = 0.000001;
const FEE = 0.01;

/** [gruppo, descrizione, funzione -> risultato, esito atteso, modo atteso?] */
const PROVE = [
  // ---- varianti dell'indice
  ["variante", "indice con variante attesa e variante giusta -> CORRETTO estratto",
    () => classificaCampo({ status: "presente", value: "PUN", variant: "index_gme" }, { value: "PUN", variant: "index_gme" }), "CORRETTO", "estratto"],
  ["variante", "variante attesa ma non restituita -> ERRATO",
    () => classificaCampo({ status: "presente", value: "PUN", variant: "index_gme" }, { value: "PUN" }), "ERRATO"],
  ["variante", "variante diversa da quella attesa -> ERRATO",
    () => classificaCampo({ status: "presente", value: "PSV", variant: "day_ahead" }, { value: "PSV", variant: "mensile" }), "ERRATO"],
  ["variante", "indice sbagliato con variante giusta -> ERRATO",
    () => classificaCampo({ status: "presente", value: "PUN", variant: "medio_mensile" }, { value: "PSV", variant: "medio_mensile" }), "ERRATO"],

  // ---- nome originale dell'indice
  ["nome_originale", "indice ALTRO con testo originale conservato -> CORRETTO estratto",
    () => classificaCampo({ status: "presente", value: "ALTRO", original_text: "ZXGAS-M" }, { value: "ALTRO", original_text: "indice ZXGAS-M" }), "CORRETTO", "estratto"],
  ["nome_originale", "indice ALTRO senza testo originale -> ERRATO (nome perso, regola 7)",
    () => classificaCampo({ status: "presente", value: "ALTRO", original_text: "ZXGAS-M" }, { value: "ALTRO" }), "ERRATO"],
  ["nome_originale", "indice ALTRO con testo originale diverso -> ERRATO",
    () => classificaCampo({ status: "presente", value: "ALTRO", original_text: "ZXGAS-M" }, { value: "ALTRO", original_text: "PUN" }), "ERRATO"],
  ["nome_originale", "indice noto forzato a un altro valore invece di ALTRO -> ERRATO",
    () => classificaCampo({ status: "presente", value: "ALTRO", original_text: "ZXGAS-M" }, { value: "PSV", original_text: "ZXGAS-M" }), "ERRATO"],
  ["nome_originale", "nome originale 'PUN Index GME' conservato dentro un testo piu' lungo -> CORRETTO",
    () => classificaCampo({ status: "presente", value: "PUN", variant: "index_gme", original_text: "PUN Index GME" }, { value: "PUN", variant: "index_gme", original_text: "il PUN Index GME maggiorato" }), "CORRETTO", "estratto"],
  ["nome_originale", "nome originale atteso ma non restituito per un indice noto -> ERRATO",
    () => classificaCampo({ status: "presente", value: "PUN", variant: "index_gme", original_text: "PUN Index GME" }, { value: "PUN", variant: "index_gme" }), "ERRATO"],

  // ---- valore originale (quota annuale -> mensile)
  ["originale", "144 €/anno -> 12 €/mese con originale conservato -> CORRETTO",
    () => classificaCampo({ status: "presente", value: 12, unit: "€/mese", original: { value: 144, unit: "€/anno" } }, { value: 12, unit: "€/mese", original: { value: 144, unit: "€/anno" } }, FEE), "CORRETTO", "estratto"],
  ["originale", "12 €/mese corretto ma originale 144 €/anno perso -> ERRATO (regola 9)",
    () => classificaCampo({ status: "presente", value: 12, unit: "€/mese", original: { value: 144, unit: "€/anno" } }, { value: 12, unit: "€/mese" }, FEE), "ERRATO"],
  ["originale", "originale con periodicita' diversa -> ERRATO",
    () => classificaCampo({ status: "presente", value: 12, unit: "€/mese", original: { value: 144, unit: "€/anno" } }, { value: 12, unit: "€/mese", original: { value: 144, unit: "€/mese" } }, FEE), "ERRATO"],
  ["originale", "conversione sbagliata (144 -> 14,4) -> ERRATO",
    () => classificaCampo({ status: "presente", value: 12, unit: "€/mese", original: { value: 144, unit: "€/anno" } }, { value: 14.4, unit: "€/mese", original: { value: 144, unit: "€/anno" } }, FEE), "ERRATO"],

  // ---- riferimento POD / PDR
  ["riferimento", "PCV per POD: valore e riferimento POD conservati -> CORRETTO",
    () => classificaCampo({ status: "presente", value: 7.5, unit: "€/mese", per: "POD" }, { value: 7.5, unit: "€/mese", per: "POD" }, FEE), "CORRETTO", "estratto"],
  ["riferimento", "PCV corretta ma riferimento POD perso -> ERRATO",
    () => classificaCampo({ status: "presente", value: 7.5, unit: "€/mese", per: "POD" }, { value: 7.5, unit: "€/mese" }, FEE), "ERRATO"],
  ["riferimento", "CCV gas con riferimento POD invece di PDR -> ERRATO (luce/gas confusi)",
    () => classificaCampo({ status: "presente", value: 8, unit: "€/mese", per: "PDR", original: { value: 96, unit: "€/anno" } }, { value: 8, unit: "€/mese", per: "POD", original: { value: 96, unit: "€/anno" } }, FEE), "ERRATO"],
  ["riferimento", "CCV gas: riferimento PDR e originale annuale conservati -> CORRETTO",
    () => classificaCampo({ status: "presente", value: 8, unit: "€/mese", per: "PDR", original: { value: 96, unit: "€/anno" } }, { value: 8, unit: "€/mese", per: "PDR", original: { value: 96, unit: "€/anno" } }, FEE), "CORRETTO", "estratto"],

  // ---- sconti (regola 11)
  ["sconto", "sconto con valore, unita' e durata giusti e affects_energy_price=false -> CORRETTO",
    () => classificaLista({ status: "presente", items: [{ type: "sconto", value: 0.01, unit: "€/kWh", duration: "12 mesi", affects_energy_price: false }] },
      [{ type: "sconto", value: 0.01, unit: "€/kWh", duration: "12 mesi", affects_energy_price: false }], T), "CORRETTO", "estratto"],
  ["sconto", "sconto riconosciuto ma durata persa -> ERRATO",
    () => classificaLista({ status: "presente", items: [{ type: "sconto", value: 0.01, unit: "€/kWh", duration: "12 mesi", affects_energy_price: false }] },
      [{ type: "sconto", value: 0.01, unit: "€/kWh", affects_energy_price: false }], T), "ERRATO"],
  ["sconto", "sconto con valore sbagliato -> ERRATO",
    () => classificaLista({ status: "presente", items: [{ type: "sconto", value: 0.01, unit: "€/kWh", duration: "12 mesi", affects_energy_price: false }] },
      [{ type: "sconto", value: 0.1, unit: "€/kWh", duration: "12 mesi", affects_energy_price: false }], T), "ERRATO"],
  ["sconto", "sconto che altera il prezzo dell'energia -> ERRATO",
    () => classificaLista({ status: "presente", items: [{ type: "sconto", value: 0.01, unit: "€/kWh", duration: "12 mesi", affects_energy_price: false }] },
      [{ type: "sconto", value: 0.01, unit: "€/kWh", duration: "12 mesi", affects_energy_price: true }], T), "ERRATO"],
  ["sconto", "sconto non riconosciuto (lista vuota) -> MANCANTE",
    () => classificaLista({ status: "presente", items: [{ type: "sconto", value: 0.01, unit: "€/kWh", duration: "12 mesi", affects_energy_price: false }] }, [], T), "MANCANTE"],
  ["sconto", "sconto letto come prezzo dell'energia -> INVENTATO attribuzione_errata",
    () => classificaCampo({ status: "non_presente", value: null }, { value: 0.01, unit: "€/kWh" }, T, "Sconto di 0,010 €/kWh sul prezzo energia"), "INVENTATO"],

  // ---- distinzione estratto / vuoto corretto
  ["modo", "dato non presente lasciato vuoto -> CORRETTO vuoto_corretto (non 'estratto')",
    () => classificaCampo({ status: "non_presente", value: null }, null), "CORRETTO", "vuoto_corretto"],
  ["modo", "dato non applicabile lasciato vuoto -> CORRETTO vuoto_corretto",
    () => classificaCampo({ status: "non_applicabile", value: null }, null), "CORRETTO", "vuoto_corretto"],
  ["modo", "spread 0,018 €/kWh restituito giusto -> CORRETTO estratto",
    () => classificaCampo({ status: "presente", value: 0.018, unit: "€/kWh" }, { value: 0.018, unit: "€/kWh" }, T), "CORRETTO", "estratto"],
  ["modo", "dato ambiguo restituito come certo -> INVENTATO",
    () => classificaCampo({ status: "ambiguo", value: null }, { value: 1.234 }), "INVENTATO"],
  ["modo", "dato ambiguo segnalato da verificare -> CORRETTO ambiguo_segnalato",
    () => classificaCampo({ status: "ambiguo", value: null }, { value: 1.234, da_verificare: true }), "CORRETTO", "ambiguo_segnalato"],
  ["modo", "dato ambiguo lasciato vuoto -> CORRETTO ambiguo_vuoto",
    () => classificaCampo({ status: "ambiguo", value: null }, null), "CORRETTO", "ambiguo_vuoto"],

  // ---- spread / indice non confusi
  ["attribuzione", "spread letto come valore dell'indice nel documento -> INVENTATO attribuzione_errata",
    () => classificaCampo({ status: "non_presente", value: null }, { value: 0.025, unit: "€/kWh" }, T, "Prezzo energia: PUN + 0,025 €/kWh"), "INVENTATO"],

  // ---- denominazioni equivalenti (identita' del nome; l'affidabilita' del ruolo e' fuori dal classificatore)
  ["denominazioni", "denominazione verificata elencata -> CORRETTO, testo originale conservato",
    () => classificaCampo(FORN_DEN, { value: "Enel Energia S.p.A" }), "CORRETTO", "denominazione_verificata"],
  ["denominazioni", "stessa denominazione ma NON verificata (stato non_verificato) -> ERRATO",
    () => classificaCampo({ ...FORN_DEN, denominations: [{ ...FORN_DEN.denominations[1], verification: { state: "non_verificato" } }] }, { value: "Enel Energia S.p.A" }), "ERRATO"],
  ["denominazioni", "campo senza denominations: forma societaria diversa -> ERRATO (confronto invariato)",
    () => classificaCampo({ status: "presente", value: "Enel Energia" }, { value: "Enel Energia S.p.A" }), "ERRATO"],
  ["denominazioni", "denominazione non elencata (altra societa' del gruppo) -> ERRATO",
    () => classificaCampo(FORN_DEN, { value: "Enel S.p.A" }), "ERRATO"],
  ["denominazioni", "valore atteso esatto -> CORRETTO estratto (modo invariato)",
    () => classificaCampo(FORN_DEN, { value: "Enel Energia" }), "CORRETTO", "estratto"],
  ["denominazioni", "nessun valore restituito -> MANCANTE anche con denominations",
    () => classificaCampo(FORN_DEN, null), "MANCANTE"],
  ["denominazioni", "il valore originale del parser resta in valore_estratto",
    () => { const r = classificaCampo(FORN_DEN, { value: "Enel Energia S.p.A" }); return r.valore_estratto === "Enel Energia S.p.A" && r.denominazione.kind === "ragione_sociale" ? { esito: "CORRETTO" } : { esito: "ERRATO" }; }, "CORRETTO"],

  // ---- verificabilita' dei valori attesi (pagina + testo originale)
  ["fonte", "frase presente alla pagina dichiarata -> ok",
    () => verificaFonte({ source_text: "PUN Index GME + 0,020 €/kWh", page: 2 }, PAGINE_PROVA).ok ? { esito: "CORRETTO" } : { esito: "ERRATO" }, "CORRETTO"],
  ["fonte", "frase con spazi e maiuscole diversi dal PDF -> ok (confronto tollerante)",
    () => verificaFonte({ source_text: "pun  index gme+0,020 €/kwh", page: 2 }, PAGINE_PROVA).ok ? { esito: "CORRETTO" } : { esito: "ERRATO" }, "CORRETTO"],
  ["fonte", "frase a una pagina diversa da quella dichiarata -> problema",
    () => verificaFonte({ source_text: "PUN Index GME + 0,020 €/kWh", page: 1 }, PAGINE_PROVA).ok ? { esito: "CORRETTO" } : { esito: "ERRATO" }, "ERRATO"],
  ["fonte", "frase che non compare nel documento -> problema",
    () => verificaFonte({ source_text: "spread di 0,999 €/kWh", page: 2 }, PAGINE_PROVA).ok ? { esito: "CORRETTO" } : { esito: "ERRATO" }, "ERRATO"],
  ["fonte", "source_text mancante -> problema",
    () => verificaFonte({ page: 2 }, PAGINE_PROVA).ok ? { esito: "CORRETTO" } : { esito: "ERRATO" }, "ERRATO"],
  ["fonte", "pagina mancante -> problema",
    () => verificaFonte({ source_text: "PUN Index GME" }, PAGINE_PROVA).ok ? { esito: "CORRETTO" } : { esito: "ERRATO" }, "ERRATO"],
  ["fonte", "pagina inesistente -> problema",
    () => verificaFonte({ source_text: "PUN Index GME", page: 9 }, PAGINE_PROVA).ok ? { esito: "CORRETTO" } : { esito: "ERRATO" }, "ERRATO"],
];

const FORN_DEN = {
  status: "presente", value: "Enel Energia",
  denominations: [
    { value: "Enel Energia", kind: "denominazione_commerciale", source_text: "x", page: 1, verification: { state: "verificato", by: "Max", at: "2026-10-01", note: "prova" } },
    { value: "Enel Energia S.p.A.", kind: "ragione_sociale", source_text: "y", page: 1, verification: { state: "verificato", by: "Max", at: "2026-10-01", note: "prova" } },
  ],
};

const PAGINE_PROVA = [
  { pagina: 1, testo: "Condizioni tecnico economiche Offerta luce domestici" },
  { pagina: 2, testo: "Il corrispettivo e' pari a PUN Index GME + 0,020 €/kWh per 12 mesi" },
];

export function eseguiAutotest() {
  const falliti = [];
  const coperti = {};
  for (const [gruppo, descrizione, fn, esitoAtteso, modoAtteso] of PROVE) {
    const r = fn();
    let ok = r.esito === esitoAtteso;
    if (ok && modoAtteso !== undefined) ok = r.modo === modoAtteso;
    if (gruppo === "attribuzione" && ok) ok = r.sottotipo === "attribuzione_errata";
    coperti[gruppo] = (coperti[gruppo] || 0) + 1;
    if (!ok) falliti.push(`[${gruppo}] ${descrizione}: ottenuto ${r.esito}${r.modo ? "/" + r.modo : ""}${r.sottotipo ? "/" + r.sottotipo : ""}, atteso ${esitoAtteso}${modoAtteso ? "/" + modoAtteso : ""}`);
  }
  return { totale: PROVE.length, falliti, coperti };
}
