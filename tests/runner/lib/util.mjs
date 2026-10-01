// Utilita' comuni del runner. Nessun accesso di scrittura ai file dell'app.
import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const qui = dirname(fileURLToPath(import.meta.url));

export const PERCORSI = {
  repo: resolve(qui, "../../.."),
  tests: resolve(qui, "../.."),
  cte: resolve(qui, "../../cte"),
  unit: resolve(qui, "../../unit"),
  schema: resolve(qui, "../../schema"),
  riferimento: resolve(qui, "../../riferimento"),
  report: resolve(qui, "../report"),
};

export function leggiJSON(percorso) {
  return JSON.parse(readFileSync(percorso, "utf8"));
}

export function sha256Buffer(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

export function sha256File(percorso) {
  return sha256Buffer(readFileSync(percorso));
}

export function commitCorrente() {
  try {
    return execSync("git rev-parse --short HEAD", { cwd: PERCORSI.repo }).toString().trim();
  } catch {
    return "sconosciuto";
  }
}

export function esiste(p) {
  return existsSync(p);
}

export function percorsoRepo(...parti) {
  return join(PERCORSI.repo, ...parti);
}

/** Import opzionale: restituisce null se il pacchetto non e' installato. */
export async function importOpzionale(nome) {
  try {
    return await import(nome);
  } catch {
    return null;
  }
}

export const argomenti = new Set(process.argv.slice(2));
