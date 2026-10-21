import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
const require=createRequire(import.meta.url);
const A=require('../mrf-cte-v11-analisi.js');
const source=readFileSync(new URL('../mrf-cte-v11-analisi.js',import.meta.url),'utf8');
const doc=rows=>({pagine:[{numero:1,righe:rows.map(t=>({testo:t,celle:[{testo:t}]}))}],pagineSenzaTesto:[]});
const dual=require('./cte/documenti/dual-03-righe-di-prova.json');

test('Non effettua rete, salvataggi e non nomina fornitori nel codice',()=>{
  assert.doesNotMatch(source,/\bsupabaseClient\b|\.insert\s*\(|\.upload\s*\(|\bfetch\s*\(|localStorage|XMLHttpRequest|\b(enel|plenitude|edison|sorgenia|eni)\b/i);
  assert.deepEqual(A.CONFIG.campiAttivi,[]);
});

test('Dual 03: riconoscimento entrambe le forniture anche se il vecchio lettore dice luce',()=>{
  const o=A.analizza(dual,'luce');
  assert.equal(o.versione,'1.1.0');
  assert.equal(o.luce.tipoPrezzo.value,'fisso');
  assert.equal(o.gas.tipoPrezzo.value,'fisso');
  assert.equal(o.luce.prezzoListino.value,0.2079);
  assert.equal(o.gas.prezzoListino.value,0.87);
  assert.equal(o.luce.quotaFissa.value,12);
  assert.equal(o.gas.quotaFissa.value,12);
});

test('Dual 03: listino, perdita di rete e promozione sono slot diversi',()=>{
  const o=A.analizza(dual,'dual');
  assert.equal(o.luce.prezzoNettoPerdite.value,0.189);
  assert.equal(o.luce.prezzoScontato.value,0.1455);
  assert.equal(o.gas.prezzoScontato.value,0.61);
  assert.equal(o.luce.prezzoApplicabile.value,0.1455);
  assert.equal(o.gas.prezzoApplicabile.value,0.61);
  assert.equal(o.luce.prezzoListino.candidati[0].perdite,'lordo');
});

test('Dual 03: fasce lordo e netto separate, nessun conflitto fasce',()=>{
  const x=A.analizza(dual,'dual').luce;
  assert.equal(x.fasce.lordo.F1.value,0.2154);
  assert.equal(x.fasce.lordo.F23.value,0.2036);
  assert.equal(x.fasce.netto.F1.value,0.1958);
  assert.equal(x.fasce.netto.F23.value,0.1851);
  assert.equal(x.prezzoListino.status,'rilevato');
});

test('Dual 03: 30% certo, 5% domiciliazione condizionato e non applicato',()=>{
  const o=A.analizza(dual,'dual');
  for(const k of ['luce','gas']) {
    assert.ok(o[k].sconti.some(x=>x.percentuale===30&&!x.condizionato));
    assert.ok(o[k].sconti.some(x=>x.percentuale===5&&x.condizionato));
  }
  assert.equal(o.gas.prezzoApplicabile.value,0.61);
});

test('Luce monoraria senza gas: il gas rimane vuoto',()=>{
  const o=A.analizza(doc(['Energia Elettrica codice offerta L123','Fisso per 12 mesi','Corrispettivo Luce 0,1400 €/kWh','Commercializzazione e Vendita 120 €/anno']),'dual');
  assert.equal(o.luce.prezzoListino.value,0.14);
  assert.equal(o.luce.quotaFissa.value,10);
  assert.equal(o.gas.prezzoListino.value,null);
  assert.equal(o.gas.quotaFissa.value,null);
});

test('Quote comuni senza sezione: non promosse a luce o gas',()=>{
  const o=A.analizza(doc(['Corrispettivo annuo commercializzazione 240 €/anno']),'dual');
  assert.equal(o.luce.quotaFissa.value,null);
  assert.equal(o.gas.quotaFissa.value,null);
  assert.ok(o.avvisi.some(x=>x.includes('privi di commodity')));
});

test('Prezzi diversi sullo stesso slot: null e Da verificare',()=>{
  const o=A.analizza(doc(['Energia Elettrica codice offerta ABC','Corrispettivo Luce 0,14 €/kWh','Corrispettivo Luce 0,15 €/kWh']),'luce');
  assert.equal(o.luce.prezzoListino.value,null);
  assert.equal(o.luce.prezzoListino.status,'da_verificare');
});

test('Ripetizioni identiche: valide come duplice evidenza, non conflitto',()=>{
  const o=A.analizza(doc(['Gas Naturale codice offerta G1','Corrispettivo Gas 0,72 €/Smc','Corrispettivo Gas 0,72 €/Smc']));
  assert.equal(o.gas.prezzoListino.value,0.72);
  assert.equal(o.gas.prezzoListino.candidati.length,2);
});

test('Sconto condizionato senza prova: prezzo applicabile Da verificare',()=>{
  const o=A.analizza(doc(['Gas Naturale codice offerta G1',
    'Corrispettivo Gas 0,75 €/Smc',
    'Sconto Domiciliazione 5% condizionato all\u0027addebito SEPA',
    'scontato con domiciliazione 0,71 €/Smc']));
  assert.equal(o.gas.prezzoListino.value,0.75);
  assert.equal(o.gas.prezzoScontato.value,0.71);
  assert.equal(o.gas.prezzoApplicabile.value,null);
});

test('Indice PUN+spread, spread non confuso con prezzo fisso',()=>{
  const o=A.analizza(doc(['Energia Elettrica codice offerta V1',
    'Prezzo variabile indicizzato al PUN',
    'Spread PUN + 0,006 €/kWh']));
  assert.equal(o.luce.spread.value,0.006);
  assert.equal(o.luce.indice.value,'PUN');
  assert.equal(o.luce.prezzoListino.value,null);
  assert.equal(o.luce.tipoPrezzo.value,'variabile');
});

test('Indice PSV + spread e zero esplicito riconosciuto',()=>{
  const o=A.analizza(doc(['Gas Naturale codice offerta V1',
    'Prezzo variabile indicizzato al PSV',
    'Spread PSV + 0,000 €/Smc']));
  assert.equal(o.gas.spread.value,0);
  assert.equal(o.gas.indice.value,'PSV');
  assert.equal(o.gas.tipoPrezzo.value,'variabile');
});

test('In caso di impossibilita lettura, restituire errore e nessuna eccezione alla pagina', async()=>{
  const r=await A.arricchisciOmbra({}, {commodity:'dual'}, {leggiFile:async()=>{throw Error('PDF protetto');}});
  assert.match(r.lettoreUniversaleCTE.errore,/protetto/);
  assert.deepEqual(r.lettoreUniversaleCTE.campiAttivi,[]);
});

test('Modalita ombra: lascia invariato l\u0027oggetto del motore attuale',async()=>{
  const originale={commodity:'luce',classificazionePrezzoFissoCTE:{luce:{valore:9}}};
  const copia=JSON.stringify(originale);
  const r=await A.arricchisciOmbra({name:'test.pdf'},originale,{leggiFile:async()=>dual});
  assert.equal(JSON.stringify(originale),copia);
  assert.equal(r.lettoreUniversaleCTE.risultato.luce.prezzoListino.value,0.2079);
  assert.deepEqual(Object.keys(r),['lettoreUniversaleCTE']);
});

test('Quota POD/anno e PDR/anno identificano correttamente la materia prima',()=>{
  const o=A.analizza(doc(['Corrispettivo annuo commercializzazione 144 €/POD/anno',
    'Corrispettivo annuo commercializzazione 96 €/PDR/anno']),'dual');
  assert.equal(o.luce.quotaFissa.value,12);
  assert.equal(o.gas.quotaFissa.value,8);
});

test('Due quote affiancate senza intestazione affidabile non vengono attribuite',()=>{
  const o=A.analizza(doc(['Energia Elettrica codice offerta ABC',
    'Commercializzazione | 120 €/anno | 240 €/anno']),'dual');
  assert.equal(o.luce.quotaFissa.value,null);
  assert.equal(o.gas.quotaFissa.value,null);
  assert.ok(o.diagnostica.nonClassificati.some(x=>x.commodity_fonte==='ambiguo_colonne'));
});

test('Separatore di cella non impedisce il riconoscimento del titolo gas',()=>{
  assert.equal(A.identificaZona('Gas Naturale | codice offerta 123','luce'),'gas');
  assert.equal(A.identificaZona('Gas Naturale | 0,00% 44,57%','luce'),'luce');
});
