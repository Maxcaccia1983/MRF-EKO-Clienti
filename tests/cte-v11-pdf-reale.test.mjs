/* Test di collaudo obbligatorio in CI: PDF vero via PDF.js, NON fixture testuale. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
const require=createRequire(import.meta.url);
const A=require('../mrf-cte-v11-analisi.js');
const fileUrl=new URL('./cte/documenti/dual-03.pdf',import.meta.url);
const expected=JSON.parse(readFileSync(new URL('./cte/expected/dual-03.proposta.json',import.meta.url),'utf8'));
const hashAtteso='88c7e16c5738c60cabc94561aa494483daddf9c0628dc3da38b81a5d6eb5638d';
let pdfjs=null,lettore=null;
try {pdfjs=require('pdfjs-dist/legacy/build/pdf.js');lettore=require('../mrf-cte-lettore.js');} catch(e){}
const motivoSalto=!existsSync(fileUrl)?'PDF dual-03 non disponibile':!pdfjs||!lettore?'PDF.js 3.11.174 o lettore originale non installati':null;

// La CI deve fallire invece di nascondere un test saltato.
if(motivoSalto && process.env.RICHIEDI_PDF_REALI==='1') test('Dual 03 deve essere realmente analizzato',()=>assert.fail(motivoSalto));

test('CTE dual-03 letto tramite PDF.js: hash e campi chiave', {skip:motivoSalto||false},async()=>{
  const buffer=readFileSync(fileUrl);
  assert.equal(createHash('sha256').update(buffer).digest('hex'),hashAtteso);
  const pdf=await pdfjs.getDocument({data:new Uint8Array(buffer),verbosity:0,isEvalSupported:false}).promise;
  assert.equal(pdf.numPages,16);
  const documento=await lettore.leggiPdf(pdf);
  const r=A.analizza(documento,'luce');
  assert.equal(r.luce.prezzoListino.value,expected.luce.prezzo_listino_lordo_perdite.valore);
  assert.equal(r.luce.prezzoNettoPerdite.value,expected.luce.prezzo_listino_netto_perdite.valore);
  assert.equal(r.luce.prezzoScontato.value,expected.luce.sconto_special_days.prezzo_dichiarato);
  assert.equal(r.luce.quotaFissa.value,expected.luce.quota_fissa.valore_mensile_euro);
  assert.equal(r.gas.prezzoListino.value,expected.gas.prezzo_listino.valore);
  assert.equal(r.gas.prezzoScontato.value,expected.gas.sconto_special_days.prezzo_dichiarato);
  assert.equal(r.gas.quotaFissa.value,expected.gas.quota_fissa.valore_mensile_euro);
  assert.equal(r.luce.fasce.lordo.F1.value,expected.luce.prezzi_fasce_lordo_perdite.F1);
  assert.equal(r.luce.fasce.lordo.F23.value,expected.luce.prezzi_fasce_lordo_perdite.F23);
  assert.equal(r.luce.fasce.netto.F1.value,expected.luce.prezzi_fasce_netto_perdite.F1);
  assert.equal(r.luce.fasce.netto.F23.value,expected.luce.prezzi_fasce_netto_perdite.F23);
});

// Verifica dell'originale possibile anche senza PDF.js.
test('Impronta SHA-256 originale del facsimile dual-03',()=>{
  assert.equal(createHash('sha256').update(readFileSync(fileUrl)).digest('hex'),hashAtteso);
});
