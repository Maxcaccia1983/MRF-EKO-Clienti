
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(
  new URL("../index.html", import.meta.url),
  "utf8"
);

const inizio = html.indexOf(
  "async function provaLetturaCTEAdminMRF() {"
);

const fine = html.indexOf(
  "async function caricaCTEAdminMRF()", inizio
);

assert.ok(inizio >= 0 && fine > inizio,
  "Funzione anteprima CTE non trovata");

const sorgente = html.slice(inizio, fine);

// Il test non deve eseguire operazioni di rete o salvataggio.
assert.doesNotMatch(
  sorgente,
  /\bsupabaseClient\b|\.insert\s*\(|\.upload\s*\(|\bfetch\s*\(/
);

function datiCTE(commodity, mancante = false) {
  const luce = commodity === "luce";

  return {
    fornitore: "Eko 360 Srl",
    nomeOfferta: luce
      ? "FIX MONO GEN 24 DOMP"
      : "PSVSBIL 8 DOM 8CCVP",
    codiceOfferta: luce ? "TEST-L" : "TEST-G",
    commodity,
    segmento: "domestico",
    validitaDa: "2026-07-25",
    validitaAl: "2026-07-31",

    classificazionePrezzoCTE: {
      [commodity]: {
        tipoPrezzo: luce ? "fisso" : "variabile",
        indice: luce ? null : "PSbG",
        evidenze: []
      }
    },

    classificazionePrezzoFissoCTE: {
      [commodity]: {
        valore: luce ? 0.1529 : null,
        unita: "€/kWh",
        prezziFasce: luce
          ? { F1: 0.1529, F2: 0.1529, F3: 0.1529 }
          : {},
        evidenze: []
      }
    },

    classificazioneSpreadCTE: {
      [commodity]: {
        valore: luce || mancante ? null : 0.08,
        unita: luce ? null : "€/Smc",
        evidenze: luce || mancante
          ? []
          : ["PSbG + 0,08 €/Smc"]
      }
    },

    classificazioneCostiFissiCTE: {
      [commodity]: {
        valoreMensile: mancante ? null : 8,
        evidenze: mancante ? [] : ["CCV 96 €/anno"]
      }
    }
  };
}

function preparaTest(dati, file = {
  name: "prova.pdf",
  type: "application/pdf",
  size: 1024
}) {
  const input = { files: file ? [file] : [] };
  const anteprima = {
    style: { display: "none" },
    textContent: ""
  };
  const stato = { textContent: "" };
  let letture = 0;

  const document = {
    getElementById(id) {
      if (id === "cteFileMRF") return input;
      if (id === "anteprimaCTEMRF") return anteprima;
      if (id === "statoCaricamentoCTEMRF") return stato;
      return null;
    }
  };

  const funzione = new Function(
    "document",
    "leggiTestoCTEMRF",
    "analizzaTestoCTEMRF",
    "console",
    sorgente + "\nreturn provaLetturaCTEAdminMRF;"
  );

  const avvia = funzione(
    document,
    async () => {
      letture++;
      return "Testo CTE simulato";
    },
    () => dati,
    { error() {} }
  );

  return {
    avvia,
    anteprima,
    stato,
    numeroLetture: () => letture
  };
}

test("Anteprima luce fissa completa", async () => {
  const r = preparaTest(datiCTE("luce"));
  await r.avvia();

  const testo = r.anteprima.textContent;

  assert.match(testo, /LUCE\nTipo prezzo: fisso/);
  assert.match(testo, /0,1529 €\/kWh/);
  assert.match(testo, /F1: 0,1529/);
  assert.match(testo, /F2: 0,1529/);
  assert.match(testo, /F3: 0,1529/);
  assert.match(testo, /8 €\/mese/);
  assert.match(testo, /96,00 €\/POD\/anno/);
  assert.match(testo, /Tipologia cliente: domestico/);
  assert.match(testo, /Validità offerta:/);
  assert.doesNotMatch(testo, /\nGAS\n/);
});

test("Anteprima gas variabile completa", async () => {
  const r = preparaTest(datiCTE("gas"));
  await r.avvia();

  const testo = r.anteprima.textContent;

  assert.match(testo, /GAS\nTipo prezzo: variabile/);
  assert.match(testo, /Indice: PSbG/);
  assert.match(testo, /Spread: 0,08 €\/Smc/);
  assert.match(testo, /8 €\/mese/);
  assert.match(testo, /96,00 €\/PDR\/anno/);
  assert.doesNotMatch(testo, /\nLUCE\n/);
});

test("Dati mancanti visibili come da verificare", async () => {
  const r = preparaTest(datiCTE("gas", true));
  await r.avvia();

  assert.match(
    r.anteprima.textContent,
    /Spread: Da verificare/
  );
  assert.match(
    r.anteprima.textContent,
    /Quota fissa annua equivalente: Da verificare/
  );
});

test("Nessun PDF selezionato", async () => {
  const r = preparaTest(datiCTE("luce"), null);
  await r.avvia();

  assert.match(r.stato.textContent, /Seleziona una CTE PDF/);
  assert.equal(r.numeroLetture(), 0);
});

test("File non PDF rifiutato", async () => {
  const r = preparaTest(datiCTE("luce"), {
    name: "documento.txt",
    type: "text/plain",
    size: 100
  });
  await r.avvia();

  assert.match(r.stato.textContent, /Seleziona un file PDF/);
  assert.equal(r.numeroLetture(), 0);
});

test("PDF superiore a 20 MB rifiutato", async () => {
  const r = preparaTest(datiCTE("gas"), {
    name: "grande.pdf",
    type: "application/pdf",
    size: 21 * 1024 * 1024
  });
  await r.avvia();

  assert.match(r.stato.textContent, /PDF superiore a 20 MB/);
  assert.equal(r.numeroLetture(), 0);
});

//
// TEST CLASSIFICAZIONE CLIENTE CTE
// Usa il codice reale dell'applicazione.
//

const inizioParserSegmento = html.indexOf(
  "function analizzaTestoCTEMRF(testo) {"
);

const inizioSegmento = html.indexOf(
  'let segmento = "";',
  inizioParserSegmento
);

const fineSegmento = html.indexOf(
  "const classificazionePrezzoCTE =",
  inizioSegmento
);

assert.ok(
  inizioParserSegmento >= 0 &&
  inizioSegmento >= 0 &&
  fineSegmento > inizioSegmento,
  "Classificazione cliente CTE non trovata"
);

const codiceSegmento = html.slice(
  inizioSegmento,
  fineSegmento
);

const classificaCliente = new Function(
  "testo",
  'const minuscolo = String(testo).toLowerCase();\n' +
  codiceSegmento +
  "\nreturn segmento;"
);

test("CTE domestica con note business", () => {
  const testo = [
    "Condizioni tecnico economiche gas naturale",
    "Nome Offerta: PSVSBIL 0 DOM 8CCV",
    "Offerta a prezzo variabile",
    "Clienti domestici",
    "Condizioni contrattuali ".repeat(100),
    "Nota: cliente domestico o cliente non domestico"
  ].join(" ");

  assert.equal(
    classificaCliente(testo),
    "domestico"
  );
});

test("CTE clienti non domestici", () => {
  const testo =
    "Condizioni tecnico economiche gas " +
    "Clienti non domestici " +
    "Offerta business";

  assert.equal(
    classificaCliente(testo),
    "business"
  );
});

test("CTE clienti condominiali", () => {
  const testo =
    "Condizioni tecnico economiche gas " +
    "Clienti condominiali";

  assert.equal(
    classificaCliente(testo),
    "condominio"
  );
});

test("CTE senza tipologia riconoscibile", () => {
  const testo =
    "Condizioni economiche fornitura gas " +
    "Indice PSbG e quota annuale";

  assert.equal(
    classificaCliente(testo),
    ""
  );
});
