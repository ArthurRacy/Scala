/**
 * QA 06 — FINANCEIRO, INDICADORES e DASHBOARD
 * Cobre TASK-402 (ledger unificado, pago x pendente) e TASK-403 (indicadores
 * e dashboard exatos por mês/ano).
 */
'use strict';

module.exports = function (t, core, dados) {
  var describe = t.describe, it = t.it, igual = t.igual, verdadeiro = t.verdadeiro,
      falso = t.falso;

  var seed = dados.seed;

  function novoStore() { return core.criarStoreComSeed(seed, { usuario: 'qa' }); }

  function dadosCirurgia(extra) {
    return Object.assign({
      status: 'Realizada', data: '2026-10-01',
      inicioPrev: '07:00', fimPrev: '13:00',
      inicioReal: '07:00', fimReal: '13:00',
      paciente: 'Paciente', convenio: 'Particular',
      procedimento: 'Proc', cirurgiao: 'Dr.',
      anestesista: 'Fabrício Tavares', sala: 'S1',
      avaliacaoNec: 'Não', valor: 1000, pago: 'Não'
    }, extra || {});
  }

  /** Cenário reutilizado: 3 anestesias + 1 avaliação, em outubro/2026. */
  function cenario() {
    var store = novoStore();
    // 1000 pago, com NF
    store.adicionarCirurgia(dadosCirurgia({
      paciente: 'Ana', valor: 1000, pago: 'Sim', nf: 'NF-1', dataPagamento: '2026-10-10'
    }));
    // 2000 pendente, sem NF
    store.adicionarCirurgia(dadosCirurgia({
      paciente: 'Bruno', valor: 2000, pago: 'Não', inicioPrev: '14:00', fimPrev: '16:00',
      inicioReal: '14:00', fimReal: '16:00'
    }));
    // 500 cancelada — não deve entrar em nada
    store.adicionarCirurgia(dadosCirurgia({
      paciente: 'Carla', valor: 500, pago: 'Sim', status: 'Cancelada',
      inicioPrev: '17:00', fimPrev: '18:00', inicioReal: '', fimReal: ''
    }));
    // cirurgia com avaliação pré, 300 pago
    store.adicionarCirurgia(dadosCirurgia({
      paciente: 'Diego', valor: 1500, pago: 'Sim', nf: 'NF-2', avaliacaoNec: 'Sim',
      inicioPrev: '19:00', fimPrev: '20:00', inicioReal: '19:00', fimReal: '20:00'
    }));
    var av = store.estado.avaliacoes[0];
    store.atualizarAvaliacao(av.id, {
      realizada: 'Sim', data: '2026-10-05', anestesista: 'Fabrício Tavares',
      valor: 300, pago: 'Sim', nf: 'NF-3'
    });
    return store;
  }

  /* ===================================================== TASK-402 ======= */
  describe('TASK-402 — Ledger unificado', function () {

    it('reúne anestesias e avaliações numa só lista', function () {
      var store = cenario();
      var ledger = store.ledger();
      var tipos = {};
      ledger.forEach(function (l) { tipos[l.tipo] = (tipos[l.tipo] || 0) + 1; });
      igual(tipos['Anestesia'], 3, 'Ana, Bruno, Diego (Carla está cancelada)');
      igual(tipos['Avaliação pré'], 1);
    });

    it('usa exatamente os rótulos de TIPO da planilha', function () {
      var store = cenario();
      store.ledger().forEach(function (l) {
        verdadeiro(core.DOMINIOS.TIPO_LANCAMENTO.indexOf(l.tipo) >= 0, 'tipo inválido: ' + l.tipo);
      });
    });

    it('exclui cirurgia cancelada do ledger', function () {
      var store = cenario();
      falso(store.ledger().some(function (l) { return l.paciente === 'Carla'; }));
    });

    it('exclui lançamento sem VALOR (critério da planilha)', function () {
      var store = novoStore();
      store.adicionarCirurgia(dadosCirurgia({ paciente: 'Sem Valor', valor: '' }));
      igual(store.ledger().length, 0, 'sem valor não é receita');
    });

    it('STATUS DA NOTA é "Emitida" com NF e "Sem nota" sem NF', function () {
      var store = cenario();
      var ana = store.ledger().filter(function (l) { return l.paciente === 'Ana'; })[0];
      var bruno = store.ledger().filter(function (l) { return l.paciente === 'Bruno'; })[0];
      igual(ana.statusNota, 'Emitida');
      igual(bruno.statusNota, 'Sem nota');
    });

    it('a DATA do lançamento de anestesia é a data da cirurgia', function () {
      var store = cenario();
      var ana = store.ledger().filter(function (l) { return l.paciente === 'Ana'; })[0];
      igual(ana.data, '2026-10-01');
    });

    it('a DATA do lançamento de avaliação é a data da avaliação', function () {
      var store = cenario();
      var av = store.ledger().filter(function (l) { return l.tipo === 'Avaliação pré'; })[0];
      igual(av.data, '2026-10-05');
    });

    it('o ledger de avaliação mostra o ID da cirurgia (como na planilha)', function () {
      var store = cenario();
      var av = store.ledger().filter(function (l) { return l.tipo === 'Avaliação pré'; })[0];
      verdadeiro(/^CIR/.test(av.id), 'ID exibido: ' + av.id);
      verdadeiro(/^AVP/.test(av.idAvaliacao), 'ID próprio preservado: ' + av.idAvaliacao);
    });

    it('separa pagos de pendentes com subtotais', function () {
      var store = cenario();
      var sep = core.separarPorPagamento(store.ledger());
      igual(sep.qtdPagos, 3, 'Ana 1000, Diego 1500, avaliação 300');
      igual(sep.somaPagos, 2800);
      igual(sep.qtdPendentes, 1, 'Bruno 2000');
      igual(sep.somaPendentes, 2000);
    });

    it('filtra só pendentes', function () {
      var store = cenario();
      var pend = store.ledger({ apenasPendentes: true });
      igual(pend.length, 1);
      igual(pend[0].paciente, 'Bruno');
    });

    it('filtra só sem nota fiscal', function () {
      var store = cenario();
      var sem = store.ledger({ apenasSemNota: true });
      igual(sem.length, 1);
      igual(sem[0].paciente, 'Bruno');
    });

    it('filtra por competência e por anestesista', function () {
      var store = cenario();
      igual(store.ledger({ mes: 10, ano: 2026 }).length, 4);
      igual(store.ledger({ mes: 11, ano: 2026 }).length, 0);
      igual(store.ledger({ anestesista: 'Fabrício Tavares' }).length, 4);
      igual(store.ledger({ anestesista: 'Alene Cunha' }).length, 0);
    });

    it('vem ordenado por data', function () {
      var store = cenario();
      var l = store.ledger();
      for (var i = 1; i < l.length; i++) {
        verdadeiro(String(l[i - 1].data) <= String(l[i].data), 'ledger fora de ordem');
      }
    });
  });

  describe('FINANCEIRO — indicadores mensais', function () {

    it('calcula total, recebido e pendente de anestesias', function () {
      var store = cenario();
      var f = store.financeiro(10, 2026);
      igual(f.totalAnestesias, 4500, '1000 + 2000 + 1500 (Carla cancelada fora)');
      igual(f.recebidoAnestesias, 2500, '1000 + 1500');
      igual(f.pendenteAnestesias, 2000, 'Bruno');
    });

    it('calcula total, recebido e pendente de avaliações', function () {
      var store = cenario();
      var f = store.financeiro(10, 2026);
      igual(f.totalAvaliacoes, 300);
      igual(f.recebidoAvaliacoes, 300);
      igual(f.pendenteAvaliacoes, 0);
    });

    it('TOTAL GERAL RECEBIDO soma as duas origens', function () {
      var store = cenario();
      var f = store.financeiro(10, 2026);
      igual(f.totalRecebido, 2800);
      igual(f.totalPendente, 2000);
      igual(f.totalFaturado, 4800);
    });

    it('pendente = total - recebido, sempre', function () {
      var store = cenario();
      var f = store.financeiro(10, 2026);
      igual(f.pendenteAnestesias, f.totalAnestesias - f.recebidoAnestesias);
      igual(f.pendenteAvaliacoes, f.totalAvaliacoes - f.recebidoAvaliacoes);
      igual(f.totalPendente, f.totalFaturado - f.totalRecebido);
    });

    it('mês sem movimento devolve zeros, não erro', function () {
      var store = cenario();
      var f = store.financeiro(12, 2026);
      igual(f.totalAnestesias, 0);
      igual(f.totalRecebido, 0);
      igual(f.totalPendente, 0);
    });

    it('conta procedimentos pagos sem nota fiscal', function () {
      var store = novoStore();
      store.adicionarCirurgia(dadosCirurgia({ valor: 1000, pago: 'Sim', nf: '' }));
      store.adicionarCirurgia(dadosCirurgia({
        valor: 1000, pago: 'Sim', nf: 'NF-9',
        inicioPrev: '14:00', fimPrev: '15:00', inicioReal: '14:00', fimReal: '15:00'
      }));
      var f = store.financeiro(10, 2026);
      igual(f.semNota, 1);
      igual(f.comNota, 1);
    });

    it('consolida o ano nos três meses do horizonte', function () {
      var store = cenario();
      var anual = core.consolidarFinanceiroAnual(store.estado.cirurgias, store.estado.avaliacoes, 2026);
      igual(anual.meses.length, 3);
      igual(anual.meses[0].sigla, 'OUT');
      igual(anual.total.totalRecebido, 2800);
    });
  });

  /* ===================================================== TASK-403 ======= */
  describe('TASK-403 — INDICADORES por anestesista', function () {

    it('conta só as cirurgias Realizadas', function () {
      var store = novoStore();
      store.adicionarCirurgia(dadosCirurgia({ status: 'Realizada' }));
      store.adicionarCirurgia(dadosCirurgia({
        status: 'Agendada', inicioPrev: '14:00', fimPrev: '15:00', inicioReal: '', fimReal: ''
      }));
      store.adicionarCirurgia(dadosCirurgia({
        status: 'Cancelada', inicioPrev: '16:00', fimPrev: '17:00', inicioReal: '', fimReal: ''
      }));

      var i = store.indicadores('Fabrício Tavares', 10, 2026);
      igual(i.numCirurgias, 1, 'só a Realizada');
    });

    it('as horas usam "<>Cancelada", não "Realizada"', function () {
      var store = novoStore();
      store.adicionarCirurgia(dadosCirurgia({ status: 'Realizada', inicioReal: '07:00', fimReal: '13:00' }));
      store.adicionarCirurgia(dadosCirurgia({
        status: 'Agendada', inicioPrev: '14:00', fimPrev: '17:00', inicioReal: '', fimReal: ''
      }));

      var i = store.indicadores('Fabrício Tavares', 10, 2026);
      igual(i.numCirurgias, 1);
      igual(i.horasReais, 6);
      igual(i.horasEstimadas, 9, '6h da realizada + 3h da agendada');
    });

    it('conta só as avaliações realizadas', function () {
      var store = cenario();
      var i = store.indicadores('Fabrício Tavares', 10, 2026);
      igual(i.numAvaliacoes, 1);
    });

    it('VALOR PENDENTE EM ANESTESIAS = total - recebido (corrige o erro da planilha)', function () {
      var store = cenario();
      var i = store.indicadores('Fabrício Tavares', 10, 2026);
      igual(i.totalAnest, 4500);
      igual(i.recebidoAnest, 2500);
      igual(i.pendenteAnest, 2000, 'conta correta: VALOR TOTAL - VALOR RECEBIDO');

      // Regressão: a fórmula antiga da planilha (B14 = B11-B12) subtraía
      // dinheiro de uma CONTAGEM de avaliações — número sem sentido
      // financeiro. Não recalculamos isso em produção (ver core/09_indicadores.js);
      // aqui só provamos que o resultado certo não coincide com o do bug.
      var formulaAntiga = i.numAvaliacoes - i.totalAnest;
      falso(i.pendenteAnest === formulaAntiga, 'não pode coincidir com a fórmula antiga (B11-B12)');
    });

    it('TOTAL RECEBIDO = recebido anest. + recebido aval. (corrige o erro da planilha)', function () {
      var store = cenario();
      var i = store.indicadores('Fabrício Tavares', 10, 2026);
      igual(i.totalRecebido, 2800, '2500 + 300');

      // Regressão: a fórmula antiga da planilha (B18 = B12+B16) somava o
      // TOTAL de anestesias em vez do RECEBIDO, inflando o caixa.
      var formulaAntiga = i.totalAnest + i.recebidoAval;
      igual(formulaAntiga, 4800, 'confirma que a fórmula antiga daria outro número');
      falso(i.totalRecebido === formulaAntiga, 'não pode coincidir com a fórmula antiga (B12+B16)');
    });

    it('conta notas fiscais e procedimentos pagos sem nota', function () {
      var store = cenario();
      var i = store.indicadores('Fabrício Tavares', 10, 2026);
      igual(i.qtdNotas, 3, 'NF-1, NF-2 e NF-3');
      // Carla está Cancelada, mas foi marcada como PAGA e sem nota fiscal.
      // A contagem de "pagos sem NF" não filtra status — é assim na planilha,
      // e é o comportamento desejado: dinheiro recebido sem nota emitida é
      // exatamente a pendência que este indicador existe para mostrar, ainda
      // mais quando o procedimento foi cancelado.
      igual(i.qtdSemNota, 1, 'Carla: cancelada, paga e sem nota');
    });

    it('o indicador de "pago sem nota" não filtra por status (igual à planilha)', function () {
      var store = novoStore();
      store.adicionarCirurgia(dadosCirurgia({
        status: 'Cancelada', valor: 500, pago: 'Sim', nf: '', inicioReal: '', fimReal: ''
      }));
      var i = store.indicadores('Fabrício Tavares', 10, 2026);
      igual(i.qtdSemNota, 1);
      igual(i.totalAnest, 0, 'mas o valor da cancelada não entra no faturamento');
    });

    it('anestesista sem movimento no mês devolve tudo zero', function () {
      var store = cenario();
      var i = store.indicadores('Alene Cunha', 10, 2026);
      igual(i.numCirurgias, 0);
      igual(i.totalAnest, 0);
      igual(i.totalRecebido, 0);
      igual(i.pendenteAnest, 0);
    });

    it('o comparativo traz uma linha por anestesista', function () {
      var store = cenario();
      var comp = store.comparativo(10, 2026);
      igual(comp.length, 15);
      var fab = comp.filter(function (l) { return l.anestesista === 'Fabrício Tavares'; })[0];
      igual(fab.numCirurgias, 3);
      igual(fab.totalRecebido, 2800);
    });

    it('a coluna VALOR PENDENTE do comparativo fecha com E-F', function () {
      var store = cenario();
      store.comparativo(10, 2026).forEach(function (l) {
        igual(l.pendenteAnest, core.arredondar2(l.totalAnest - l.recebidoAnest), l.anestesista);
      });
    });

    it('os totais do comparativo somam as 15 linhas', function () {
      var store = cenario();
      var comp = store.comparativo(10, 2026);
      var tot = core.totaisComparativo(comp);
      igual(tot.numCirurgias, 3);
      igual(tot.totalAnest, 4500);
      igual(tot.totalRecebido, 2800);
    });

    it('ranqueia por critério', function () {
      var store = cenario();
      var r = core.ranquear(store.comparativo(10, 2026), 'numCirurgias');
      igual(r[0].anestesista, 'Fabrício Tavares');
    });
  });

  describe('TASK-403 — DASHBOARD', function () {

    it('conta realizadas e canceladas separadamente', function () {
      var store = cenario();
      var d = store.dashboard(10, 2026);
      igual(d.kpis.cirurgiasRealizadas, 3);
      igual(d.kpis.cirurgiasCanceladas, 1);
    });

    it('soma as horas reais do mês, excluindo cancelada', function () {
      var store = cenario();
      var d = store.dashboard(10, 2026);
      igual(d.kpis.horasTotais, 6 + 2 + 1, 'Ana 6h, Bruno 2h, Diego 1h');
    });

    it('receita, recebido e pendente fecham entre si', function () {
      var store = cenario();
      var k = store.dashboard(10, 2026).kpis;
      igual(k.receitaAnestesias, 4500);
      igual(k.receitaAvaliacoes, 300);
      igual(k.totalRecebido, 2800);
      igual(k.totalPendente, 2000);
      igual(k.totalFaturado, k.receitaAnestesias + k.receitaAvaliacoes);
      igual(k.totalPendente, k.totalFaturado - k.totalRecebido);
    });

    it('conta as avaliações realizadas', function () {
      var store = cenario();
      igual(store.dashboard(10, 2026).kpis.numAvaliacoes, 1);
    });

    it('a série por anestesista tem os 15, na ordem do cadastro', function () {
      var store = cenario();
      var s = store.dashboard(10, 2026).porAnestesista;
      igual(s.length, 15);
      igual(s[0].rotulo, 'Roberta Almeida');
      igual(s[5].rotulo, 'Fabrício Tavares');
      igual(s[5].valor, 3);
    });

    it('a série por mês cobre OUT, NOV e DEZ', function () {
      var store = cenario();
      var s = store.dashboard(10, 2026).porMes;
      igual(s.length, 3);
      igual(s[0].rotulo, 'Outubro');
      igual(s[0].valor, 3);
      igual(s[1].valor, 0);
    });

    it('a série de status cobre os 5 valores do domínio', function () {
      var store = cenario();
      var s = store.dashboard(10, 2026).porStatus;
      igual(s.length, 5);
      igual(s.filter(function (x) { return x.rotulo === 'Realizada'; })[0].valor, 3);
      igual(s.filter(function (x) { return x.rotulo === 'Cancelada'; })[0].valor, 1);
    });

    it('a série de convênio ignora cancelada e ordena do maior', function () {
      var store = cenario();
      var s = store.dashboard(10, 2026).porConvenio;
      igual(s[0].rotulo, 'Particular');
      igual(s[0].valor, 3);
    });

    it('calcula as taxas de leitura rápida', function () {
      var store = cenario();
      var k = store.dashboard(10, 2026).kpis;
      igual(k.taxaCancelamento, 25, '1 cancelada em 4 desfechos');
      verdadeiro(k.taxaRecebimento > 58 && k.taxaRecebimento < 59, 'taxa: ' + k.taxaRecebimento);
    });

    it('mês vazio não divide por zero', function () {
      var store = novoStore();
      var k = store.dashboard(12, 2026).kpis;
      igual(k.taxaCancelamento, 0);
      igual(k.taxaRecebimento, 0);
      igual(k.mediaHorasPorCirurgia, 0);
    });

    it('o filtro de mês/ano muda todos os números', function () {
      var store = cenario();
      store.adicionarCirurgia(dadosCirurgia({
        data: '2026-11-03', paciente: 'Nov', valor: 700, pago: 'Sim'
      }));
      igual(store.dashboard(10, 2026).kpis.cirurgiasRealizadas, 3);
      igual(store.dashboard(11, 2026).kpis.cirurgiasRealizadas, 1);
      igual(store.dashboard(11, 2026).kpis.totalRecebido, 700);
    });
  });
};
