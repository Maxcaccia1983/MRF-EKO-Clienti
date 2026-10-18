// Test del lettore universale CTE (mrf-cte-lettore.js).
// Solo casi sintetici: nessun PDF, nessuna rete, nessun salvataggio.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const L = require("../mrf-cte-lettore.js");
const sorgente = readFileSync(new URL("../mrf-cte-lettore.js", import.meta.url), "utf8");

const analizzaRighe = (righe, commodity = "") =>
  L.analizza(L.documentoDaTesto(righe), commodity);

test("Il modulo non usa rete, Supabase o salvataggi", () => {
  assert.doesNotMatch(sorgente, /\bsupabase\w*\b|\.insert\s*\(|\.upload\s*\(|\bfetch\s*\(|localStorage|XMLHttpRequest/);
});

test("Il modulo non contiene nomi di fornitori", () => {
  assert.doesNotMatch(sorgente, /\b(enel|eni|plenitude|sorgenia|edison|a2a|hera|iren|acea|e\.on|axpo|pulsee|alperia|illumia|dolomiti|estra)\b/i);
});

test("Numeri italiani e casi ambigui", () => {
  assert.equal(L.convertiNumero("0,145"), 0.145);
  assert.equal(L.convertiNumero("1.234,56"), 1234.56);
  assert.equal(L.convertiNumero("0.16600"), 0.166);
  assert.equal(L.convertiNumero("204,000000"), 204);
  assert.equal(L.convertiNumero("1.500"), null); // ambiguo: mai indovinare
});

test("Valori con unità: c€, €/MWh, POD, punto di prelievo, €/kW", () => {
  const v = L.trovaValori(
    "a 2,5 c€/kWh e 120 €/MWh, quota 144 €/POD/anno, 204 euro/punto di prelievo/anno, potenza 1,5 €/kW"
  );
  assert.equal(v.length, 5);
  assert.equal(v[0].numero, 0.025);
  assert.equal(v[1].base, "mwh");
  assert.equal(v[2].punto, "POD");
  assert.equal(v[3].dimensione, "periodo");
  assert.equal(v[4].dimensione, "potenza");
});

test("Barra speciale (⁄) e unità spezzata su due righe", () => {
  const r = analizzaRighe([
    "Vendita di gas naturale",
    "Corrispettivo annuo: Commercializzazione e",
    "144 euro⁄anno"
  ], "gas");
  assert.equal(r.gas.quotaFissa.value, 12);
  assert.equal(r.gas.quotaFissa.original.valore, 144);
});

test("Luce fissa in tabella voce | valore", () => {
  const r = analizzaRighe([
    "Corrispettivi definiti dal venditore",
    "Corrispettivi | Valore",
    "Prezzo Luce | 0,17849 €/kWh",
    "Quota fissa | 144 €/POD/anno"
  ], "luce");
  assert.equal(r.luce.tipoPrezzo.value, "fisso");
  assert.equal(r.luce.prezzoFisso.value, 0.17849);
  assert.equal(r.luce.quotaFissa.value, 12);
  assert.ok(r.luce.prezzoFisso.source_text.includes("Prezzo Luce"));
  assert.equal(r.luce.spread.value, null);
});

test("Sconti e prezzi scontati non diventano il prezzo dell'energia", () => {
  const r = analizzaRighe([
    "Prezzo Luce | 0,17849 €/kWh",
    "Sconto: sconto del 7% sul Prezzo Luce (valore dello sconto pari a",
    "0,01249 €/kWh), per un Prezzo Luce di 0,16600 €/kWh"
  ], "luce");
  assert.equal(r.luce.prezzoFisso.value, 0.17849);
  assert.equal(r.luce.sconti.length, 2);
});

test("Formula PUN Index GME + spread", () => {
  const r = analizzaRighe([
    "la componente energia sarà pari a PUN Index GME + 0,02785 euro/kWh"
  ], "luce");
  assert.equal(r.luce.tipoPrezzo.value, "variabile");
  assert.equal(r.luce.indice.value, "PUN");
  assert.equal(r.luce.spread.value, 0.02785);
  assert.equal(r.luce.prezzoFisso.value, null);
});

test("Spread senza segno +: indice citato nella frase", () => {
  const r = analizzaRighe([
    "Corrispettivo al consumo a copertura dei costi non coperti dal PSV pari a 0,0965 euro/Smc"
  ], "gas");
  assert.equal(r.gas.indice.value, "PSV");
  assert.equal(r.gas.spread.value, 0.0965);
});

test("Spread negativo", () => {
  const r = analizzaRighe(["Prezzo: PSV - 0,02 €/Smc"], "gas");
  assert.equal(r.gas.indice.value, "PSV");
  assert.equal(r.gas.spread.value, -0.02);
  assert.equal(r.diagnostica.candidati[0].concetto, "spread");
});

test("Valori diversi per la stessa voce: nessuna scelta arbitraria", () => {
  const r = analizzaRighe([
    "Quota fissa | 84 €/POD/anno",
    "Quota fissa | 81,12 €/POD/anno"
  ], "luce");
  assert.equal(r.luce.quotaFissa.value, null);
  assert.equal(r.luce.quotaFissa.status, "ambiguo");
  assert.equal(r.luce.quotaFissa.candidati.length, 2);
});

test("Valore legato a un periodo: segnalato da verificare", () => {
  const r = analizzaRighe([
    "Fee: il cui valore è pari, per il primo anno di fornitura, a 0,006 €/kWh"
  ], "luce");
  assert.equal(r.luce.spread.value, 0.006);
  assert.equal(r.luce.spread.status, "da_verificare");
});

test("Componenti regolate e tabelle di composizione escluse", () => {
  const r = analizzaRighe([
    "Oneri generali di sistema | 0,0590 €/kWh",
    "Componente Energia incluse le perdite di rete | 0,146000 euro/kWh | 52,2 %"
  ], "luce");
  assert.equal(r.luce.prezzoFisso.value, null);
  assert.equal(r.luce.tipoPrezzo.value, null);
});

test("DUAL: luce e gas separati per unità e sezione", () => {
  const r = analizzaRighe([
    "Vendita di energia elettrica",
    "Corrispettivo Luce | 0,1716 euro/kWh",
    "Commercializzazione e Vendita | 144 euro/anno",
    "Vendita di gas naturale",
    "Corrispettivo Gas | 0,72 euro/Smc",
    "Commercializzazione e Vendita | 120 euro/anno"
  ], "dual");
  assert.equal(r.luce.prezzoFisso.value, 0.1716);
  assert.equal(r.gas.prezzoFisso.value, 0.72);
  assert.equal(r.luce.quotaFissa.value, 12);
  assert.equal(r.gas.quotaFissa.value, 10);
});

test("Documento senza valori: tutto vuoto, niente inventato", () => {
  const r = analizzaRighe(["Condizioni generali di fornitura", "Il cliente può recedere in ogni momento."], "luce");
  for (const s of ["luce", "gas"]) {
    assert.equal(r[s].prezzoFisso.value, null);
    assert.equal(r[s].spread.value, null);
    assert.equal(r[s].quotaFissa.value, null);
    assert.equal(r[s].tipoPrezzo.value, null);
  }
});

test("Righe da coordinate: frammenti di cifre riuniti, celle separate", () => {
  const it = (str, x, w, y) => ({ str, transform: [6, 0, 0, 6, x, y], width: w });
  const righe = L.costruisciRighe([
    it("Componente Energia", 55.8, 60, 292.1),
    it("0,14", 361.6, 10.1, 294.2),
    it("6", 371.6, 3.4, 294.2),
    it("000", 375.0, 10.6, 294.2),
    it(" ", 385.6, 2.7, 294.2),
    it("euro/kWh", 388.3, 26.9, 294.2),
    it("Contributo fisso", 55.8, 45, 274.6),
    it("204,000000", 351.5, 32.7, 276.7),
    it("euro/anno", 387.0, 28.3, 276.7)
  ]);
  assert.equal(righe.length, 2);
  assert.equal(righe[0].testo, "Componente Energia | 0,146000 euro/kWh");
  assert.equal(righe[1].testo, "Contributo fisso | 204,000000 euro/anno");
});

test("Modalità ombra: i dati esistenti non cambiano", () => {
  const esistenti = { commodity: "luce", classificazioneCostiFissiCTE: { luce: { valoreMensile: null, evidenze: [] } } };
  const r = analizzaRighe(["Quota fissa | 144 €/POD/anno"], "luce");
  const dati = L.combina(esistenti, r, []);
  assert.equal(dati.classificazioneCostiFissiCTE.luce.valoreMensile, null);
  const voce = dati.lettoreUniversaleCTE.confronto.find(c => c.commodity === "luce" && c.campo === "quota_fissa");
  assert.equal(voce.esito, "solo_nuovo");
  assert.equal(voce.nuovo, 12);
});

test("Campo attivo: completa il vuoto e annulla i conflitti", () => {
  const r = analizzaRighe(["Quota fissa | 144 €/POD/anno"], "luce");

  const vuoto = { commodity: "luce", classificazioneCostiFissiCTE: { luce: { valoreMensile: null, evidenze: [] } } };
  const completato = L.combina(vuoto, r, ["quota_fissa"]);
  assert.equal(completato.classificazioneCostiFissiCTE.luce.valoreMensile, 12);
  assert.equal(completato.classificazioneCostiFissiCTE.luce.evidenze.length, 1);

  const diverso = { commodity: "luce", classificazioneCostiFissiCTE: { luce: { valoreMensile: 10, evidenze: ["x"] } } };
  const conflitto = L.combina(diverso, r, ["quota_fissa"]);
  assert.equal(conflitto.classificazioneCostiFissiCTE.luce.valoreMensile, null);
  assert.deepEqual(conflitto.classificazioneCostiFissiCTE.luce.conflittoLettoreUniversale, { esistente: 10, nuovo: 12 });

  const uguale = { commodity: "luce", classificazioneCostiFissiCTE: { luce: { valoreMensile: 12, evidenze: ["x"] } } };
  assert.equal(L.combina(uguale, r, ["quota_fissa"]).classificazioneCostiFissiCTE.luce.valoreMensile, 12);
});

test("Errore di lettura: il flusso esistente non si blocca", async () => {
  const dati = await L.arricchisci({ arrayBuffer: async () => { throw new Error("file illeggibile"); } }, { commodity: "luce" });
  assert.equal(dati.commodity, "luce");
  assert.ok(dati.lettoreUniversaleCTE.errore);
});
