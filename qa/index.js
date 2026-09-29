#!/usr/bin/env node
/**
 * ============================================================================
 * qa/index.js — Suíte completa de QA
 * ============================================================================
 *   node qa                 roda tudo
 *   node qa 03              roda só os arquivos cujo nome começa com "03"
 *   node qa rodizio         roda só os arquivos cujo nome contém "rodizio"
 *
 * Sai com código 1 se qualquer teste falhar, para servir de porta de CI.
 * ============================================================================
 */
'use strict';

var fs = require('fs');
var path = require('path');

var t = require('./_runner.js');
var core = require('../core');

/* ------------------------------------------------- dados de referência --- */

function carregarJSON(nome) {
  var caminho = path.join(__dirname, '..', 'data', nome);
  if (!fs.existsSync(caminho)) return null;
  return JSON.parse(fs.readFileSync(caminho, 'utf8'));
}

var dados = {
  seed: carregarJSON('seed.json'),
  escalasRef: carregarJSON('escalas_ref.json'),
  cabecalhos: carregarJSON('cabecalhos_planilha.json')
};

if (!dados.seed) {
  console.error('\nFalta data/seed.json.');
  console.error('Gere com:  python tools/extrair_dados.py "<planilha.xlsx>"\n');
  process.exit(2);
}
if (!dados.escalasRef) {
  console.error('\nFalta data/escalas_ref.json (gabarito das escalas mensais).');
  console.error('Gere com:  python tools/extrair_dados.py "<planilha.xlsx>"\n');
  process.exit(2);
}

/* --------------------------------------------------- seleção de arquivos -- */

var filtro = (process.argv[2] || '').toLowerCase();

var arquivos = fs.readdirSync(__dirname)
  .filter(function (f) { return /\.test\.js$/.test(f); })
  .sort()
  .filter(function (f) { return !filtro || f.toLowerCase().indexOf(filtro) >= 0; });

if (arquivos.length === 0) {
  console.error('Nenhum arquivo de teste casou com "' + filtro + '".');
  process.exit(2);
}

/* ------------------------------------------- fidelidade viva à planilha -- */
/**
 * Roda antes de tudo: se os cabeçalhos do schema divergirem da planilha, os
 * outros testes podem passar e o sistema ainda assim estar desalinhado do
 * arquivo que o grupo usa. Este é o teste que protege contra isso.
 */
if (dados.cabecalhos) {
  t.describe('FIDELIDADE — cabeçalhos do schema x planilha em uso', function () {

    function conferir(rotulo, esperado, obtido) {
      t.it(rotulo, function () {
        t.verdadeiro(obtido, 'aba não encontrada na planilha');
        t.igual(obtido.length, esperado.length, 'quantidade de colunas');
        for (var i = 0; i < esperado.length; i++) {
          t.igual(obtido[i], esperado[i], 'coluna ' + (i + 1));
        }
      });
    }

    ['ANESTESISTAS', 'ESCALA_BASE', 'ESCALA_CONSOLIDADA', 'CIRURGIAS', 'AVALIACOES_PRE', 'LOG']
      .forEach(function (logico) {
        var aba = core.SCHEMA[logico].aba;
        conferir(logico + ' [' + aba + ']', core.schemaCabecalhoPlanilha(logico),
          dados.cabecalhos[aba] && dados.cabecalhos[aba].cabecalho);
      });

    core.CONFIG.MESES_ESCALA.forEach(function (m) {
      conferir('ESCALA_MENSAL [' + m.aba + ']', core.schemaCabecalho('ESCALA_MENSAL'),
        dados.cabecalhos[m.aba] && dados.cabecalhos[m.aba].cabecalho);
    });

    conferir('HORAS (cabeçalho na linha 4)', core.schemaCabecalho('HORAS'),
      dados.cabecalhos['HORAS'] && dados.cabecalhos['HORAS'].linha4);

    conferir('FINANCEIRO ledger (cabeçalho na linha 20)',
      core.SCHEMA.FINANCEIRO.ledger.colunas.map(function (c) { return c.rotulo; }),
      dados.cabecalhos['FINANCEIRO'] && dados.cabecalhos['FINANCEIRO'].linha20);

    conferir('INDICADORES comparativo (cabeçalho na linha 23)',
      core.SCHEMA.INDICADORES.comparativo.colunas.map(function (c) { return c.rotulo; }),
      dados.cabecalhos['INDICADORES'] && dados.cabecalhos['INDICADORES'].linha23);

    /** Rótulos de indicadores, linha a linha na coluna A. */
    function conferirRotulos(rotulo, aba, itens) {
      t.it(rotulo, function () {
        var colA = dados.cabecalhos[aba] && dados.cabecalhos[aba].colunaA;
        t.verdadeiro(colA, 'coluna A não extraída de ' + aba);
        itens.forEach(function (it) {
          t.igual(colA[String(it.linha)], it.rotulo, aba + ' linha ' + it.linha);
        });
      });
    }

    conferirRotulos('FINANCEIRO — rótulos dos indicadores', 'FINANCEIRO', core.SCHEMA.FINANCEIRO.indicadores);
    conferirRotulos('INDICADORES — rótulos dos indicadores', 'INDICADORES', core.SCHEMA.INDICADORES.indicadores);
    conferirRotulos('DASHBOARD — rótulos dos KPIs', 'DASHBOARD', core.SCHEMA.DASHBOARD.kpis);
  });
}

/* ------------------------------------------------------------ execução --- */

arquivos.forEach(function (arquivo) {
  var suite = require(path.join(__dirname, arquivo));
  if (typeof suite !== 'function') {
    throw new Error('O arquivo ' + arquivo + ' deve exportar uma função (t, core, dados).');
  }
  suite(t, core, dados);
});

/* ------------------------------------------------------------ relatório -- */

t.aguardar(20000).then(function () {
  console.log(t.relatorio('QA — ' + core.CONFIG.NOME_SISTEMA + ' v' + core.CONFIG.VERSAO));
  var r = t.resumo();
  process.exit(r.falhou === 0 ? 0 : 1);
});
