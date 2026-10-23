#!/usr/bin/env node
// BASELINE PROVVISORIA: stessa fotografia di genera-baseline.mjs, ma ottenuta con una
// versione di pdf.js DIVERSA da quella dell'app (3.11.174).
//
// Serve solo quando pdf.js 3.11.174 non e' installabile (es. registro npm bloccato).
// Non sostituisce la baseline ufficiale e non va mai confusa con essa:
//   - scrive in tests/cte/baseline-provvisoria/ e tests/cte/testo-provvisorio/
//     (le cartelle ufficiali baseline/ e testo/ NON vengono toccate);
//   - ogni file dichiara la versione di pdf.js realmente usata;
//   - il runner di regressione non legge queste cartelle.
// Il testo estratto da un'altra versione puo' differire da quello che il parser vede
// nell'app (ordine degli elementi, spazi): i valori vanno riconfermati con la baseline
// ufficiale appena possibile (npm run baseline).
//
// Uso:  PDFJS_ALT=/percorso/assoluto/pdfjs-dist/legacy/build/pdf.mjs node genera-baseline-provvisoria.mjs [id ...]

import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { PERCORSI, leggiJSON, sha256File, commitCorrente } from "./lib/util.mjs";
import { caricaParserAttuale } from "./lib/parser-attuale.mjs";
import { adattaCTE } from "./lib/adattatori.mjs";
import { condizioneOcrApp } from "./lib/estrai-testo.mjs";

const AVVISO =
  "BASELINE PROVVISORIA - fotografia del parser attuale su testo estratto con una versione di pdf.js DIVERSA da quella dell'app (3.11.174). NON e' la baseline ufficiale, NON e' l'output corretto e non va copiata negli expected.";

const percorsoPdfjs = process.env.PDFJS_ALT;
if (!percorsoPdfjs) {
  console.error("Impostare PDFJS_ALT con il percorso assoluto di pdfjs-dist/legacy/build/pdf.mjs");
  process.exit(2);
}
const pdfjs = await import(pathToFileURL(percorsoPdfjs).href);
const versionePdfjs = pdfjs.version || pdfjs.default?.version;
if (versionePdfjs === "3.11.174") {
  console.error("Con pdf.js 3.11.174 usare la baseline ufficiale: npm run baseline.");
  process.exit(2);
}

// Stessa logica di estrai-testo.mjs (items.str uniti da spazio, pagine unite da spazio).
async function estrai(percorsoPdf) {
  const dati = new Uint8Array(readFileSync(percorsoPdf));
  const compito = pdfjs.getDocument({ data: dati, isEvalSupported: false, useSystemFonts: false });
  const pdf = await compito.promise;
  let completo = "";
  const pagine = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const pagina = await pdf.getPage(n);
    const contenuto = await pagina.getTextContent();
    const testoPagina = contenuto.items.map((i) => i.str).join(" ");
    completo += " " + testoPagina;
    const compatto = testoPagina.replace(/\s+/g, " ").trim();
    pagine.push({ pagina: n, testo: compatto, caratteri: compatto.length, parole: compatto ? compatto.split(" ").length : 0 });
  }
  await compito.destroy();
  return { testo: completo.replace(/\s+/g, " ").trim(), numeroPagine: pagine.length, pagine };
}

const dirBase = join(PERCORSI.cte, "baseline-provvisoria");
const dirTesto = join(PERCORSI.cte, "testo-provvisorio");
mkdirSync(dirBase, { recursive: true });
mkdirSync(dirTesto, { recursive: true });

const parser = caricaParserAttuale();
const provenienza = {
  commit: commitCorrente(),
  generato_il: new Date().toISOString(),
  ...parser.provenienza,
  pdfjs_usato: versionePdfjs,
  pdfjs_dell_app: "3.11.174",
  baseline_ufficiale: false,
};

const manifest = leggiJSON(join(PERCORSI.cte, "MANIFEST.json"));
const richiesti = new Set(process.argv.slice(2));
for (const doc of manifest.documenti || []) {
  if (richiesti.size && !richiesti.has(doc.id)) continue;
  if (doc.insieme === "holdout") {
    console.log(`- ${doc.id}: holdout, saltato.`);
    continue;
  }
  const pdf = join(PERCORSI.cte, doc.file);
  if (!existsSync(pdf) || sha256File(pdf) !== doc.sha256) {
    console.error(`- ${doc.id}: file mancante o hash diverso, saltato.`);
    process.exitCode = 1;
    continue;
  }
  const estratto = await estrai(pdf);
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
  writeFileSync(join(dirBase, doc.id + ".baseline-provvisoria.json"), JSON.stringify(baseline, null, 2) + "\n");
  writeFileSync(join(dirTesto, doc.id + ".txt"), estratto.testo + "\n");
  console.log(`- ${doc.id}: baseline provvisoria e testo provvisorio scritti (pdf.js ${versionePdfjs}).`);
}
