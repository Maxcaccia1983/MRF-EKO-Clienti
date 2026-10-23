#!/usr/bin/env node
// Genera tests/unit/CASI_SINTETICI.md: i casi sintetici in forma leggibile,
// per la revisione di Max. Il documento e' DERIVATO dai file *.cases.json:
// per modificare un caso si modifica il JSON e si rigenera.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { PERCORSI, leggiJSON } from "./lib/util.mjs";
import { caricaParserAttuale } from "./lib/parser-attuale.mjs";
import { SONDE, eLista } from "./lib/adattatori.mjs";
import { classificaCampo, classificaLista, scegliTolleranza } from "./lib/classifica.mjs";

const parser = caricaParserAttuale();
const TITOLI = { numeri: "Numeri (regola 25)", unita: "Unita' di misura (regole 9, 26, 27)", "formule-indice": "Formule, indici e spread (regole 5-8, 10, 11)" };
const virgola = (n) => String(n).replace(".", ",");
const val = (a) => {
  if (a.items) return a.items.map((i) => `${i.type} ${virgola(i.value)} ${i.unit}, durata ${i.duration}, non altera il prezzo dell'energia: ${i.affects_energy_price === false ? "si" : "no"}`).join("; ");
  return a.value === null || a.value === undefined ? "—" : virgola(a.value);
};
const out = (o) => {
  if (Array.isArray(o)) return o.length ? o.map((i) => i.type + " " + i.value).join("; ") : "nessuno sconto";
  return o == null ? "nessun valore" : virgola(o.value) + (o.unit ? " " + o.unit : "");
};
const esitoTesto = (r) =>
  r.esito === "CORRETTO" ? (r.modo === "estratto" ? "CORRETTO · estratto" : "CORRETTO · vuoto giusto") : r.esito + (r.sottotipo ? " · " + r.sottotipo : "");

// ---- carica tutto
const suites = ["numeri", "unita", "formule-indice"].map((nome) => ({ nome, def: leggiJSON(join(PERCORSI.unit, nome + ".cases.json")) }));
const tutti = suites.flatMap((s) => s.def.casi.map((c) => ({ ...c, suite: s.nome })));
const modificati = tutti.filter((c) => c.modifica);

const L = [];
L.push("# Casi sintetici — scheda di revisione", "");
L.push("> **Stato: DA RIVEDERE.** Nessun caso è approvato. Ogni esito calcolato su questi casi è **provvisorio**.");
L.push("> File generato da `tests/runner/genera-schede-casi.mjs` a partire da `tests/unit/*.cases.json`: non modificarlo a mano.", "");

L.push("## Cosa è cambiato in questa revisione", "");
L.push(`Dei ${tutti.length} casi, **${tutti.length - modificati.length} sono invariati** rispetto alla versione precedente (45 casi), **${modificati.filter((c) => c.modifica.tipo === "corretto").length} sono stati corretti** e **${modificati.filter((c) => c.modifica.tipo === "integrato").length} sono nuovi**. Nessuno è stato approvato: per tutti serve la tua decisione.`, "");
L.push("| Caso | Tipo | Cosa è cambiato |", "|---|---|---|");
for (const c of modificati) L.push(`| ${c.id} | ${c.modifica.tipo} | ${c.modifica.nota} |`);
L.push("");

L.push("Come leggere le colonne:");
L.push("- **Atteso**: il valore corretto secondo la proposta. `—` significa che il parser NON deve restituire alcun valore.");
L.push("- **Stato atteso**: `presente` (deve trovarlo), `non_presente` / `non_applicabile` (non deve inventarlo), `ambiguo` (non deve darlo per certo).");
L.push("- **Parser attuale**: solo per informazione (è la baseline, **non** la verità).");
L.push("- **Esito provvisorio**: `estratto` = il parser ha letto il valore giusto; `vuoto giusto` = il parser ha correttamente lasciato vuoto un dato che doveva restare vuoto (non prova alcuna capacità di lettura).");
L.push("- **Da conservare**: oltre al valore, il test controlla variante e nome originale dell'indice, valore originale prima della conversione, riferimento POD/PDR, durata dello sconto. Se il parser li perde, il campo è ERRATO. Non sono solo descritti qui: li verifica il classificatore (vedi sezione A del report, autotest).", "");
L.push("Per approvare un caso: impostare `stato_revisione` a `approvato` nel JSON. Per contestarlo: `contestato` con una nota.", "");

let casi = 0, campi = 0;
for (const { nome: suite, def } of suites) {
  L.push(`## ${TITOLI[suite]} — ${def.casi.length} casi`, "");
  if (suite === "numeri") {
    L.push("Quando il punto può essere sia separatore delle migliaia sia decimale (`2.423`), il caso **dichiara la convenzione numerica** e riporta il testo di contesto che la prova:", "");
    L.push("- `it`: convenzione italiana dichiarata (punto = migliaia, virgola = decimali), con un testo di contesto che la dimostra (es. un altro numero scritto con la virgola decimale);");
    L.push("- `en`: convenzione inglese (punto = decimali);");
    L.push("- `non_dichiarata`: nessun elemento per decidere. Il caso resta **ambiguo**: il parser non deve scegliere, nemmeno se il contesto è un consumo.", "");
    L.push("La convenzione è un dato del caso: il futuro normalizzatore dovrà riceverla, perché il parser attuale vede solo la stringa e non può usarla.", "");
  }
  for (const c of def.casi) {
    casi++;
    const uscita = SONDE[suite](parser, c);
    L.push(`### ${c.id} · ${c.stato_revisione}${c.modifica ? " · " + (c.modifica.tipo === "corretto" ? "MODIFICATO (corretto)" : "NUOVO (integrato)") : ""}`);
    L.push(`- **Testo:** \`${c.input}\`${c.contesto ? `  ·  **Contesto:** ${c.contesto}` : ""}${c.commodity ? `  ·  **Fornitura:** ${c.commodity}` : ""}`);
    if (c.convenzione_numerica) L.push(`- **Convenzione numerica:** ${c.convenzione_numerica}${c.testo_contesto ? `  ·  **Testo di contesto:** \`${c.testo_contesto}\`` : "  ·  **Testo di contesto:** nessuno"}`);
    L.push(`- **Motivazione:** ${c.motivazione}`);
    if (c.modifica) L.push(`- **Modifica:** ${c.modifica.nota}`);
    L.push("");
    L.push("| Campo | Stato atteso | Atteso | Unità | Da conservare | Parser attuale | Esito provvisorio |", "|---|---|---|---|---|---|---|");
    for (const [campo, a] of Object.entries(c.atteso)) {
      campi++;
      const tol = scegliTolleranza(campo);
      const r = eLista(campo) ? classificaLista(a, uscita[campo], tol) : classificaCampo(a, uscita[campo] ?? null, tol, c.input);
      const conserva = [
        a.variant ? "variante " + a.variant : "",
        a.original_text ? "nome originale «" + a.original_text + "»" : "",
        a.original ? "originale " + virgola(a.original.value) + " " + a.original.unit : "",
        a.per ? "riferimento " + a.per : "",
      ].filter(Boolean).join(", ");
      L.push(`| ${campo} | ${a.status} | ${val(a)} | ${a.unit || "—"} | ${conserva || "—"} | ${out(uscita[campo])} | ${esitoTesto(r)} |`);
    }
    L.push("");
  }
}
L.splice(L.indexOf("## Cosa è cambiato in questa revisione"), 0, `**${casi} casi, ${campi} campi valutati.**`, "");
writeFileSync(join(PERCORSI.unit, "CASI_SINTETICI.md"), L.join("\n") + "\n");
console.log(`CASI_SINTETICI.md scritto: ${casi} casi, ${campi} campi.`);
