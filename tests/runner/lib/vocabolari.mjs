// Vocabolari controllati usati dai casi di test e dallo schema expected.
// Un valore fuori da questi elenchi e' un errore del MATERIALE DI TEST
// (sezione A del report), non del parser.

export const INDICI = ["PUN", "PSV", "TTF", "ALTRO"];

// Varianti dell'indice (regola 7): PUN Index GME, PUN medio mensile, PUN per
// fascia, PSV Day Ahead, PSV mensile.
export const VARIANTI_INDICE = ["index_gme", "medio_mensile", "per_fascia", "day_ahead", "mensile"];

// Riferimento della quota fissa: per punto di prelievo (luce) o di riconsegna (gas).
export const RIFERIMENTI_FORNITURA = ["POD", "PDR"];
