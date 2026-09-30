#!/usr/bin/env node
// Genera tests/unit/CASI_SINTETICI.md: i casi sintetici in forma leggibile,
// per la revisione di Max. Il documento e' DERIVATO dai file *.cases.json:
// per modificare un caso si modifica il JSON e si rigenera.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { PERCORSI, leggiJSON } from "./lib/util.mjs";
import { caricaParserAttuale } from "./lib/parser-attuale.mjs";
import { SONDE } from "./lib/adattatori.mjs";
import { classificaCampo, scegliTolleranza } from "./lib/classifica.mjs";

const parser = caricaParserAttuale();
const TITOLI = { numeri: "Numeri (regola 25)", unita: "Unita' di misura (regole 9, 26, 27)", "formule-indice": "Formule, indici e spread (regole 5-8, 10, 11)" };
const val = (a) => (a.value === null || a.value === undefined ? "—" : String(a.value).replace(".", ","));
const out = (o) => (o == null ? "nessun valore" : String(o.value).replace(".", ",") + (o.unit ? " " + o.unit : ""));

const L = [];
L.push("# Casi sintetici — scheda di revisione", "");
L.push("> **Stato: DA RIVEDERE.** Nessun caso è approvato. Ogni esito calcolato su questi casi è **provvisorio**.");
L.push("> File generato da `tests/runner/genera-schede-casi.mjs` a partire da `tests/unit/*.cases.json`: non modificarlo a mano.", "");
L.push("Come leggere le colonne:");
L.push("- **Atteso**: il valore corretto secondo la proposta. `—` significa che il parser NON deve restituire alcun valore.");
L.push("- **Stato atteso**: `presente` (deve trovarlo), `non_presente` / `non_applicabile` (non deve inventarlo), `ambiguo` (non deve darlo per certo).");
L.push("- **Parser attuale**: solo per informazione (è la baseline, **non** la verità).", "");
L.push("Per approvare un caso: impostare `stato_revisione` a `approvato` nel JSON. Per contestarlo: `contestato` con una nota.", "");

let casi = 0, campi = 0;
for (const suite of ["numeri", "unita", "formule-indice"]) {
  const def = leggiJSON(join(PERCORSI.unit, suite + ".cases.json"));
  L.push(`## ${TITOLI[suite]} — ${def.casi.length} casi`, "");
  if (suite === "numeri") {
    L.push("Il **contesto** è dichiarato nel caso: il futuro normalizzatore dovrà riceverlo, perché lo stesso testo (es. `1.234`) si legge in modo diverso a seconda che sia un consumo, un importo o un prezzo.", "");
  }
  for (const c of def.casi) {
    casi++;
    const uscita = SONDE[suite](parser, c);
    L.push(`### ${c.id} · ${c.stato_revisione}`);
    L.push(`- **Testo:** \`${c.input}\`${c.contesto ? `  ·  **Contesto:** ${c.contesto}` : ""}${c.commodity ? `  ·  **Fornitura:** ${c.commodity}` : ""}`);
    L.push(`- **Motivazione:** ${c.motivazione}`, "");
    L.push("| Campo | Stato atteso | Atteso | Unità | Parser attuale | Esito provvisorio |", "|---|---|---|---|---|---|");
    for (const [campo, a] of Object.entries(c.atteso)) {
      campi++;
      const r = classificaCampo(a, uscita[campo] ?? null, scegliTolleranza(campo), c.input);
      const extra = [a.variant ? "variante " + a.variant : "", a.original_text ? "testo " + a.original_text : "", a.original ? "originale " + a.original.value + " " + a.original.unit : ""].filter(Boolean).join(", ");
      L.push(`| ${campo} | ${a.status} | ${val(a)}${extra ? " (" + extra + ")" : ""} | ${a.unit || "—"} | ${out(uscita[campo])} | ${r.esito}${r.sottotipo ? " · " + r.sottotipo : ""} |`);
    }
    L.push("");
  }
}
L.splice(2, 0, `**${casi} casi, ${campi} campi valutati.**`, "");
writeFileSync(join(PERCORSI.unit, "CASI_SINTETICI.md"), L.join("\n") + "\n");
console.log(`CASI_SINTETICI.md scritto: ${casi} casi, ${campi} campi.`);
