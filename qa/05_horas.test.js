/**
 * QA 05 — Aba HORAS  (TASK-401 / MELHORIA 3)
 * O ponto central: horas reais e estimadas JAMAIS se somam, e a falta do
 * horário real numa cirurgia realizada incrementa o contador de pendência e
 * adota o tempo estimado provisoriamente — em campo separado.
 */
'use strict';

module.exports = function (t, core, dados) {
  var describe = t.describe, it = t.it, igual = t.igual, verdadeiro = t.verdadeiro,
      falso = t.falso, proximo = t.proximo;

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

  describe('Cálculo básico de horas', function () {

    it('soma as horas reais do anestesista no mês', function () {
      var store = novoStore();
      store.adicionarCirurgia(dadosCirurgia({ inicioReal: '07:00', fimReal: '13:00' }));
      store.adicionarCirurgia(dadosCirurgia({ inicioPrev: '14:00', fimPrev: '17:00', inicioReal: '14:00', fimReal: '17:30' }));

      var h = core.horasDoAnestesistaNoMes(store.estado.cirurgias, 'Fabrício Tavares', 10, 2026);
      igual(h.real, 9.5, '6h + 3h30');
    });

    it('soma as horas estimadas em separado', function () {
      var store = novoStore();
      store.adicionarCirurgia(dadosCirurgia({ inicioPrev: '07:00', fimPrev: '13:00', inicioReal: '07:00', fimReal: '14:00' }));

      var h = core.horasDoAnestesistaNoMes(store.estado.cirurgias, 'Fabrício Tavares', 10, 2026);
      igual(h.estimada, 6, 'previsto');
      igual(h.real, 7, 'realizado');
    });

    it('ignora cirurgia cancelada', function () {
      var store = novoStore();
      store.adicionarCirurgia(dadosCirurgia({ status: 'Cancelada' }));
      var h = core.horasDoAnestesistaNoMes(store.estado.cirurgias, 'Fabrício Tavares', 10, 2026);
      igual(h.real, 0);
      igual(h.estimada, 0);
    });

    it('conta cirurgia Agendada nas horas estimadas (critério "<>Cancelada")', function () {
      var store = novoStore();
      store.adicionarCirurgia(dadosCirurgia({ status: 'Agendada', inicioReal: '', fimReal: '' }));
      var h = core.horasDoAnestesistaNoMes(store.estado.cirurgias, 'Fabrício Tavares', 10, 2026);
      igual(h.estimada, 6);
      igual(h.real, 0);
      igual(h.semHorarioReal, 0, 'Agendada sem hora real não é pendência');
    });

    it('separa por mês de competência', function () {
      var store = novoStore();
      store.adicionarCirurgia(dadosCirurgia({ data: '2026-10-01' }));
      store.adicionarCirurgia(dadosCirurgia({ data: '2026-11-03', anestesista: 'Fabrício Tavares' }));

      igual(core.horasDoAnestesistaNoMes(store.estado.cirurgias, 'Fabrício Tavares', 10, 2026).real, 6);
      igual(core.horasDoAnestesistaNoMes(store.estado.cirurgias, 'Fabrício Tavares', 11, 2026).real, 6);
      igual(core.horasDoAnestesistaNoMes(store.estado.cirurgias, 'Fabrício Tavares', 12, 2026).real, 0);
    });
  });

  /* ===================================================== TASK-401 ======= */
  describe('TASK-401 — Fallback e contador de pendência', function () {

    it('cirurgia Realizada sem TEMPO REAL entra no contador', function () {
      var store = novoStore();
      store.adicionarCirurgia(dadosCirurgia({ inicioReal: '', fimReal: '' }));

      var h = core.horasDoAnestesistaNoMes(store.estado.cirurgias, 'Fabrício Tavares', 10, 2026);
      igual(h.semHorarioReal, 1);
    });

    it('sem o término real, adota o tempo estimado como pendência', function () {
      var store = novoStore();
      store.adicionarCirurgia(dadosCirurgia({ inicioReal: '07:00', fimReal: '' }));

      var h = core.horasDoAnestesistaNoMes(store.estado.cirurgias, 'Fabrício Tavares', 10, 2026);
      igual(h.semHorarioReal, 1, 'conta como pendência');
      igual(h.real, 0, 'não entra nas horas reais');
      igual(h.pendente, 6, 'o estimado é adotado provisoriamente');
      igual(h.projetada, 6, 'real + pendente');
    });

    it('as horas REAIS nunca recebem o valor estimado', function () {
      var store = novoStore();
      store.adicionarCirurgia(dadosCirurgia({ inicioReal: '', fimReal: '' }));

      var h = core.horasDoAnestesistaNoMes(store.estado.cirurgias, 'Fabrício Tavares', 10, 2026);
      igual(h.real, 0, 'REGRA DE OURO: real e estimada não se misturam');
      igual(h.estimada, 6);
    });

    it('preencher o horário real zera a pendência', function () {
      var store = novoStore();
      store.adicionarCirurgia(dadosCirurgia({ inicioReal: '', fimReal: '' }));
      var id = store.estado.cirurgias[0].id;

      var antes = core.horasDoAnestesistaNoMes(store.estado.cirurgias, 'Fabrício Tavares', 10, 2026);
      igual(antes.semHorarioReal, 1);

      store.atualizarCirurgia(id, { inicioReal: '07:15', fimReal: '13:45' });
      var depois = core.horasDoAnestesistaNoMes(store.estado.cirurgias, 'Fabrício Tavares', 10, 2026);
      igual(depois.semHorarioReal, 0);
      igual(depois.real, 6.5);
      igual(depois.pendente, 0);
    });

    it('ehPendenciaHorario só é verdade para Realizada sem tempo real', function () {
      verdadeiro(core.ehPendenciaHorario({ status: 'Realizada', inicioReal: '', fimReal: '' }));
      verdadeiro(core.ehPendenciaHorario({ status: 'Realizada', inicioReal: '07:00', fimReal: '' }));
      falso(core.ehPendenciaHorario({ status: 'Realizada', inicioReal: '07:00', fimReal: '13:00' }));
      falso(core.ehPendenciaHorario({ status: 'Agendada', inicioReal: '', fimReal: '' }));
      falso(core.ehPendenciaHorario({ status: 'Cancelada', inicioReal: '', fimReal: '' }));
    });

    it('calcTempoEfetivo diz de onde veio o número', function () {
      igual(core.calcTempoEfetivo({ inicioReal: '07:00', fimReal: '13:00', inicioPrev: '07:00', fimPrev: '12:00' }).fonte, 'REAL');
      igual(core.calcTempoEfetivo({ inicioReal: '', fimReal: '', inicioPrev: '07:00', fimPrev: '12:00' }).fonte, 'ESTIMADO');
      igual(core.calcTempoEfetivo({ inicioReal: '', fimReal: '', inicioPrev: '', fimPrev: '' }).fonte, 'INDISPONIVEL');
    });

    it('o fallback não inventa hora quando nem o previsto existe', function () {
      var store = novoStore();
      store.adicionarCirurgia(dadosCirurgia({ inicioPrev: '', fimPrev: '', inicioReal: '', fimReal: '' }));
      var h = core.horasDoAnestesistaNoMes(store.estado.cirurgias, 'Fabrício Tavares', 10, 2026);
      igual(h.semHorarioReal, 1, 'ainda é pendência');
      igual(h.pendente, 0, 'mas não há estimado para adotar');
    });

    it('lista as cirurgias que estão travando o fechamento', function () {
      var store = novoStore();
      store.adicionarCirurgia(dadosCirurgia({ inicioReal: '', fimReal: '', paciente: 'Sem Hora' }));
      store.adicionarCirurgia(dadosCirurgia({ inicioPrev: '14:00', fimPrev: '16:00', inicioReal: '14:00', fimReal: '16:00', paciente: 'Com Hora' }));

      var p = store.pendencias();
      igual(p.length, 1);
      igual(p[0].paciente, 'Sem Hora');
      verdadeiro(p[0].faltaInicio);
      verdadeiro(p[0].faltaFim);
      igual(p[0].horasEstimadasAdotadas, 6);
      verdadeiro(/Realizada sem horário real/.test(p[0].mensagem));
    });

    it('a mensagem de pendência diz qual campo falta', function () {
      var store = novoStore();
      store.adicionarCirurgia(dadosCirurgia({ inicioReal: '07:00', fimReal: '' }));
      var p = store.pendencias();
      verdadeiro(/HORA TÉRMINO REAL/.test(p[0].mensagem), p[0].mensagem);
      falso(p[0].faltaInicio);
      verdadeiro(p[0].faltaFim);
    });

    it('filtra pendências por anestesista e mês', function () {
      var store = novoStore();
      store.adicionarCirurgia(dadosCirurgia({ inicioReal: '', fimReal: '' }));
      store.adicionarCirurgia(dadosCirurgia({
        data: '2026-10-02', anestesista: 'Amanda de Souza', inicioReal: '', fimReal: ''
      }));

      igual(store.pendencias({ anestesista: 'Fabrício Tavares' }).length, 1);
      igual(store.pendencias({ mes: 10, ano: 2026 }).length, 2);
      igual(store.pendencias({ mes: 11, ano: 2026 }).length, 0);
    });
  });

  describe('Aba HORAS montada', function () {

    it('gera uma linha por anestesista', function () {
      var store = novoStore();
      igual(store.horas().length, 15);
    });

    it('as colunas por mês casam com os campos do schema', function () {
      var store = novoStore();
      store.adicionarCirurgia(dadosCirurgia({ data: '2026-10-01' }));
      var linha = store.horas().filter(function (l) { return l.nome === 'Fabrício Tavares'; })[0];

      igual(linha.real_10, 6);
      igual(linha.real_11, 0);
      igual(linha.real_12, 0);
      igual(linha.totalReais, 6);
      igual(linha.estim_10, 6);
      igual(linha.totalEstimadas, 6);
    });

    it('TOTAL REAIS soma só os três meses de reais', function () {
      var store = novoStore();
      store.adicionarCirurgia(dadosCirurgia({ data: '2026-10-01' }));
      store.adicionarCirurgia(dadosCirurgia({ data: '2026-11-03' }));
      store.adicionarCirurgia(dadosCirurgia({ data: '2026-12-01' }));

      var linha = store.horas().filter(function (l) { return l.nome === 'Fabrício Tavares'; })[0];
      igual(linha.totalReais, 18);
      igual(linha.totalEstimadas, 18);
      verdadeiro(linha.totalReais !== linha.totalReais + linha.totalEstimadas,
        'os dois totais são independentes');
    });

    it('o contador de pendência é acumulado no ano', function () {
      var store = novoStore();
      store.adicionarCirurgia(dadosCirurgia({ data: '2026-10-01', inicioReal: '', fimReal: '' }));
      store.adicionarCirurgia(dadosCirurgia({ data: '2026-11-03', inicioReal: '', fimReal: '' }));

      var linha = store.horas().filter(function (l) { return l.nome === 'Fabrício Tavares'; })[0];
      igual(linha.semHorarioReal, 2);
      igual(linha.totalPendentes, 12);
      igual(linha.totalReais, 0);
      igual(linha.totalProjetado, 12);
    });

    it('anestesista sem cirurgia fica com tudo zerado, não com erro', function () {
      var store = novoStore();
      var linha = store.horas().filter(function (l) { return l.nome === 'Alene Cunha'; })[0];
      igual(linha.totalReais, 0);
      igual(linha.totalEstimadas, 0);
      igual(linha.semHorarioReal, 0);
    });

    it('os totais gerais somam as 15 linhas', function () {
      var store = novoStore();
      store.adicionarCirurgia(dadosCirurgia({ data: '2026-10-01', anestesista: 'Fabrício Tavares' }));
      store.adicionarCirurgia(dadosCirurgia({ data: '2026-10-02', anestesista: 'Amanda de Souza' }));

      var tot = core.totaisHoras(store.horas());
      igual(tot.totalReais, 12);
    });

    it('horas que atravessam a meia-noite entram corretas', function () {
      var store = novoStore();
      store.adicionarCirurgia(dadosCirurgia({
        inicioPrev: '22:00', fimPrev: '02:00', inicioReal: '22:00', fimReal: '02:30'
      }));
      var linha = store.horas().filter(function (l) { return l.nome === 'Fabrício Tavares'; })[0];
      igual(linha.real_10, 4.5);
      igual(linha.estim_10, 4);
    });

    it('não acumula ruído de ponto flutuante em muitas somas', function () {
      var store = novoStore();
      for (var i = 0; i < 20; i++) {
        store.adicionarCirurgia(dadosCirurgia({
          data: '2026-10-01', inicioPrev: '07:00', fimPrev: '07:10',
          inicioReal: '07:00', fimReal: '07:10', paciente: 'P' + i
        }));
      }
      var linha = store.horas().filter(function (l) { return l.nome === 'Fabrício Tavares'; })[0];
      proximo(linha.real_10, 20 * (10 / 60), 1e-6, '20 x 10min = 3h20');
      igual(core.horasHHMM(linha.real_10), '3:20');
    });
  });

  describe('Exibição de horas', function () {

    it('formata em [h]:mm como a planilha', function () {
      igual(core.horasHHMM(6.5), '6:30');
      igual(core.horasHHMM(0), '0:00');
      igual(core.horasHHMM(25.25), '25:15');
    });

    it('formata em texto legível', function () {
      igual(core.horasTexto(6.5), '6h 30');
      igual(core.horasTexto(6), '6h');
      igual(core.horasTexto(null), '');
    });
  });
};
