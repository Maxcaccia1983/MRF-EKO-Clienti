// Estrazione del testo nativo con pdf.js 3.11.174 (stessa versione dell'app).
// Riproduce leggiTestoCTEMRF di index.html:
//   items.map(i => i.str).join(" ") per pagina, pagine unite da " ",
//   spazi compattati.
// Registra anche le metriche per pagina, utili al futuro controllo qualita'
// (FASE 1) ma NON usate per cambiare il comportamento.
//
// OCR: NON eseguito in FASE 0 (servirebbe il rendering su canvas in Node).
// Il runner registra soltanto se l'app, con le sue regole attuali, avvierebbe l'OCR.

import { readFileSync } from "node:fs";
import { importOpzionale } from "./util.mjs";

let pdfjs = null;

async function caricaPdfjs() {
  if (pdfjs) return pdfjs;
  const mod = await importOpzionale("pdfjs-dist/legacy/build/pdf.js");
  if (!mod) {
    throw new Error("pdfjs-dist 3.11.174 non installato: eseguire 'npm install' in tests/runner (in CI avviene automaticamente).");
  }
  pdfjs = mod.default || mod;
  return pdfjs;
}

export async function estraiTestoNativo(percorsoPdf) {
  const lib = await caricaPdfjs();
  const dati = new Uint8Array(readFileSync(percorsoPdf));
  const pdf = await lib.getDocument({ data: dati, isEvalSupported: false, useSystemFonts: false }).promise;

  let testoCompleto = "";
  const pagine = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const pagina = await pdf.getPage(n);
    const contenuto = await pagina.getTextContent();
    const testoPagina = contenuto.items.map((i) => i.str).join(" ");
    testoCompleto += " " + testoPagina;
    const compatto = testoPagina.replace(/\s+/g, " ").trim();
    pagine.push({
      pagina: n,
      caratteri: compatto.length,
      parole: compatto ? compatto.split(" ").length : 0,
    });
  }
  const testoPulito = testoCompleto.replace(/\s+/g, " ").trim();
  await pdf.destroy();
  return { testo: testoPulito, numeroPagine: pagine.length, pagine };
}

/** Replica la condizione di index.html (leggiTestoCTEMRF, r.1498-1519). */
export function condizioneOcrApp(testo, datiParser, numeroPagine) {
  const parole = testo.split(/\s+/).filter(Boolean).length;
  const leggibile = testo.length >= 500 && parole >= 80;
  const attiverebbe = !(leggibile && datiParser.validitaDa && datiParser.validitaAl);
  return {
    testo_nativo_leggibile: leggibile,
    app_avvierebbe_ocr: attiverebbe,
    pagine_ocr_app: attiverebbe ? (leggibile ? 1 : numeroPagine) : 0,
    ocr_eseguito_nel_test: false,
    nota: "FASE 0: l'OCR non viene eseguito dal runner. Per i documenti 'scansionato' il risultato del test riflette solo il testo nativo.",
  };
}
