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
import { readFileSync } from "node:fs";
import { PERCORSI, leggiJSON, sha256File, commitCorrente, argomenti, importOpzionale } from "./lib/util.mjs";
import { caricaParserAttuale } from "./lib/parser-attuale.mjs";
import { classificaCampo, classificaLista, scegliTolleranza } from "./lib/classifica.mjs";
import { SONDE, adattaCTE, appiattisciExpected, eLista } from "./lib/adattatori.mjs";
import { estraiTestoNativo, condizioneOcrApp, verificaPdfjs } from "./lib/estrai-testo.mjs";
import { controllaUniversalita } from "./lib/universalita.mjs";
import { eseguiAutotest } from "./lib/autotest-classificatore.mjs";
import { verificaFonte } from "./lib/fonti.mjs";
import { INDICI, VARIANTI_INDICE, RIFERIMENTI_FORNITURA } from "./lib/vocabolari.mjs";

// Versione del pacchetto INSTALLATO in tests/runner/node_modules: e' quella che l'import ESM del
// runner usa davvero. Non si guardano installazioni globali, che il runner non carica.
function versionePacchetto(nome) {
  try {
    return JSON.parse(readFileSync(join(PERCORSI.tests, "runner", "node_modules", nome, "package.json"), "utf8")).version;
  } catch { return null; }
}

const CI = argomenti.has("--ci");
const DETTAGLI_HOLDOUT = argomenti.has("--dettagli-holdout");
const AGGIORNA = argomenti.has("--aggiorna-riferimento");

const bloccanti = [];
const avvisi = [];
// Controlli che NON sono stati eseguiti. Se ce n'e' anche uno solo, la sezione A
// del report dice "CONTROLLI PARZIALI" e non "OK": un controllo saltato non e' un controllo superato.
const parziali = [];
// Evidenza delle validazioni EFFETTIVAMENTE eseguite (oggetto, schema, validatore, esito).
const validazioni = [];
// Attributi di conservazione (varianti, nomi originali, originali, POD/PDR, sconti) richiesti dai casi.
const conservazione = { varianti: [], nomi_originali: [], originali: [], riferimenti: [], sconti: [], convenzioni: [] };
const risultati = []; // { chiave, gruppo, id, campo, esito, dettaglio, conta_nel_giudizio, insieme, fornitore_nuovo }

// ---------------------------------------------------------------- 1. schema
let infoValidatore = { nome: "ajv", versione: null, eseguito: false };
let infoPdfjs = { versione: null, caricato: false };

async function validatoreSchema() {
  const mod = await importOpzionale("ajv/dist/2020.js");
  if (!mod) {
    const msg = "Validazione JSON Schema NON eseguita: ajv non installato.";
    (CI ? bloccanti : parziali).push(msg);
    return null;
  }
  const Ajv = mod.default || mod;
  const ajv = new Ajv({ allErrors: true, strict: false });
  infoValidatore = { nome: "ajv", versione: versionePacchetto("ajv") || "versione non leggibile", eseguito: true };
  return {
    expected: ajv.compile(leggiJSON(join(PERCORSI.schema, "expected-cte.v1.schema.json"))),
    manifest: ajv.compile(leggiJSON(join(PERCORSI.schema, "manifest.v1.schema.json"))),
  };
}

function erroriAjv(fn) {
  return (fn.errors || []).map((e) => (e.instancePath || "/") + " " + e.message).join("; ");
}

/** Esegue una validazione e ne registra l'evidenza. Restituisce true/false, o null se non eseguibile. */
function valida(validatori, tipo, oggetto, dato) {
  const schema = tipo === "manifest" ? "manifest.v1.schema.json" : "expected-cte.v1.schema.json";
  if (!validatori) {
    validazioni.push({ oggetto, schema, esito: "NON ESEGUITA (ajv assente)" });
    return null;
  }
  const fn = validatori[tipo];
  const ok = fn(dato);
  validazioni.push({ oggetto, schema, esito: ok ? "valido" : "NON VALIDO: " + erroriAjv(fn) });
  return ok;
}

// ---------------------------------------------------------------- 2. unit
const STATI_REVISIONE = ["da_rivedere", "approvato", "contestato"];
const CONVENZIONI = ["it", "en", "non_dichiarata"];
// Un punto seguito da esattamente 3 cifre ("2.423"): in convenzione italiana sono migliaia,
// in convenzione inglese sono decimali. Il caso DEVE dichiarare la convenzione.
// Con lo zero iniziale ("0.145") il punto non puo' essere un separatore di migliaia: e' decimale (caso N12).
const PUNTO_AMBIGUO = /^[1-9]\d{0,2}\.\d{3}$/;

/** Controlli di integrita' del materiale di test (sezione A): non riguardano il parser. */
function controllaCaso(suite, caso, visti) {
  const dove = "unit/" + suite + "/" + caso.id;
  if (visti.has(caso.id)) bloccanti.push(dove + ": ID duplicato tra i casi");
  visti.add(caso.id);
  if (!STATI_REVISIONE.includes(caso.stato_revisione)) bloccanti.push(dove + ": stato_revisione '" + caso.stato_revisione + "' non valido");
  if (caso.modifica && !["corretto", "integrato"].includes(caso.modifica.tipo)) bloccanti.push(dove + ": modifica.tipo non valido");

  // Convenzione numerica (suite numeri)
  if (suite === "numeri") {
    const c = caso.convenzione_numerica;
    if (c !== undefined && !CONVENZIONI.includes(c)) bloccanti.push(dove + ": convenzione_numerica '" + c + "' non valida");
    if (PUNTO_AMBIGUO.test(caso.input) && !c) {
      bloccanti.push(dove + ": '" + caso.input + "' ha un punto ambiguo (migliaia o decimale) ma il caso non dichiara la convenzione numerica");
    }
    if (c) {
      conservazione.convenzioni.push(caso.id + "=" + c);
      const st = caso.atteso.valore && caso.atteso.valore.status;
      if (c === "non_dichiarata" && PUNTO_AMBIGUO.test(caso.input) && st !== "ambiguo") {
        bloccanti.push(dove + ": senza convenzione dichiarata un punto ambiguo deve restare 'ambiguo', non '" + st + "'");
      }
      if ((c === "it" || c === "en") && PUNTO_AMBIGUO.test(caso.input) && !caso.testo_contesto) {
        bloccanti.push(dove + ": convenzione '" + c + "' dichiarata senza testo_contesto che la provi");
      }
    }
  }

  // Attributi di conservazione e vocabolari
  for (const [campo, a] of Object.entries(caso.atteso)) {
    if (!a) continue;
    const nome = dove + "/" + campo;
    if (/\.index$/.test(campo) && a.status === "presente") {
      if (!INDICI.includes(a.value)) bloccanti.push(nome + ": indice '" + a.value + "' fuori dal vocabolario " + INDICI.join("/"));
      if (a.value === "ALTRO" && !a.original_text) bloccanti.push(nome + ": indice ALTRO senza original_text (regola 7)");
    }
    if (a.variant) {
      if (!VARIANTI_INDICE.includes(a.variant)) bloccanti.push(nome + ": variante '" + a.variant + "' fuori dal vocabolario " + VARIANTI_INDICE.join("/"));
      conservazione.varianti.push(caso.id);
    }
    if (a.original_text) conservazione.nomi_originali.push(caso.id);
    if (a.original) conservazione.originali.push(caso.id);
    if (a.per) {
      if (!RIFERIMENTI_FORNITURA.includes(a.per)) bloccanti.push(nome + ": riferimento '" + a.per + "' fuori dal vocabolario " + RIFERIMENTI_FORNITURA.join("/"));
      conservazione.riferimenti.push(caso.id);
    }
    if (/\.sconti$/.test(campo)) {
      conservazione.sconti.push(caso.id);
      for (const it of a.items || []) {
        if (it.duration == null || it.value == null || typeof it.affects_energy_price !== "boolean") {
          bloccanti.push(nome + ": ogni sconto atteso deve dichiarare valore, durata e affects_energy_price");
        }
      }
    }
  }
}

function eseguiUnit(parser) {
  const visti = new Set();
  for (const suite of ["numeri", "unita", "formule-indice"]) {
    const file = join(PERCORSI.unit, suite + ".cases.json");
    const def = leggiJSON(file);
    const sonda = SONDE[suite];
    for (const caso of def.casi) {
      controllaCaso(suite, caso, visti);
      let uscita;
      try {
        uscita = sonda(parser, caso);
      } catch (e) {
        bloccanti.push("unit/" + suite + "/" + caso.id + ": errore di esecuzione " + e.message);
        continue;
      }
      for (const [campo, atteso] of Object.entries(caso.atteso)) {
        const ott = uscita[campo] ?? null;
        const tol = scegliTolleranza(campo);
        const { esito, dettaglio, sottotipo, modo } = eLista(campo)
          ? classificaLista(atteso, ott, tol)
          : classificaCampo(atteso, ott, tol, caso.input);
        risultati.push({
          chiave: "unit/" + suite + "/" + caso.id + "/" + campo,
          gruppo: "unit/" + suite, id: caso.id, campo, esito, modo, dettaglio, sottotipo,
          // I casi unitari entrano nel controllo di REGRESSIONE (comportamento),
          // ma il loro giudizio di CORRETTEZZA resta provvisorio finche' Max non li approva.
          conta_nel_giudizio: true,
          provvisorio: caso.stato_revisione !== "approvato",
          input: caso.input, atteso: atteso, ottenuto: ott, motivazione: caso.motivazione,
        });
      }
    }
  }
}

// Verificabilita' di un campo atteso verificato: pagina e frase originale presenti nel documento.
function controllaFonteCampo(doc, campo, atteso, estratto) {
  const voci = Array.isArray(atteso.items) ? atteso.items : [atteso];
  if (doc.tipo_pdf === "scansionato") {
    const msg = doc.id + ": le frasi originali (source_text) dei campi verificati non sono controllabili automaticamente: PDF scansionato senza testo nativo";
    if (!parziali.includes(msg)) parziali.push(msg);
    return;
  }
  for (const voce of voci) {
    const r = verificaFonte(voce, estratto.pagine);
    if (!r.ok) bloccanti.push(doc.id + " " + campo + ": valore atteso non verificabile sul documento - " + r.problema);
  }
}

// ---------------------------------------------------------------- 3. CTE
async function eseguiCTE(parser, validatori) {
  const manifest = leggiJSON(join(PERCORSI.cte, "MANIFEST.json"));
  if (valida(validatori, "manifest", "cte/MANIFEST.json", manifest) === false) {
    bloccanti.push("MANIFEST.json non valido: " + erroriAjv(validatori.manifest));
  }
  const modello = leggiJSON(join(PERCORSI.cte, "expected", "_MODELLO.expected.json"));
  if (valida(validatori, "expected", "cte/expected/_MODELLO.expected.json", modello) === false) {
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
      (CI ? bloccanti : parziali).push(doc.id + ": estrazione testo NON eseguita (" + e.message + ")");
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
    if (valida(validatori, "expected", "cte/expected/" + doc.id + ".expected.json", exp) === false) {
      bloccanti.push(doc.id + ".expected.json non valido: " + erroriAjv(validatori.expected));
      continue;
    }
    if (exp.document_id !== doc.id) bloccanti.push(doc.id + ": document_id dell'expected non corrisponde");
    info.revisione = exp.document_review.state;

    for (const [campo, atteso] of Object.entries(appiattisciExpected(exp))) {
      const tol = scegliTolleranza(campo, exp.tolerances);
      const { esito, dettaglio, sottotipo, modo } = eLista(campo)
        ? classificaLista(atteso, uscita[campo], tol)
        : classificaCampo(atteso, uscita[campo] ?? null, tol, estratto.testo);
      const verificato = atteso && atteso.verification && atteso.verification.state === "verificato";
      // Un valore verificato deve poter essere ricontrollato sul PDF: pagina + frase originale.
      if (verificato && atteso.status === "presente") {
        controllaFonteCampo(doc, campo, atteso, estratto);
      }
      risultati.push({
        chiave: "cte/" + doc.id + "/" + campo,
        gruppo: "cte", id: doc.id, campo, esito, modo, dettaglio, sottotipo,
        conta_nel_giudizio: !!verificato,
        provvisorio: !verificato,
        insieme: doc.insieme, fornitore_nuovo: doc.fornitore_nuovo,
      });
    }
  }
  return { documenti: riepilogoDoc, totale: documenti.length };
}

// ---------------------------------------------------------------- 4. confronto con riferimento
// Senza un file di riferimento non esiste un "prima": ogni campo e' trattato come in passato (nessun campo "nuovo").
const rif_presente_flag = (rif) => rif && rif.__presente === true;

function confrontaRiferimento() {
  const f = join(PERCORSI.riferimento, "stato-accettato.json");
  const rif = existsSync(f) ? { ...leggiJSON(f), __presente: true } : { esiti: {} };
  const prima = rif.esiti || {};
  const regressioni = [];
  const nuoveInvenzioni = [];
  const invenzioniNote = [];
  const miglioramenti = [];
  // Campi di test aggiunti DOPO la creazione del riferimento: non hanno uno stato
  // precedente, quindi non si puo' dire che il parser sia peggiorato. Sono elencati
  // a parte e vanno congelati con l'approvazione di Max (--aggiorna-riferimento).
  const campiNuovi = [];
  for (const r of risultati) {
    if (!r.conta_nel_giudizio) continue;
    const p = prima[r.chiave];
    if (p === undefined && rif_presente_flag(rif)) { campiNuovi.push(r); continue; }
    if (r.esito === "INVENTATO") (p === "INVENTATO" ? invenzioniNote : nuoveInvenzioni).push(r);
    if (p === "CORRETTO" && r.esito !== "CORRETTO") regressioni.push({ ...r, prima: p });
    if (p && p !== "CORRETTO" && r.esito === "CORRETTO") miglioramenti.push({ ...r, prima: p });
  }
  return { presente: existsSync(f), generato_il: rif.generato_il, commit: rif.commit, regressioni, nuoveInvenzioni, invenzioniNote, miglioramenti, campiNuovi };
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
// "Corretti" si divide in due cose molto diverse:
//   estratti  il parser ha restituito il valore giusto (prova che SA leggere il dato)
//   vuoti     il parser ha correttamente lasciato vuoto un dato non presente / non applicabile / ambiguo
function conteggi(lista) {
  const c = { CORRETTO: 0, estratti: 0, vuoti: 0, ERRATO: 0, MANCANTE: 0, INVENTATO: 0, NON_VALUTATO: 0 };
  for (const r of lista) {
    c[r.esito]++;
    if (r.esito === "CORRETTO") (r.modo === "estratto" ? c.estratti++ : c.vuoti++);
  }
  return c;
}

function riga(c) {
  return `| ${c.estratti} | ${c.vuoti} | ${c.ERRATO} | ${c.MANCANTE} | ${c.INVENTATO} | ${c.NON_VALUTATO} |`;
}
const INTESTAZIONE_CONTEGGI = "| Estratti giusti | Vuoti giusti | Errati | Mancanti | Inventati | Non valutati |";

const fmt = (o) => (o == null ? "null" : JSON.stringify(o.value !== undefined ? o.value : o) + (o && o.unit ? " " + o.unit : ""));

function scriviReport(ctx) {
  const { parser, cte, rif, univ, pronto, statoControlli, esitoRegressione, autotest } = ctx;
  const L = [];
  L.push("# Report regressione CTE - MRF EKO", "");
  L.push(`> **STATO DEL LETTORE: ${pronto.pronto ? "PRONTO" : "NON PRONTO"}.** ` +
    "Questo esito dipende solo dal criterio di prontezza (sezione D). Il superamento dei controlli e della regressione NON rende il lettore pronto.", "");
  L.push(`- Data: ${new Date().toISOString()}`);
  L.push(`- Commit: ${commitCorrente()}`);
  L.push(`- parser-bolletta.js v${parser.provenienza.parser_bolletta_versione} (sha256 ${parser.provenienza.parser_bolletta_sha256.slice(0, 12)}...) · index.html sha256 ${parser.provenienza.index_html_sha256.slice(0, 12)}...`);
  L.push(`- Riferimento per la regressione: ${rif.presente ? rif.generato_il + " (commit " + rif.commit + ")" : "assente"}`);
  L.push(`- Ambiente: Node ${process.versions.node} · ajv ${versionePacchetto("ajv") || "NON INSTALLATO"} · pdfjs-dist installato ${versionePacchetto("pdfjs-dist") || "NO"} · pdf.js caricato dal runner: ${infoPdfjs.caricato ? infoPdfjs.versione + " (versione dell'app)" : "NO"}`, "");

  const testoControlli = { OK: "OK (tutti i controlli eseguiti)", PARZIALI: "**CONTROLLI PARZIALI** - non eseguiti: " + parziali.join("; "), PROBLEMI: "PROBLEMI (vedi sezione A)" }[statoControlli];
  const righeNuovi = rif.campiNuovi.length
    ? ` · ${rif.campiNuovi.length} campi di test nuovi da congelare con approvazione (di cui ${rif.campiNuovi.filter((r) => r.esito === "INVENTATO").length} inventati)`
    : "";
  L.push("| Sezione | Domanda | Esito |", "|---|---|---|");
  L.push(`| A. Controlli del runner | Il materiale di test e' integro e valido? | ${testoControlli} |`);
  L.push(`| B. Regressione | Il comportamento e' peggiorato rispetto al riferimento? | ${esitoRegressione ? "Nessun peggioramento" : "PEGGIORAMENTI"}${righeNuovi} |`);
  L.push(`| C. Correttezza del parser | Il parser estrae i valori giusti? | Vedi tabelle: tutti gli esiti sono PROVVISORI finche' i casi non sono approvati |`);
  L.push(`| D. Prontezza | Il lettore puo' essere dichiarato pronto? | ${pronto.pronto ? "SI" : "NO"} |`, "");

  // ---- A
  L.push("## A. Controlli del runner (integrita')", "");
  L.push("Verificano il materiale di test, non il parser: schema JSON, hash dei PDF, ID univoci, vocabolari, convenzione numerica, autotest del classificatore, universalita' statica.", "");
  L.push(`**Stato: ${{ OK: "OK", PARZIALI: "CONTROLLI PARZIALI", PROBLEMI: "PROBLEMI" }[statoControlli]}.** Un controllo non eseguito NON conta come controllo superato.`, "");
  if (!bloccanti.length) L.push("- Nessun problema bloccante.");
  bloccanti.forEach((b) => L.push("- BLOCCANTE: " + b));
  parziali.forEach((b) => L.push("- NON ESEGUITO: " + b));
  avvisi.forEach((b) => L.push("- Avviso: " + b));

  L.push("", "### Evidenza delle validazioni JSON Schema eseguite");
  if (infoValidatore.eseguito) {
    L.push(`Validatore: ${infoValidatore.nome} ${infoValidatore.versione} (draft 2020-12). Elenco generato dal runner a ogni esecuzione; in GitHub compare nel riepilogo dell'Action.`, "");
    L.push("| Oggetto validato | Schema | Esito |", "|---|---|---|");
    validazioni.forEach((v) => L.push(`| \`${v.oggetto}\` | \`${v.schema}\` | ${v.esito} |`));
    if (!validazioni.length) L.push("| (nessun oggetto) | - | - |");
  } else {
    L.push("**Nessuna validazione JSON Schema eseguita in questa esecuzione** (ajv assente). Gli oggetti seguenti NON sono stati validati:", "");
    validazioni.forEach((v) => L.push(`- \`${v.oggetto}\` contro \`${v.schema}\``));
  }

  L.push("", "### Autotest del classificatore");
  L.push(`Il classificatore giudica correttamente ${autotest.totale - autotest.falliti.length}/${autotest.totale} situazioni simulate (il parser attuale non le attraversa mai, quindi senza questo autotest non sarebbero controllate).`);
  L.push("- Gruppi: " + Object.entries(autotest.coperti).map(([g, n]) => `${g} ${n}`).join(" · "));
  autotest.falliti.forEach((f) => L.push("- FALLITO: " + f));

  L.push("", "### Cosa i casi richiedono di conservare (oltre al valore)");
  L.push("Controllato dal classificatore su ogni caso elencato; se il parser restituisce il valore giusto ma perde questi attributi, il campo e' ERRATO.");
  const el = (a) => (a.length ? [...new Set(a)].join(", ") : "nessuno");
  L.push(`- Varianti dell'indice (vocabolario ${VARIANTI_INDICE.join("/")}): ${el(conservazione.varianti)}`);
  L.push(`- Nome originale dell'indice (testo trovato nel documento): ${el(conservazione.nomi_originali)}`);
  L.push(`- Valore originale prima della conversione (es. 144 €/anno): ${el(conservazione.originali)}`);
  L.push(`- Riferimento POD/PDR della quota fissa: ${el(conservazione.riferimenti)}`);
  L.push(`- Sconti con valore, durata e affects_energy_price: ${el(conservazione.sconti)}`);
  L.push(`- Convenzione numerica dichiarata (it/en/non_dichiarata): ${el(conservazione.convenzioni)}`);
  L.push("", "### Universalita' (controllo statico)");
  L.push(`Fornitori noti controllati: ${univ.fornitori_controllati}.`);
  L.push("- Riconoscere il nome del fornitore per compilare il campo 'fornitore' e' AMMESSO (menzione, revisione umana).");
  L.push("- Cambiare il parsing in base al fornitore e' una VIOLAZIONE (diramazione per fornitore o nome noto dentro una condizione).");
  univ.avvisi.forEach((a) => L.push("- Avviso: " + a));
  L.push(`- Violazioni (parsing dipendente dal fornitore o accesso a cte_offerte): ${univ.violazioni.length}`);
  univ.violazioni.forEach((v) => L.push(`  - ${v.tipo} ${v.file}:${v.riga} \`${v.testo}\``));
  L.push(`- Menzioni di nomi noti da rivedere a mano: ${(univ.menzioni || []).length}`);
  (univ.menzioni || []).forEach((v) => L.push(`  - ${v.file}:${v.riga} (${v.token}) \`${v.testo}\``));
  L.push("- Il controllo statico non dimostra l'universalita': la prova sono i risultati su holdout e fornitori nuovi (sezione C).");

  // ---- B
  L.push("", "## B. Regressione rispetto al riferimento (comportamento)", "");
  L.push("Confronta gli esiti di oggi con quelli congelati in `riferimento/stato-accettato.json`. Misura se il comportamento e' cambiato, non se e' corretto.", "");
  L.push("**Nuove invenzioni** (bloccanti anche se il totale non aumenta):");
  if (!rif.nuoveInvenzioni.length) L.push("- Nessuna.");
  rif.nuoveInvenzioni.forEach((r) => L.push(`- \`${r.chiave}\` - ${r.dettaglio}`));
  L.push("", "**Regressioni** (campi che erano CORRETTO e ora non lo sono):");
  if (!rif.regressioni.length) L.push("- Nessuna.");
  rif.regressioni.forEach((r) => L.push(`- \`${r.chiave}\` - prima ${r.prima}, ora ${r.esito}: ${r.dettaglio}`));
  if (rif.miglioramenti.length) {
    L.push("", "**Miglioramenti:**");
    rif.miglioramenti.forEach((r) => L.push(`- \`${r.chiave}\` - prima ${r.prima}, ora CORRETTO`));
  }
  L.push("", `**Campi di test nuovi, non ancora nel riferimento (${rif.campiNuovi.length}):**`);
  if (!rif.campiNuovi.length) L.push("- Nessuno.");
  else {
    L.push("Sono stati aggiunti ai casi dopo il congelamento del riferimento: non hanno un \"prima\", quindi non sono ne' peggioramenti ne' miglioramenti. Il riferimento si aggiorna solo con l'approvazione di Max.", "");
    const perEsito = conteggi(rif.campiNuovi);
    L.push(`Esiti attuali: estratti giusti ${perEsito.estratti}, vuoti giusti ${perEsito.vuoti}, errati ${perEsito.ERRATO}, mancanti ${perEsito.MANCANTE}, inventati ${perEsito.INVENTATO}.`);
    rif.campiNuovi.forEach((r) => L.push(`- ${r.esito}${r.modo ? " (" + r.modo + ")" : ""} \`${r.chiave}\`${r.dettaglio ? " - " + r.dettaglio : ""}`));
  }

  // ---- C
  L.push("", "## C. Correttezza del parser (PROVVISORIA)", "");
  L.push("Esiti rispetto ai valori attesi. I casi unitari sono proposte sintetiche NON ancora approvate: ogni esito qui sotto e' PROVVISORIO.", "");
  L.push("### C1. Casi unitari sintetici", "");
  L.push("**Corretto non significa estratto.** 'Estratti giusti' = il parser ha letto il valore giusto. 'Vuoti giusti' = il parser ha lasciato vuoto un campo che doveva restare vuoto (dato non presente, non applicabile o ambiguo): non dimostra alcuna capacita' di lettura.", "");
  L.push("| Suite | Estratti giusti | Vuoti giusti | Errati | Mancanti | Inventati | Non valutati | Stato |", "|---|---|---|---|---|---|---|---|");
  for (const s of ["numeri", "unita", "formule-indice"]) {
    const lista = risultati.filter((r) => r.gruppo === "unit/" + s);
    const prov = lista.some((r) => r.provvisorio);
    L.push(`| ${s} ` + riga(conteggi(lista)) + ` ${prov ? "PROVVISORIO" : "approvato"} |`);
  }
  const inv = risultati.filter((r) => r.esito === "INVENTATO");
  L.push("", `### C2. Campi INVENTATI (${inv.length}) - gia' presenti nel riferimento: ${rif.invenzioniNote.length}`, "");
  L.push("| Chiave | Input | Output del parser | Atteso | Sottotipo |", "|---|---|---|---|---|");
  inv.forEach((r) => L.push(`| \`${r.chiave}\` | ${r.input ? "\"" + r.input + "\"" : "-"} | ${fmt(r.ottenuto)} | ${r.atteso ? r.atteso.status : "-"} | ${r.sottotipo || "-"} |`));
  L.push("", "### C2b. Valori che il parser attuale estrae correttamente (non sono campi lasciati vuoti)", "");
  const estratti = risultati.filter((r) => r.gruppo.startsWith("unit/") && r.esito === "CORRETTO" && r.modo === "estratto");
  const perSuite = {};
  for (const r of estratti) (perSuite[r.gruppo] ||= []).push(`${r.id} ${r.campo.replace(/^valore$/, "")}`.trim() + " = " + fmt(r.ottenuto));
  for (const [g, l] of Object.entries(perSuite)) L.push(`- **${g}** (${l.length}): ` + l.join("; "));
  if (!estratti.length) L.push("- Nessuno.");
  L.push("", "<details><summary>Tutti i casi unitari non corretti</summary>", "");
  risultati.filter((r) => r.gruppo.startsWith("unit/") && r.esito !== "CORRETTO").forEach((r) =>
    L.push(`- ${r.esito}${r.provvisorio ? " (provvisorio)" : ""} \`${r.chiave}\` - input: "${r.input}" - ${r.dettaglio}`));
  L.push("", "</details>");

  L.push("", "### C3. CTE reali", "");
  L.push(`Documenti nel MANIFEST: ${cte.totale}. Nel giudizio entrano solo i campi con verifica manuale 'verificato'; gli altri sono mostrati come provvisori.`, "");
  L.push("| Insieme | Estratti giusti | Vuoti giusti | Errati | Mancanti | Inventati | Non valutati |", "|---|---|---|---|---|---|---|");
  for (const [nome, f] of [["Sviluppo", (r) => r.insieme === "sviluppo"], ["Holdout (mai usate nello sviluppo)", (r) => r.insieme === "holdout"], ["Fornitori nuovi", (r) => r.fornitore_nuovo === true]]) {
    L.push(`| ${nome} ` + riga(conteggi(risultati.filter((r) => r.gruppo === "cte" && r.conta_nel_giudizio && f(r)))));
  }
  if (!cte.totale) L.push("", "Nessuna CTE caricata: la correttezza su documenti reali NON e' ancora misurata.");
  for (const d of cte.documenti) {
    L.push("", `#### ${d.id} (${d.insieme}${d.fornitore_nuovo ? ", fornitore nuovo" : ""}) - expected ${d.expected}${d.revisione ? " / " + d.revisione : ""}`);
    L.push(`- OCR: l'app ${d.ocr.app_avvierebbe_ocr ? "AVVIEREBBE" : "non avvierebbe"} l'OCR (${d.ocr.pagine_ocr_app} pagine). OCR effettivo nel test: NON ESEGUITO.`);
    if (d.insieme === "holdout" && !DETTAGLI_HOLDOUT) { L.push("- Dettagli nascosti (holdout)."); continue; }
    risultati.filter((r) => r.gruppo === "cte" && r.id === d.id && r.esito !== "NON_VALUTATO").forEach((r) =>
      L.push(`- ${r.esito}${r.provvisorio ? " (provvisorio: campo non verificato)" : ""} \`${r.campo}\` ${r.dettaglio}`));
  }

  // ---- D
  L.push("", `## D. Criterio di prontezza del lettore: ${pronto.pronto ? "SODDISFATTO" : "NON SODDISFATTO"}`, "");
  pronto.criteri.forEach((c) => L.push(`- [${c.ok ? "x" : " "}] ${c.criterio}`));
  L.push("", "Copertura categorie: " + pronto.copertura.map((c) => (c.coperta ? "✓ " : "✗ ") + c.categoria).join(" · "));

  L.push("", "## Prove incomplete o non eseguite", "");
  L.push("- **OCR effettivo: INCOMPLETO.** Il runner non esegue l'OCR; registra solo se l'app lo avvierebbe. I PDF scansionati sono valutati sul solo testo nativo.");
  L.push("- **Prove di accesso reali a Supabase: NON ESEGUITE.** Da pianificare separatamente (tests/accessi/PIANO_PROVE_ACCESSO.md). Nessun utente creato, nessuna modifica all'autenticazione.");
  L.push("- **Casi unitari: DA RIVEDERE.** Nessuno e' approvato; i relativi esiti di correttezza sono provvisori.");
  L.push("- **CTE reali: ASSENTI** finche' il MANIFEST e' vuoto" + (cte.totale ? "." : ": la lettura dei PDF con pdf.js e la validazione degli expected non sono mai state esercitate su un documento."));
  if (statoControlli === "PARZIALI") L.push("- **Controlli parziali in questa esecuzione:** " + parziali.join("; "));
  L.push("- La baseline descrive il comportamento attuale e non e' mai usata come verita'.");
  return L.join("\n");
}

// ---------------------------------------------------------------- main
async function main() {
  const parser = caricaParserAttuale();
  const validatori = await validatoreSchema();
  // pdf.js: si verifica ora che sia caricabile e nella versione dell'app, anche senza documenti.
  let versionePdfjs = null;
  try {
    versionePdfjs = await verificaPdfjs();
  } catch (e) {
    (CI ? bloccanti : parziali).push("pdf.js 3.11.174 NON caricato: " + e.message);
  }
  infoPdfjs = { versione: versionePdfjs, caricato: !!versionePdfjs };
  const autotest = eseguiAutotest();
  autotest.falliti.forEach((f) => bloccanti.push("Autotest del classificatore: " + f));
  eseguiUnit(parser);
  const cte = await eseguiCTE(parser, validatori);
  const univ = controllaUniversalita({ "parser-bolletta.js": parser.sorgenti.parser, "index.html#analizzaTestoCTEMRF": parser.sorgenti.cte });
  if (univ.violazioni.length) bloccanti.push(univ.violazioni.length + " violazioni di universalita'");
  const rif = confrontaRiferimento();
  if (!rif.presente) avvisi.push("Riferimento assente: nessun confronto di regressione possibile.");
  const pronto = valutaProntezza(cte);

  // A ha tre stati: PROBLEMI (qualcosa e' rotto), PARZIALI (nulla e' rotto ma qualche controllo
  // non e' stato eseguito), OK (tutti i controlli eseguiti e superati).
  const statoControlli = bloccanti.length ? "PROBLEMI" : parziali.length ? "PARZIALI" : "OK";
  const esitoControlli = bloccanti.length === 0;
  const esitoRegressione = rif.regressioni.length === 0 && rif.nuoveInvenzioni.length === 0;
  // Il codice di uscita riguarda solo A e B. La prontezza (D) e' riportata ma
  // non fa fallire la CI: il lettore resta NON PRONTO finche' D non e' soddisfatto.
  const esitoFinale = esitoControlli && esitoRegressione;
  const report = scriviReport({ parser, cte, rif, univ, pronto, statoControlli, esitoRegressione, autotest });

  mkdirSync(PERCORSI.report, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  writeFileSync(join(PERCORSI.report, `report-${stamp}.md`), report);
  writeFileSync(join(PERCORSI.report, `risultati-${stamp}.json`), JSON.stringify({ stato_controlli: statoControlli, bloccanti, parziali, avvisi, validazioni, validatore: infoValidatore, pdfjs: infoPdfjs, autotest, conservazione, risultati, cte, univ, pronto }, null, 2));
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
