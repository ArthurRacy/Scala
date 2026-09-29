/**
 * QA 10 — Ajustes pedidos pelo grupo
 *   - tipos de cirurgia (TUSS) e o gráfico "cirurgias por tipo"
 *   - comparativo com horas estimadas (os valores em dinheiro saíram da tela)
 *   - dias fixos de cada anestesista, vindos da escala-base
 *   - chave PIX no cadastro, sem quebrar a fidelidade com a planilha
 *   - PDF do termo de consentimento bem formado
 */
'use strict';

var fs = require('fs');
var path = require('path');
var vm = require('vm');

module.exports = function (t, core, dados) {
  var describe = t.describe, it = t.it, igual = t.igual, verdadeiro = t.verdadeiro,
      igualProfundo = t.igualProfundo;

  var seed = dados.seed;

  function novoStore() { return core.criarStoreComSeed(seed, { usuario: 'qa' }); }

  function dadosCirurgia(extra) {
    return Object.assign({
      status: 'Realizada', data: '2026-10-01',
      inicioPrev: '07:00', fimPrev: '10:00',
      inicioReal: '07:00', fimReal: '09:30',
      paciente: 'Paciente', convenio: 'Particular',
      procedimento: 'Mamoplastia de aumento', cirurgiao: 'Dr.',
      anestesista: 'Fabrício Tavares', sala: 'S1',
      avaliacaoNec: 'Não', valor: 1000, pago: 'Não'
    }, extra || {});
  }

  describe('Tipos de cirurgia (TUSS)', function () {

    it('classifica pelos nomes usuais, com e sem acento', function () {
      var casos = {
        'Mamoplastia de aumento': 'Mamoplastia',
        'Mastopexia com prótese': 'Mastopexia',
        'Lipoaspiração de abdome e flancos': 'Lipoaspiração',
        'lipo HD': 'Lipoaspiração',
        'Abdominoplastia + lipo': 'Abdominoplastia',
        'Ritidoplastia': 'Face',
        'Face completa': 'Face completa',
        'Braquioplastia': 'Braquioplastia',
        'Rinoplastia': 'Rinoplastia',
        'Transplante capilar FUE': 'Transplante capilar',
        'Blefaroplastia superior': 'Blefaroplastia'
      };
      Object.keys(casos).forEach(function (p) {
        igual(core.classificarTipoCirurgia(p), casos[p], p);
      });
    });

    it('o código TUSS escrito no texto decide o tipo', function () {
      igual(core.classificarTipoCirurgia('Substituição de prótese mamária (TUSS 30602327)'), 'Mamoplastia');
      igual(core.classificarTipoCirurgia('30501342'), 'Rinoplastia');
    });

    it('texto vazio ou desconhecido vira "Outros"', function () {
      igual(core.classificarTipoCirurgia(''), core.TIPO_CIRURGIA_OUTROS);
      igual(core.classificarTipoCirurgia('Colecistectomia'), core.TIPO_CIRURGIA_OUTROS);
    });

    it('"face" não casa dentro de outra palavra', function () {
      igual(core.classificarTipoCirurgia('Superfaceta'), core.TIPO_CIRURGIA_OUTROS);
    });

    it('toda sugestão da lista é classificada no próprio tipo', function () {
      core.sugestoesProcedimento().forEach(function (s) {
        igual(core.classificarTipoCirurgia(s.valor), s.tipo, s.valor);
      });
    });

    it('os códigos TUSS têm 8 dígitos e não se repetem entre tipos', function () {
      var vistos = {};
      core.TIPOS_CIRURGIA.forEach(function (tp) {
        tp.tuss.forEach(function (x) {
          verdadeiro(/^\d{8}$/.test(x.codigo), x.codigo);
          verdadeiro(!vistos[x.codigo], 'código repetido: ' + x.codigo);
          vistos[x.codigo] = true;
        });
      });
    });

    it('série por tipo conta o mês sem as canceladas, "Outros" por último', function () {
      var store = novoStore();
      store.adicionarCirurgia(dadosCirurgia({ paciente: 'A', procedimento: 'Rinoplastia' }));
      store.adicionarCirurgia(dadosCirurgia({ paciente: 'B', procedimento: 'Rinoplastia',
        inicioPrev: '11:00', fimPrev: '12:00', inicioReal: '', fimReal: '', status: 'Agendada' }));
      store.adicionarCirurgia(dadosCirurgia({ paciente: 'C', procedimento: 'Hérnia',
        inicioPrev: '13:00', fimPrev: '14:00', inicioReal: '13:00', fimReal: '14:00' }));
      store.adicionarCirurgia(dadosCirurgia({ paciente: 'D', procedimento: 'Mamoplastia',
        inicioPrev: '15:00', fimPrev: '16:00', status: 'Cancelada', inicioReal: '', fimReal: '' }));

      var s = store.dashboard(10, 2026).porTipo;
      igualProfundo(s, [{ rotulo: 'Rinoplastia', valor: 2 }, { rotulo: 'Outros', valor: 1 }]);
    });
  });

  describe('Comparativo — produção, sem valores', function () {

    it('traz horas estimadas ao lado das reais', function () {
      var store = novoStore();
      store.adicionarCirurgia(dadosCirurgia());
      var fab = store.comparativo(10, 2026).filter(function (l) {
        return l.anestesista === 'Fabrício Tavares';
      })[0];
      igual(fab.horasEstimadas, 3);
      igual(fab.horasReais, 2.5);
    });

    it('o total de horas estimadas soma em minutos, sem erro de arredondamento', function () {
      var linhas = [];
      for (var i = 0; i < 20; i++) linhas.push({ horasEstimadas: 10 / 60, horasReais: 0 });
      igual(core.totaisComparativo(linhas).horasEstimadas, core.minutosParaHoras(200));
    });
  });

  describe('Cadastro — dias fixos e chave PIX', function () {

    it('cada um dos 15 cai em 2 dias fixos na escala-base da planilha', function () {
      var dias = core.diasFixosPorAnestesista(seed.ESCALA_BASE);
      seed.ANESTESISTAS.forEach(function (a) {
        var d = dias[core.normalizar(a.nome)] || [];
        igual(d.length, 2, a.nome);
      });
    });

    it('os dias saem na ordem da semana', function () {
      var dias = core.diasFixosPorAnestesista(seed.ESCALA_BASE);
      Object.keys(dias).forEach(function (k) {
        var ordem = dias[k].map(function (d) { return core.DOMINIOS.DIA_SEMANA_ESCALA.indexOf(d); });
        igualProfundo(ordem.slice().sort(), ordem, k);
      });
    });

    it('salva e lê a chave PIX', function () {
      var store = novoStore();
      var r = store.salvarAnestesista({ id: 'A06', nome: 'Fabrício Tavares', pix: 'fabricio@exemplo.com' });
      verdadeiro(r.ok, JSON.stringify(r.erros));
      igual(store.estado.anestesistas[5].pix, 'fabricio@exemplo.com');
    });

    it('CHAVE PIX é coluna extra: exporta, mas fica fora da conferência com a planilha', function () {
      verdadeiro(core.schemaCabecalho('ANESTESISTAS').indexOf('CHAVE PIX') >= 0);
      igual(core.schemaCabecalhoPlanilha('ANESTESISTAS').indexOf('CHAVE PIX'), -1);
    });
  });

  describe('Termo de consentimento em PDF', function () {

    var raiz = path.join(__dirname, '..', 'webapp', 'js');
    var ctx = vm.createContext({ dataBR: core.dataBR, normalizar: core.normalizar, Blob: Blob });
    vm.runInContext(fs.readFileSync(path.join(raiz, '03b_pdf.js'), 'utf8') + ';this.PDF=PDF;', ctx);
    vm.runInContext(fs.readFileSync(path.join(raiz, '03c_tcle.js'), 'utf8') + ';this.TCLE=TCLE;', ctx);

    function fonteDoTermo(dadosTermo) {
      // Mesmo caminho do gerar(), mas devolvendo o texto em vez do Blob.
      var original = ctx.PDF.documento;
      var fonte = null;
      ctx.PDF.documento = function (cfg) {
        var d = original(cfg);
        var blob = d.blob;
        d.blob = function (rodape) { fonte = d.fonte(rodape); return blob(rodape); };
        return d;
      };
      try { ctx.TCLE.gerar(dadosTermo); } finally { ctx.PDF.documento = original; }
      return fonte;
    }

    var fonte = fonteDoTermo({
      paciente: 'Maria José (teste)', procedimento: 'Rinoplastia', dataCirurgia: '2026-10-15',
      cirurgiao: 'Dr. Ávila', anestesista: 'Fabrício Tavares', idCirurgia: 'C0001', idAvaliacao: 'AV0001'
    });

    it('é um PDF 1.4 com o arquivo todo em ASCII', function () {
      igual(fonte.slice(0, 8), '%PDF-1.4');
      verdadeiro(/^[\x00-\x7f]*$/.test(fonte), 'byte fora de ASCII quebraria os offsets');
      verdadeiro(/%%EOF\n$/.test(fonte));
    });

    it('a tabela xref aponta para o início de cada objeto', function () {
      var sx = Number(fonte.match(/startxref\n(\d+)/)[1]);
      igual(fonte.slice(sx, sx + 4), 'xref');
      var entradas = fonte.slice(sx).split('\n').filter(function (l) { return /^\d{10} 00000 n $/.test(l); });
      verdadeiro(entradas.length > 4);
      entradas.forEach(function (e, i) {
        var pos = Number(e.slice(0, 10));
        igual(fonte.slice(pos, pos + String(i + 1).length + 6), (i + 1) + ' 0 obj', 'objeto ' + (i + 1));
      });
    });

    it('o /Length de cada fluxo bate com o conteúdo', function () {
      var re = /<< \/Length (\d+) >>\nstream\n/g, m, n = 0;
      while ((m = re.exec(fonte))) {
        var ini = m.index + m[0].length;
        igual(fonte.slice(ini + Number(m[1]), ini + Number(m[1]) + 10), '\nendstream');
        n++;
      }
      verdadeiro(n >= 1);
    });

    it('acentos viram cp1252 em octal e parênteses são escapados', function () {
      igual(ctx.PDF.literal('Ávila (x)'), '(\\301vila \\(x\\))');
      igual(ctx.PDF.literal('—'), '(\\227)');
    });

    it('nome do arquivo sem acento', function () {
      igual(ctx.TCLE.nomeArquivo({ paciente: 'Maria José' }), 'TCLE_anestesia_maria_jose.pdf');
    });
  });
};
