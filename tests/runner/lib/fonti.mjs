// Verificabilita' dei valori attesi: ogni campo VERIFICATO e PRESENTE deve indicare
// la pagina e la frase esatta del documento originale (source_text), cosi' che
// chiunque possa ricontrollarlo aprendo il PDF a quella pagina (regola 14).
// Il runner controlla che la frase compaia davvero nel testo del documento, alla pagina dichiarata.
// Il confronto ignora maiuscole, spazi e trattini di sillabazione: pdf.js unisce gli
// elementi di testo con spazi che la frase copiata a mano non ha.

const norm = (t) =>
  String(t || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[­‐-―]/g, "-")
    .replace(/\s+/g, "");

/**
 * @param {object} campo  campo atteso (o elemento di una lista) con source_text e page
 * @param {{pagina:number, testo:string}[]} pagine  testo per pagina del documento
 * @returns {{ok:boolean, problema?:string}}
 */
export function verificaFonte(campo, pagine) {
  if (!campo.source_text) return { ok: false, problema: "campo verificato senza source_text (frase originale)" };
  if (!Number.isInteger(campo.page)) return { ok: false, problema: "campo verificato senza page (pagina del documento)" };
  const frase = norm(campo.source_text);
  if (!frase) return { ok: false, problema: "source_text vuoto" };
  const dichiarata = pagine.find((p) => p.pagina === campo.page);
  if (!dichiarata) return { ok: false, problema: "pagina " + campo.page + " inesistente (il documento ha " + pagine.length + " pagine)" };
  if (norm(dichiarata.testo).includes(frase)) return { ok: true };
  const altra = pagine.find((p) => norm(p.testo).includes(frase));
  if (altra) return { ok: false, problema: "la frase non e' a pagina " + campo.page + " ma a pagina " + altra.pagina };
  return { ok: false, problema: "la frase source_text non compare nel testo del documento" };
}
