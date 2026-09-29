/**
 * QA 14 — Guarda dos dados (requisito: o que é lançado dura pelo menos 1 ano)
 *   - política de retenção das cópias automáticas (função pura do GUARDA)
 *   - backup completo com PDFs: exporta, sanea e reimporta
 *   - estado de partida (seed) separado do dado salvo
 * O IndexedDB em si é verificado no navegador (docs/QA.md): Node não tem.
 */
'use strict';

var fs = require('fs');
var path = require('path');
var vm = require('vm');

module.exports = function (t, core, dados) {
  var describe = t.describe, it = t.it, igual = t.igual, verdadeiro = t.verdadeiro, falso = t.falso;

  var RAIZ = path.join(__dirname, '..');
  var ctx = vm.createContext(Object.assign({}, core, {
    UI: { baixarTexto: function () {}, downloadBloqueado: function () { return false; } },
    SEED_INICIAL: dados.seed, console: console
  }));
  ['03_dados.js', '03d_guarda.js'].forEach(function (f) {
    vm.runInContext(fs.readFileSync(path.join(RAIZ, 'webapp', 'js', f), 'utf8'), ctx);
  });
  var GUARDA = vm.runInContext('GUARDA', ctx);
  var DADOS = vm.runInContext('DADOS', ctx);

  /** Uma cópia diária por dia, de `dias` dias atrás até hoje. */
  function diarias(hoje, dias) {
    var lista = [];
    for (var i = 0; i <= dias; i++) {
      var d = core.somarDias(hoje, -i);
      lista.push({ id: 'dia-' + d, tipo: 'diaria', dia: d });
    }
    return lista;
  }

  describe('Retenção das cópias automáticas', function () {

    var HOJE = '2027-09-25';
    var copias = diarias(HOJE, 800);
    var sair = GUARDA.copiasParaApagar(copias, HOJE);
    var ficam = copias.filter(function (c) { return sair.indexOf(c.id) < 0; }).map(function (c) { return c.dia; });

    it('guarda todas as diárias dos últimos 35 dias', function () {
      for (var i = 0; i < 35; i++) verdadeiro(ficam.indexOf(core.somarDias(HOJE, -i)) >= 0, 'dia -' + i);
    });

    it('guarda a primeira de cada mês por 24 meses — cobre mais de 1 ano', function () {
      verdadeiro(ficam.indexOf('2026-10-01') >= 0, 'out/2026, 12 meses atrás');
      verdadeiro(ficam.indexOf('2025-10-01') >= 0, 'out/2025, 24 meses atrás');
    });

    it('descarta o resto (não enche o disco)', function () {
      falso(ficam.indexOf('2026-10-02') >= 0, 'dia 2 de mês antigo sai');
      falso(ficam.indexOf('2025-08-01') >= 0, 'além de 24 meses sai');
      verdadeiro(ficam.length < 35 + 26, 'total enxuto: ' + ficam.length);
    });

    it('cópia de "antes de apagar" fica 400 dias', function () {
      var marcos = [
        { id: 'a', tipo: 'antes-de-apagar', dia: core.somarDias(HOJE, -399) },
        { id: 'b', tipo: 'antes-de-apagar', dia: core.somarDias(HOJE, -401) }
      ];
      var s = GUARDA.copiasParaApagar(marcos, HOJE);
      igual(s.join(','), 'b');
    });

    it('com poucas cópias, nada sai', function () {
      igual(GUARDA.copiasParaApagar(diarias('2026-10-05', 3), '2026-10-05').length, 0);
    });
  });

  describe('Backup completo com PDFs', function () {

    var store = core.criarStoreComSeed(dados.seed, { usuario: 'qa' });
    store.adicionarCirurgia({ status: 'Agendada', data: '2026-10-01', inicioPrev: '07:00', fimPrev: '09:00',
      paciente: 'Ana', procedimento: 'Rinoplastia', anestesista: 'Fabrício Tavares', avaliacaoNec: 'Sim' });
    var uid = store.estado.avaliacoes[0].uid;
    var anexos = [{ meta: { id: 'EX1', uidAvaliacao: uid, idAvaliacao: 'AVP0001', nome: 'hemograma.pdf', tamanho: 9 },
      conteudo: 'JVBERi0xLjQ=' }];

    it('o arquivo leva os PDFs e volta com eles, presos ao mesmo uid', function () {
      var texto = DADOS.exportarJSON(store.estado, anexos);
      var r = DADOS.importarJSON(texto);
      verdadeiro(r.ok);
      igual(r.anexos.length, 1);
      igual(r.anexos[0].meta.uidAvaliacao, uid);
      igual(r.estado.avaliacoes[0].uid, uid, 'o vínculo sobrevive ao backup');
    });

    it('anexo sem uid ou sem conteúdo é descartado na importação', function () {
      var texto = JSON.stringify({ dados: JSON.parse(DADOS.exportarJSON(store.estado)).dados,
        anexos: [{ meta: { id: 'X' }, conteudo: 'a' }, { meta: { id: 'Y', uidAvaliacao: 'u' } }] });
      igual(DADOS.importarJSON(texto).anexos.length, 0);
    });

    it('backup sem PDFs não carrega o campo anexos', function () {
      falso('anexos' in JSON.parse(DADOS.exportarJSON(store.estado)));
    });
  });

  describe('Partida', function () {
    it('sem nada salvo, parte do seed (15 anestesistas e a escala-base)', function () {
      var s = DADOS.estadoDoSeed();
      igual(s.origem, 'seed');
      igual(s.estado.anestesistas.length, 15);
      igual(s.estado.escalaBase.length, 30);
    });
  });
};
