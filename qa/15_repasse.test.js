/**
 * QA 15 — Repasse (divisão igual do resultado do mês)
 */
'use strict';

module.exports = function (t, core, dados) {
  var describe = t.describe, it = t.it, igual = t.igual, verdadeiro = t.verdadeiro, falso = t.falso;

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
};
