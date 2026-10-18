import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(
  new URL("../index.html", import.meta.url),
  "utf8"
);

const inizio = html.indexOf(
  "function convertiNumeroEconomicoCTEMRF("
);
const fine = html.indexOf(
  "async function provaLetturaCTEAdminMRF(",
  inizio
);

assert.ok(inizio >= 0 && fine > inizio);

const codice = html.slice(inizio, fine);

assert.doesNotMatch(
  codice,
  /\bsupabaseClient\b|\.insert\s*\(|\.upload\s*\(|\bfetch\s*\(/
);

const analizza = new Function(
  codice + "\nreturn analizzaTestoCTEMRF;"
)();

const testo = [
  "Fixa Time 24 - Condizioni Economiche",
  "Clienti domestici",
  "FORNITURA DI ENERGIA ELETTRICA",
  "Vendita di energia elettrica",
  "Offerta a prezzo fisso per 24 mesi",
  "Corrispettivo a consumo: Corrispettivo Luce 0,1716 euro/kWh",
  "Corrispettivo annuo: Commercializzazione e Vendita 144 euro/anno",
  "FORNITURA DI GAS NATURALE",
  "Vendita di gas naturale",
  "Offerta a prezzo fisso per 24 mesi",
  "Corrispettivo a consumo: Corrispettivo Gas 0,72 euro/Smc",
  "Corrispettivo annuo: Commercializzazione e Vendita 144 euro/anno"
].join("\n");

const dati = analizza(testo);

test("CTE dual: due tariffe fisse", () => {
  assert.equal(dati.commodity, "dual");
  assert.equal(dati.classificazionePrezzoCTE.luce.tipoPrezzo, "fisso");
  assert.equal(dati.classificazionePrezzoCTE.gas.tipoPrezzo, "fisso");
});

test("CTE dual: prezzi luce e gas separati", () => {
  assert.equal(dati.classificazionePrezzoFissoCTE.luce.valore, 0.1716);
  assert.equal(dati.classificazionePrezzoFissoCTE.gas.valore, 0.72);
});

test("CTE dual: quote fisse separate", () => {
  assert.equal(dati.classificazioneCostiFissiCTE.luce.valoreMensile, 12);
  assert.equal(dati.classificazioneCostiFissiCTE.gas.valoreMensile, 12);
});
