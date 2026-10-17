import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

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

assert.ok(inizio >= 0 && fine > inizio);

test("CTE DUAL bloccata prima di Supabase", async () => {
  const stato = { textContent: "" };
  const anteprima = {
    textContent: "",
    style: { display: "none" }
  };

  const elementi = {
    statoCaricamentoCTEMRF: stato,
    anteprimaCTEMRF: anteprima,
    cteFileMRF: {
      files: [{
        name: "cte-dual.pdf",
        type: "application/pdf",
        size: 1024
      }]
    }
  };

  const document = {
    getElementById(id) {
      assert.ok(id in elementi, "Elemento inatteso: " + id);
      return elementi[id];
    }
  };

  const supabaseClient = new Proxy({}, {
    get() {
      throw new Error("Tentativo di accesso a Supabase");
    }
  });

  const creaFunzione = new Function(
    "document",
    "leggiTestoCTEMRF",
    "analizzaTestoCTEMRF",
    "supabaseClient",
    html.slice(inizio, fine) +
      "\nreturn caricaCTEAdminMRF;"
  );

  const carica = creaFunzione(
    document,
    async () => "CTE dual simulata",
    () => ({
      commodity: "dual",
      fornitore: "Plenitude",
      fornitoreAffidabile: true,
      nomeOfferta: "Fixa Time 24"
    }),
    supabaseClient
  );

  await carica();

  assert.match(stato.textContent, /caricamento bloccato/i);
});
