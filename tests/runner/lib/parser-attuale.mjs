// Carica i parser ATTUALI dell'app in una sandbox, in SOLA LETTURA.
//
// - parser-bolletta.js viene letto dal disco ed eseguito in memoria.
//   Per i test unitari viene aggiunta IN MEMORIA una "sonda" che espone alcune
//   funzioni interne (normalizzaNumero, trovaPrezziUnitari, ...). Il file sul
//   disco non viene mai modificato.
// - analizzaTestoCTEMRF viene estratta da index.html (dalla sua dichiarazione
//   fino a "async function caricaCTEAdminMRF") ed eseguita nella stessa sandbox.
// - Viene riprodotto l'ordine di caricamento dell'app: parser-bolletta.js
//   registra la patch MRF_CTE_REFINEMENT_V1 su DOMContentLoaded, poi lo script
//   inline definisce analizzaTestoCTEMRF, poi scatta DOMContentLoaded.
//
// Se le "ancore" testuali non vengono trovate (perche' il codice e' cambiato),
// il caricamento fallisce con un messaggio esplicito: il test non indovina.

import { readFileSync } from "node:fs";
import vm from "node:vm";
import { percorsoRepo, sha256Buffer } from "./util.mjs";

const ANCORA_SONDA = "window.MRFBollettaParser = {";
const INIZIO_CTE = "function analizzaTestoCTEMRF(testo) {";
const FINE_CTE = "async function caricaCTEAdminMRF";

export function caricaParserAttuale() {
  const fileParser = percorsoRepo("parser-bolletta.js");
  const fileIndex = percorsoRepo("index.html");
  const bufParser = readFileSync(fileParser);
  const bufIndex = readFileSync(fileIndex);
  const sorgenteParser = bufParser.toString("utf8");
  const sorgenteIndex = bufIndex.toString("utf8");

  if (!sorgenteParser.includes(ANCORA_SONDA)) {
    throw new Error("Sonda non applicabile: ancora '" + ANCORA_SONDA + "' non trovata in parser-bolletta.js");
  }
  const parserConSonda = sorgenteParser.replace(
    ANCORA_SONDA,
    "window.__MRF_SONDA__ = { normalizzaNumero, normalizzaTesto, trovaPrezziUnitari, estraiPrezzoEnergia, estraiPeriodo, rilevaTipoFornitura };\n    " + ANCORA_SONDA
  );

  const inizio = sorgenteIndex.indexOf(INIZIO_CTE);
  const fine = sorgenteIndex.indexOf(FINE_CTE, inizio);
  if (inizio < 0 || fine < 0) {
    throw new Error("Parser CTE non trovato in index.html (ancore '" + INIZIO_CTE + "' / '" + FINE_CTE + "')");
  }
  const sorgenteCTE = sorgenteIndex.slice(inizio, fine);

  const ascoltatori = [];
  const contesto = {
    console,
    addEventListener(tipo, fn) {
      if (tipo === "DOMContentLoaded") ascoltatori.push(fn);
    },
  };
  contesto.window = contesto;
  vm.createContext(contesto);

  vm.runInContext(parserConSonda, contesto, { filename: "parser-bolletta.js" });
  vm.runInContext(sorgenteCTE, contesto, { filename: "index.html#analizzaTestoCTEMRF" });
  for (const fn of ascoltatori) fn();

  if (typeof contesto.analizzaTestoCTEMRF !== "function") {
    throw new Error("analizzaTestoCTEMRF non disponibile dopo il caricamento");
  }

  return {
    sonda: contesto.__MRF_SONDA__,
    bollette: contesto.MRFBollettaParser,
    analizzaCTE: (testo) => contesto.analizzaTestoCTEMRF(testo),
    provenienza: {
      parser_bolletta_sha256: sha256Buffer(bufParser),
      index_html_sha256: sha256Buffer(bufIndex),
      parser_bolletta_versione: contesto.MRFBollettaParser && contesto.MRFBollettaParser.versione,
      patch_cte_applicate: ascoltatori.length,
    },
    sorgenti: { parser: sorgenteParser, cte: sorgenteCTE },
  };
}
