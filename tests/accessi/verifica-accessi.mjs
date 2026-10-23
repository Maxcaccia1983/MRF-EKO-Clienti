#!/usr/bin/env node
// MRF EKO - Prove di accesso EFFETTIVE a Supabase (sola lettura).
//
// Diverse dalle query di configurazione gia' eseguite nel SQL Editor: qui si
// prova davvero cosa ottiene ciascun profilo attraverso la stessa API usata
// dall'app, con la chiave publishable presente in index.html.
//
// Profili:
//   visitatore       sempre (solo chiave publishable)
//   non_admin        se MRF_TEST_NONADMIN_EMAIL e MRF_TEST_NONADMIN_PASSWORD
//   admin            se MRF_TEST_ADMIN_EMAIL e MRF_TEST_ADMIN_PASSWORD
// Opzionale: MRF_TEST_STORAGE_PATH = percorso di un PDF esistente nel bucket
//            cte-mrf (serve per la prova di download).
//
// SOLO LETTURA: nessuna INSERT, UPDATE, DELETE, upload o modifica di policy.
// Le prove di scrittura negativa sono volutamente escluse (vedi PIANO_PROVE_ACCESSO.md).
// Le credenziali si passano come variabili d'ambiente e non vengono mai
// stampate ne' salvate. Il token viene revocato (logout) alla fine.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const qui = dirname(fileURLToPath(import.meta.url));
const index = readFileSync(join(qui, "../../index.html"), "utf8");
const URL_BASE = process.env.SUPABASE_URL || (index.match(/SUPABASE_URL\s*=\s*"([^"]+)"/) || [])[1];
const CHIAVE = process.env.SUPABASE_PUBLISHABLE_KEY || (index.match(/SUPABASE_PUBLISHABLE_KEY\s*=\s*"([^"]+)"/) || [])[1];
const BUCKET = "cte-mrf";
const PATH_STORAGE = process.env.MRF_TEST_STORAGE_PATH || null;

if (!URL_BASE || !CHIAVE) {
  console.error("URL o chiave publishable non trovati.");
  process.exit(2);
}

const esiti = [];
function registra(profilo, prova, atteso, ottenuto, ok) {
  esiti.push({ profilo, prova, atteso, ottenuto, esito: ok === null ? "SALTATA" : ok ? "OK" : "PROBLEMA" });
}

async function richiesta(percorso, { metodo = "GET", token = null, corpo = null, header = {} } = {}) {
  const h = { apikey: CHIAVE, Authorization: "Bearer " + (token || CHIAVE), ...header };
  if (corpo) h["Content-Type"] = "application/json";
  const r = await fetch(URL_BASE + percorso, { method: metodo, headers: h, body: corpo ? JSON.stringify(corpo) : undefined });
  let dati = null;
  const testo = await r.text();
  try { dati = JSON.parse(testo); } catch { dati = testo.slice(0, 200); }
  return { stato: r.status, dati, contentRange: r.headers.get("content-range") };
}

async function login(email, password) {
  const r = await richiesta("/auth/v1/token?grant_type=password", { metodo: "POST", corpo: { email, password } });
  if (r.stato !== 200 || !r.dati.access_token) throw new Error("login fallito (HTTP " + r.stato + ")");
  return { token: r.dati.access_token, userId: r.dati.user && r.dati.user.id };
}

async function logout(token) {
  try { await richiesta("/auth/v1/logout", { metodo: "POST", token }); } catch { /* ignora */ }
}

const righe = (r) => (Array.isArray(r.dati) ? r.dati.length : null);
const negato = (r) => r.stato >= 400 || (Array.isArray(r.dati) && r.dati.length === 0);

async function proveComuniNonAdmin(profilo, token) {
  const cte = await richiesta("/rest/v1/cte_offerte?select=id&limit=1", { token });
  registra(profilo, "Lettura cte_offerte", "0 righe o accesso negato", `HTTP ${cte.stato}, righe ${righe(cte)}`, negato(cte));

  const adm = await richiesta("/rest/v1/admin_users?select=user_id", { token });
  registra(profilo, "Lettura admin_users", "0 righe o accesso negato", `HTTP ${adm.stato}, righe ${righe(adm)}`, negato(adm));

  const lista = await richiesta(`/storage/v1/object/list/${BUCKET}`, { metodo: "POST", token, corpo: { prefix: "", limit: 5 } });
  registra(profilo, "Elenco file bucket cte-mrf", "0 file o accesso negato", `HTTP ${lista.stato}, elementi ${righe(lista)}`, negato(lista));

  if (PATH_STORAGE) {
    const dl = await richiesta(`/storage/v1/object/authenticated/${BUCKET}/${encodeURI(PATH_STORAGE)}`, { token });
    registra(profilo, "Download PDF autenticato", "negato (4xx)", `HTTP ${dl.stato}`, dl.stato >= 400);
  } else {
    registra(profilo, "Download PDF autenticato", "negato (4xx)", "MRF_TEST_STORAGE_PATH non impostato", null);
  }
}

async function main() {
  console.log(`Prove di accesso su ${URL_BASE} (sola lettura)\n`);

  // Bucket pubblico? Deve fallire per chiunque.
  if (PATH_STORAGE) {
    const pub = await richiesta(`/storage/v1/object/public/${BUCKET}/${encodeURI(PATH_STORAGE)}`);
    registra("chiunque", "URL pubblico del PDF", "negato (bucket privato)", `HTTP ${pub.stato}`, pub.stato >= 400);
  }

  // 1. Visitatore
  await proveComuniNonAdmin("visitatore", null);

  // 2. Autenticato non admin
  if (process.env.MRF_TEST_NONADMIN_EMAIL && process.env.MRF_TEST_NONADMIN_PASSWORD) {
    const s = await login(process.env.MRF_TEST_NONADMIN_EMAIL, process.env.MRF_TEST_NONADMIN_PASSWORD);
    try { await proveComuniNonAdmin("non_admin", s.token); } finally { await logout(s.token); }
  } else {
    registra("non_admin", "Tutte le prove", "-", "credenziali di test non fornite", null);
  }

  // 3. Admin (solo letture)
  if (process.env.MRF_TEST_ADMIN_EMAIL && process.env.MRF_TEST_ADMIN_PASSWORD) {
    const s = await login(process.env.MRF_TEST_ADMIN_EMAIL, process.env.MRF_TEST_ADMIN_PASSWORD);
    try {
      const cnt = await richiesta("/rest/v1/cte_offerte?select=id", { token: s.token, metodo: "HEAD", header: { Prefer: "count=exact", Range: "0-0" } });
      const totale = cnt.contentRange ? Number(cnt.contentRange.split("/")[1]) : null;
      registra("admin", "Conteggio cte_offerte", "> 0 (attesi 78)", `HTTP ${cnt.stato}, totale ${totale}`, cnt.stato < 400 && totale > 0);

      const adm = await richiesta("/rest/v1/admin_users?select=user_id", { token: s.token });
      const soloPropria = Array.isArray(adm.dati) && adm.dati.length === 1 && adm.dati[0].user_id === s.userId;
      registra("admin", "Lettura admin_users", "solo la propria riga", `HTTP ${adm.stato}, righe ${righe(adm)}`, soloPropria);

      const lista = await richiesta(`/storage/v1/object/list/${BUCKET}`, { metodo: "POST", token: s.token, corpo: { prefix: "", limit: 5 } });
      registra("admin", "Elenco file bucket cte-mrf", "consentito", `HTTP ${lista.stato}`, lista.stato < 400);

      if (PATH_STORAGE) {
        const dl = await richiesta(`/storage/v1/object/authenticated/${BUCKET}/${encodeURI(PATH_STORAGE)}`, { token: s.token });
        registra("admin", "Download PDF autenticato", "consentito", `HTTP ${dl.stato}`, dl.stato < 400);
      }
    } finally {
      await logout(s.token);
    }
  } else {
    registra("admin", "Tutte le prove", "-", "credenziali di test non fornite", null);
  }

  console.table(esiti);
  const problemi = esiti.filter((e) => e.esito === "PROBLEMA").length;
  console.log(problemi ? `\n${problemi} PROBLEMI rilevati.` : "\nNessun problema rilevato nelle prove eseguite.");
  process.exit(problemi ? 1 : 0);
}

main().catch((e) => {
  console.error("Errore:", e.message);
  process.exit(2);
});
