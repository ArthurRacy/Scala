/**
 * QA 13 — Revisão de lógica (set/2026)
 * Cada teste aqui corresponde a um defeito encontrado na revisão profunda e
 * falharia com o código anterior.
 */
'use strict';

module.exports = function (t, core, dados) {
  var describe = t.describe, it = t.it, igual = t.igual, verdadeiro = t.verdadeiro, falso = t.falso;

  var seed = dados.seed;
  function novoStore() { return core.criarStoreComSeed(seed, { usuario: 'qa' }); }

  // 01/10/2026 é quinta; o elenco de quinta começa em Fabrício Tavares.
  function cirurgia(extra) {
    return Object.assign({
      status: 'Agendada', data: '2026-10-01', inicioPrev: '07:00', fimPrev: '09:00',
      paciente: 'Paciente', procedimento: 'Rinoplastia', anestesista: 'Fabrício Tavares',
      avaliacaoNec: 'Não'
    }, extra || {});
  }

  function temAviso(rel, campo) {
    return rel.avisos.some(function (a) { return a.campo === campo; });
  }

  describe('Dinheiro e horas — formatação e leitura', function () {

    it('centavos que arredondam para 100 passam para o real', function () {
      igual(core.moedaBR(1234.999), 'R$ 1.235,00');
      igual(core.moedaBR(0.995), 'R$ 1,00');
      igual(core.moedaBR(-0.001), 'R$ 0,00', 'sem "-R$ 0,00"');
    });

    it('"1.500" em pt-BR é mil e quinhentos, não 1,5', function () {
      igual(core.paraNumero('1.500'), 1500);
      igual(core.paraNumero('R$ 1.250.000'), 1250000);
      igual(core.paraNumero('1.5'), 1.5, 'um ponto sem grupo de 3 continua decimal');
      igual(core.paraNumero('1234.56'), 1234.56);
    });

    it('duração negativa não vira "-1:-30"', function () {
      igual(core.horasHHMM(-0.5), '-0:30');
    });
  });

  describe('Cirurgias', function () {

    it('nome digitado sem acento vira a grafia do cadastro e acha a posição', function () {
      var st = novoStore();
      verdadeiro(st.adicionarCirurgia(cirurgia({ anestesista: 'fabricio TAVARES' })).ok);
      var c = st.estado.cirurgias[0];
      igual(c.anestesista, 'Fabrício Tavares');
      igual(c.posicao, 1, 'antes caía "fora da escala-base"');
    });

    it('início igual ao término não é 24 horas de conflito', function () {
      var a = { inicioPrev: '07:00', fimPrev: '07:00' };
      var b = { inicioPrev: '08:00', fimPrev: '10:00' };
      falso(core.horariosSobrepostos(a, b));
      verdadeiro(core.horariosSobrepostos({ inicioPrev: '22:00', fimPrev: '02:00' }, { inicioPrev: '23:00', fimPrev: '23:30' }),
        'virada de meia-noite continua valendo');
    });

    it('valor que não é número é recusado (antes virava vazio calado)', function () {
      var rel = core.validarCirurgia(cirurgia({ valor: 'abc' }));
      falso(rel.ok);
    });

    it('avisa: realizada com data futura, realizada sem anestesista, término = início', function () {
      igual(core.CONFIG.HOJE, null);
      core.CONFIG.HOJE = '2026-10-05';
      try {
        verdadeiro(temAviso(core.validarCirurgia(cirurgia({ status: 'Realizada', data: '2026-10-20' })), 'status'));
        verdadeiro(temAviso(core.validarCirurgia(cirurgia({ status: 'Realizada', anestesista: '' })), 'anestesista'));
        verdadeiro(temAviso(core.validarCirurgia(cirurgia({ fimPrev: '07:00' })), 'fimPrev'));
        falso(temAviso(core.validarCirurgia(cirurgia({ status: 'Realizada', data: '2026-10-01' })), 'status'));
      } finally { core.CONFIG.HOJE = null; }
    });

    it('trocar para anestesista INATIVO gera aviso', function () {
      var st = novoStore();
      st.salvarAnestesista({ id: 'A09', ativo: 'Não' });
      var r = st.adicionarCirurgia(cirurgia({ anestesista: st.estado.anestesistas[8].nome }));
      verdadeiro(r.ok);
      verdadeiro(r.avisos.some(function (a) { return /INATIVO/.test(a.msg); }));
    });
  });

  describe('Avaliações e faturamento', function () {

    it('avaliação nasce sem valor (não vira lançamento de R$ 0,00)', function () {
      var st = novoStore();
      st.adicionarCirurgia(cirurgia({ avaliacaoNec: 'Sim' }));
      igual(st.estado.avaliacoes[0].valor, null);
      igual(st.ledger().filter(function (l) { return l.tipo === 'Avaliação pré'; }).length, 0);
    });

    it('avaliação NÃO feita de cirurgia cancelada sai do faturamento', function () {
      var st = novoStore();
      st.adicionarCirurgia(cirurgia({ avaliacaoNec: 'Sim', valor: 1000 }));
      var a = st.estado.avaliacoes[0];
      st.atualizarAvaliacao(a.id, { valor: 300 });
      igual(st.financeiro(10, 2026).totalAvaliacoes, 300);
      st.atualizarCirurgia(st.estado.cirurgias[0].id, { status: 'Cancelada' });
      igual(st.financeiro(10, 2026).totalAvaliacoes, 0);
      igual(st.dashboard(10, 2026).kpis.avaliacoesPendentes, 0, 'nem conta como pendente');
    });

    it('avaliação FEITA continua faturada mesmo com a cirurgia cancelada depois', function () {
      var st = novoStore();
      st.adicionarCirurgia(cirurgia({ avaliacaoNec: 'Sim' }));
      var a = st.estado.avaliacoes[0];
      st.atualizarAvaliacao(a.id, { valor: 300, realizada: 'Sim', anestesista: 'Alene Cunha', data: '2026-09-28' });
      st.atualizarCirurgia(st.estado.cirurgias[0].id, { status: 'Cancelada' });
      igual(st.financeiro(9, 2026).totalAvaliacoes, 300);
    });

    it('lançamento de avaliação ainda não feita usa a data da cirurgia', function () {
      var st = novoStore();
      st.adicionarCirurgia(cirurgia({ avaliacaoNec: 'Sim' }));
      st.atualizarAvaliacao(st.estado.avaliacoes[0].id, { valor: 250 });
      var l = st.ledger().filter(function (x) { return x.tipo === 'Avaliação pré'; })[0];
      igual(l.data, '2026-10-01');
    });

    it('avaliação depois da cirurgia gera aviso', function () {
      var rel = core.validarAvaliacao({ idCirurgia: 'CIR0001', data: '2026-10-05', dataCirurgia: '2026-10-01' });
      verdadeiro(temAviso(rel, 'data'));
    });
  });

  describe('Cadastro e escala', function () {

    it('renomear leva o nome junto para escala, cirurgias e avaliações', function () {
      var st = novoStore();
      st.adicionarCirurgia(cirurgia({ avaliacaoNec: 'Sim' }));
      var r = st.salvarAnestesista({ id: 'A06', nome: 'Fabrício T. Tavares' });
      verdadeiro(r.ok, JSON.stringify(r.erros));
      var c = st.estado.cirurgias[0];
      igual(c.anestesista, 'Fabrício T. Tavares');
      igual(c.posicao, 1, 'continua achando a posição');
      igual(st.estado.avaliacoes[0].anestCirurgia, 'Fabrício T. Tavares');
      verdadeiro(st.estado.escalaBase.some(function (l) { return l.nome === 'Fabrício T. Tavares'; }));
      falso(st.estado.escalaBase.some(function (l) { return l.nome === 'Fabrício Tavares'; }));
      verdadeiro(st.estado.log.some(function (l) { return l.campo === 'NOME ATUALIZADO EM CASCATA'; }));
      verdadeiro(st.verificarIntegridade().ok, 'nada fica órfão');
    });

    it('substituição não pode pôr a mesma pessoa em dois postos no dia', function () {
      var st = novoStore();
      var dia = st.escalaDoMes(2026, 10).filter(function (l) { return l.data === '2026-10-01'; });
      var r = st.ajustarEscala('2026-10-01', 2, { substituto: dia[0].efetivo, motivo: 'x' });
      falso(r.ok);
      verdadeiro(/dois postos/.test(r.erros[0].msg));
    });

    it('inativo que continua na escala-base gera aviso', function () {
      var st = novoStore();
      st.salvarAnestesista({ id: 'A06', ativo: 'Não' });
      var rel = core.validarEscalaBase(st.estado.escalaBase, st.estado.anestesistas);
      verdadeiro(rel.ok, 'não bloqueia');
      verdadeiro(rel.avisos.some(function (a) { return /INATIVO/.test(a.msg); }));
    });
  });

  describe('Histórico', function () {

    it('avaliação órfã mantém paciente e data (não some do mês)', function () {
      var a = { idCirurgia: 'CIR9999', paciente: 'Ana', dataCirurgia: '2026-10-01', nomeCirurgia: 'y', anestCirurgia: 'z' };
      core.recalcularAvaliacao(a, null);
      igual(a.paciente, 'Ana');
      igual(a.mes, 10);
    });

    it('o LOG de exclusão guarda o resumo do que foi apagado', function () {
      var st = novoStore();
      st.adicionarCirurgia(cirurgia({ paciente: 'Maria Souza', valor: 1500, pago: 'Sim', nf: '77' }));
      st.removerCirurgia(st.estado.cirurgias[0].id, { comAvaliacoes: true });
      var l = st.estado.log.filter(function (x) { return x.campo === 'REGISTRO EXCLUÍDO'; })[0];
      verdadeiro(/Maria Souza/.test(l.de), l.de);
      verdadeiro(/01\/10\/2026/.test(l.de));
      verdadeiro(/R\$ 1\.500,00 \(pago\)/.test(l.de));
      verdadeiro(/NF 77/.test(l.de));
    });
  });
};
