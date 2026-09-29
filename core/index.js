/**
 * ============================================================================
 * core/index.js — Carregador único (só usado no Node.js)
 * ============================================================================
 * O core foi escrito num único modelo de runtime: todos os módulos vivem no
 * escopo GLOBAL e se enxergam por nome. É assim que o Google Apps Script
 * funciona (concatena os arquivos por ordem de nome) e é assim que o navegador
 * funciona (uma <script> por arquivo, na ordem).
 *
 * No Node.js cada arquivo teria escopo próprio, e um módulo não veria o outro.
 * Este carregador resolve isso: requer os arquivos NA ORDEM e publica os
 * símbolos de cada um em globalThis antes de carregar o próximo. O resultado é
 * exatamente o mesmo ambiente dos outros dois runtimes — nenhuma divergência
 * de comportamento entre "roda no teste" e "roda na planilha".
 *
 * Uso:  const core = require('./core');   // ou require('../core')
 * ============================================================================
 */
'use strict';

/**
 * Ordem de carga. É a mesma ordem das <script> no webapp e a mesma ordem
 * alfabética que o Apps Script usa — por isso o prefixo numérico nos nomes.
 */
var ARQUIVOS = [
  '00_config.js',
  '01_schema.js',
  '02_util.js',
  '02b_calendario.js',
  '03_dominios.js',
  '04_rodizio.js',
  '05_cirurgias.js',
  '05b_procedimentos.js',
  '06_avaliacoes.js',
  '06b_boletim.js',
  '06c_qualidade.js',
  '06d_estrutura.js',
  '07_horas.js',
  '08_financeiro.js',
  '09_indicadores.js',
  '09b_repasse.js',
  '09c_qualidade_painel.js',
  '10_dashboard.js',
  '10b_retencao.js',
  '11_log.js',
  '12_store.js'
];

var api = {};

ARQUIVOS.forEach(function (arquivo) {
  var exportado;
  try {
    exportado = require('./' + arquivo);
  } catch (e) {
    if (e && e.code === 'MODULE_NOT_FOUND' && String(e.message).indexOf(arquivo) >= 0) {
      // Módulo ainda não escrito: o core carrega o que existe e segue.
      return;
    }
    throw e;
  }
  Object.keys(exportado).forEach(function (chave) {
    globalThis[chave] = exportado[chave];
    api[chave] = exportado[chave];
  });
});

/** Lista dos arquivos que compõem o core, na ordem de carga. */
api.ARQUIVOS_CORE = ARQUIVOS;

module.exports = api;
