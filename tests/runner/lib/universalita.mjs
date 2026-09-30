// Controllo STATICO di universalita' del codice del parser.
//
// Distingue due cose diverse (non sono la stessa cosa):
//
//  A. RICONOSCERE il nome del fornitore  -> ammesso.
//     Leggere la ragione sociale dal documento per compilare il campo
//     "fornitore" e' un'estrazione come le altre. Se un nome noto compare nel
//     codice fuori da una condizione viene solo segnalato per revisione umana
//     (MENZIONE), senza bloccare.
//
//  B. CAMBIARE IL PARSING in base al fornitore -> VIOLAZIONE (regola 1).
//     B1 diramazione_per_fornitore: una condizione confronta l'identita' del
//        fornitore (es. if (fornitore === "X"), /x/.test(fornitore),
//        switch (fornitore), regole[fornitore]).
//     B2 condizione_con_nome_noto: un nome di fornitore noto compare dentro
//        una condizione (if / switch / case / ternario / .test()).
//
//  C. accesso_dati -> VIOLAZIONE: il parser non deve leggere cte_offerte o
//     Supabase. I 78 record sono un riferimento diagnostico, MAI una tabella
//     di ricerca.
//
// Cosa NON dimostra: che il motore funzioni su CTE mai viste. Quella prova e'
// data dai documenti "holdout" e "fornitore_nuovo" nel report di regressione.

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { PERCORSI, leggiJSON } from "./util.mjs";

const SUFFISSI = /\b(s\.?\s?p\.?\s?a\.?|s\.?\s?r\.?\s?l\.?\s?s?\.?|s\.?\s?a\.?\s?s\.?|s\.?\s?n\.?\s?c\.?|spa|srl|group|energia|energy|luce|gas|italia|servizi|trading|vendita|mercato|libero)\b/gi;

function tokenSignificativi(nome) {
  return String(nome)
    .replace(SUFFISSI, " ")
    .split(/[^A-Za-zÀ-ÿ0-9]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 4);
}

export function elencoFornitoriNoti() {
  const nomi = new Set();
  const manifest = join(PERCORSI.cte, "MANIFEST.json");
  if (existsSync(manifest)) {
    for (const d of leggiJSON(manifest).documenti || []) if (d.fornitore_dichiarato) nomi.add(d.fornitore_dichiarato);
  }
  const txt = join(PERCORSI.riferimento, "fornitori-noti.txt");
  if (existsSync(txt)) {
    for (const riga of readFileSync(txt, "utf8").split(/\r?\n/)) {
      const r = riga.trim();
      if (r && !r.startsWith("#")) nomi.add(r);
    }
  }
  return [...nomi];
}

function eccezioni() {
  const f = join(PERCORSI.riferimento, "universalita-eccezioni.json");
  return existsSync(f) ? leggiJSON(f).eccezioni || [] : [];
}

/**
 * @param sorgenti { nomeFile: codice }  codice del parser da ispezionare
 */
export function controllaUniversalita(sorgenti) {
  const violazioni = [];
  const avvisi = [];
  const fornitori = elencoFornitoriNoti();
  const ecc = eccezioni();

  if (!fornitori.length) {
    avvisi.push("Elenco fornitori vuoto: il controllo dei nomi non e' ancora significativo (aggiungere documenti al MANIFEST o nomi in riferimento/fornitori-noti.txt).");
  }

  const VAR = "(?:fornitore|fornitoreRilevato|nomeFornitore|supplier)";
  const DIRAMAZIONE = [
    new RegExp("\\b" + VAR + "\\b\\s*(?:===?|!==?)\\s*[\"'`]"),
    new RegExp("[\"'`]\\s*(?:===?|!==?)\\s*\\b" + VAR + "\\b"),
    new RegExp("\\.test\\(\\s*" + VAR + "\\b"),
    new RegExp("\\b" + VAR + "\\b(?:\\s*\\.\\s*toLowerCase\\(\\))?\\s*\\.\\s*(?:includes|startsWith|endsWith|match|indexOf|search)\\("),
    new RegExp("switch\\s*\\(\\s*" + VAR + "\\b"),
    new RegExp("\\[\\s*" + VAR + "(?:\\.toLowerCase\\(\\))?\\s*\\]"),
  ];
  const CONDIZIONE = /\bif\s*\(|\belse\s+if\b|\bswitch\s*\(|\bcase\b|\?[^?:]*:|\.test\(/;
  const menzioni = [];

  for (const [file, codice] of Object.entries(sorgenti)) {
    codice.split("\n").forEach((riga, i) => {
      const pulita = riga.trim();
      const commento = /^(\/\/|\/?\*)/.test(pulita);
      const rif = { file, riga: i + 1, testo: pulita.slice(0, 160) };

      if (!commento && /\bcte_offerte\b|supabaseClient|\.from\(\s*["']/.test(riga)) {
        violazioni.push({ ...rif, tipo: "accesso_dati", motivo: "Il parser non deve leggere cte_offerte/Supabase: i record sono solo riferimento diagnostico." });
      }
      if (!commento && DIRAMAZIONE.some((re) => re.test(riga))) {
        violazioni.push({ ...rif, tipo: "diramazione_per_fornitore", motivo: "La logica cambia in base all'identita' del fornitore (regola 1)." });
      }
      for (const nome of fornitori) {
        for (const tok of tokenSignificativi(nome)) {
          const re = new RegExp("(^|[^A-Za-zÀ-ÿ0-9])" + tok.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "($|[^A-Za-zÀ-ÿ0-9])", "i");
          if (!re.test(riga)) continue;
          const ammessa = ecc.some((e) => e.token && e.token.toLowerCase() === tok.toLowerCase() && e.file === file);
          if (!commento && CONDIZIONE.test(riga) && !ammessa) {
            violazioni.push({ ...rif, tipo: "condizione_con_nome_noto", token: tok, fornitore: nome, motivo: "Nome di fornitore dentro una condizione di parsing (regola 1)." });
          } else {
            menzioni.push({ ...rif, tipo: "menzione_nome", token: tok, fornitore: nome, motivo: ammessa ? "Eccezione dichiarata" : "Nome presente fuori da condizioni: verificare a mano che serva solo a riconoscere il fornitore." });
          }
        }
      }
    });
  }
  return { fornitori_controllati: fornitori.length, violazioni, menzioni, avvisi };
}
