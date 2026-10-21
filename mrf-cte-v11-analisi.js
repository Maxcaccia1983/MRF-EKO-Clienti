/*
 * MRF EKO — Analisi economica universale 1.1.0, MODULO AFFIANCATO.
 * Non sostituisce il lettore v1.0; lavora sui documenti (pagine/righe) gia'
 * costruiti da esso. Nessuna rete, storage, salvataggio, nomi fornitori.
 * Compatibilita' browser/Node. Source evidence conservata nei risultati.
 */
(function (root, factory) {
  'use strict';
  const api = factory();
  root.MRFAnalisiCTE11 = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  const VERSIONE = '1.1.0';
  const CONFIG = { campiAttivi: [] }; // MAI cambiare in modalita' ombra
  const n = v => {
    const t=String(v).replace(/\s/g,'');
    if (t.includes(',') && t.includes('.')) return Number(t.lastIndexOf(',')>t.lastIndexOf('.') ? t.replace(/\./g,'').replace(',','.') : t.replace(/,/g,''));
    if (t.includes(',')) return Number(t.replace(',','.'));
    return Number(t);
  };
  const numeroValido = v => typeof v === 'number' && Number.isFinite(v);
  const normalizza = t => String(t || '').replace(/[⁄∕／]/g, '/').replace(/\s+/g, ' ').trim();
  const basso = t => normalizza(t).toLocaleLowerCase('it');
  const RE_VALORE = /(-?\d+(?:[.,]\d+)?)\s*(c€|€|euro|eur)\s*(?:\/|per|al)\s*(?:(POD|PDR|punto\s+di\s+prelievo|punto\s+di\s+riconsegna)\s*\/\s*)?(kwh|smc|mwh|mese|anno)\b/gi;
  const RE_PERCENTUALE = /\b(?:sconto|riduzione|bonus)[^.%\n]{0,125}?(?:pari\s+al|del|di)?\s*(\d+(?:[.,]\d+)?)\s*%/i;
  const RE_PERCENTUALE_ANTICIPATA = /(\d+(?:[.,]\d+)?)\s*%\s*(?:di\s+)?sconto/i;
  const RE_SCONTO = /\b(sconto|scontato|scontata|scontati|riduzione|bonus)\b/i;
  const RE_QUOTA = /\b(commercializzazione|corrispettivo annuo|quota fissa|corrispettivo mensile|costo fisso|corrispettivo fisso|pcv|ccv)\b/i;
  const RE_PREZZO = /\b(corrispettivo|prezzo|componente energia|materia prima|fee|spread|maggiorazione|scontato)\b/i;
  const RE_ESCLUSIONE = /\b(spesa annua|spesa stimata|fattura tipo|rete e oneri|spesa complessiva|oneri generali|imposte|iva|deposito cauzionale|stima della spesa|trasporto|dispacciamento|accise|gestione contatore|per la distribuzione)\b/i;
  const RE_INDICE = /\b(PUN(?:\s+Index)?|PSV|PSbG|TTF)\b/i;
  const RE_SPREAD = /\b(spread|maggiorazione|fee|margine|costi non coperti dal|corrispettivo aggiuntivo)\b/i;
  const RE_NETTO = /\b(al netto (?:delle |di )?perdite|netto delle perdite|senza perdite)\b/i;
  const RE_LORDO = /\b(include (?:le )?perdite|comprese? (?:le )?perdite|incluse? (?:le )?perdite|comprensiv[oa] (?:delle )?perdite)\b/i;

  function identificaZona(riga, zonaAttiva) {
    const testo = normalizza(riga);
    const t = basso(testo);
    if (!t || t.length > 145 || /(?:€|euro)\s*\//i.test(t)) return zonaAttiva;
    // Titoli di sezione, non semplici riferimenti a luce/gas nel testo.
    const luce = /^(?:(?:di\s+)?energia elettrica(?:\s*(?:\|\s*)?codice\s+offerta|\s*$)|vendita di energia elettrica\s*$|fornitura di energia elettrica\s*$|scheda di confrontabilit[aà].*energia elettrica|offerta a prezzo fisso per la fornitura di energia elettrica\s*$)|\b(?:smart|time|fix|offerta)\s+luce\s+valida\b/i.test(t);
    const gas = /^(?:gas naturale(?:\s*(?:\|\s*)?codice\s+offerta|\s*$)|vendita di gas naturale\s*$|fornitura di gas naturale\s*$|offerta a prezzo fisso per la fornitura di gas\s*$)|\b(?:smart|time|fix|offerta)\s+gas\s+valida\b/i.test(t);
    if (luce !== gas) return luce ? 'luce' : 'gas';
    return zonaAttiva;
  }

  function creaCampoVuoto(stato='non_rilevato', candidati=[]) {
    return { value: null, unit: null, status: stato, candidati };
  }
  function determinaValore(lista, unit) {
    const distinti = [...new Set(lista.map(c => c.valore))];
    if (!lista.length) return creaCampoVuoto();
    if (distinti.length !== 1) return creaCampoVuoto('da_verificare', lista);
    const primo = lista[0];
    return { value: distinti[0], unit, status: 'rilevato', page: primo.pagina,
      source_text: primo.source_text, candidati: lista };
  }

  function estraiCandidati(documento) {
    const candidati=[], sconti=[], diagnostica=[], tipologie=[];
    let zona = null;
    let contestoTitolo = '';
    const sezioniPerPagina = [];
    for (const pagina of documento.pagine || []) {
      let precedente = '';
      const righe = pagina.righe || [];
      const zone = [];
      for (let i=0; i<righe.length; i++) {
        const linea = normalizza(righe[i].testo || (righe[i].celle || []).map(x => x.testo).join(' | '));
        const primaZona = zona;
        zona = identificaZona(linea, zona);
        if (primaZona !== zona) contestoTitolo = linea;
        zone.push(zona);
        // Solo dichiarazioni esplicite di intestazione dell'offerta.
        const fisso = /^(?:fisso\s+per\s+\d+\s+mesi|offerta\s+a\s+prezzo\s+fisso|prezzo\s+fisso\s+per\s+\d+\s+mesi)/i.test(linea);
        const variabile = /^(?:variabile\s+per\s+\d+\s+mesi|offerta\s+a\s+prezzo\s+variabile|prezzo\s+variabile\s+indicizzato)/i.test(linea);
        if(zona && (fisso!==variabile)) tipologie.push({commodity:zona,value:fisso?'fisso':'variabile',pagina:pagina.numero,source_text:linea});
        // La percentuale di sconto e' evidenza separata dal prezzo.
        let percentuale = linea.match(RE_PERCENTUALE) || linea.match(RE_PERCENTUALE_ANTICIPATA);

        if (percentuale && zona) {
          const valore = n(percentuale[1]);
          const condizionato = /\b(?:domiciliazione|addebito|sepa|qualora|condizione che|attivata|mantenuta)\b/i.test(linea);
          const commoditySconto = /\bcorrispettivo luce\b/i.test(linea)?'luce': /\bcorrispettivo gas\b/i.test(linea)?'gas':zona;
          sconti.push({commodity:commoditySconto, percentuale:valore,
            condizionato, stato:condizionato ? 'condizionato_da_verificare' : 'contrattuale',
            pagina:pagina.numero, source_text:linea});
        }
        const testoCandidati = linea.replace(/[|]/g, ' ');
        const tuttiValori=[...testoCandidati.matchAll(RE_VALORE)];
        const quoteRiga=tuttiValori.filter(m=>['mese','anno'].includes(m[4]?.toLowerCase()));
        const quoteAffiancate=quoteRiga.length>1;
        RE_VALORE.lastIndex=0;
        for (const m of tuttiValori) {
          const [intero, num, val, punto, base] = m;
          let valore = n(num);
          if (!numeroValido(valore)) continue;
          if (val.toLowerCase()==='c€') valore/=100;
          const commodityPunto=/^(pod|punto\s+di\s+prelievo)$/i.test(punto||'')?'luce':/^(pdr|punto\s+di\s+riconsegna)$/i.test(punto||'')?'gas':null;
          let commodity = base.toLowerCase()==='kwh'?'luce':base.toLowerCase()==='smc'?'gas':(commodityPunto||zona);
          if(quoteAffiancate && ['anno','mese'].includes(base.toLowerCase()) && !commodityPunto)
            commodity=null; // colonne multiple senza riferimento POD/PDR: non promuovere
          let unit = base.toLowerCase()==='kwh'?'€/kWh':base.toLowerCase()==='smc'?'€/Smc':base.toLowerCase()==='mwh'?'€/MWh':'€/mese';
          if (base.toLowerCase()==='anno') valore/=12;
          if (base.toLowerCase()==='mwh' && commodity==='luce') {valore/=1000;unit='€/kWh';}
          const prefisso = testoCandidati.slice(0,m.index);
          const coda = testoCandidati.slice(m.index+intero.length);
          const label = prefisso.slice(-240);
          const contesto = normalizza(label+' '+coda.slice(0,110));
          const quote = base.toLowerCase()==='mese'||base.toLowerCase()==='anno';
          // Il testo di riga domina: non ereditare una parola 'sconto' da tabelle precedenti.
          const sconto = RE_SCONTO.test(label) || /^\s*(?:prezzo\s+)?scontat/i.test(coda);
          const quota = quote && (RE_QUOTA.test(contesto)||RE_QUOTA.test(precedente));
          const indicizzato = RE_INDICE.test(contesto) && /\+|spread|maggiorazione|fee/i.test(contesto);
          const spread = !quote && (RE_SPREAD.test(contesto)||indicizzato);
          const fasciaMatch = prefisso.slice(-25).match(/\b(F0|F1|F2|F3|F23)\b\s*[:=]?\s*$/i);
          // In frasi lunghe il qualificatore deve essere attribuito al singolo valore.
          const netto = RE_NETTO.test(label) || (RE_NETTO.test(precedente) && /^(?:pari a|(?:F0|F1|F2|F3|F23)\b)/i.test(label.trim()));
          const lordo = !netto && RE_LORDO.test(label);
          let ruolo = quote?'non_classificato': 'prezzo_base';
          if (quota) ruolo='quota_fissa';
          else if (quote) ruolo='non_classificato';
          else if (sconto) ruolo='prezzo_scontato';
          else if (spread) ruolo='spread';
          else if (!RE_PREZZO.test(contesto) && !fasciaMatch) ruolo='non_classificato';
          if (RE_ESCLUSIONE.test(label) && !netto) ruolo='non_classificato';
          if (unit==='€/MWh' && commodity==='gas') ruolo='non_classificato';
          const candidato = {
            commodity, commodity_fonte: ['kwh','smc'].includes(base.toLowerCase())?'unita':commodityPunto?'punto':quoteAffiancate?'ambiguo_colonne':'sezione',
            ruolo, valore:Number(valore.toFixed(7)),unita:unit,
            fascia:fasciaMatch?fasciaMatch[1].toUpperCase():null,
            perdite:netto?'netto':lordo?'lordo':'non_specificato',
            condizione:sconto?(/\b(domiciliazione|sepa|addebito|condizionat)\b/i.test(linea+' '+precedente)?'condizionato':'sconto_dichiarato'):null,
            pagina:pagina.numero, source_text:linea, voce:label.trim(),
            contesto_titolo:contestoTitolo,
            originale:intero
          };
          if (!commodity || ruolo==='non_classificato') diagnostica.push(candidato);
          else candidati.push(candidato);
        }
        if (linea) precedente=linea;
      }
      sezioniPerPagina.push({pagina:pagina.numero,zone:[...new Set(zone.filter(Boolean))]});
    }
    // La descrizione esplicita che il prezzo in tabella INCLUDE le perdite:
    // attribuzione soltanto alle righe di tabella della stessa commodity.
    const includono = new Set();
    let z = null;
    for (const pagina of documento.pagine||[]) for (const r of pagina.righe||[]) {
      const tx=normalizza(r.testo);
      z=identificaZona(tx,z);
      if (/\b(?:inserito|riportato)\s+in\s+tabella\b/i.test(tx) && RE_LORDO.test(tx) && z)
        includono.add(z);
    }
    for (const c of candidati) if (c.ruolo==='prezzo_base'&&c.perdite==='non_specificato' &&
        includono.has(c.commodity) && /\bcorrispettivo (?:luce|energia)\b/i.test(c.voce)) {
      c.perdite='lordo';
      c.perdite_fonte='nota sul corrispettivo in tabella della stessa sezione';
    }
    return {candidati,sconti,diagnostica,sezioniPerPagina,tipologie};
  }

  function analizza(documento, commodityDocumento) {
    const {candidati,sconti,diagnostica,sezioniPerPagina,tipologie}=estraiCandidati(documento);
    const avvisi=[];
    if (documento.pagineSenzaTesto && documento.pagineSenzaTesto.length)
      avvisi.push('Pagine senza testo digitale; OCR non eseguito: '+documento.pagineSenzaTesto.join(', '));
    function perCommodity(commodity) {
      const lista=candidati.filter(x=>x.commodity===commodity);
      const unita=commodity==='luce'?'€/kWh':'€/Smc';
      const prezzo=x=>x.ruolo==='prezzo_base'&&x.unita===unita;
      const base=lista.filter(x=>prezzo(x)&&x.perdite!=='netto'&&!x.fascia);
      const netto=lista.filter(x=>prezzo(x)&&x.perdite==='netto'&&!x.fascia);
      const promozioni=lista.filter(x=>x.ruolo==='prezzo_scontato'&&x.unita===unita);
      const quote=lista.filter(x=>x.ruolo==='quota_fissa'&&x.unita==='€/mese');
      const spread=lista.filter(x=>x.ruolo==='spread'&&x.unita===unita);
      const fasce={lordo:{},netto:{}};
      for (const tipo of ['lordo','netto']) {
        for (const fascia of ['F0','F1','F2','F3','F23']) {
          const gruppo=lista.filter(x=>prezzo(x)&&x.fascia===fascia&&(tipo==='netto'?x.perdite==='netto':x.perdite!=='netto'));
          if (gruppo.length) fasce[tipo][fascia]=determinaValore(gruppo,unita);
        }
      }
      const prezzoListino=determinaValore(base,unita);
      const prezzoNetto=determinaValore(netto,unita);
      const prezzoPromozionale=determinaValore(promozioni,unita);
      const quotaFissa=determinaValore(quote,'€/mese');
      const spreadCampo=determinaValore(spread,unita);
      // Uno spread nullo e' rilevato solo se esplicitamente dichiarato: non inferire 0.
      const scontiCommodity=sconti.filter(x=>x.commodity===commodity);
      const haPrezzo=base.length+netto.length+promozioni.length>0||
        Object.keys(fasce.lordo).length>0||Object.keys(fasce.netto).length>0;
      const indiceCand = [...new Set(spread.map(x=>{
        const found=x.source_text.match(RE_INDICE); return found?found[1].toUpperCase():null;
      }).filter(Boolean))];
      const indice=indiceCand.length===1?{value:indiceCand[0],status:'rilevato'}:creaCampoVuoto(indiceCand.length?'da_verificare':'non_rilevato');
      const tipiDichiarati=[...new Set(tipologie.filter(x=>x.commodity===commodity).map(x=>x.value))];
      const tipoDaDichiarazione=tipiDichiarati.length===1?tipiDichiarati[0]:null;
      const tipoDerivato=haPrezzo&&!indiceCand.length?'fisso':(!haPrezzo&&indiceCand.length?'variabile':null);
      const conflittoTipo=tipiDichiarati.length>1 || (tipoDaDichiarazione && tipoDerivato && tipoDaDichiarazione!==tipoDerivato);
      const tipo=conflittoTipo?null:(tipoDaDichiarazione||tipoDerivato);
      const anomalie=[['prezzo_listino',prezzoListino],['prezzo_netto',prezzoNetto],['prezzo_scontato',prezzoPromozionale],['quota_fissa',quotaFissa],['spread',spreadCampo]];
      for(const [nome,campo] of anomalie) if(campo.status==='da_verificare') avvisi.push(`${commodity}: ${nome} ambiguo; Da verificare`);
      return {
        abilitato:lista.length>0, tipoPrezzo:{value:tipo,status:tipo?'rilevato':'da_verificare',evidenze:tipologie.filter(x=>x.commodity===commodity)},
        indice,prezzoFisso:prezzoListino,prezzoListino,prezzoNettoPerdite:prezzoNetto,
        prezzoScontato:prezzoPromozionale,
        prezzoApplicabile:prezzoPromozionale.value!==null && promozioni.length>0 &&
          promozioni.every(x=>x.condizione==='sconto_dichiarato') && scontiCommodity.some(x=>!x.condizionato)
          ? {...prezzoPromozionale,nota:'Promozione contrattuale; ulteriori sconti condizionati non applicati'}
          : creaCampoVuoto('da_verificare'),
        prezziFasce:fasce.lordo,fasce,fasceIncoerenti:Object.values(fasce.lordo).some(x=>x.status==='da_verificare'),
        quotaFissa,spread:spreadCampo,sconti:scontiCommodity,
        evidenze:lista,
        nonClassificati:diagnostica.filter(x=>x.commodity===commodity)
      };
    }
    const luce=perCommodity('luce');
    const gas=perCommodity('gas');
    if(diagnostica.some(x=>!x.commodity)) avvisi.push('Valori privi di commodity sicura: Da verificare');
    return {versione:VERSIONE,commodityDocumento:commodityDocumento||null,luce,gas,avvisi,
      diagnostica:{candidati,nonClassificati:diagnostica,sezioniPerPagina,tipologie}};
  }

  // Unico punto d'ingresso per la pagina PRIVATA: restituisce un nuovo oggetto
  // diagnostico, senza modificare datiEsistenti e senza attivare il motore.
  async function arricchisciOmbra(file, datiEsistenti, lettoreBase) {
    if (!lettoreBase || typeof lettoreBase.leggiFile !== 'function')
      return {lettoreUniversaleCTE:{versione:VERSIONE,campiAttivi:[],errore:'Lettore PDF base non disponibile'}};
    try {
      const documento = await lettoreBase.leggiFile(file);
      const risultato = analizza(documento,datiEsistenti?.commodity);
      return {lettoreUniversaleCTE:{versione:VERSIONE,campiAttivi:[],risultato,avvisi:risultato.avvisi}};
    } catch(e) {
      return {lettoreUniversaleCTE:{versione:VERSIONE,campiAttivi:[],errore:String(e?.message||e)}};
    }
  }

  function descriviDiagnostica(result) {
    if(result?.lettoreUniversaleCTE?.errore) return 'LETTORE v1.1: Da verificare: '+result.lettoreUniversaleCTE.errore;
    const r=result?.lettoreUniversaleCTE?.risultato||result;
    if(!r||!r.luce||!r.gas)return 'Diagnostica non disponibile';
    const output=['MRF UNIVERSALE 1.1.0 — SOLO OMBRA'];
    for(const k of ['luce','gas']){
      const x=r[k];
      output.push(`${k}: tipo=${x.tipoPrezzo.value??'Da verificare'}, listino=${x.prezzoListino.value??'Da verificare'}, netto_perdite=${x.prezzoNettoPerdite.value??'Da verificare'}, scontato=${x.prezzoScontato.value??'Da verificare'}, quota_mese=${x.quotaFissa.value??'Da verificare'}`);
    }
    output.push(...r.avvisi.map(x=>'ATTENZIONE: '+x));
    return output.join('\n');
  }
  return {VERSIONE,CONFIG,analizza,estraiCandidati,arricchisciOmbra,descriviDiagnostica,identificaZona,determinaValore};
});
