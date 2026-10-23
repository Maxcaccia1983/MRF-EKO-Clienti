#!/usr/bin/env node
// Controllo statico di universalita', eseguibile da solo.
// Esce con codice 1 se trova nomi di fornitori nel codice del parser o accessi
// a cte_offerte/Supabase dal parser.
import { caricaParserAttuale } from "./lib/parser-attuale.mjs";
import { controllaUniversalita } from "./lib/universalita.mjs";

const parser = caricaParserAttuale();
const esito = controllaUniversalita({
  "parser-bolletta.js": parser.sorgenti.parser,
  "index.html#analizzaTestoCTEMRF": parser.sorgenti.cte,
});
console.log(JSON.stringify(esito, null, 2));
process.exit(esito.violazioni.length ? 1 : 0);
