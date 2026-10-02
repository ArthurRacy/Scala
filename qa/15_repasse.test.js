/**
 * QA 15 — Repasse (divisão igual do resultado do mês)
 */
'use strict';

var fs = require('fs');
var path = require('path');
var vm = require('vm');

module.exports = function (t, core, dados) {
  var describe = t.describe, it = t.it, igual = t.igual, verdadeiro = t.verdadeiro, falso = t.falso;

  // O saneador da entrada (webapp/js/03_dados.js) decide o que sobrevive a um recarregamento.
  var ctx = vm.createContext(Object.assign({}, core, {
    UI: { baixarTexto: function () {}, downloadBloqueado: function () { return false; } },
    SEED_INICIAL: dados.seed, Blob: Blob, console: console
  }));
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'webapp', 'js', '03_dados.js'), 'utf8'), ctx);
  var DADOS = vm.runInContext('DADOS', ctx);

  function novoStore() { return core.criarStoreComSeed(dados.seed, { usuario: 'qa' }); }

  function cirurgia(extra) {
    return Object.assign({
      status: 'Realizada', data: '2026-10-01', inicioPrev: '07:00', fimPrev: '09:00',
      inicioReal: '07:00', fimReal: '09:00',
      paciente: 'Paciente', procedimento: 'Rinoplastia', anestesista: 'Fabrício Tavares',
      avaliacaoNec: 'Não'
    }, extra || {});
  }

  describe('Divisão igual', function () {

    it('15 ativos dividem R$ 1.000,00 fechando no centavo', function () {
      var st = novoStore();
      st.adicionarCirurgia(cirurgia({ valor: 1000, pago: 'Sim', dataPagamento: '2026-10-10' }));
      var r = st.repasse(2026, 10);
      igual(r.participantes, 15);
      igual(r.bruto, 1000);
      var soma = 0;
      r.linhas.forEach(function (l) { soma += Math.round(l.cota * 100); });
      igual(soma, 100000, 'soma das cotas = líquido');
      igual(r.linhas[0].cota, 66.67);
      igual(r.linhas[14].cota, 66.66);
    });

    it('despesas saem antes da divisão; inativo não entra', function () {
      var st = novoStore();
      st.adicionarCirurgia(cirurgia({ valor: 1500, pago: 'Sim', dataPagamento: '2026-10-10' }));
      st.salvarAnestesista({ id: 'A15', ativo: 'Não' });
      verdadeiro(st.salvarDespesasRepasse(2026, 10, 100, 'aluguel da sala').ok);
      var r = st.repasse(2026, 10);
      igual(r.liquido, 1400);
      igual(r.participantes, 14);
      igual(r.linhas[0].cota, 100);
      falso(st.salvarDespesasRepasse(2026, 10, -5).ok, 'despesa negativa recusada');
    });
  });

  describe('Base do mês', function () {

    it('caixa: conta no mês em que o dinheiro entrou', function () {
      var st = novoStore();
      st.adicionarCirurgia(cirurgia({ valor: 900, pago: 'Sim', dataPagamento: '2026-11-03' }));
      igual(st.repasse(2026, 10).bruto, 0, 'cirurgia de outubro paga em novembro');
      igual(st.repasse(2026, 11).bruto, 900);
      igual(st.repasse(2026, 10, { base: 'competencia' }).bruto, 900, 'pela produção, é outubro');
    });

    it('pago sem data de pagamento conta no mês da cirurgia e é sinalizado', function () {
      var st = novoStore();
      st.adicionarCirurgia(cirurgia({ valor: 900, pago: 'Sim' }));
      var r = st.repasse(2026, 10);
      igual(r.bruto, 900);
      igual(r.semDataPagamento, 1);
    });

    it('não pago e cancelada não entram', function () {
      var st = novoStore();
      st.adicionarCirurgia(cirurgia({ valor: 900, pago: 'Não' }));
      st.adicionarCirurgia(cirurgia({ valor: 700, pago: 'Sim', dataPagamento: '2026-10-05', status: 'Cancelada',
        inicioPrev: '10:00', fimPrev: '11:00', inicioReal: '', fimReal: '' }));
      igual(st.repasse(2026, 10).bruto, 0);
    });

    it('avaliação paga entra na base', function () {
      var st = novoStore();
      st.adicionarCirurgia(cirurgia({ avaliacaoNec: 'Sim' }));
      st.atualizarAvaliacao(st.estado.avaliacoes[0].id, { valor: 300, pago: 'Sim', dataPagamento: '2026-10-02',
        realizada: 'Sim', anestesista: 'Alene Cunha', data: '2026-09-28' });
      igual(st.repasse(2026, 10).bruto, 300);
    });
  });

  describe('Registro do que foi repassado', function () {

    it('registra, mostra a diferença, vai para o LOG com a chave PIX', function () {
      var st = novoStore();
      st.salvarAnestesista({ id: 'A01', pix: 'roberta@exemplo.com' });
      st.adicionarCirurgia(cirurgia({ valor: 1500, pago: 'Sim', dataPagamento: '2026-10-10' }));
      verdadeiro(st.registrarPagamentoRepasse(2026, 10, 'A01', 60, '2026-11-05').ok);
      var l = st.repasse(2026, 10).linhas.filter(function (x) { return x.id === 'A01'; })[0];
      igual(l.cota, 100);
      igual(l.repassado, 60);
      igual(l.diferenca, 40);
      var log = st.estado.log[st.estado.log.length - 1];
      igual(log.campo, 'REPASSE REGISTRADO');
      verdadeiro(/roberta@exemplo\.com/.test(log.para));
    });

    it('entrou mais dinheiro depois: o pago fica, a diferença cresce', function () {
      var st = novoStore();
      st.adicionarCirurgia(cirurgia({ valor: 1500, pago: 'Sim', dataPagamento: '2026-10-10' }));
      st.registrarPagamentoRepasse(2026, 10, 'A01', 100, '2026-10-31');
      st.adicionarCirurgia(cirurgia({ valor: 1500, pago: 'Sim', dataPagamento: '2026-10-20',
        inicioPrev: '10:00', fimPrev: '11:00', inicioReal: '10:00', fimReal: '11:00' }));
      var l = st.repasse(2026, 10).linhas.filter(function (x) { return x.id === 'A01'; })[0];
      igual(l.repassado, 100);
      igual(l.diferenca, 100);
    });

    it('recusa valor zero, data inválida e anestesista inexistente', function () {
      var st = novoStore();
      falso(st.registrarPagamentoRepasse(2026, 10, 'A01', 0, '2026-10-31').ok);
      falso(st.registrarPagamentoRepasse(2026, 10, 'A01', 10, '').ok);
      falso(st.registrarPagamentoRepasse(2026, 10, 'A99', 10, '2026-10-31').ok);
    });

    it('desfazer tira o registro e anota no LOG', function () {
      var st = novoStore();
      st.registrarPagamentoRepasse(2026, 10, 'A01', 50, '2026-10-31');
      verdadeiro(st.removerPagamentoRepasse(2026, 10, 0).ok);
      igual(st.repasse(2026, 10).totalRepassado, 0);
      igual(st.estado.log[st.estado.log.length - 1].campo, 'REPASSE DESFEITO');
    });

    it('transação que falha não deixa repasse pela metade', function () {
      var st = novoStore();
      st.registrarPagamentoRepasse(2026, 10, 'A01', 50, '2026-10-31');
      st.transacao(function (s) { s.repasses[0].pagamentos.push({ valor: 999 }); return { ok: false, erros: [{ msg: 'x' }] }; });
      igual(st.repasse(2026, 10).totalRepassado, 50);
    });
  });

  /**
   * Auditoria de 02/10/2026 (F02): o repasse dividia pelos ativos DE HOJE. Desativar
   * alguém reescrevia a cota dos meses passados e fazia sumir da tela o repasse
   * já pago a essa pessoa (R$ 100 pagos viravam R$ 0 repassado).
   */
  describe('Grupo do mês guardado', function () {

    function mesComMilEQuinhentos() {
      var st = novoStore();
      st.adicionarCirurgia(cirurgia({ valor: 1500, pago: 'Sim', dataPagamento: '2026-10-10' }));
      return st;
    }
    function linhaDe(r, id) { return r.linhas.filter(function (l) { return l.id === id; })[0]; }

    it('desativar alguém depois do repasse não muda a cota nem apaga o que foi pago', function () {
      var st = mesComMilEQuinhentos();
      verdadeiro(st.registrarPagamentoRepasse(2026, 10, 'A15', 100, '2026-10-20').ok);
      verdadeiro(st.salvarAnestesista({ id: 'A15', ativo: 'Não' }).ok);
      var r = st.repasse(2026, 10);
      verdadeiro(r.participantesGuardados, 'o grupo ficou guardado ao registrar o repasse');
      igual(r.participantes, 15, 'o mês continua dividido por 15');
      igual(r.linhas[0].cota, 100);
      var l = linhaDe(r, 'A15');
      verdadeiro(!!l, 'a linha de quem saiu continua na tela');
      igual(l.repassado, 100);
      igual(l.diferenca, 0);
      igual(r.totalRepassado, 100);
    });

    it('salvar as despesas também guarda o grupo; antes disso o mês segue o cadastro de hoje', function () {
      var st = mesComMilEQuinhentos();
      st.salvarAnestesista({ id: 'A15', ativo: 'Não' });
      var antes = st.repasse(2026, 10);
      falso(antes.participantesGuardados);
      igual(antes.participantes, 14, 'mês ainda sem gravação: vale o grupo ativo hoje');

      var st2 = mesComMilEQuinhentos();
      verdadeiro(st2.salvarDespesasRepasse(2026, 10, 0, '').ok);
      st2.salvarAnestesista({ id: 'A15', ativo: 'Não' });
      var depois = st2.repasse(2026, 10);
      verdadeiro(depois.participantesGuardados);
      igual(depois.participantes, 15, 'o grupo foi guardado com 15 antes de A15 sair');
    });

    it('quem entra depois não entra num mês já guardado; "atualizar" refaz enquanto ninguém foi pago', function () {
      var st = mesComMilEQuinhentos();
      st.salvarAnestesista({ id: 'A15', ativo: 'Não' });
      st.salvarDespesasRepasse(2026, 10, 0, '');                 // guarda 14
      st.salvarAnestesista({ id: 'A15', ativo: 'Sim' });
      igual(st.repasse(2026, 10).participantes, 14);
      verdadeiro(st.atualizarParticipantesRepasse(2026, 10).ok);
      igual(st.repasse(2026, 10).participantes, 15);
      var log = st.estado.log.filter(function (e) { return e.campo === 'GRUPO DO REPASSE'; });
      verdadeiro(log.length >= 2, 'o grupo guardado e a atualização ficam no LOG');

      verdadeiro(st.registrarPagamentoRepasse(2026, 10, 'A01', 50, '2026-10-31').ok);
      falso(st.atualizarParticipantesRepasse(2026, 10).ok, 'com repasse registrado o grupo não muda mais');
    });

    it('pagamento a quem não é do grupo do mês aparece numa linha à parte e entra no total', function () {
      var st = mesComMilEQuinhentos();
      st.salvarAnestesista({ id: 'A15', ativo: 'Não' });
      st.salvarDespesasRepasse(2026, 10, 0, '');                 // grupo de 14, sem A15
      st.salvarAnestesista({ id: 'A15', ativo: 'Sim' });
      verdadeiro(st.registrarPagamentoRepasse(2026, 10, 'A15', 40, '2026-10-31').ok);
      var r = st.repasse(2026, 10);
      igual(r.participantes, 14);
      igual(r.linhas.length, 15);
      var extra = linhaDe(r, 'A15');
      verdadeiro(extra.foraDoGrupo);
      igual(extra.cota, 0);
      igual(extra.repassado, 40);
      igual(extra.diferenca, -40);
      igual(r.totalRepassado, 40);
    });

    it('a soma das cotas continua fechando no centavo com o grupo guardado', function () {
      var st = novoStore();
      st.salvarAnestesista({ id: 'A15', ativo: 'Não' });
      st.adicionarCirurgia(cirurgia({ valor: 1000, pago: 'Sim', dataPagamento: '2026-10-10' }));
      st.salvarDespesasRepasse(2026, 10, 0, '');
      var soma = 0;
      st.repasse(2026, 10).linhas.forEach(function (l) { soma += Math.round(l.cota * 100); });
      igual(soma, 100000);
    });

    it('repasse antigo, sem grupo guardado, abre como antes e também mostra quem foi pago e saiu', function () {
      var st = mesComMilEQuinhentos();
      st.transacao(function (s) {
        s.repasses.push({ mes: '2026-10', despesas: null, obs: '', pagamentos: [
          { idAnestesista: 'A15', nome: 'Fulano', pix: '', valor: 100, data: '2026-10-20' }] });
        return { ok: true, semRecalculo: true };
      });
      st.salvarAnestesista({ id: 'A15', ativo: 'Não' });
      var r = st.repasse(2026, 10);
      falso(r.participantesGuardados);
      igual(r.participantes, 14);
      igual(linhaDe(r, 'A15').repassado, 100);
      igual(r.totalRepassado, 100);
    });

    it('o grupo guardado sobrevive a salvar e recarregar', function () {
      var st = mesComMilEQuinhentos();
      st.salvarAnestesista({ id: 'A15', ativo: 'Não' });
      st.salvarDespesasRepasse(2026, 10, 0, '');
      var volta = DADOS.sanearEstado(JSON.parse(JSON.stringify(DADOS.enxugar(st.estado))));
      var reg = volta.repasses.filter(function (r) { return r.mes === '2026-10'; })[0];
      igual(reg.participantes.length, 14);
      igual(reg.participantes[0].id, 'A01');
      var st2 = core.criarStore(volta, { usuario: 'qa' });
      st2.recalcular();
      verdadeiro(st2.repasse(2026, 10).participantesGuardados);
    });

    it('a operação nova é só do administrador, vai ao servidor e não roda em concorrência', function () {
      verdadeiro(core.MUTACOES_STORE.indexOf('atualizarParticipantesRepasse') >= 0);
      verdadeiro(core.MUTACOES_SO_ADMIN.indexOf('atualizarParticipantesRepasse') >= 0);
      falso(core.MUTACOES_SEGURAS_EM_CONCORRENCIA.indexOf('atualizarParticipantesRepasse') >= 0);
    });
  });
};
