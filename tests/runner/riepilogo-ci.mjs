#!/usr/bin/env node
// Riepilogo INFORMATIVO per la CI (non blocca nulla, non promuove nulla).
// Per ogni documento non holdout, dopo `genera-baseline.mjs`:
//   1. versione di pdf.js realmente in uso (deve essere quella dell'app);
//   2. confronto tra le frasi fonte (source_text) delle bozze expected e il testo
//      estratto, pagina per pagina: dice quali frasi un controllo automatico non
//      ritroverebbe (es. valori staccati dalle etichette, caso C8);
//   3. sintesi di cio' che il parser attuale restituisce (baseline: NON e' la verita');
//   4. segnali di qualita' del testo (cifre spezzate da spazi).
// Scrive su stdout, su $GITHUB_STEP_SUMMARY (se presente) e come annotazioni
// ::notice, cosi' il risultato e' leggibile anche senza scaricare gli artifact.
//
// Variabili opzionali: BASELINE_DIR, BASELINE_SUFFIX (per prove locali).

import { existsSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { PERCORSI, leggiJSON } from "./lib/util.mjs";
import { verificaFonte } from "./lib/fonti.mjs";
import { verificaPdfjs } from "./lib/estrai-testo.mjs";

const dirBase = process.env.BASELINE_DIR || join(PERCORSI.cte, "baseline");
const suffisso = process.env.BASELINE_SUFFIX || ".baseline.json";

const righe = [];
const notice = [];
const md = (s = "") => righe.push(s);

let versione = "NON DISPONIBILE";
try { versione = await verificaPdfjs(); } catch (e) { versione = "NON DISPONIBILE (" + e.message + ")"; }
md("# Riepilogo CI del lettore CTE (informativo)");
md("");
md(`- pdf.js in uso: **${versione}** (l'app usa 3.11.174)`);
md("- La baseline e' la fotografia del parser attuale: **non e' la verita'** e non e' un esito di correttezza.");

function raccogliFonti(exp) {
  const out = [];
  for (const sez of ["document", "validity", "electricity", "gas"]) {
    for (const [k, c] of Object.entries(exp[sez] || {})) {
      if (c && typeof c === "object" && "source_text" in c && c.source_text) out.push({ nome: sez + "." + k, campo: c });
    }
  }
  (exp.discounts?.items || []).forEach((c, i) => c.source_text && out.push({ nome: `discounts[${i}]`, campo: c }));
  return out;
}

const manifest = leggiJSON(join(PERCORSI.cte, "MANIFEST.json"));
for (const doc of manifest.documenti || []) {
  if (doc.insieme === "holdout") { md(`\n## ${doc.id}\nholdout: non esaminato.`); continue; }
  const fBase = join(dirBase, doc.id + suffisso);
  if (!existsSync(fBase)) { md(`\n## ${doc.id}\n**Baseline assente** in ${fBase}.`); notice.push([doc.id, "baseline assente"]); continue; }
  const b = leggiJSON(fBase);
  const pagine = b.estrazione.pagine;
  const p = b.parser_cte_attuale || {};
  const testo = pagine.map((x) => x.testo).join(" ");

  const sez = [];
  sez.push(`\n## ${doc.id}`);
  sez.push(`- pagine: ${b.estrazione.numero_pagine}, caratteri: ${b.estrazione.caratteri}; pagine con poco testo (<200 car.): ${pagine.filter((x) => x.caratteri < 200).map((x) => x.pagina).join(", ") || "nessuna"}`);
  sez.push(`- OCR: testo nativo leggibile ${b.ocr.testo_nativo_leggibile}; l'app avvierebbe l'OCR: ${b.ocr.app_avvierebbe_ocr}`);
  const spezzate = testo.match(/\d[,.]\d{1,3}(?: \d){1,}/g) || [];
  sez.push(`- possibili cifre spezzate da spazi (es. "0,01 2 4 9", con qualche falso positivo): ${spezzate.length}${spezzate.length ? " — esempi: " + spezzate.slice(0, 4).map((s) => '"' + s + '"').join(", ") : ""}`);
  sez.push(`- parser attuale (sintesi): fornitore="${p.fornitore || ""}" affidabile=${p.fornitoreAffidabile} | offerta="${p.nomeOfferta || ""}" | codice="${p.codiceOfferta || ""}" | commodity=${p.commodity} | segmento=${p.segmento} | validita' da=${p.validitaDa} a=${p.validitaAl}`);

  const fExp = join(PERCORSI.cte, "expected", doc.id + ".expected.json");
  let esito = "expected assente";
  if (existsSync(fExp)) {
    const fonti = raccogliFonti(leggiJSON(fExp));
    const manca = [];
    for (const { nome, campo } of fonti) {
      const r = verificaFonte(campo, pagine);
      if (!r.ok) manca.push(`${nome} (pag. ${campo.page}): ${r.problema}`);
    }
    esito = `frasi fonte ${fonti.length}, non ritrovate nel testo ${manca.length}`;
    sez.push(`- expected (bozza): ${esito}`);
    manca.forEach((m) => sez.push(`  - NON RITROVATA: ${m}`));
  } else sez.push("- expected: assente");
  righe.push(...sez);
  notice.push([doc.id, sez.slice(1).join("\n")]);
}

const testoFinale = righe.join("\n");
console.log(testoFinale);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, testoFinale + "\n");
if (process.env.GITHUB_ACTIONS) {
  const esc = (s) => String(s).replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
  console.log(`::notice title=${esc("pdf.js in uso")}::${esc(versione)}`);
  for (const [id, msg] of notice) console.log(`::notice title=${esc("riepilogo " + id)}::${esc(msg)}`);
}
