/**
 * QA 04 — Integração CIRURGIAS -> AVALIAÇÕES PRÉ
 * Cobre TASK-301 (criação automática da linha), TASK-302 (vínculo e
 * auto-preenchimento) e TASK-303 (anestesista da avaliação restrito).
 */
'use strict';

module.exports = function (t, core, dados) {
  var describe = t.describe, it = t.it, igual = t.igual, verdadeiro = t.verdadeiro,
      falso = t.falso;

  var seed = dados.seed;

  /** Store limpo, já com cadastro e escalas. */
  function novoStore() {
    return core.criarStoreComSeed(seed, { usuario: 'qa' });
  }

  /** Dados base de uma cirurgia. */
  function dadosCirurgia(extra) {
    return Object.assign({
      status: 'Agendada', data: '2026-10-01',
      inicioPrev: '07:00', fimPrev: '13:00',
      paciente: 'Maria Souza', convenio: 'Unimed',
      procedimento: 'Colecistectomia', cirurgiao: 'Dr. Lima',
      anestesista: 'Fabrício Tavares', sala: 'Sala 2',
      avaliacaoNec: 'Não', valor: 1200, pago: 'Não'
    }, extra || {});
  }

  /* ===================================================== TASK-301 ======= */
  describe('TASK-301 — Criação automática da linha de avaliação', function () {

    it('cria a linha no momento em que a cirurgia nasce com "Sim"', function () {
      var store = novoStore();
      var r = store.adicionarCirurgia(dadosCirurgia({ avaliacaoNec: 'Sim' }));
      verdadeiro(r.ok, JSON.stringify(r.erros));
      igual(store.estado.avaliacoes.length, 1);
      igual(r.criadas.length, 1);
    });

    it('NÃO cria a linha quando a cirurgia é marcada como "Não"', function () {
      var store = novoStore();
      store.adicionarCirurgia(dadosCirurgia({ avaliacaoNec: 'Não' }));
      igual(store.estado.avaliacoes.length, 0);
    });

    it('cria a linha quando o campo é alterado de "Não" para "Sim" depois', function () {
      var store = novoStore();
      store.adicionarCirurgia(dadosCirurgia({ avaliacaoNec: 'Não' }));
      igual(store.estado.avaliacoes.length, 0);

      var id = store.estado.cirurgias[0].id;
      var r = store.atualizarCirurgia(id, { avaliacaoNec: 'Sim' });
      verdadeiro(r.ok);
      igual(store.estado.avaliacoes.length, 1);
      igual(store.estado.avaliacoes[0].idCirurgia, id);
    });

    it('é idempotente: marcar "Sim" de novo não duplica a linha', function () {
      var store = novoStore();
      store.adicionarCirurgia(dadosCirurgia({ avaliacaoNec: 'Sim' }));
      var id = store.estado.cirurgias[0].id;

      store.atualizarCirurgia(id, { avaliacaoNec: 'Sim' });
      store.atualizarCirurgia(id, { avaliacaoNec: 'Sim' });
      store.recalcular();
      store.recalcular();

      igual(store.estado.avaliacoes.length, 1, 'ainda uma única avaliação');
    });

    it('não cria linha para cirurgia cancelada', function () {
      var store = novoStore();
      store.adicionarCirurgia(dadosCirurgia({ avaliacaoNec: 'Sim', status: 'Cancelada' }));
      igual(store.estado.avaliacoes.length, 0);
    });

    it('a linha nasce com REALIZADA?="Não" e TCLE="Não"', function () {
      var store = novoStore();
      store.adicionarCirurgia(dadosCirurgia({ avaliacaoNec: 'Sim' }));
      var a = store.estado.avaliacoes[0];
      igual(a.realizada, 'Não');
      igual(a.tcle, 'Não');
      igual(a.pago, 'Não');
    });

    it('a linha recebe ID_AVALIAÇÃO sequencial com prefixo AVP', function () {
      var store = novoStore();
      store.adicionarCirurgia(dadosCirurgia({ avaliacaoNec: 'Sim', paciente: 'A' }));
      store.adicionarCirurgia(dadosCirurgia({ avaliacaoNec: 'Sim', paciente: 'B', data: '2026-10-02', anestesista: 'Amanda de Souza' }));
      igual(store.estado.avaliacoes[0].id, 'AVP0001');
      igual(store.estado.avaliacoes[1].id, 'AVP0002');
    });

    it('voltar o campo para "Não" NÃO apaga a avaliação — só sinaliza órfã', function () {
      var store = novoStore();
      store.adicionarCirurgia(dadosCirurgia({ avaliacaoNec: 'Sim' }));
      var id = store.estado.cirurgias[0].id;

      var r = store.atualizarCirurgia(id, { avaliacaoNec: 'Não' });
      igual(store.estado.avaliacoes.length, 1, 'dado clínico não se descarta sozinho');
      igual(r.orfas.length, 1);
      verdadeiro(/não requer mais/i.test(r.orfas[0].motivo));
    });

    it('a criação automática é registrada no LOG', function () {
      var store = novoStore();
      store.adicionarCirurgia(dadosCirurgia({ avaliacaoNec: 'Sim' }));
      var entradas = store.estado.log.filter(function (l) {
        return /AVALIAÇÃO CRIADA AUTOMATICAMENTE/.test(l.campo);
      });
      igual(entradas.length, 1);
      igual(entradas[0].aba, 'AVALIAÇÕES PRÉ');
    });

    it('cria uma linha por cirurgia, não uma por recálculo', function () {
      var store = novoStore();
      var horarios = [['07:00', '08:00'], ['09:00', '10:00'], ['11:00', '12:00']];
      horarios.forEach(function (h, i) {
        var r = store.adicionarCirurgia(dadosCirurgia({
          avaliacaoNec: 'Sim', paciente: 'P' + i, inicioPrev: h[0], fimPrev: h[1]
        }));
        verdadeiro(r.ok, 'cirurgia ' + i + ': ' + JSON.stringify(r.erros));
      });
      store.recalcular();
      igual(store.estado.cirurgias.length, 3);
      igual(store.estado.avaliacoes.length, 3);
    });
  });

  /* ===================================================== TASK-302 ======= */
  describe('TASK-302 — Vínculo por ID_CIRURGIA e auto-preenchimento', function () {

    it('vincula pelo ID_CIRURGIA', function () {
      var store = novoStore();
      store.adicionarCirurgia(dadosCirurgia({ avaliacaoNec: 'Sim' }));
      igual(store.estado.avaliacoes[0].idCirurgia, store.estado.cirurgias[0].id);
    });

    it('espelha os quatro campos da cirurgia', function () {
      var store = novoStore();
      store.adicionarCirurgia(dadosCirurgia({
        avaliacaoNec: 'Sim',
        paciente: 'João da Silva',
        data: '2026-11-03',
        procedimento: 'Herniorrafia inguinal',
        anestesista: 'Roberta Almeida'
      }));
      var a = store.estado.avaliacoes[0];
      igual(a.paciente, 'João da Silva', 'PACIENTE (auto)');
      igual(a.dataCirurgia, '2026-11-03', 'DATA DA CIRURGIA (auto)');
      igual(a.nomeCirurgia, 'Herniorrafia inguinal', 'NOME DA CIRURGIA (auto)');
      igual(a.anestCirurgia, 'Roberta Almeida', 'ANESTESISTA DA CIRURGIA (auto)');
    });

    it('re-espelha quando a cirurgia é corrigida', function () {
      var store = novoStore();
      store.adicionarCirurgia(dadosCirurgia({ avaliacaoNec: 'Sim' }));
      var id = store.estado.cirurgias[0].id;

      store.atualizarCirurgia(id, {
        paciente: 'Maria Souza Corrigida',
        procedimento: 'Colecistectomia videolaparoscópica'
      });

      var a = store.estado.avaliacoes[0];
      igual(a.paciente, 'Maria Souza Corrigida');
      igual(a.nomeCirurgia, 'Colecistectomia videolaparoscópica');
    });

    it('MÊS/ANO da avaliação vêm da data da avaliação quando ela existe', function () {
      var store = novoStore();
      store.adicionarCirurgia(dadosCirurgia({ avaliacaoNec: 'Sim', data: '2026-11-03' }));
      var a = store.estado.avaliacoes[0];
      igual(a.mes, 11, 'sem data própria, usa a da cirurgia');

      store.atualizarAvaliacao(a.id, { data: '2026-10-28' });
      igual(store.estado.avaliacoes[0].mes, 10, 'com data própria, usa a dela');
      igual(store.estado.avaliacoes[0].ano, 2026);
    });

    // Mudança deliberada (revisão de set/2026): a planilha esvazia por IFERROR,
    // mas no sistema isso apagava o histórico da avaliação órfã — ela sumia
    // também do mês de competência, com o valor já faturado.
    it('os campos espelhados SE MANTÊM se a cirurgia desaparece (histórico)', function () {
      var a = { idCirurgia: 'CIR9999', paciente: 'x', dataCirurgia: '2026-10-01', nomeCirurgia: 'y', anestCirurgia: 'z' };
      core.espelharDadosDaCirurgia(a, null);
      igual(a.paciente, 'x');
      igual(a.dataCirurgia, '2026-10-01');
      igual(a.nomeCirurgia, 'y');
      igual(a.anestCirurgia, 'z');
    });

    it('a coluna T da cirurgia reage à avaliação vinculada', function () {
      var store = novoStore();
      store.adicionarCirurgia(dadosCirurgia({ avaliacaoNec: 'Sim' }));
      igual(store.estado.cirurgias[0].statusAval, 'Pendente');

      var a = store.estado.avaliacoes[0];
      store.atualizarAvaliacao(a.id, { realizada: 'Sim', anestesista: 'Fabrício Tavares', data: '2026-09-28' });
      igual(store.estado.cirurgias[0].statusAval, 'Realizada');
    });

    it('avaliação órfã é detectada quando a cirurgia é removida em cascata', function () {
      var store = novoStore();
      store.adicionarCirurgia(dadosCirurgia({ avaliacaoNec: 'Sim' }));
      var id = store.estado.cirurgias[0].id;

      var bloqueio = store.removerCirurgia(id);
      falso(bloqueio.ok, 'remover sem cascata deve ser recusado');

      var r = store.removerCirurgia(id, { comAvaliacoes: true });
      verdadeiro(r.ok);
      igual(store.estado.cirurgias.length, 0);
      igual(store.estado.avaliacoes.length, 0);
    });
  });

  /* ===================================================== TASK-303 ======= */
  describe('TASK-303 — ANESTESISTA DA AVALIAÇÃO restrito ao cadastro', function () {

    it('aceita qualquer um dos 15', function () {
      var store = novoStore();
      store.adicionarCirurgia(dadosCirurgia({ avaliacaoNec: 'Sim' }));
      var a = store.estado.avaliacoes[0];

      seed.ANESTESISTAS.forEach(function (an) {
        var r = store.atualizarAvaliacao(a.id, { anestesista: an.nome });
        verdadeiro(r.ok, 'deveria aceitar ' + an.nome + ': ' + JSON.stringify(r.erros));
      });
    });

    it('recusa quem não está no cadastro', function () {
      var store = novoStore();
      store.adicionarCirurgia(dadosCirurgia({ avaliacaoNec: 'Sim' }));
      var a = store.estado.avaliacoes[0];

      var r = store.atualizarAvaliacao(a.id, { anestesista: 'Dr. Inventado' });
      falso(r.ok);
      verdadeiro(r.erros.some(function (e) { return e.campo === 'anestesista'; }));
    });

    it('sugere o anestesista da cirurgia, mas permite trocar', function () {
      var store = novoStore();
      store.adicionarCirurgia(dadosCirurgia({ avaliacaoNec: 'Sim', anestesista: 'Fabrício Tavares' }));
      var a = store.estado.avaliacoes[0];
      igual(a.anestesista, 'Fabrício Tavares', 'sugestão inicial');

      var r = store.atualizarAvaliacao(a.id, { anestesista: 'Alene Cunha' });
      verdadeiro(r.ok);
      igual(store.estado.avaliacoes[0].anestesista, 'Alene Cunha');
      igual(store.estado.avaliacoes[0].anestCirurgia, 'Fabrício Tavares',
        'quem operou continua registrado em separado');
    });

    it('a avaliação pode ser feita por quem não operou (caso real do grupo)', function () {
      var store = novoStore();
      store.adicionarCirurgia(dadosCirurgia({ avaliacaoNec: 'Sim', anestesista: 'Fabrício Tavares', valor: 1200 }));
      var a = store.estado.avaliacoes[0];
      store.atualizarAvaliacao(a.id, {
        anestesista: 'Alene Cunha', realizada: 'Sim', data: '2026-09-30', valor: 250, pago: 'Sim'
      });

      // A receita da avaliação vai para quem avaliou, não para quem operou.
      var iAlene = store.indicadores('Alene Cunha', 9, 2026);
      igual(iAlene.recebidoAval, 250);
      var iFab = store.indicadores('Fabrício Tavares', 9, 2026);
      igual(iFab.recebidoAval, 0);
    });
  });

  describe('Validação da avaliação', function () {

    it('exige ID_CIRURGIA', function () {
      var rel = core.validarAvaliacao({ idCirurgia: '' }, {});
      falso(rel.ok);
    });

    it('recusa ID_CIRURGIA que não existe', function () {
      var rel = core.validarAvaliacao({ idCirurgia: 'CIR9999' }, { idsCirurgia: ['CIR0001'] });
      falso(rel.ok);
    });

    it('recusa valor negativo', function () {
      var rel = core.validarAvaliacao({ idCirurgia: 'CIR0001', valor: -10 }, { idsCirurgia: ['CIR0001'] });
      falso(rel.ok);
    });

    it('avisa quando está marcada como realizada sem anestesista', function () {
      var rel = core.validarAvaliacao({ idCirurgia: 'CIR0001', realizada: 'Sim', anestesista: '' },
        { idsCirurgia: ['CIR0001'] });
      verdadeiro(rel.avisos.some(function (a) { return a.campo === 'anestesista'; }));
    });

    it('avisa quando marcada como paga sem valor', function () {
      var rel = core.validarAvaliacao({ idCirurgia: 'CIR0001', pago: 'Sim', valor: '' },
        { idsCirurgia: ['CIR0001'] });
      verdadeiro(rel.avisos.some(function (a) { return a.campo === 'valor'; }));
    });
  });
};
