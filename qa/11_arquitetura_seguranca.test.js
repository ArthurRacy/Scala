/**
 * QA 11 — Arquitetura e segurança
 *   - IDs nunca reaproveitados (o LOG não pode passar a falar de outro registro)
 *   - uid estável da avaliação (prende os PDFs de exame ao paciente certo)
 *   - store: só campos MANUAIS entram; rollback sem clonar o LOG
 *   - fronteira de importação: backup adulterado não injeta campo nem objeto
 *   - CSV sem fórmula ativa (CSV/formula injection)
 *   - estrutura: cada tela e cada módulo do core está carregado na página
 */
'use strict';

var fs = require('fs');
var path = require('path');
var vm = require('vm');

module.exports = function (t, core, dados) {
  var describe = t.describe, it = t.it, igual = t.igual, verdadeiro = t.verdadeiro, falso = t.falso;

  var seed = dados.seed;
  var RAIZ = path.join(__dirname, '..');

  function novoStore() { return core.criarStoreComSeed(seed, { usuario: 'qa' }); }

  function cirurgia(extra) {
    return Object.assign({
      status: 'Agendada', data: '2026-10-01', inicioPrev: '07:00', fimPrev: '09:00',
      paciente: 'Paciente', procedimento: 'Rinoplastia', anestesista: 'Fabrício Tavares',
      avaliacaoNec: 'Sim'
    }, extra || {});
  }

  describe('IDs nunca reaproveitados', function () {

    it('excluir a última cirurgia não devolve o ID para a próxima', function () {
      var store = novoStore();
      store.adicionarCirurgia(cirurgia({ paciente: 'A' }));
      store.adicionarCirurgia(cirurgia({ paciente: 'B', inicioPrev: '10:00', fimPrev: '11:00' }));
      var ultima = store.estado.cirurgias[1].id;
      verdadeiro(store.removerCirurgia(ultima, { comAvaliacoes: true }).ok);
      store.adicionarCirurgia(cirurgia({ paciente: 'C', inicioPrev: '12:00', fimPrev: '13:00' }));
      var nova = store.estado.cirurgias[1].id;
      verdadeiro(nova !== ultima, 'o ID ' + ultima + ' renasceu em outra cirurgia');
    });

    it('o mesmo vale para o ID da avaliação criada em cascata', function () {
      var store = novoStore();
      store.adicionarCirurgia(cirurgia({ paciente: 'A' }));
      var idAval = store.estado.avaliacoes[0].id;
      store.removerCirurgia(store.estado.cirurgias[0].id, { comAvaliacoes: true });
      store.adicionarCirurgia(cirurgia({ paciente: 'B' }));
      verdadeiro(store.estado.avaliacoes[0].id !== idAval, 'ID_AVALIAÇÃO reaproveitado');
    });

    it('a sequência sobrevive a salvar e recarregar (vai no estado)', function () {
      var store = novoStore();
      store.adicionarCirurgia(cirurgia());
      store.removerCirurgia(store.estado.cirurgias[0].id, { comAvaliacoes: true });
      var copia = JSON.parse(JSON.stringify(store.estado));
      var outro = core.criarStore(copia, { usuario: 'qa' });
      outro.recalcular();
      igual(outro.proximoIdCirurgia(), core.CONFIG.PREFIXO_CIRURGIA + '0002');
    });
  });

  describe('uid da avaliação', function () {

    it('toda avaliação nasce com uid, e uids não se repetem', function () {
      var store = novoStore();
      store.adicionarCirurgia(cirurgia({ paciente: 'A' }));
      store.adicionarCirurgia(cirurgia({ paciente: 'B', inicioPrev: '10:00', fimPrev: '11:00' }));
      var u = store.estado.avaliacoes.map(function (a) { return a.uid; });
      igual(u.length, 2);
      verdadeiro(u[0] && u[1] && u[0] !== u[1]);
    });

    it('avaliação antiga sem uid ganha um no recálculo', function () {
      var store = novoStore();
      store.adicionarCirurgia(cirurgia());
      delete store.estado.avaliacoes[0].uid;
      store.recalcular();
      verdadeiro(!!store.estado.avaliacoes[0].uid);
    });

    it('a tela não consegue trocar o uid nem o vínculo', function () {
      var store = novoStore();
      store.adicionarCirurgia(cirurgia());
      var a = store.estado.avaliacoes[0];
      var uid = a.uid, idCir = a.idCirurgia;
      verdadeiro(store.atualizarAvaliacao(a.id, { uid: 'outro', idCirurgia: 'CIR9999', obs: 'ok' }).ok);
      igual(a.uid, uid);
      igual(a.idCirurgia, idCir);
      igual(a.obs, 'ok');
    });

    it('excluir a cirurgia informa as avaliações removidas (para limpar os PDFs)', function () {
      var store = novoStore();
      store.adicionarCirurgia(cirurgia());
      var uid = store.estado.avaliacoes[0].uid;
      var r = store.removerCirurgia(store.estado.cirurgias[0].id, { comAvaliacoes: true });
      igual(r.removidas.length, 1);
      igual(r.removidas[0].uid, uid);
    });
  });

  describe('Store — campos protegidos e rollback', function () {

    it('atualizar não troca o ID da cirurgia', function () {
      var store = novoStore();
      store.adicionarCirurgia(cirurgia({ avaliacaoNec: 'Não' }));
      var id = store.estado.cirurgias[0].id;
      verdadeiro(store.atualizarCirurgia(id, { id: 'CIR0999', paciente: 'Novo' }).ok);
      igual(store.estado.cirurgias[0].id, id);
      igual(store.estado.cirurgias[0].paciente, 'Novo');
    });

    it('campo "(auto)" mandado pela tela é ignorado', function () {
      var store = novoStore();
      store.adicionarCirurgia(cirurgia({ avaliacaoNec: 'Não' }));
      var c = store.estado.cirurgias[0];
      var pos = c.posicao;
      store.atualizarCirurgia(c.id, { posicao: '99', idAnestesista: 'X' });
      igual(c.posicao, pos);
      verdadeiro(c.idAnestesista !== 'X');
    });

    it('"__proto__" vindo de JSON não polui o registro', function () {
      var store = novoStore();
      store.adicionarCirurgia(cirurgia({ avaliacaoNec: 'Não' }));
      var c = store.estado.cirurgias[0];
      var mal = JSON.parse('{"__proto__": {"invadido": true}, "obs": "x"}');
      verdadeiro(store.atualizarCirurgia(c.id, mal).ok);
      igual(c.invadido, undefined);
      igual(({}).invadido, undefined);
    });

    it('transação rejeitada não deixa rastro no estado nem no LOG', function () {
      var store = novoStore();
      store.adicionarCirurgia(cirurgia({ avaliacaoNec: 'Não' }));
      var logAntes = store.estado.log.length;
      var antes = JSON.stringify(store.estado.cirurgias);
      var r = store.transacao(function (st, api) {
        st.cirurgias[0].paciente = 'mudou';
        api.registrar([core.novaEntradaLog({ usuario: 'qa', aba: 'X', campo: 'Y' })]);
        return { ok: false, erros: [{ campo: '', msg: 'não' }] };
      });
      falso(r.ok);
      igual(store.estado.log.length, logAntes);
      igual(JSON.stringify(store.estado.cirurgias), antes);
    });

    it('troca de CHAVE PIX vai para o LOG (rota do dinheiro é auditada)', function () {
      var store = novoStore();
      store.salvarAnestesista({ id: 'A01', pix: 'antiga@x.com' });
      store.salvarAnestesista({ id: 'A01', pix: 'nova@x.com' });
      var ultima = store.estado.log[store.estado.log.length - 1];
      igual(ultima.campo, 'CHAVE PIX');
      igual(ultima.de, 'antiga@x.com');
      igual(ultima.para, 'nova@x.com');
    });

    it('exceção no meio da transação também desfaz', function () {
      var store = novoStore();
      var logAntes = store.estado.log.length;
      var r = store.transacao(function (st, api) {
        api.registrar([core.novaEntradaLog({ usuario: 'qa', aba: 'X', campo: 'Y' })]);
        throw new Error('boom');
      });
      falso(r.ok);
      igual(store.estado.log.length, logAntes);
    });
  });

  /* ------------------------------------------------ camada web (vm) ----- */

  var ctx = vm.createContext(Object.assign({}, core, {
    UI: { baixarTexto: function () {} },
    SEED_INICIAL: null, console: console
  }));
  vm.runInContext(fs.readFileSync(path.join(RAIZ, 'webapp', 'js', '03_dados.js'), 'utf8') + ';this.DADOS=DADOS;', ctx);
  var DADOS = ctx.DADOS;

  describe('Importação — fronteira de confiança', function () {

    function backup(extra) {
      var e = novoStore().estado;
      var o = JSON.parse(JSON.stringify({
        anestesistas: e.anestesistas, escalaBase: e.escalaBase, escalas: e.escalas,
        cirurgias: [{ id: 'CIR0001', paciente: 'Ana', status: 'Agendada', data: '2026-10-01',
          campoEstranho: 'x', obs: { aninhado: true } }],
        avaliacoes: [{ id: 'AVP0001', idCirurgia: 'CIR0001', uid: 'u123' }],
        log: [], config: { escalaBaseAuto: 'sim', lixo: 1 }
      }));
      return Object.assign(o, extra || {});
    }

    it('descarta campo fora do schema e objeto aninhado', function () {
      var r = DADOS.importarJSON(JSON.stringify(backup()));
      verdadeiro(r.ok);
      var c = r.estado.cirurgias[0];
      igual(c.campoEstranho, undefined);
      igual(c.obs, '');
      igual(c.paciente, 'Ana');
    });

    it('mantém o uid interno da avaliação', function () {
      var r = DADOS.importarJSON(JSON.stringify(backup()));
      igual(r.estado.avaliacoes[0].uid, 'u123');
    });

    it('config só aceita valores do tipo certo', function () {
      var r = DADOS.importarJSON(JSON.stringify(backup()));
      igual(r.estado.config.escalaBaseAuto, false, '"sim" (texto) não liga a escala automática');
      igual(r.estado.config.lixo, undefined);
    });

    it('recusa arquivo que não é backup', function () {
      falso(DADOS.importarJSON('{"x":1}').ok);
      falso(DADOS.importarJSON('não é json').ok);
    });

    it('texto gigante é cortado', function () {
      var b = backup();
      b.cirurgias[0].obs = new Array(20001).join('a');
      var r = DADOS.importarJSON(JSON.stringify(b));
      verdadeiro(r.estado.cirurgias[0].obs.length <= 5000);
    });

    it('seed também passa pelo saneamento', function () {
      var r = DADOS.importarSeed(JSON.stringify({
        ANESTESISTAS: [{ id: 'A01', nome: 'X', ativo: 'Sim', script: '<b>' }], ESCALA_BASE: []
      }));
      verdadeiro(r.ok);
      igual(r.anestesistas[0].script, undefined);
    });
  });

  describe('CSV — sem fórmula ativa', function () {

    it('célula que começa com =, +, -, @ vira texto', function () {
      var csv = DADOS.paraCSV([['=HYPERLINK("http://x")', '+1+1', '@SUM(A1)', '-2+3', 'ok']]);
      verdadeiro(csv.indexOf("'=HYPERLINK") >= 0, csv);
      verdadeiro(csv.indexOf("'+1+1") >= 0);
      verdadeiro(csv.indexOf("'@SUM") >= 0);
      verdadeiro(csv.indexOf("'-2+3") >= 0);
    });

    it('número negativo continua número', function () {
      igual(DADOS.paraCSV([['-120,50', '-5']]), '-120,50;-5');
    });

    it('o FINANCEIRO sai com o mês pedido, não sempre o primeiro', function () {
      var store = novoStore();
      var arquivos = DADOS.exportarCSVs(store, 11, 2026);
      var fin = arquivos.filter(function (a) { return a.nome === 'FINANCEIRO'; })[0].conteudo;
      verdadeiro(/MÊS;11/.test(fin), fin.slice(0, 120));
    });
  });

  describe('Estrutura — tudo que existe está carregado', function () {

    var html = fs.readFileSync(path.join(RAIZ, 'webapp', 'index.html'), 'utf8');

    it('cada módulo do core entra na página, na mesma ordem do Node', function () {
      var naPagina = (html.match(/\.\.\/core\/[\w.]+\.js/g) || []).map(function (s) { return s.replace('../core/', ''); });
      igual(naPagina.join(','), core.ARQUIVOS_CORE.join(','));
    });

    it('cada arquivo de tela está na página e se registra em TELAS', function () {
      var pasta = path.join(RAIZ, 'webapp', 'js', 'telas');
      fs.readdirSync(pasta).filter(function (f) { return /\.js$/.test(f); }).forEach(function (f) {
        verdadeiro(html.indexOf('js/telas/' + f) >= 0, f + ' não está no index.html');
        var fonte = fs.readFileSync(path.join(pasta, f), 'utf8');
        verdadeiro(new RegExp('^TELAS\\.' + f.replace('.js', '') + ' = ', 'm').test(fonte), f + ' não se registra');
      });
    });

    it('telas não dependem umas das outras por atalho antigo', function () {
      var pasta = path.join(RAIZ, 'webapp', 'js');
      [pasta, path.join(pasta, 'telas')].forEach(function (d) {
        fs.readdirSync(d).filter(function (f) { return /\.js$/.test(f); }).forEach(function (f) {
          var fonte = fs.readFileSync(path.join(d, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
          falso(/\bTELAS2\b/.test(fonte), f + ' ainda usa TELAS2');
        });
      });
    });

    it('a página declara política de conteúdo sem script inline', function () {
      verdadeiro(/Content-Security-Policy/.test(html));
      verdadeiro(/script-src 'self'/.test(html));
      falso(/<script>(?!\s*<\/script>)/.test(html), 'script inline quebraria a CSP');
    });
  });
};
