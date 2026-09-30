// Controllo STATICO di universalita' del codice del parser.
//
// Cosa verifica:
//  1. che nel codice del parser non compaiano nomi di fornitori usati come
//     regola (regola inderogabile n. 1);
//  2. che il parser non consulti cte_offerte o Supabase: i 78 record sono un
//     riferimento diagnostico, MAI una tabella di ricerca.
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

  for (const [file, codice] of Object.entries(sorgenti)) {
    const righe = codice.split("\n");
    righe.forEach((riga, i) => {
      if (/\bcte_offerte\b|supabaseClient|\.from\(\s*["']/.test(riga)) {
        violazioni.push({ tipo: "accesso_dati", file, riga: i + 1, testo: riga.trim().slice(0, 160), motivo: "Il parser non deve leggere cte_offerte/Supabase: i record sono solo riferimento diagnostico." });
      }
      for (const nome of fornitori) {
        for (const tok of tokenSignificativi(nome)) {
          const re = new RegExp("(^|[^A-Za-zÀ-ÿ0-9])" + tok.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "($|[^A-Za-zÀ-ÿ0-9])", "i");
          if (re.test(riga)) {
            const ammessa = ecc.some((e) => e.token && e.token.toLowerCase() === tok.toLowerCase() && e.file === file);
            (ammessa ? avvisi : violazioni).push({
              tipo: "nome_fornitore", file, riga: i + 1, token: tok, fornitore: nome,
              testo: riga.trim().slice(0, 160),
              motivo: ammessa ? "Eccezione dichiarata in universalita-eccezioni.json" : "Nome di fornitore nel codice del parser (regola 1).",
            });
          }
        }
      }
    });
  }
  return { fornitori_controllati: fornitori.length, violazioni, avvisi };
}
