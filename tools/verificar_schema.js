#!/usr/bin/env node
/**
 * ============================================================================
 * verificar_schema.js — Confere o core/01_schema.js contra a planilha real
 * ============================================================================
 * Lê um JSON de cabeçalhos extraído do .xlsx (gerado por tools/extrair_cabecalhos.py)
 * e compara rótulo por rótulo com o SCHEMA. Qualquer divergência de acento,
 * espaço ou parêntese aparece aqui — é a rede de proteção contra "quebrar a
 * planilha" ao mexer no código.
 *
 *   node tools/verificar_schema.js <cabecalhos.json>
 * ============================================================================
 */
'use strict';

var fs = require('fs');
var path = require('path');
var { CONFIG } = require('../core/00_config.js');
var { SCHEMA, schemaCabecalho, schemaCabecalhoPlanilha } = require('../core/01_schema.js');

var arquivo = process.argv[2] || path.join(__dirname, '..', 'data', 'cabecalhos_planilha.json');
if (!fs.existsSync(arquivo)) {
  console.error('Arquivo de cabeçalhos não encontrado: ' + arquivo);
  console.error('Gere-o com: python tools/extrair_cabecalhos.py <planilha.xlsx>');
  process.exit(2);
}
var real = JSON.parse(fs.readFileSync(arquivo, 'utf8'));

var erros = [];
var ok = [];

/** Compara duas listas de rótulos posição por posição. */
function comparar(contexto, esperado, obtido) {
  if (!obtido) { erros.push(contexto + ': aba ausente na planilha'); return; }
  var n = Math.max(esperado.length, obtido.length);
  var falhas = 0;
  for (var i = 0; i < n; i++) {
    var e = esperado[i] === undefined ? '(ausente)' : esperado[i];
    var o = obtido[i] === undefined ? '(ausente)' : obtido[i];
    if (e !== o) {
      erros.push(contexto + ' col ' + (i + 1) + ': schema=' + JSON.stringify(e) + ' planilha=' + JSON.stringify(o));
      falhas++;
    }
  }
  if (!falhas) ok.push(contexto + ' (' + esperado.length + ' colunas)');
}

/* --- Abas tabulares simples --------------------------------------------- */
['ANESTESISTAS', 'ESCALA_BASE', 'ESCALA_CONSOLIDADA', 'CIRURGIAS', 'AVALIACOES_PRE', 'LOG']
  .forEach(function (logico) {
    var aba = SCHEMA[logico].aba;
    comparar(logico + ' [' + aba + ']', schemaCabecalhoPlanilha(logico), real[aba] && real[aba].cabecalho);
  });

/* --- As três escalas mensais compartilham um só cabeçalho --------------- */
CONFIG.MESES_ESCALA.forEach(function (m) {
  comparar('ESCALA_MENSAL [' + m.aba + ']', schemaCabecalho('ESCALA_MENSAL'), real[m.aba] && real[m.aba].cabecalho);
});

/* --- HORAS: cabeçalho fica na linha 4 ----------------------------------- */
comparar('HORAS [HORAS]', schemaCabecalho('HORAS'), real['HORAS'] && real['HORAS'].linha4);

/* --- FINANCEIRO: ledger na linha 20 ------------------------------------- */
comparar('FINANCEIRO ledger', SCHEMA.FINANCEIRO.ledger.colunas.map(function (c) { return c.rotulo; }),
  real['FINANCEIRO'] && real['FINANCEIRO'].linha20);

/* --- INDICADORES: comparativo na linha 23 ------------------------------- */
comparar('INDICADORES comparativo', SCHEMA.INDICADORES.comparativo.colunas.map(function (c) { return c.rotulo; }),
  real['INDICADORES'] && real['INDICADORES'].linha23);

/* --- Rótulos de indicadores (coluna A, linha a linha) ------------------- */
function compararRotulosLinha(contexto, abaReal, itens) {
  var colA = real[abaReal] && real[abaReal].colunaA;
  if (!colA) { erros.push(contexto + ': coluna A não extraída'); return; }
  var falhas = 0;
  itens.forEach(function (it) {
    var obtido = colA[String(it.linha)];
    if (obtido !== it.rotulo) {
      erros.push(contexto + ' linha ' + it.linha + ': schema=' + JSON.stringify(it.rotulo) + ' planilha=' + JSON.stringify(obtido === undefined ? null : obtido));
      falhas++;
    }
  });
  if (!falhas) ok.push(contexto + ' (' + itens.length + ' rótulos)');
}

compararRotulosLinha('FINANCEIRO indicadores', 'FINANCEIRO', SCHEMA.FINANCEIRO.indicadores);
compararRotulosLinha('INDICADORES indicadores', 'INDICADORES', SCHEMA.INDICADORES.indicadores);
compararRotulosLinha('DASHBOARD kpis', 'DASHBOARD', SCHEMA.DASHBOARD.kpis);

/* --- Relatório ---------------------------------------------------------- */
console.log('=== VERIFICAÇÃO DE FIDELIDADE: schema x planilha ===\n');
ok.forEach(function (o) { console.log('  OK   ' + o); });
if (erros.length) {
  console.log('\n  ' + erros.length + ' DIVERGÊNCIA(S):');
  erros.forEach(function (e) { console.log('  ERRO ' + e); });
  console.log('\nResultado: FALHOU');
  process.exit(1);
}
console.log('\nResultado: 100% fiel à planilha (' + ok.length + ' blocos conferidos)');
