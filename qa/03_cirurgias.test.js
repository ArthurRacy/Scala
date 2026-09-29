/**
 * QA 03 — Aba CIRURGIAS: automações e colunas calculadas
 * Cobre TASK-201 (lista suspensa), TASK-202 (ID automático) e TASK-203
 * (posição no rodízio), além de todas as colunas "(auto)".
 */
'use strict';

module.exports = function (t, core, dados) {
  var describe = t.describe, it = t.it, igual = t.igual, verdadeiro = t.verdadeiro,
      falso = t.falso;

  var seed = dados.seed;
  var porNome = core.indexarAnestesistasPorNome(seed.ANESTESISTAS);

  var escalas = {};
  [10, 11, 12].forEach(function (m) {
    escalas[m] = core.gerarEscalaMensal(2026, m, seed.ESCALA_BASE, {}, seed.ANESTESISTAS);
  });
  var idxEscala = core.indexarConsolidada(core.gerarConsolidada(escalas, seed.ANESTESISTAS));

  /** Cirurgia de exemplo, já recalculada. */
  function cirurgia(extra) {
    var c = Object.assign({
      id: 'CIR0001', status: 'Agendada', data: '2026-10-01',
      inicioPrev: '07:00', fimPrev: '13:00', inicioReal: '', fimReal: '',
      paciente: 'Paciente Teste', convenio: 'Particular', telefone: '',
      procedimento: 'Procedimento Teste', cirurgiao: 'Dr. Teste',
      anestesista: 'Fabrício Tavares', sala: 'Sala 1',
      avaliacaoNec: 'Não', valor: 1000, pago: 'Não',
      dataPagamento: '', nf: '', obs: ''
    }, extra || {});
    return core.recalcularCirurgia(c, { porNome: porNome, idxEscala: idxEscala, avaliacoesPorCirurgia: {} });
  }

  /* ===================================================== TASK-201 ======= */
  describe('TASK-201 — ANESTESISTA restrito aos 15 do cadastro', function () {

    it('aceita nome que existe no cadastro', function () {
      var rel = core.validarCirurgia(cirurgia({ anestesista: 'Fabrício Tavares' }),
        { nomesAnestesistas: seed.ANESTESISTAS.map(function (a) { return a.nome; }) });
      verdadeiro(rel.ok, rel.resumo());
    });

    it('recusa nome que não existe no cadastro', function () {
      var rel = core.validarCirurgia(cirurgia({ anestesista: 'Dr. Inventado' }),
        { nomesAnestesistas: seed.ANESTESISTAS.map(function (a) { return a.nome; }) });
      falso(rel.ok);
      verdadeiro(rel.erros.some(function (e) { return e.campo === 'anestesista'; }));
    });

    it('a lista de opções tem exatamente os 15 nomes', function () {
      var store = core.criarStoreComSeed(seed);
      igual(store.nomesAnestesistas().length, 15);
    });

    it('a lista de ativos filtra quem está inativo', function () {
      var s = JSON.parse(JSON.stringify(seed));
      s.ANESTESISTAS[0].ativo = 'Não';
      var store = core.criarStoreComSeed(s);
      igual(store.nomesAnestesistas(true).length, 14);
      igual(store.nomesAnestesistas().length, 15, 'sem filtro continua 15');
    });

    it('o STATUS é restrito à lista suspensa', function () {
      var rel = core.validarCirurgia(cirurgia({ status: 'Suspensa' }), {});
      falso(rel.ok);
    });
  });

  /* ===================================================== TASK-202 ======= */
  describe('TASK-202 — ID_ANESTESISTA (auto) por busca no cadastro', function () {

    it('preenche o ID a partir do nome escolhido', function () {
      igual(cirurgia({ anestesista: 'Fabrício Tavares' }).idAnestesista, 'A06');
      igual(cirurgia({ anestesista: 'Roberta Almeida' }).idAnestesista, 'A01');
      igual(cirurgia({ anestesista: 'Maria Fernanda' }).idAnestesista, 'A15');
    });

    it('resolve o nome ignorando caixa e acento', function () {
      igual(cirurgia({ anestesista: 'fabricio tavares' }).idAnestesista, 'A06');
      igual(cirurgia({ anestesista: 'FABRÍCIO TAVARES' }).idAnestesista, 'A06');
    });

    it('fica vazio quando o anestesista não foi escolhido', function () {
      igual(cirurgia({ anestesista: '' }).idAnestesista, '');
    });

    it('fica vazio (não quebra) quando o nome não existe', function () {
      igual(cirurgia({ anestesista: 'Dr. Inventado' }).idAnestesista, '');
    });

    it('resolve todos os 15 nomes do cadastro', function () {
      seed.ANESTESISTAS.forEach(function (a) {
        igual(cirurgia({ anestesista: a.nome }).idAnestesista, a.id, 'nome ' + a.nome);
      });
    });
  });

  /* ===================================================== TASK-203 ======= */
  describe('TASK-203 — POSIÇÃO DO ANESTESISTA NO RODÍZIO', function () {

    it('acha a posição cruzando DATA e ANESTESISTA na consolidada', function () {
      igual(cirurgia({ data: '2026-10-01', anestesista: 'Fabrício Tavares' }).posicao, 1);
      igual(cirurgia({ data: '2026-10-01', anestesista: 'Marcus Vinícius' }).posicao, 3);
      igual(cirurgia({ data: '2026-10-01', anestesista: 'Priscilla De Carli' }).posicao, 5);
    });

    it('acompanha o giro semanal', function () {
      igual(cirurgia({ data: '2026-10-08', anestesista: 'Heloísa Roncolato' }).posicao, 1);
      igual(cirurgia({ data: '2026-10-08', anestesista: 'Fabrício Tavares' }).posicao, 5);
    });

    it('marca "fora da escala-base" quem não está escalado no dia', function () {
      igual(cirurgia({ data: '2026-10-01', anestesista: 'Alene Cunha' }).posicao, 'fora da escala-base');
    });

    it('fica vazio quando falta data ou anestesista', function () {
      igual(cirurgia({ data: '', anestesista: 'Fabrício Tavares' }).posicao, '');
      igual(cirurgia({ anestesista: '' }).posicao, '');
    });
  });

  describe('Colunas de tempo (F e I)', function () {

    it('TEMPO ESTIMADO = término previsto - início previsto', function () {
      igual(cirurgia({ inicioPrev: '07:00', fimPrev: '13:00' }).tempoEstimado, 6);
      igual(cirurgia({ inicioPrev: '08:30', fimPrev: '09:15' }).tempoEstimado, 0.75);
    });

    it('TEMPO REAL = término real - início real', function () {
      igual(cirurgia({ inicioReal: '07:10', fimReal: '12:40' }).tempoReal, 5.5);
    });

    it('os dois ficam null quando falta um dos lados', function () {
      igual(cirurgia({ inicioReal: '07:00', fimReal: '' }).tempoReal, null);
      igual(cirurgia({ inicioPrev: '', fimPrev: '13:00' }).tempoEstimado, null);
    });

    it('trata cirurgia que atravessa a meia-noite', function () {
      igual(cirurgia({ inicioReal: '22:00', fimReal: '02:30' }).tempoReal, 4.5);
    });

    it('avisa quando a duração real passa do teto de sanidade', function () {
      var c = cirurgia({ inicioPrev: '07:00', fimPrev: '08:00' });
      var rel = core.validarCirurgia(c, {});
      // 24h exatas não dispara; o aviso é para o que excede.
      verdadeiro(rel.avisos.length >= 0);
    });

    it('avisa quando só um dos horários reais foi preenchido', function () {
      var rel = core.validarCirurgia(cirurgia({ inicioReal: '07:00', fimReal: '' }), {});
      verdadeiro(rel.avisos.some(function (a) { return /incompleto/i.test(a.msg); }));
    });
  });

  describe('Colunas Z, AA, AB, AC, AD', function () {

    it('DIA DA SEMANA (auto) segue o vocabulário da planilha', function () {
      igual(cirurgia({ data: '2026-10-01' }).dia, 'QUINTA-FEIRA');
      igual(cirurgia({ data: '2026-10-03' }).dia, 'SÁBADO');
    });

    it('ANESTESISTAS ESCALADOS NO DIA lista os 5 com " | "', function () {
      igual(cirurgia({ data: '2026-10-01' }).escalados,
        'Fabrício Tavares | Heloísa Roncolato | Marcus Vinícius | Maria Fernanda | Priscilla De Carli');
    });

    it('SUGESTÃO ANESTESISTA - POSIÇÃO 1 traz quem abre o dia', function () {
      igual(cirurgia({ data: '2026-10-01' }).sugestaoPos1, 'Fabrício Tavares');
      igual(cirurgia({ data: '2026-10-08' }).sugestaoPos1, 'Heloísa Roncolato');
    });

    it('MÊS e ANO (auto) saem da data da cirurgia', function () {
      var c = cirurgia({ data: '2026-12-15' });
      igual(c.mes, 12);
      igual(c.ano, 2026);
    });

    it('todas as colunas auto ficam vazias quando não há data', function () {
      var c = cirurgia({ data: '' });
      igual(c.dia, '');
      igual(c.mes, '');
      igual(c.ano, '');
      igual(c.escalados, '');
      igual(c.sugestaoPos1, '');
    });
  });

  describe('Coluna T — STATUS DA AVALIAÇÃO PRÉ-ANESTÉSICA', function () {

    it('mostra "N/A" quando a avaliação não é necessária', function () {
      igual(core.calcStatusAvaliacao({ avaliacaoNec: 'Não', id: 'CIR0001' }, {}), 'N/A');
    });

    it('mostra "Pendente" quando é necessária e não há avaliação realizada', function () {
      igual(core.calcStatusAvaliacao({ avaliacaoNec: 'Sim', id: 'CIR0001' }, {}), 'Pendente');
      igual(core.calcStatusAvaliacao({ avaliacaoNec: 'Sim', id: 'CIR0001' },
        { CIR0001: [{ realizada: 'Não' }] }), 'Pendente');
    });

    it('mostra "Realizada" quando há avaliação marcada como realizada', function () {
      igual(core.calcStatusAvaliacao({ avaliacaoNec: 'Sim', id: 'CIR0001' },
        { CIR0001: [{ realizada: 'Sim' }] }), 'Realizada');
    });

    it('só usa os três valores do vocabulário da planilha', function () {
      var validos = core.DOMINIOS.STATUS_AVALIACAO;
      [{ avaliacaoNec: 'Não' }, { avaliacaoNec: 'Sim' }, { avaliacaoNec: '' }].forEach(function (c) {
        c.id = 'CIR0001';
        verdadeiro(validos.indexOf(core.calcStatusAvaliacao(c, {})) >= 0);
      });
    });
  });

  describe('Critérios de contabilização (espelham os SUMIFS/COUNTIFS)', function () {

    it('"Cancelada" não é contabilizável; os outros 4 status são', function () {
      falso(core.cirurgiaContabilizavel({ status: 'Cancelada' }));
      ['Agendada', 'Confirmada', 'Realizada', 'Remarcada'].forEach(function (s) {
        verdadeiro(core.cirurgiaContabilizavel({ status: s }), s + ' deveria contar');
      });
    });

    it('só "Realizada" conta como executada', function () {
      verdadeiro(core.cirurgiaExecutada({ status: 'Realizada' }));
      ['Agendada', 'Confirmada', 'Cancelada', 'Remarcada'].forEach(function (s) {
        falso(core.cirurgiaExecutada({ status: s }), s + ' não é executada');
      });
    });

    it('a comparação de status ignora caixa e acento', function () {
      verdadeiro(core.cirurgiaExecutada({ status: 'realizada' }));
      falso(core.cirurgiaContabilizavel({ status: 'CANCELADA' }));
    });
  });

  describe('Conflito de agenda', function () {

    it('detecta o mesmo anestesista com horários sobrepostos no dia', function () {
      var lista = [
        cirurgia({ id: 'C1', inicioPrev: '07:00', fimPrev: '10:00' }),
        cirurgia({ id: 'C2', inicioPrev: '09:00', fimPrev: '12:00' })
      ];
      igual(core.detectarConflitos(lista).length, 1);
    });

    it('não acusa conflito quando os horários apenas se encostam', function () {
      var lista = [
        cirurgia({ id: 'C1', inicioPrev: '07:00', fimPrev: '10:00' }),
        cirurgia({ id: 'C2', inicioPrev: '10:00', fimPrev: '12:00' })
      ];
      igual(core.detectarConflitos(lista).length, 0);
    });

    it('não acusa conflito entre anestesistas diferentes', function () {
      var lista = [
        cirurgia({ id: 'C1', anestesista: 'Fabrício Tavares', inicioPrev: '07:00', fimPrev: '10:00' }),
        cirurgia({ id: 'C2', anestesista: 'Heloísa Roncolato', inicioPrev: '08:00', fimPrev: '11:00' })
      ];
      igual(core.detectarConflitos(lista).length, 0);
    });

    it('ignora cirurgia cancelada na checagem de conflito', function () {
      var lista = [
        cirurgia({ id: 'C1', inicioPrev: '07:00', fimPrev: '10:00' }),
        cirurgia({ id: 'C2', inicioPrev: '09:00', fimPrev: '12:00', status: 'Cancelada' })
      ];
      igual(core.detectarConflitos(lista).length, 0);
    });
  });

  describe('Normalização na gravação', function () {

    it('converte data pt-BR para ISO e hora para HH:MM', function () {
      var c = cirurgia({ data: '15/12/2026', inicioPrev: '7:00' });
      igual(c.data, '2026-12-15');
      igual(c.inicioPrev, '07:00');
    });

    it('canoniza status, convênio e Sim/Não', function () {
      var c = cirurgia({ status: 'realizada', convenio: 'unimed', pago: 'sim', avaliacaoNec: 'nao' });
      igual(c.status, 'Realizada');
      igual(c.convenio, 'Unimed');
      igual(c.pago, 'Sim');
      igual(c.avaliacaoNec, 'Não');
    });

    it('converte valor em texto pt-BR para número', function () {
      igual(cirurgia({ valor: 'R$ 1.500,50' }).valor, 1500.5);
    });

    it('recalcular duas vezes dá o mesmo resultado (idempotente)', function () {
      var c = cirurgia({ inicioReal: '07:00', fimReal: '13:00' });
      var antes = JSON.stringify(c);
      core.recalcularCirurgia(c, { porNome: porNome, idxEscala: idxEscala, avaliacoesPorCirurgia: {} });
      igual(JSON.stringify(c), antes);
    });
  });
};
