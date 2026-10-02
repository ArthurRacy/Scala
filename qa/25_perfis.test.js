/**
 * QA 25 — Perfis de acesso (core/12b_permissoes.js)
 *   - os três perfis e os dois nomes antigos ("admin", "equipe")
 *   - quais telas cada perfil abre
 *   - quem pode cada operação do store (tabela conferida operação por operação;
 *     operação nova sem classificação nasce fechada)
 *   - o anestesista não envia nem recebe dinheiro
 *   - o estado e os comandos chegam cortados por perfil, e a tela do anestesista
 *     (que reexecuta os comandos já cortados) chega ao MESMO estado visível do
 *     servidor
 */
'use strict';

var fs = require('fs');
var path = require('path');
var vm = require('vm');

module.exports = function (t, core, dados) {
  var describe = t.describe, it = t.it, igual = t.igual, verdadeiro = t.verdadeiro, falso = t.falso;

  var ctxDados = vm.createContext(Object.assign({}, core, {
    UI: { baixarTexto: function () {}, downloadBloqueado: function () { return false; } },
    SEED_INICIAL: dados.seed, Blob: Blob, console: console
  }));
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'webapp', 'js', '03_dados.js'), 'utf8'), ctxDados);
  var DADOS = vm.runInContext('DADOS', ctxDados);

  var TODAS = ['painel', 'escala', 'quadro', 'cirurgias', 'avaliacoes', 'boletim', 'qualidade',
    'horas', 'financeiro', 'repasse', 'indicadores', 'painel_qualidade', 'estrutura',
    'anestesistas', 'clinica', 'integridade', 'log', 'usuarios', 'dados'];

  describe('Perfis', function () {

    it('três perfis, e os nomes antigos viram os novos', function () {
      igual(core.ORDEM_DOS_PERFIS.join(','), 'chefe,anestesista,secretaria');
      igual(core.PERFIS.chefe.rotulo, 'Anestesista chefe');
      igual(core.PERFIS.anestesista.rotulo, 'Anestesista');
      igual(core.PERFIS.secretaria.rotulo, 'Secretária');
      igual(core.perfilCanonico('admin'), 'chefe');
      igual(core.perfilCanonico('equipe'), 'anestesista');
      igual(core.perfilCanonico(' Secretaria '), 'secretaria');
      igual(core.perfilCanonico('qualquer'), '');
      igual(core.perfilCanonico(null), '');
    });
  });

  describe('Telas de cada perfil', function () {

    function abre(perfil) { return TODAS.filter(function (tela) { return core.perfilPodeVerTela(perfil, tela); }); }

    it('chefe abre tudo', function () {
      igual(abre('chefe').join(','), TODAS.join(','));
    });

    it('anestesista: painel de operação e painel de qualidade; nada de dinheiro nem de administração', function () {
      igual(abre('anestesista').join(','), 'painel,escala,quadro,cirurgias,avaliacoes,boletim,qualidade,painel_qualidade');
    });

    it('secretária: operação e gestão, sem painel de qualidade, estrutura e administração', function () {
      igual(abre('secretaria').join(','),
        'painel,escala,quadro,cirurgias,avaliacoes,boletim,qualidade,horas,financeiro,repasse,indicadores,anestesistas,clinica');
    });

    it('perfil desconhecido não abre nada', function () {
      igual(abre('visitante').length, 0);
      igual(abre(undefined).length, 0);
    });

    it('só chefe e secretária veem dinheiro; só o chefe é coordenação', function () {
      verdadeiro(core.perfilVeFinanceiro('chefe') && core.perfilVeFinanceiro('secretaria'));
      falso(core.perfilVeFinanceiro('anestesista'));
      falso(core.perfilVeFinanceiro('admin') === false, 'admin antigo = chefe');
      verdadeiro(core.perfilEhCoordenacao('chefe'));
      falso(core.perfilEhCoordenacao('anestesista') || core.perfilEhCoordenacao('secretaria'));
    });
  });

  describe('Quem faz cada operação', function () {

    // c = chefe, a = anestesista, s = secretária
    var ESPERADO = {
      adicionarCirurgia: 'cas', atualizarCirurgia: 'cas', removerCirurgia: 'cas', atualizarAvaliacao: 'cas',
      ajustarEscala: 'cas', aplicarRemanejamento: 'cas',
      salvarAnestesista: 'cs', definirEscalaBase: 'cs', definirModoEscalaBase: 'cs', salvarConfigClinica: 'cs',
      salvarDespesasRepasse: 'cs', registrarPagamentoRepasse: 'cs', removerPagamentoRepasse: 'cs', atualizarParticipantesRepasse: 'cs',
      criarBoletim: 'ca', salvarBoletim: 'ca', alterarLinhaBoletim: 'ca', finalizarBoletim: 'ca', reabrirBoletim: 'ca', descartarBoletim: 'ca',
      criarFichaQualidade: 'cas', salvarFichaQualidade: 'cas', preencherFichaDoBoletim: 'cas', alterarEventoQualidade: 'cas',
      registrarSeguimentoQualidade: 'cas', revisarFichaQualidade: 'cas', concluirFichaQualidade: 'cas',
      reabrirFichaQualidade: 'cas', descartarFichaQualidade: 'cas',
      salvarRegistroEstrutura: 'c', removerRegistroEstrutura: 'c', salvarConfigQualidade: 'c',
      reparar: 'c'
    };
    var PERFIL_DA_LETRA = { c: 'chefe', a: 'anestesista', s: 'secretaria' };

    it('toda operação do store está na tabela deste teste, e a tabela não tem operação que não existe', function () {
      igual(Object.keys(ESPERADO).sort().join(','), core.MUTACOES_STORE.slice().sort().join(','));
    });

    it('a tabela do core diz exatamente o que a tabela do teste diz, operação por operação e perfil por perfil', function () {
      Object.keys(ESPERADO).forEach(function (nome) {
        ['c', 'a', 's'].forEach(function (letra) {
          var quer = ESPERADO[nome].indexOf(letra) >= 0;
          var r = core.perfilPodeExecutar(PERFIL_DA_LETRA[letra], nome, []);
          igual(r.ok, quer, nome + ' para ' + PERFIL_DA_LETRA[letra]);
        });
      });
    });

    it('operação sem classificação nasce fechada para quem não é chefe', function () {
      verdadeiro(core.perfilPodeExecutar('chefe', 'operacaoNovaEsquecida', []).ok);
      falso(core.perfilPodeExecutar('anestesista', 'operacaoNovaEsquecida', []).ok);
      falso(core.perfilPodeExecutar('secretaria', 'operacaoNovaEsquecida', []).ok);
    });

    it('perfil que não existe não faz nada', function () {
      var r = core.perfilPodeExecutar('visitante', 'adicionarCirurgia', [{}]);
      falso(r.ok);
      igual(r.motivo, 'perfil');
    });

    it('os nomes antigos continuam valendo: admin faz tudo, equipe é o anestesista', function () {
      verdadeiro(core.perfilPodeExecutar('admin', 'salvarConfigQualidade', []).ok);
      falso(core.perfilPodeExecutar('equipe', 'registrarPagamentoRepasse', []).ok);
      verdadeiro(core.perfilPodeExecutar('equipe', 'salvarBoletim', []).ok);
    });
  });

  describe('O anestesista não envia dinheiro nem dados de contato', function () {

    it('cirurgia: valor, pago, data do pagamento e nota fiscal são recusados, mesmo com valor vazio', function () {
      ['valor', 'pago', 'dataPagamento', 'nf'].forEach(function (campo) {
        var dados = { paciente: 'P' }; dados[campo] = '';
        var r = core.perfilPodeExecutar('anestesista', 'adicionarCirurgia', [dados]);
        falso(r.ok, campo);
        igual(r.motivo, 'campo');
        var u = {}; u[campo] = 'x';
        falso(core.perfilPodeExecutar('anestesista', 'atualizarCirurgia', ['CIR0001', u]).ok, 'atualizar ' + campo);
      });
    });

    it('avaliação: o mesmo; o resto da avaliação ele faz', function () {
      falso(core.perfilPodeExecutar('anestesista', 'atualizarAvaliacao', ['AVP0001', { valor: 300 }]).ok);
      falso(core.perfilPodeExecutar('anestesista', 'atualizarAvaliacao', ['AVP0001', { nf: '1' }]).ok);
      verdadeiro(core.perfilPodeExecutar('anestesista', 'atualizarAvaliacao', ['AVP0001', { realizada: 'Sim', tcle: 'Sim' }]).ok);
    });

    it('sem campo financeiro, ele lança e edita cirurgia normalmente', function () {
      verdadeiro(core.perfilPodeExecutar('anestesista', 'adicionarCirurgia', [{ paciente: 'P', data: '2026-10-05' }]).ok);
      verdadeiro(core.perfilPodeExecutar('anestesista', 'atualizarCirurgia', ['CIR0001', { status: 'Realizada' }]).ok);
    });

    it('secretária e chefe enviam dinheiro sem problema', function () {
      verdadeiro(core.perfilPodeExecutar('secretaria', 'atualizarCirurgia', ['CIR0001', { valor: 1000, pago: 'Sim', nf: '9' }]).ok);
      verdadeiro(core.perfilPodeExecutar('chefe', 'adicionarCirurgia', [{ valor: 1 }]).ok);
    });
  });

  describe('O que chega a cada perfil', function () {

    function estadoComDinheiro() {
      var st = core.criarStoreComSeed(dados.seed, { usuario: 'qa' });
      st.salvarAnestesista({ id: 'A01', pix: 'roberta@exemplo.com', telefone: '(61) 99999-0000', email: 'r@exemplo.com', crm: '12345-DF' });
      st.adicionarCirurgia({ status: 'Realizada', data: '2026-10-01', inicioPrev: '07:00', fimPrev: '09:00',
        inicioReal: '07:00', fimReal: '09:00', paciente: 'Maria', procedimento: 'Rinoplastia', anestesista: 'Fabrício Tavares',
        avaliacaoNec: 'Sim', valor: 2500, pago: 'Sim', dataPagamento: '2026-10-05', nf: 'NF-77', telefone: '(61) 98888-0000' });
      st.atualizarAvaliacao(st.estado.avaliacoes[0].id, { valor: 300, pago: 'Sim', dataPagamento: '2026-10-02', nf: 'NF-78', realizada: 'Sim' });
      st.registrarPagamentoRepasse(2026, 10, 'A01', 100, '2026-10-20');
      return DADOS.enxugar(st.estado);
    }

    it('chefe recebe o estado inteiro, o mesmo objeto', function () {
      var e = estadoComDinheiro();
      verdadeiro(core.projetarEstadoParaPerfil(e, 'chefe') === e);
      verdadeiro(e.log.length > 0);
    });

    it('secretária recebe tudo menos o LOG', function () {
      var e = estadoComDinheiro();
      var p = core.projetarEstadoParaPerfil(e, 'secretaria');
      igual(p.log.length, 0);
      igual(p.cirurgias[0].valor, 2500);
      igual(p.repasses.length, 1);
      igual(p.anestesistas[0].pix, 'roberta@exemplo.com');
      verdadeiro(e.log.length > 0, 'o original não foi mexido');
    });

    it('anestesista recebe sem dinheiro, sem repasse, sem PIX/telefone/e-mail dos colegas e sem LOG', function () {
      var e = estadoComDinheiro();
      var p = core.projetarEstadoParaPerfil(e, 'anestesista');
      var texto = JSON.stringify(p);
      ['2500', 'NF-77', 'NF-78', 'roberta@exemplo.com', '(61) 99999-0000', 'r@exemplo.com'].forEach(function (segredo) {
        falso(texto.indexOf(segredo) >= 0, segredo + ' não pode ir para o anestesista');
      });
      igual(p.repasses.length, 0);
      igual(p.log.length, 0);
      verdadeiro(!('valor' in p.cirurgias[0]) && !('pago' in p.cirurgias[0]) && !('dataPagamento' in p.cirurgias[0]) && !('nf' in p.cirurgias[0]));
      verdadeiro(!('valor' in p.avaliacoes[0]) && !('pago' in p.avaliacoes[0]));
      igual(p.cirurgias[0].telefone, '(61) 98888-0000', 'telefone do PACIENTE é da operação: continua');
      igual(p.anestesistas[0].crm, '12345-DF', 'CRM aparece no boletim: continua');
      igual(p.cirurgias[0].paciente, 'Maria');
      igual(e.cirurgias[0].valor, 2500, 'o original não foi mexido');
      verdadeiro(e.repasses.length === 1);
    });

    it('perfil desconhecido recebe o corte mais fechado', function () {
      var e = estadoComDinheiro();
      falso(JSON.stringify(core.projetarEstadoParaPerfil(e, 'visitante')).indexOf('NF-77') >= 0);
    });

    it('comandos: o anestesista não recebe os de repasse; recebe os outros sem os campos restritos', function () {
      var rep = { revisao: 7, nome: 'registrarPagamentoRepasse', args: [2026, 10, 'A01', 100, '2026-10-20'], usuario: 'X', login: 'x' };
      var r = core.redigirComandoParaPerfil(rep, 'anestesista');
      verdadeiro(r.oculto && r.revisao === 7);
      falso(JSON.stringify(r).indexOf('100') >= 0, 'o valor não vai junto');

      var cir = { revisao: 8, nome: 'atualizarCirurgia', args: ['CIR0001', { status: 'Realizada', valor: 900, pago: 'Sim', nf: 'N' }], usuario: 'X' };
      var c = core.redigirComandoParaPerfil(cir, 'anestesista');
      igual(JSON.stringify(c.args), JSON.stringify(['CIR0001', { status: 'Realizada' }]));
      igual(cir.args[1].valor, 900, 'o original não foi mexido');

      var cad = { revisao: 9, nome: 'salvarAnestesista', args: [{ id: 'A01', pix: 'x', telefone: '1', email: 'e', crm: '1' }] };
      igual(JSON.stringify(core.redigirComandoParaPerfil(cad, 'anestesista').args[0]), JSON.stringify({ id: 'A01', crm: '1' }));

      var rec = core.redigirComandoParaPerfil({ revisao: 10, nome: 'reparar', args: [] }, 'anestesista');
      verdadeiro(rec.oculto && rec.recarregar);

      var outro = { revisao: 11, nome: 'salvarBoletim', args: ['BOL0001', { destino: 'UTI' }] };
      verdadeiro(core.redigirComandoParaPerfil(outro, 'anestesista') === outro, 'o que não tem dinheiro passa inteiro');
    });

    it('comandos: chefe e secretária recebem tudo como foi gravado', function () {
      var rep = { revisao: 7, nome: 'registrarPagamentoRepasse', args: [2026, 10, 'A01', 100, '2026-10-20'] };
      verdadeiro(core.redigirComandoParaPerfil(rep, 'chefe') === rep);
      verdadeiro(core.redigirComandoParaPerfil(rep, 'secretaria') === rep);
    });
  });

  /**
   * O teste que importa: o servidor aplica os comandos no estado completo; a tela do
   * anestesista aplica os MESMOS comandos, já cortados, no estado dela (também
   * cortado). No fim, o que o anestesista enxerga tem de ser exatamente o que o
   * servidor mostraria a ele. Se um dia um comando depender de dado que o
   * anestesista não recebe, este teste quebra.
   */
  describe('A tela do anestesista acompanha o servidor sem ver dinheiro', function () {

    var HOJE = '2026-10-05';
    var CIR = { status: 'Realizada', data: '2026-10-05', inicioPrev: '07:00', fimPrev: '09:00', inicioReal: '07:00', fimReal: '09:00',
      paciente: 'Paciente A', procedimento: 'Rinoplastia', anestesista: 'Fabrício Tavares', avaliacaoNec: 'Não' };

    function novoNoServidor(estado, usuario) {
      var st = core.criarStore(DADOS.sanearEstado(JSON.parse(JSON.stringify(estado))), { usuario: usuario, horizonte: 'movel', hoje: HOJE });
      st.recalcular();
      return st;
    }

    function semOsCarimbos(estado) {
      var e = JSON.parse(JSON.stringify(estado));
      delete e.salvoEm;
      e.log = [];
      return e;
    }

    /** Caminho e valores da primeira diferença entre dois dados (texto vazio se iguais). */
    function primeiraDiferenca(a, b, caminho) {
      caminho = caminho || '$';
      if (core.jsonCanonico(a) === core.jsonCanonico(b)) return '';
      if (a && b && typeof a === 'object' && typeof b === 'object' && Array.isArray(a) === Array.isArray(b)) {
        var chaves = Object.keys(a).concat(Object.keys(b).filter(function (k) { return !(k in a); }));
        for (var i = 0; i < chaves.length; i++) {
          var d = primeiraDiferenca(a[chaves[i]], b[chaves[i]], caminho + '.' + chaves[i]);
          if (d) return d;
        }
      }
      return caminho + ': servidor=' + JSON.stringify(a).slice(0, 120) + ' | tela=' + JSON.stringify(b).slice(0, 120);
    }

    function cenario() {
      var completo = core.criarStoreComSeed(dados.seed, { usuario: 'Chefe', horizonte: 'movel', hoje: HOJE });
      var visao = novoNoServidor(core.projetarEstadoParaPerfil(DADOS.enxugar(completo.estado), 'anestesista'), 'Anestesista');
      var n = 0;
      var falhas = [];

      // Aplica no servidor (estado completo); se aceito, entra no "diário" e é reexecutado na tela do anestesista.
      function comando(nome) {
        var args = Array.prototype.slice.call(arguments, 1);
        var ctx = { agora: HOJE + ' 10:' + String(10 + (++n)).padStart(2, '0') + ':00', semente: 'sem' + n + 'abcdef' };
        var r = core.executarComContexto(ctx, function () { return completo[nome].apply(completo, JSON.parse(JSON.stringify(args))); });
        if (!r || r.ok === false) return r;
        var entrada = { revisao: n, nome: nome, args: JSON.parse(JSON.stringify(args)), contexto: ctx, usuario: 'Chefe', login: 'chefe' };
        var enviado = core.redigirComandoParaPerfil(entrada, 'anestesista');
        if (enviado.oculto) return r;
        visao.usuario = enviado.usuario;   // como a tela faz ao reexecutar o que outra pessoa gravou
        var res = core.executarComContexto(enviado.contexto, function () { return visao[enviado.nome].apply(visao, enviado.args); });
        if (!res || res.ok === false) falhas.push(nome + ': ' + JSON.stringify(res && res.erros));
        return r;
      }
      return { completo: completo, visao: visao, comando: comando, falhas: falhas };
    }

    it('um dia inteiro de trabalho, com dinheiro no meio, chega ao mesmo estado visível', function () {
      var c = cenario();
      var ok = function (r, msg) { verdadeiro(r && r.ok, msg + ' ' + JSON.stringify(r && r.erros)); };

      ok(c.comando('adicionarCirurgia', Object.assign({}, CIR, { valor: 1837.45, pago: 'Não' })), 'cirurgia 1 com valor');
      ok(c.comando('adicionarCirurgia', Object.assign({}, CIR, { paciente: 'Paciente B', inicioPrev: '10:00', fimPrev: '11:00',
        inicioReal: '10:00', fimReal: '11:00', anestesista: 'Alene Cunha', avaliacaoNec: 'Sim' })), 'cirurgia 2 com avaliação');
      ok(c.comando('atualizarCirurgia', 'CIR0001', { valor: 2291.9, pago: 'Sim', dataPagamento: '2026-10-06', nf: 'NF-ALFA', obs: 'conferido' }), 'pagamento');
      ok(c.comando('atualizarCirurgia', 'CIR0002', { convenio: 'Unimed' }), 'só convênio');
      var av = c.completo.estado.avaliacoes[0];
      ok(c.comando('atualizarAvaliacao', av.id, { realizada: 'Sim', anestesista: 'Alene Cunha', data: '2026-10-04', valor: 351.15, pago: 'Sim', nf: 'NF-BETA' }), 'avaliação');
      ok(c.comando('salvarAnestesista', { id: 'A02', pix: 'a02@exemplo.com', telefone: '(11) 90000-0000', crm: '55555-DF' }), 'cadastro com PIX');
      ok(c.comando('salvarDespesasRepasse', 2026, 10, 123.45, 'aluguel'), 'despesas do repasse');
      ok(c.comando('registrarPagamentoRepasse', 2026, 10, 'A01', 61.37, '2026-10-20'), 'repasse');
      c.comando('atualizarParticipantesRepasse', 2026, 10);   // recusado (já há repasse): o servidor não grava, a tela não recebe
      ok(c.comando('criarBoletim', 'CIR0001'), 'boletim');
      ok(c.comando('salvarBoletim', 'BOL0001', { paciente: { peso: '70' }, pre: { asa: 'I' }, tecnicas: ['Sedação'],
        monitorizacao: core.MONITORIZACAO_BASICA, destino: 'SRPA', semIntercorrencias: true,
        tempos: { inicioAnestesia: '07:00', fimAnestesia: '08:40' } }), 'campos do boletim');
      ok(c.comando('ajustarEscala', '2026-10-06', 1, { substituto: 'Alene Cunha', motivo: 'Congresso' }), 'substituição');
      ok(c.comando('salvarAnestesista', { id: 'A03', ativo: 'Não' }), 'desativa alguém');
      ok(c.comando('removerCirurgia', 'CIR0002', { comAvaliacoes: true }), 'exclui cirurgia 2');

      igual(c.falhas.join(' | '), '', 'nenhum comando cortado pode falhar na tela do anestesista');
      var crua = JSON.stringify(DADOS.enxugar(c.visao.estado));
      ['1837.45', '2291.9', '351.15', '123.45', '61.37', 'NF-ALFA', 'NF-BETA', 'a02@exemplo.com', '(11) 90000-0000'].forEach(function (segredo) {
        falso(crua.indexOf(segredo) >= 0, segredo + ' não pode estar na tela do anestesista (estado cru, sem projeção)');
      });
      igual(c.visao.estado.repasses.length, 0, 'nenhum repasse na tela do anestesista');
      var visaoDoServidor = core.projetarEstadoParaPerfil(DADOS.enxugar(c.completo.estado), 'anestesista');
      var daTela = core.projetarEstadoParaPerfil(DADOS.enxugar(c.visao.estado), 'anestesista');
      igual(primeiraDiferenca(semOsCarimbos(visaoDoServidor), semOsCarimbos(daTela)), '',
        'o que o anestesista enxerga = o que o servidor mostraria a ele');
    });

    it('a tela do anestesista nunca guarda dinheiro, nem o que ela mesma reexecutou', function () {
      var c = cenario();
      c.comando('adicionarCirurgia', Object.assign({}, CIR, { valor: 777, pago: 'Sim', nf: 'NF-SEGREDO' }));
      c.comando('salvarAnestesista', { id: 'A04', pix: 'segredo-pix@exemplo.com' });
      var tela = JSON.stringify(DADOS.enxugar(c.visao.estado));
      falso(/NF-SEGREDO|segredo-pix|\b777\b/.test(tela), 'nada de dinheiro na tela do anestesista');
    });
  });
};
