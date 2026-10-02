/**
 * ============================================================================
 * 11B_LOG_ARQUIVO — Arquivo mensal e limpeza do LOG (regras puras)
 * ============================================================================
 * O LOG de auditoria cresce para sempre dentro do estado, e todo computador da
 * clínica o baixa a cada recarga. A regra para ele não pesar e, ao mesmo tempo, não
 * perder a prova de quem fez o quê:
 *
 *   1. TODO MÊS, o mês fechado vira um ARQUIVO (JSON por linha, comprimido), com o
 *      código SHA-256 do conteúdo. É o backup mensal do log.
 *   2. A TELA guarda só os últimos `mesesNaTela` meses (padrão 6). O que é mais
 *      antigo sai da tela, e SÓ DEPOIS de o arquivo estar gravado e conferido.
 *   3. O ARQUIVO é guardado por `anosDeGuarda` anos (padrão 5; 0 = nunca apagar sozinho).
 *      Prontuário e dinheiro têm prazo de guarda legal que não é do sistema decidir:
 *      o Anestesista chefe ajusta, com o jurídico.
 *
 * Este arquivo só tem as contas (quais meses, qual corte, que texto). Quem escreve
 * no disco é server/auditoria.js; quem tira as linhas do estado é a operação
 * `arquivarLogAte` do store (a única que remove linha do LOG, e deixa uma linha
 * "LOG ARQUIVADO" no lugar). Os dois tipos de log têm a mesma regra:
 *   alteracoes  as alterações críticas (estado.log)
 *   acessos     entradas, saídas, recusas, backups, exames… (server/auditoria.js)
 * ============================================================================
 */

var LOG_PADRAO = { mesesNaTela: 6, anosDeGuarda: 5 };
var LOG_LIMITES = {
  mesesNaTela: { min: 1, max: 36 },
  anosDeGuarda: { min: 0, max: 30 }
};
var TIPOS_DE_LOG = ['alteracoes', 'acessos'];

function inteiroNaFaixa(v, faixa) {
  if (v === null || v === undefined || v === '' || typeof v === 'boolean') return null;
  var n = Number(v);
  return isFinite(n) && Math.floor(n) === n && n >= faixa.min && n <= faixa.max ? n : null;
}

/** Configuração do log lida de qualquer entrada: valor fora da faixa volta ao padrão. */
function lerConfigLog(cfg) {
  cfg = cfg && typeof cfg === 'object' ? cfg : {};
  var m = inteiroNaFaixa(cfg.mesesNaTela, LOG_LIMITES.mesesNaTela);
  var a = inteiroNaFaixa(cfg.anosDeGuarda, LOG_LIMITES.anosDeGuarda);
  return {
    mesesNaTela: m === null ? LOG_PADRAO.mesesNaTela : m,
    anosDeGuarda: a === null ? LOG_PADRAO.anosDeGuarda : a
  };
}

/** 'YYYY-MM' ± n meses. */
function somarMesesAoMes(mes, n) {
  var a = Number(String(mes).slice(0, 4));
  var m = Number(String(mes).slice(5, 7)) - 1 + Number(n);
  a += Math.floor(m / 12);
  m = ((m % 12) + 12) % 12;
  return a + '-' + pad2(m + 1);
}

/** Mês ('YYYY-MM') de um carimbo 'YYYY-MM-DD HH:MM:SS'; '' se não for um carimbo de verdade. */
function mesDoLog(quando) {
  var dia = String(quando === null || quando === undefined ? '' : quando).slice(0, 10);
  return dataValida(dia) && /^\d{4}-\d{2}-\d{2}$/.test(dia) ? dia.slice(0, 7) : '';
}

/**
 * Agrupa entradas pelo mês. Entrada sem carimbo válido vai para `semData`: ela nunca é
 * arquivada nem tirada da tela (não dá para provar a que mês pertence).
 */
function agruparLogPorMes(entradas) {
  var meses = {}, semData = [];
  (entradas || []).forEach(function (e) {
    var mes = mesDoLog(e && e.quando);
    if (!mes) { semData.push(e); return; }
    (meses[mes] = meses[mes] || []).push(e);
  });
  return { meses: meses, semData: semData };
}

/**
 * O mês já pode virar arquivo? Só depois de fechar e de passar mais um dia: o servidor
 * aceita comando com a hora até 5 minutos fora da dele, então nos primeiros minutos do mês
 * novo ainda pode chegar uma entrada carimbada no mês que acabou.
 */
function mesFechadoParaArquivo(mes, hoje) {
  var h = paraData(hoje);
  if (!h || !/^\d{4}-\d{2}$/.test(mes)) return false;
  return h >= somarDias(somarMesesAoMes(mes, 1) + '-01', 1);
}

/** Primeiro dia que PERMANECE na tela: o que for anterior a ele pode sair (depois de arquivado). */
function corteDaTela(hoje, mesesNaTela) {
  return somarMesesAoMes(paraData(hoje).slice(0, 7), -Number(mesesNaTela)) + '-01';
}

/** Os meses cujo arquivo já passou do prazo de guarda (anosDeGuarda 0 = nenhum). */
function mesesDeArquivoParaApagar(meses, hoje, anosDeGuarda) {
  if (!anosDeGuarda) return [];
  var limite = somarMesesAoMes(paraData(hoje).slice(0, 7), -12 * Number(anosDeGuarda));
  return (meses || []).filter(function (m) { return m < limite; });
}

/** O texto do arquivo: uma entrada por linha, com as chaves em ordem (o mesmo dado dá sempre o mesmo texto). */
function textoDoArquivoDeLog(entradas) {
  return (entradas || []).map(function (e) { return jsonCanonico(e) + '\n'; }).join('');
}

/** O contrário: { entradas, invalidas } (linha que não lê não derruba a leitura, mas é contada). */
function entradasDoTextoDeLog(texto) {
  var entradas = [], invalidas = 0;
  String(texto || '').split('\n').forEach(function (linha) {
    if (!linha.trim()) return;
    try {
      var v = JSON.parse(linha);
      if (v && typeof v === 'object' && !Array.isArray(v)) entradas.push(v); else invalidas++;
    } catch (e) { invalidas++; }
  });
  return { entradas: entradas, invalidas: invalidas };
}

/** 'alteracoes' + '2026-09' (+ parte 2) -> 'alteracoes_2026-09_p2.jsonl.gz'. */
function nomeDoArquivoDeLog(tipo, mes, parte) {
  return tipo + '_' + mes + (parte > 1 ? '_p' + parte : '') + '.jsonl.gz';
}

/** O contrário: { tipo, mes, parte } ou null para nome que não é de arquivo de log. */
function lerNomeDoArquivoDeLog(nome) {
  var m = /^(alteracoes|acessos)_(\d{4}-\d{2})(?:_p(\d+))?\.jsonl\.gz$/.exec(String(nome || ''));
  return m ? { tipo: m[1], mes: m[2], parte: m[3] ? Number(m[3]) : 1 } : null;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    LOG_PADRAO: LOG_PADRAO, LOG_LIMITES: LOG_LIMITES, TIPOS_DE_LOG: TIPOS_DE_LOG,
    lerConfigLog: lerConfigLog, inteiroNaFaixa: inteiroNaFaixa, somarMesesAoMes: somarMesesAoMes, mesDoLog: mesDoLog,
    agruparLogPorMes: agruparLogPorMes, mesFechadoParaArquivo: mesFechadoParaArquivo,
    corteDaTela: corteDaTela, mesesDeArquivoParaApagar: mesesDeArquivoParaApagar,
    textoDoArquivoDeLog: textoDoArquivoDeLog, entradasDoTextoDeLog: entradasDoTextoDeLog,
    nomeDoArquivoDeLog: nomeDoArquivoDeLog, lerNomeDoArquivoDeLog: lerNomeDoArquivoDeLog
  };
}
