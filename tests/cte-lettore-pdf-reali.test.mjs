// Collaudo del lettore universale sui PDF reali (CTE pubbliche).
// Richiede: i PDF in tests/cte/documenti/ (dal branch fase-0-test) e pdfjs-dist.
// Se mancano, il test viene SALTATO (non fallisce).
//
// Regole:
//   - ERRATO o INVENTATO  → il test fallisce (mai un valore sbagliato o inventato)
//   - MANCANTE            → ammesso, ma il numero di campi giusti non può scendere
//                           sotto la soglia accettata (regressione)
//
// I valori attesi sono PROVVISORI (expected in bozza, non ancora verificati da Max).
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const L = require("../mrf-cte-lettore.js");

const CARTELLA = new URL("./cte/documenti/", import.meta.url);
const SOGLIA_GIUSTI = 22; // stato accettato al 17/10/2026 (22 giusti su 23)

// null = il campo NON deve avere valore (non presente / non applicabile)
const ATTESI = {
  "luce-fisso-02": {
    commodity: "luce",
    luce: { tipo: "fisso", indice: null, fisso: 0.17849, spread: null, quota: 12 },
    gas: { tipo: null, indice: null, fisso: null, spread: null, quota: null }
  },
  "luce-indicizzato-02": {
    commodity: "luce",
    luce: { tipo: "variabile", indice: "PUN", fisso: null, spread: 0.006, quota: 7 },
    gas: { tipo: null, indice: null, fisso: null, spread: null, quota: null }
  },
  "dual-01": {
    commodity: "dual",
    luce: { tipo: "variabile", indice: "PUN", fisso: null, spread: 0.02785, quota: 17 },
    gas: { tipo: "variabile", indice: "PSV", fisso: null, spread: 0.0965, quota: 17 }
  },
  "dual-02": {
    commodity: "dual",
    luce: { tipo: "variabile", indice: "PUN", fisso: null, spread: 0.022, quota: 12 },
    gas: { tipo: "variabile", indice: "PSV", fisso: null, spread: 0.15, quota: 12 }
  }
};

async function caricaPdfjs() {
  const percorsi = [process.env.PDFJS_PATH, "pdfjs-dist/legacy/build/pdf.mjs", "pdfjs-dist/legacy/build/pdf.js"].filter(Boolean);
  for (const p of percorsi) {
    try {
      if (p.endsWith(".js")) return require(p);
      return await import(p);
    } catch { /* prova il successivo */ }
  }
  return null;
}

const pdfjs = await caricaPdfjs();
const pdfPresenti = Object.keys(ATTESI).every(id => existsSync(new URL(id + ".pdf", CARTELLA)));
const motivoSalto = !pdfjs ? "pdfjs-dist non installato" : !pdfPresenti ? "PDF reali non presenti in tests/cte/documenti" : false;

// In CI (RICHIEDI_PDF_REALI=1) il collaudo è obbligatorio: niente salto silenzioso.
if (motivoSalto && process.env.RICHIEDI_PDF_REALI === "1") {
  test("Collaudo PDF reali obbligatorio", () => assert.fail("Collaudo non eseguibile: " + motivoSalto));
}

test("Lettore universale sui PDF reali: zero errati, zero inventati, nessuna regressione", { skip: motivoSalto }, async () => {
  const conteggio = { giusti: 0, mancanti: 0, errati: [], inventati: [] };
  const report = [];

  for (const [id, atteso] of Object.entries(ATTESI)) {
    const dati = new Uint8Array(readFileSync(new URL(id + ".pdf", CARTELLA)));
    const pdf = await pdfjs.getDocument({ data: dati, verbosity: 0, isEvalSupported: false }).promise;
    const documento = await L.leggiPdf(pdf);
    const r = L.analizza(documento, atteso.commodity);

    for (const s of ["luce", "gas"]) {
      const ottenuti = {
        tipo: r[s].tipoPrezzo.value,
        indice: r[s].indice.value,
        fisso: r[s].prezzoFisso.value,
        spread: r[s].spread.value,
        quota: r[s].quotaFissa.value
      };
      for (const [campo, att] of Object.entries(atteso[s])) {
        const ott = ottenuti[campo];
        const nome = `${id} ${s} ${campo}`;
        if (att === null && ott === null) continue;
        if (att === null) { conteggio.inventati.push(`${nome}: ${ott}`); continue; }
        if (ott === null) { conteggio.mancanti++; report.push(`⬜ ${nome}: mancante (atteso ${att})`); continue; }
        const ok = typeof att === "number" ? Math.abs(att - ott) < 1e-6 : att === ott;
        if (ok) conteggio.giusti++;
        else conteggio.errati.push(`${nome}: ${ott} invece di ${att}`);
      }
    }
  }

  console.log(`Giusti ${conteggio.giusti} · Mancanti ${conteggio.mancanti} · Errati ${conteggio.errati.length} · Inventati ${conteggio.inventati.length}`);
  for (const riga of report) console.log(riga);

  assert.deepEqual(conteggio.inventati, [], "Valori inventati");
  assert.deepEqual(conteggio.errati, [], "Valori errati");
  assert.ok(conteggio.giusti >= SOGLIA_GIUSTI, `Regressione: ${conteggio.giusti} giusti, soglia ${SOGLIA_GIUSTI}`);
});
