#!/usr/bin/env node
/**
 * ============================================================================
 * gerar_exemplos_qualidade.js — Relatórios de exemplo do módulo de qualidade
 * ============================================================================
 * Monta a demonstração (mesmos dados fictícios da versão online) e grava, na
 * pasta pedida, o que o módulo exporta:
 *
 *   Ficha de qualidade (PDF) .................. um atendimento completo
 *   Relatório do painel (PDF) ................. indicadores, definições e fórmulas
 *   Apresentação (PPTX) ....................... o painel para a reunião
 *   Indicadores (CSV) ......................... agregado por indicador
 *   Atendimentos sem identificação (CSV) ...... uma linha por atendimento
 *
 * É o "exemplo de relatório exportado" da validação: serve para quem aprova o
 * módulo ver, antes de implantar, exatamente o que sai — e para conferir os
 * números do painel contra as fichas.
 *
 * Uso:
 *   node tools/gerar_exemplos_qualidade.js [pasta] [AAAA-MM-DD]
 *     pasta        onde gravar (padrão: saida/exemplos_qualidade)
 *     AAAA-MM-DD   "hoje" da demonstração (padrão: hoje de verdade)
 * ============================================================================
 */
'use strict';

var fs = require('fs');
var path = require('path');
var vm = require('vm');

var RAIZ = path.join(__dirname, '..');
var core = require(path.join(RAIZ, 'core'));
var seed = JSON.parse(fs.readFileSync(path.join(RAIZ, 'data', 'seed.json'), 'utf8'));

var pasta = path.resolve(process.argv[2] || path.join(RAIZ, 'saida', 'exemplos_qualidade'));
var hoje = process.argv[3] || core.hojeISO();
fs.mkdirSync(pasta, { recursive: true });

/* ------------------------------------------------- ambiente de navegador -- */

var baixados = [];
var ctx = vm.createContext(Object.assign({}, core, {
  console: console, Blob: Blob, TextEncoder: TextEncoder, SEED_INICIAL: seed,
  hojeISO: function () { return hoje; },
  UI: {
    info: function () {}, ok: function () {}, erro: function () {},
    baixarTexto: function (nome, conteudo) { baixados.push({ nome: nome, dados: conteudo }); }
  }
}));

['03_dados.js', '03b_pdf.js', '03f_qualidade_pdf.js', '03h_pptx.js', 'demo_online.js'].forEach(function (f) {
  vm.runInContext(fs.readFileSync(path.join(RAIZ, 'webapp', 'js', f), 'utf8'), ctx);
});
var DEMO = vm.runInContext('DEMO', ctx);
var DADOS = vm.runInContext('DADOS', ctx);
var QUALIDADE_PDF = vm.runInContext('QUALIDADE_PDF', ctx);
var PPTX = vm.runInContext('PPTX', ctx);

/* -------------------------------------------------------- a demonstração -- */

var st = core.criarStoreComSeed(seed, { usuario: 'demonstração', horizonte: 'movel', hoje: hoje });
DEMO.popular(st);
var painel = st.painelQualidade({}, { hoje: hoje });

function gravar(nome, dados) {
  var arq = path.join(pasta, nome);
  fs.writeFileSync(arq, dados);
  console.log('  ' + nome + '  (' + Math.round(fs.statSync(arq).size / 1024) + ' KB)');
}

/** Blob -> Buffer (o Blob do Node lê por Promise). */
function bytes(blob) { return blob.arrayBuffer().then(function (b) { return Buffer.from(b); }); }

/** Texto do PDF (só ASCII) -> arquivo. */
function pdf(fonte) { return Buffer.from(fonte, 'latin1'); }

console.log('Gerando exemplos em ' + pasta + '  (hoje = ' + hoje + ')');

// 1) Ficha de um atendimento com evento, revisão e acompanhamentos.
var fichaExemplo = st.fichasQualidade().filter(function (f) {
  return f.eventos.length && f.revisao.revisadoEm && f.status === core.FICHA_CONCLUIDA;
})[0] || st.fichasQualidade()[0];
var cirExemplo = st.estado.cirurgias.filter(function (c) { return c.id === fichaExemplo.idCirurgia; })[0];
gravar('Ficha de qualidade ' + fichaExemplo.id + ' (exemplo).pdf', pdf(QUALIDADE_PDF.fonteFicha(fichaExemplo, cirExemplo, {
  clinica: st.clinica(), hoje: hoje, estrutura: st.estruturaDoAtendimento(fichaExemplo, cirExemplo)
})));

// 2) Relatório do painel.
gravar('Relatório de indicadores (exemplo).pdf', pdf(QUALIDADE_PDF.fonteRelatorio(painel, { clinica: st.clinica(), anonimo: true })));

// 3) Planilhas.
function csv(matriz) { return '﻿' + DADOS.paraCSV(matriz); }
var tela = null;
// As linhas vêm da própria tela (a mesma função que monta o download).
var telaFonte = fs.readFileSync(path.join(RAIZ, 'webapp', 'js', 'telas', 'painel_qualidade.js'), 'utf8');
var ctxTela = vm.createContext(Object.assign({}, ctx, {
  window: { matchMedia: function () { return { matches: false }; } }, document: {}, TELAS: {},
  COMP: { seletor: function () {}, kpi: function () {}, cabecalhoCartao: function () {}, def: function () {}, abaBtn: function () {} },
  GFX: {}, ANEXOS: {}
}));
ctxTela.UI = Object.assign({}, ctx.UI, { el: function () { return {}; }, icone: function () {}, pct: function (v) { return v + '%'; } });
ctxTela.DADOS = DADOS;
ctxTela.QUALIDADE_PDF = QUALIDADE_PDF;
ctxTela.PPTX = PPTX;
vm.runInContext(telaFonte, ctxTela);
tela = vm.runInContext('TELAS.painel_qualidade', ctxTela);

var appFalso = { store: st, servidor: false, mes: 0, ano: 0 };
gravar('Indicadores (exemplo).csv', Buffer.from(csv(tela.linhasCSV(painel)), 'utf8'));
gravar('Evolução mês a mês (exemplo).csv', Buffer.from(csv(tela.linhasEvolucaoCSV(painel)), 'utf8'));
gravar('Atendimentos sem identificação (exemplo).csv',
  Buffer.from(csv(tela.linhasAtendimentosCSV(appFalso, painel)), 'utf8'));

// 4) Apresentação.
bytes(PPTX.gerar(tela.slidesDoPainel(appFalso, painel), 'Indicadores de qualidade (exemplo)')).then(function (b) {
  gravar('Indicadores de qualidade (exemplo).pptx', b);
  console.log('Pronto.');
}).catch(function (e) { console.error(e); process.exit(1); });
