
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Legge il codice reale dell'applicazione.
const html = readFileSync(
  new URL("../index.html", import.meta.url),
  "utf8"
);

const inizio = html.indexOf(
  "async function caricaCTEAdminMRF() {"
);
const fine = html.indexOf(
  "function apriAdminMRF()", inizio
);

assert.ok(inizio >= 0 && fine > inizio,
  "Funzione caricamento CTE non trovata");

const funzione = html.slice(inizio, fine);

const a = funzione.indexOf("const tipoPrezzoCTE =");
const b = funzione.indexOf(
  "const { error: dbError }", a
);

assert.ok(a >= 0 && b > a,
  "Controllo economico non trovato");

const controllo = funzione.slice(a, b);
const inserimento = funzione.match(
  /\.insert\(\{([\s\S]*?)\}\);/
);

assert.ok(inserimento,
  "Campi di salvataggio non trovati");

// Nessuna chiamata a Supabase o alla rete.
assert.doesNotMatch(
  controllo + inserimento[1],
  /\bsupabaseClient\b|\bfetch\s*\(/
);

// Esegue soltanto le espressioni economiche.
const calcola = new Function(
  "datiCTE", "commodity", "datiCTECompleti",
  "fornitore", "fornitoreAffidabile",
  "nomeOfferta", "codiceOfferta", "segmento",
  "validitaDa", "validitaAl", "file",
  "storagePath",
  controllo + "\nreturn ({" + inserimento[1] + "});"
);

function simula({
  commodity = "gas",
  tipo = "variabile",
  indice = "PSbG",
  spread = 0.08,
  quota = 8,
  prezzo = null,
  fasce = {},
  completo = true
} = {}) {

  const dati = {
    classificazionePrezzoCTE: {
      [commodity]: { tipoPrezzo: tipo, indice }
    },
    classificazioneSpreadCTE: {
      [commodity]: {
        valore: spread,
        unita: commodity === "gas" ? "€/Smc" : "€/kWh"
      }
    },
    classificazionePrezzoFissoCTE: {
      [commodity]: {
        valore: prezzo,
        unita: "€/kWh",
        prezziFasce: fasce
      }
    },
    classificazioneCostiFissiCTE: {
      [commodity]: { valoreMensile: quota }
    }
  };

  return calcola(
    dati, commodity, completo,
    "Fornitore Test", true,
    "Offerta Test", "CODICE-TEST",
    "domestico", "2026-10-01",
    "2026-10-31",
    { name: "test.pdf", size: 1024 },
    "test/test.pdf"
  );
}

test("Gas variabile: indice, spread e quota", () => {
  const r = simula();

  assert.equal(r.tipo_prezzo, "indicizzato");
  assert.equal(r.indice_nome, "PSbG");
  assert.equal(r.spread_valore, 0.08);
  assert.equal(r.spread_unita, "€/Smc");
  assert.equal(r.quota_fissa_annua, 96);
  assert.equal(r.quota_fissa_unita, "€/PDR/anno");
  assert.equal(r.da_verificare, false);
});

test("Luce fissa: prezzo e fasce", () => {
  const fasce = {
    F1: 0.1529,
    F2: 0.1529,
    F3: 0.1529
  };

  const r = simula({
    commodity: "luce",
    tipo: "fisso",
    indice: null,
    spread: null,
    prezzo: 0.1529,
    fasce
  });

  assert.equal(r.tipo_prezzo, "fisso");
  assert.equal(r.prezzo_fisso_valore, 0.1529);
  assert.deepEqual(r.prezzi_fasce, fasce);
  assert.equal(r.spread_valore, null);
  assert.equal(r.quota_fissa_annua, 96);
  assert.equal(r.da_verificare, false);
});

test("Spread zero verificato", () => {
  const r = simula({ spread: 0 });

  assert.equal(r.spread_valore, 0);
  assert.equal(r.da_verificare, false);
});

test("Spread mancante: verifica obbligatoria", () => {
  const r = simula({ spread: null });

  assert.equal(r.spread_valore, null);
  assert.equal(r.da_verificare, true);
});

test("Quota fissa mancante: verifica obbligatoria", () => {
  const r = simula({ quota: null });

  assert.equal(r.quota_fissa_annua, null);
  assert.equal(r.da_verificare, true);
});

test("Dati identificativi incompleti", () => {
  const r = simula({ completo: false });

  assert.equal(r.da_verificare, true);
});
