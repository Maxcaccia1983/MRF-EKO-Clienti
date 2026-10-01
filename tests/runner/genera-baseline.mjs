#!/usr/bin/env node
// Genera la BASELINE: fotografia del comportamento ATTUALE del parser.
// La baseline NON e' la verita' e non promuove ne' boccia nulla: serve solo a
// vedere cosa cambia dopo una modifica. La verita' sono gli expected verificati.
//
// Scrive:
//   tests/unit/baseline-attuale.json          output grezzo dei casi unitari
//   tests/cte/baseline/<id>.baseline.json      per ogni CTE del MANIFEST (non holdout)
//   tests/cte/testo/<id>.txt                   testo nativo estratto (non holdout)
//
// I documenti "holdout" vengono saltati: non devono essere guardati durante lo
// sviluppo. Usare --includi-holdout solo al momento della valutazione.

import { writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { PERCORSI, leggiJSON, sha256File, commitCorrente, argomenti } from "./lib/util.mjs";
import { caricaParserAttuale } from "./lib/parser-attuale.mjs";
import { SONDE, adattaCTE } from "./lib/adattatori.mjs";
import { estraiTestoNativo, condizioneOcrApp } from "./lib/estrai-testo.mjs";

const AVVISO = "BASELINE TECNICA - fotografia del parser attuale. NON e' l'output corretto e non va copiata negli expected.";

async function main() {
  const parser = caricaParserAttuale();
  const provenienza = { commit: commitCorrente(), generato_il: new Date().toISOString(), ...parser.provenienza };

  // --- unit
  const unit = { avviso: AVVISO, provenienza, suite: {} };
  for (const suite of ["numeri", "unita", "formule-indice"]) {
    const def = leggiJSON(join(PERCORSI.unit, suite + ".cases.json"));
    unit.suite[suite] = def.casi.map((c) => ({ id: c.id, input: c.input, output_attuale: SONDE[suite](parser, c) }));
  }
  writeFileSync(join(PERCORSI.unit, "baseline-attuale.json"), JSON.stringify(unit, null, 2) + "\n");
  console.log("Baseline unit scritta.");

  // --- CTE
  const manifest = leggiJSON(join(PERCORSI.cte, "MANIFEST.json"));
  for (const doc of manifest.documenti || []) {
    if (doc.insieme === "holdout" && !argomenti.has("--includi-holdout")) {
      console.log(`- ${doc.id}: holdout, saltato.`);
      continue;
    }
    const pdf = join(PERCORSI.cte, doc.file);
    if (!existsSync(pdf) || sha256File(pdf) !== doc.sha256) {
      console.error(`- ${doc.id}: file mancante o hash diverso, saltato.`);
      process.exitCode = 1;
      continue;
    }
    const estratto = await estraiTestoNativo(pdf);
    const datiCTE = parser.analizzaCTE(estratto.testo);
    const bollette = parser.bollette.analizza(estratto.testo);
    const baseline = {
      avviso: AVVISO,
      provenienza,
      documento: { id: doc.id, sha256: doc.sha256, tipo_pdf: doc.tipo_pdf },
      estrazione: { numero_pagine: estratto.numeroPagine, caratteri: estratto.testo.length, pagine: estratto.pagine },
      ocr: condizioneOcrApp(estratto.testo, datiCTE, estratto.numeroPagine),
      parser_cte_attuale: datiCTE,
      adattato_schema_v1: adattaCTE(datiCTE),
      informativo_parser_bollette_su_testo_cte: {
        nota: "L'app NON usa il parser bollette sulle CTE: dato solo diagnostico.",
        tipo: bollette.tipo,
        prezzoEnergia: bollette.prezzoEnergia,
      },
    };
    writeFileSync(join(PERCORSI.cte, "baseline", doc.id + ".baseline.json"), JSON.stringify(baseline, null, 2) + "\n");
    writeFileSync(join(PERCORSI.cte, "testo", doc.id + ".txt"), estratto.testo + "\n");
    console.log(`- ${doc.id}: baseline e testo scritti.`);
  }
}

main().catch((e) => {
  console.error("Errore:", e);
  process.exit(2);
});
