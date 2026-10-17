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

assert.ok(
  inizio >= 0 && fine > inizio,
  "Motore CTE non trovato"
);

const codice = html.slice(inizio, fine);

assert.doesNotMatch(
  codice,
  /\bsupabaseClient\b|\.insert\s*\(|\.upload\s*\(|\bfetch\s*\(/
);

const analizza = new Function(
  codice + "\nreturn analizzaTestoCTEMRF;"
)();

test("Plenitude: CTE dual luce e gas", () => {
  const testo = [
    "Fixa Time 24 Condizioni Economiche",
    "Energia Elettrica codice offerta 026160ESFML54XXLFIXA24VBAS160926",
    "Vendita di energia elettrica",
    "Corrispettivo a consumo: Corrispettivo Luce 0,1716 euro/kWh",
    "Corrispettivo annuo: Commercializzazione e Vendita 144 euro/anno",
    "Gas Naturale codice offerta 026160GSFML54XX0GFIXA24BAS160926",
    "Vendita di gas naturale",
    "Corrispettivo a consumo: Corrispettivo Gas 0,72 euro/Smc",
    "Corrispettivo annuo: Commercializzazione e Vendita 144 euro/anno"
  ].join(" ");

  const dati = analizza(testo);

  assert.equal(dati.commodity, "dual");
});

test("Solo luce: riferimento al gas non crea una dual", () => {
  const testo = [
    "Condizioni Economiche luce",
    "Energia Elettrica codice offerta 026160ESFML54XXLFIXA24VBAS160926",
    "Vendita di energia elettrica",
    "Corrispettivo a consumo: Corrispettivo Luce 0,1716 euro/kWh",
    "Il fornitore propone altri prodotti come gas naturale, non inclusi in questa offerta."
  ].join(" ");

  const dati = analizza(testo);

  assert.equal(dati.commodity, "luce");
});
