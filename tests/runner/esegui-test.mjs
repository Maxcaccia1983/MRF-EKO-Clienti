#!/usr/bin/env node
// MRF EKO - Test di regressione del lettore CTE.
//
// Uso (da tests/runner):
//   npm test                         esegue tutto e confronta con il riferimento
//   node esegui-test.mjs --ci        in CI: schema e lettura PDF obbligatori
//   node esegui-test.mjs --dettagli-holdout   mostra i dettagli dei documenti holdout
//   node esegui-test.mjs --aggiorna-riferimento
//        aggiorna riferimento/stato-accettato.json. Da usare SOLO dopo
//        approvazione esplicita di Max: congela gli esiti attuali come base.
//
// Il runner NON modifica mai i file dell'app, il database o le policy.

import { writeFileSync, mkdirSync, existsSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { PERCORSI, leggiJSON, sha256File, commitCorrente, argomenti, importOpzionale } from "./lib/util.mjs";
import { caricaParserAttuale } from "./lib/parser-attuale.mjs";
import { classificaCampo, classificaLista, scegliTolleranza } from "./lib/classifica.mjs";
import { SONDE, adattaCTE, appiattisciExpected, eLista } from "./lib/adattatori.mjs";
import { estraiTestoNativo, condizioneOcrApp } from "./lib/estrai-testo.mjs";
import { controllaUniversalita } from "./lib/universalita.mjs";

const CI = argomenti.has("--ci");
const DETTAGLI_HOLDOUT = argomenti.has("--dettagli-holdout");
const AGGIORNA = argomenti.has("--aggiorna-riferimento");

const bloccanti = [];
const avvisi = [];
const risultati = []; // { chiave, gruppo, id, campo, esito, dettaglio, conta_nel_giudizio, insieme, fornitore_nuovo }

// ---------------------------------------------------------------- 1. schema
async function validatoreSchema() {
  const mod = await importOpzionale("ajv/dist/2020.js");
  if (!mod) {
    const msg = "Validazione JSON Schema non eseguita: ajv non installato.";
    (CI ? bloccanti : avvisi).push(msg);
    return null;
  }
  const Ajv = mod.default || mod;
  const ajv = new Ajv({ allErrors: true, strict: false });
  return {
    expected: ajv.compile(leggiJSON(join(PERCORSI.schema, "expected-cte.v1.schema.json"))),
    manifest: ajv.compile(leggiJSON(join(PERCORSI.schema, "manifest.v1.schema.json"))),
  };
}

function erroriAjv(fn) {
  return (fn.errors || []).map((e) => (e.instancePath || "/") + " " + e.message).join("; ");
}

// ---------------------------------------------------------------- 2. unit
function eseguiUnit(parser) {
  for (const suite of ["numeri", "unita", "formule-indice"]) {
    const file = join(PERCORSI.unit, suite + ".cases.json");
    const def = leggiJSON(file);
    const sonda = SONDE[suite];
    for (const caso of def.casi) {
      let uscita;
      try {
        uscita = sonda(parser, caso);
      } catch (e) {
        bloccanti.push("unit/" + suite + "/" + caso.id + ": errore di esecuzione " + e.message);
        continue;
      }
      for (const [campo, atteso] of Object.entries(caso.atteso)) {
        const { esito, dettaglio } = classificaCampo(atteso, uscita[campo] ?? null, scegliTolleranza(campo));
        risultati.push({
          chiave: "unit/" + suite + "/" + caso.id + "/" + campo,
          gruppo: "unit/" + suite, id: caso.id, campo, esito, dettaglio,
          conta_nel_giudizio: true, input: caso.input,
        });
      }
    }
  }
}

// ---------------------------------------------------------------- 3. CTE
async function eseguiCTE(parser, validatori) {
  const manifest = leggiJSON(join(PERCORSI.cte, "MANIFEST.json"));
  if (validatori && !validatori.manifest(manifest)) {
    bloccanti.push("MANIFEST.json non valido: " + erroriAjv(validatori.manifest));
  }
  const modello = leggiJSON(join(PERCORSI.cte, "expected", "_MODELLO.expected.json"));
  if (validatori && !validatori.expected(modello)) {
    bloccanti.push("_MODELLO.expected.json non valido: " + erroriAjv(validatori.expected));
  }

  const documenti = manifest.documenti || [];
  const ids = new Set();
  const riepilogoDoc = [];

  for (const doc of documenti) {
    if (ids.has(doc.id)) bloccanti.push("ID duplicato nel MANIFEST: " + doc.id);
    ids.add(doc.id);

    const pdf = join(PERCORSI.cte, doc.file);
    if (!existsSync(pdf)) { bloccanti.push(doc.id + ": file mancante " + doc.file); continue; }
    const hash = sha256File(pdf);
    if (hash !== doc.sha256) { bloccanti.push(doc.id + ": hash SHA-256 diverso dal MANIFEST (file sostituito?)"); continue; }

    let estratto;
    try {
      estratto = await estraiTestoNativo(pdf);
    } catch (e) {
      (CI ? bloccanti : avvisi).push(doc.id + ": estrazione testo non eseguita (" + e.message + ")");
      continue;
    }
    const datiCTE = parser.analizzaCTE(estratto.testo);
    const ocr = condizioneOcrApp(estratto.testo, datiCTE, estratto.numeroPagine);
    const uscita = adattaCTE(datiCTE);

    const fileExp = join(PERCORSI.cte, "expected", doc.id + ".expected.json");
    const info = { id: doc.id, insieme: doc.insieme, fornitore_nuovo: doc.fornitore_nuovo, categoria: doc.categoria, tipo_pdf: doc.tipo_pdf, ocr, expected: existsSync(fileExp) ? "presente" : "assente" };
    riepilogoDoc.push(info);
    if (!existsSync(fileExp)) continue;

    const exp = leggiJSON(fileExp);
    if (validatori && !validatori.expected(exp)) {
      bloccanti.push(doc.id + ".expected.json non valido: " + erroriAjv(validatori.expected));
      continue;
    }
    if (exp.document_id !== doc.id) bloccanti.push(doc.id + ": document_id dell'expected non corrisponde");
    info.revisione = exp.document_review.state;

    for (const [campo, atteso] of Object.entries(appiattisciExpected(exp))) {
      const tol = scegliTolleranza(campo, exp.tolerances);
      const { esito, dettaglio } = eLista(campo)
        ? classificaLista(atteso, uscita[campo], tol)
        : classificaCampo(atteso, uscita[campo] ?? null, tol);
      const verificato = atteso && atteso.verification && atteso.verification.state === "verificato";
      risultati.push({
        chiave: "cte/" + doc.id + "/" + campo,
        gruppo: "cte", id: doc.id, campo, esito, dettaglio,
        conta_nel_giudizio: !!verificato,
        insieme: doc.insieme, fornitore_nuovo: doc.fornitore_nuovo,
      });
    }
  }
  return { documenti: riepilogoDoc, totale: documenti.length };
}

// ---------------------------------------------------------------- 4. confronto con riferimento
function confrontaRiferimento() {
  const f = join(PERCORSI.riferimento, "stato-accettato.json");
  const rif = existsSync(f) ? leggiJSON(f) : { esiti: {} };
  const prima = rif.esiti || {};
  const regressioni = [];
  const nuoveInvenzioni = [];
  const invenzioniNote = [];
  const miglioramenti = [];
  for (const r of risultati) {
    if (!r.conta_nel_giudizio) continue;
    const p = prima[r.chiave];
    if (r.esito === "INVENTATO") (p === "INVENTATO" ? invenzioniNote : nuoveInvenzioni).push(r);
    if (p === "CORRETTO" && r.esito !== "CORRETTO") regressioni.push({ ...r, prima: p });
    if (p && p !== "CORRETTO" && r.esito === "CORRETTO") miglioramenti.push({ ...r, prima: p });
  }
  return { presente: existsSync(f), generato_il: rif.generato_il, commit: rif.commit, regressioni, nuoveInvenzioni, invenzioniNote, miglioramenti };
}

// ---------------------------------------------------------------- 5. prontezza (regole 42-43)
const CATEGORIE_MINIME = [
  ["luce", "fisso"], ["luce", "indicizzato"], ["gas", "fisso"], ["gas", "indicizzato"], ["dual"], ["complessa"], ["ocr"],
];
const CAMPI_STRUTTURA = ["document.supply_type", "electricity.price_type", "electricity.fixed_price", "electricity.index", "electricity.spread", "gas.price_type", "gas.fixed_price", "gas.index", "gas.spread"];

function valutaProntezza(cte) {
  const verificati = risultati.filter((r) => r.gruppo === "cte" && r.conta_nel_giudizio);
  const docVerificati = cte.documenti.filter((d) => d.revisione === "verificato");
  const copertura = CATEGORIE_MINIME.map((cat) => ({
    categoria: cat.join("+"),
    coperta: docVerificati.some((d) => cat.every((c) => (d.categoria || []).includes(c))),
  }));
  const inventati = verificati.filter((r) => r.esito === "INVENTATO");
  const strutturaOk = (filtro) => {
    const docs = docVerificati.filter(filtro);
    if (!docs.length) return null;
    return docs.every((d) => verificati.filter((r) => r.id === d.id && CAMPI_STRUTTURA.includes(r.campo)).every((r) => r.esito === "CORRETTO"));
  };
  const criteri = [
    { criterio: "Copertura minima delle 7 categorie con expected verificato", ok: copertura.every((c) => c.coperta) },
    { criterio: "Zero campi INVENTATI nei test verificati", ok: verificati.length > 0 && inventati.length === 0 },
    { criterio: "Struttura economica corretta su CTE holdout (mai usate nello sviluppo)", ok: strutturaOk((d) => d.insieme === "holdout") === true },
    { criterio: "Struttura economica corretta su CTE di fornitori nuovi", ok: strutturaOk((d) => d.fornitore_nuovo) === true },
  ];
  return { pronto: criteri.every((c) => c.ok), criteri, copertura, inventati: inventati.length };
}

// ---------------------------------------------------------------- report
function conteggi(lista) {
  const c = { CORRETTO: 0, ERRATO: 0, MANCANTE: 0, INVENTATO: 0, NON_VALUTATO: 0 };
  for (const r of lista) c[r.esito]++;
  return c;
}

function riga(c) {
  return `| ${c.CORRETTO} | ${c.ERRATO} | ${c.MANCANTE} | ${c.INVENTATO} | ${c.NON_VALUTATO} |`;
}

function scriviReport(ctx) {
  const { parser, cte, rif, univ, pronto, esitoFinale } = ctx;
  const L = [];
  L.push("# Report regressione CTE - MRF EKO", "");
  L.push(`- Data: ${new Date().toISOString()}`);
  L.push(`- Commit: ${commitCorrente()}`);
  L.push(`- parser-bolletta.js v${parser.provenienza.parser_bolletta_versione} (sha256 ${parser.provenienza.parser_bolletta_sha256.slice(0, 12)}...)`);
  L.push(`- index.html sha256 ${parser.provenienza.index_html_sha256.slice(0, 12)}...`);
  L.push(`- Riferimento: ${rif.presente ? rif.generato_il + " (commit " + rif.commit + ")" : "assente"}`);
  L.push("", `## Esito: ${esitoFinale ? "SUPERATO" : "NON SUPERATO"}`, "");
  L.push("SUPERATO significa soltanto: nessuna regressione, nessuna nuova invenzione, integrita' ok. NON significa che il lettore sia pronto (vedi 'Criterio di prontezza').", "");

  if (bloccanti.length) { L.push("### Problemi bloccanti"); bloccanti.forEach((b) => L.push("- " + b)); L.push(""); }
  if (avvisi.length) { L.push("### Avvisi"); avvisi.forEach((b) => L.push("- " + b)); L.push(""); }

  L.push("## Nuove invenzioni (bloccanti, anche se il totale non aumenta)");
  if (!rif.nuoveInvenzioni.length) L.push("Nessuna.");
  rif.nuoveInvenzioni.forEach((r) => L.push(`- \`${r.chiave}\` - ${r.dettaglio}`));
  L.push("", "## Regressioni (bloccanti)");
  if (!rif.regressioni.length) L.push("Nessuna.");
  rif.regressioni.forEach((r) => L.push(`- \`${r.chiave}\` - prima ${r.prima}, ora ${r.esito}: ${r.dettaglio}`));
  L.push("", "## Invenzioni gia' note (presenti nel riferimento, da eliminare)");
  if (!rif.invenzioniNote.length) L.push("Nessuna.");
  rif.invenzioniNote.forEach((r) => L.push(`- \`${r.chiave}\` - ${r.dettaglio}`));
  if (rif.miglioramenti.length) {
    L.push("", "## Miglioramenti rispetto al riferimento");
    rif.miglioramenti.forEach((r) => L.push(`- \`${r.chiave}\` - prima ${r.prima}, ora CORRETTO`));
  }

  L.push("", "## Test unitari (casi sintetici)", "", "| Suite | Corretti | Errati | Mancanti | Inventati | Non valutati |", "|---|---|---|---|---|---|");
  for (const s of ["numeri", "unita", "formule-indice"]) {
    L.push(`| ${s} ` + riga(conteggi(risultati.filter((r) => r.gruppo === "unit/" + s))));
  }
  L.push("", "<details><summary>Dettaglio dei casi non corretti</summary>", "");
  risultati.filter((r) => r.gruppo.startsWith("unit/") && r.esito !== "CORRETTO").forEach((r) =>
    L.push(`- ${r.esito} \`${r.chiave}\` - input: "${r.input}" - ${r.dettaglio}`));
  L.push("", "</details>");

  L.push("", "## Regressione su CTE", "");
  L.push(`Documenti nel MANIFEST: ${cte.totale}. Solo i campi con verifica manuale 'verificato' entrano nel giudizio.`, "");
  const gruppi = [
    ["Sviluppo", (r) => r.insieme === "sviluppo"],
    ["Holdout (mai usate nello sviluppo)", (r) => r.insieme === "holdout"],
    ["Fornitori nuovi", (r) => r.fornitore_nuovo === true],
  ];
  L.push("| Insieme | Corretti | Errati | Mancanti | Inventati | Non valutati |", "|---|---|---|---|---|---|");
  for (const [nome, f] of gruppi) L.push(`| ${nome} ` + riga(conteggi(risultati.filter((r) => r.gruppo === "cte" && r.conta_nel_giudizio && f(r)))));
  L.push("");
  for (const d of cte.documenti) {
    L.push(`### ${d.id} (${d.insieme}${d.fornitore_nuovo ? ", fornitore nuovo" : ""}) - expected ${d.expected}${d.revisione ? " / " + d.revisione : ""}`);
    L.push(`- OCR: l'app ${d.ocr.app_avvierebbe_ocr ? "AVVIEREBBE" : "non avvierebbe"} l'OCR (${d.ocr.pagine_ocr_app} pagine). Nel test l'OCR non e' eseguito.`);
    if (d.insieme === "holdout" && !DETTAGLI_HOLDOUT) { L.push("- Dettagli nascosti (holdout)."); continue; }
    risultati.filter((r) => r.gruppo === "cte" && r.id === d.id && r.esito !== "NON_VALUTATO").forEach((r) =>
      L.push(`- ${r.esito}${r.conta_nel_giudizio ? "" : " (non verificato)"} \`${r.campo}\` ${r.dettaglio}`));
  }

  L.push("", "## Universalita' (controllo statico)");
  L.push(`Fornitori controllati: ${univ.fornitori_controllati}.`);
  univ.avvisi.forEach((a) => L.push("- Avviso: " + (typeof a === "string" ? a : `${a.file}:${a.riga} ${a.motivo}`)));
  if (!univ.violazioni.length) L.push("- Nessuna violazione.");
  univ.violazioni.forEach((v) => L.push(`- VIOLAZIONE ${v.file}:${v.riga} ${v.motivo} \`${v.testo}\``));
  L.push("", "Il controllo statico non dimostra l'universalita': la prova sono i risultati su holdout e fornitori nuovi.");

  L.push("", `## Criterio di prontezza del lettore: ${pronto.pronto ? "SODDISFATTO" : "NON SODDISFATTO"}`, "");
  pronto.criteri.forEach((c) => L.push(`- [${c.ok ? "x" : " "}] ${c.criterio}`));
  L.push("", "Copertura categorie: " + pronto.copertura.map((c) => (c.coperta ? "✓ " : "✗ ") + c.categoria).join(" · "));

  L.push("", "## Limiti noti di questa esecuzione");
  L.push("- OCR non eseguito dal runner (FASE 0): i PDF scansionati sono valutati sul solo testo nativo.");
  L.push("- I casi unitari sono sintetici e in stato 'da_rivedere' finche' Max non li approva.");
  L.push("- La baseline descrive il comportamento attuale e non e' mai usata come verita'.");
  return L.join("\n");
}

// ---------------------------------------------------------------- main
async function main() {
  const parser = caricaParserAttuale();
  const validatori = await validatoreSchema();
  eseguiUnit(parser);
  const cte = await eseguiCTE(parser, validatori);
  const univ = controllaUniversalita({ "parser-bolletta.js": parser.sorgenti.parser, "index.html#analizzaTestoCTEMRF": parser.sorgenti.cte });
  if (univ.violazioni.length) bloccanti.push(univ.violazioni.length + " violazioni di universalita'");
  const rif = confrontaRiferimento();
  if (!rif.presente) avvisi.push("Riferimento assente: nessun confronto di regressione possibile.");
  const pronto = valutaProntezza(cte);

  const esitoFinale = bloccanti.length === 0 && rif.regressioni.length === 0 && rif.nuoveInvenzioni.length === 0;
  const report = scriviReport({ parser, cte, rif, univ, pronto, esitoFinale });

  mkdirSync(PERCORSI.report, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  writeFileSync(join(PERCORSI.report, `report-${stamp}.md`), report);
  writeFileSync(join(PERCORSI.report, `risultati-${stamp}.json`), JSON.stringify({ risultati, bloccanti, avvisi, cte, univ, pronto }, null, 2));
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, report + "\n");

  if (AGGIORNA) {
    if (bloccanti.length) {
      console.error("Riferimento NON aggiornato: ci sono problemi bloccanti.");
      process.exit(1);
    }
    const esiti = {};
    for (const r of risultati) if (r.conta_nel_giudizio) esiti[r.chiave] = r.esito;
    writeFileSync(join(PERCORSI.riferimento, "stato-accettato.json"), JSON.stringify({
      avviso: "Esiti accettati come base di confronto. NON sono la verita': la verita' sono gli expected verificati. Aggiornare solo con approvazione di Max.",
      generato_il: new Date().toISOString().slice(0, 10),
      commit: commitCorrente(),
      parser: parser.provenienza,
      esiti,
    }, null, 2) + "\n");
    console.log("Riferimento aggiornato: " + Object.keys(esiti).length + " esiti.");
    process.exit(0);
  }

  console.log(report);
  process.exit(esitoFinale ? 0 : 1);
}

main().catch((e) => {
  console.error("Errore del runner:", e);
  process.exit(2);
});
