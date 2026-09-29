/**
 * QA 09 — Automação: escala-base alfabética, atribuição e remanejamento
 *
 * Cobre as três regras que tiram trabalho manual do grupo:
 *   1. a ESCALA_BASE montada do cadastro, em ordem alfabética;
 *   2. a cirurgia que chega e acha sozinha a menor posição livre;
 *   3. a proposta de remanejamento quando alguém falta.
 *
 * A regra 2 tem uma sutileza que vale teste próprio: encostar horário NÃO é
 * conflito. Uma de 07-13 e outra de 13-19 são a mesma pessoa de propósito.
 */
'use strict';

module.exports = function (t, core, dados) {
  var describe = t.describe, it = t.it, igual = t.igual, verdadeiro = t.verdadeiro,
      falso = t.falso;

  var seed = dados.seed;

  /** Ordem alfabética dos 15 do cadastro, conferida à mão. */
  var ALFABETICA = [
    'Alene Cunha', 'Amanda de Souza', 'Brunna Cintra', 'Carlos Eduardo Lopes',
    'Fabrício Tavares', 'Felipe Sampaio', 'Heloísa Roncolato', 'João Américo',
    'Marcus Vinícius', 'Maria Catarina', 'Maria Fernanda', 'Priscilla De Carli',
    'Rayanne Baggio', 'Roberta Almeida', 'Tiago Tolentino'
  ];

  // 01/10/2026 é a 1ª quinta do horizonte (giro k=0), então as posições saem
  // na ordem-base: QUINTA usa o mesmo bloco da SEGUNDA (1º ao 5º).
  var QUINTA_1A = '2026-10-01';

  function storeAuto() {
    return core.criarStoreComSeed(seed, { usuario: 'qa', escalaBaseAuto: true });
  }

  function cirurgia(extra) {
    return Object.assign({
      status: 'Agendada', data: QUINTA_1A,
      inicioPrev: '07:00', fimPrev: '13:00',
      paciente: 'Paciente', convenio: 'Particular',
      procedimento: 'Proc', cirurgiao: 'Dr.',
      anestesista: 'Alene Cunha', sala: 'S1',
      avaliacaoNec: 'Não', valor: 1000, pago: 'Não'
    }, extra || {});
  }

  /* ==================================================================== */

  describe('Escala-base automática (ordem alfabética)', function () {

    it('devolve as 30 linhas no formato da planilha', function () {
      var base = core.gerarEscalaBaseAlfabetica(seed.ANESTESISTAS);
      igual(base.length, 30);
      // o dia só aparece na primeira das 5 linhas do bloco
      igual(base[0].dia, 'SEGUNDA-FEIRA');
      igual(base[1].dia, '');
      igual(base[4].dia, '');
      igual(base[5].dia, 'TERÇA-FEIRA');
    });

    it('distribui em blocos consecutivos de 5', function () {
      var idx = core.indexarEscalaBase(core.gerarEscalaBaseAlfabetica(seed.ANESTESISTAS));

      for (var p = 1; p <= 5; p++) {
        igual(idx['SEGUNDA-FEIRA'][p].nome, ALFABETICA[p - 1], 'SEG pos ' + p);
        igual(idx['TERÇA-FEIRA'][p].nome, ALFABETICA[p + 4], 'TER pos ' + p);
        igual(idx['QUARTA-FEIRA'][p].nome, ALFABETICA[p + 9], 'QUA pos ' + p);
      }
    });

    it('a fila dá a volta: quinta repete segunda, sexta repete terça', function () {
      var idx = core.indexarEscalaBase(core.gerarEscalaBaseAlfabetica(seed.ANESTESISTAS));
      for (var p = 1; p <= 5; p++) {
        igual(idx['QUINTA-FEIRA'][p].nome, idx['SEGUNDA-FEIRA'][p].nome, 'pos ' + p);
        igual(idx['SEXTA-FEIRA'][p].nome, idx['TERÇA-FEIRA'][p].nome, 'pos ' + p);
        igual(idx['SÁBADO'][p].nome, idx['QUARTA-FEIRA'][p].nome, 'pos ' + p);
      }
    });

    it('cada um dos 15 trabalha exatamente 2 dias por semana', function () {
      var base = core.gerarEscalaBaseAlfabetica(seed.ANESTESISTAS);
      var conta = {};
      base.forEach(function (l) { conta[l.nome] = (conta[l.nome] || 0) + 1; });

      igual(Object.keys(conta).length, 15);
      ALFABETICA.forEach(function (nome) {
        igual(conta[nome], 2, nome + ' deveria aparecer 2 vezes');
      });
    });

    it('leva o ID do cadastro junto', function () {
      var base = core.gerarEscalaBaseAlfabetica(seed.ANESTESISTAS);
      igual(base[0].nome, 'Alene Cunha');
      igual(base[0].id, 'A09');
    });

    it('passa na validação contra o cadastro', function () {
      var base = core.gerarEscalaBaseAlfabetica(seed.ANESTESISTAS);
      var rel = core.validarEscalaBase(base, seed.ANESTESISTAS);
      verdadeiro(rel.ok, 'erros: ' + rel.erros.map(function (e) { return e.msg; }).join(' | '));
    });

    it('ignora quem está inativo', function () {
      var cadastro = JSON.parse(JSON.stringify(seed.ANESTESISTAS));
      cadastro.filter(function (a) { return a.nome === 'Alene Cunha'; })[0].ativo = 'Não';

      var base = core.gerarEscalaBaseAlfabetica(cadastro);
      var nomes = base.map(function (l) { return l.nome; });
      falso(nomes.some(function (n) { return n === 'Alene Cunha'; }), 'inativo não entra na escala');
      igual(base.length, 30, 'os outros 14 cobrem as 30 vagas');
    });

    it('não monta nada com menos gente que posições', function () {
      var poucos = seed.ANESTESISTAS.slice(0, 4);
      igual(core.gerarEscalaBaseAlfabetica(poucos).length, 0);
    });

    it('nunca repete a mesma pessoa dentro do mesmo dia', function () {
      // 8 ativos e 30 vagas: a fila dá a volta várias vezes, mas 5 vagas
      // consecutivas de uma lista de 8 continuam sendo 5 pessoas diferentes.
      var oito = seed.ANESTESISTAS.slice(0, 8);
      var idx = core.indexarEscalaBase(core.gerarEscalaBaseAlfabetica(oito));

      core.DOMINIOS.DIA_SEMANA_ESCALA.forEach(function (dia) {
        var vistos = {};
        for (var p = 1; p <= 5; p++) {
          var nome = idx[dia][p].nome;
          falso(vistos[nome], nome + ' repetido em ' + dia);
          vistos[nome] = true;
        }
      });
    });
  });

  /* ==================================================================== */

  describe('Atribuição automática — menor posição livre', function () {

    it('dia vazio: cai na posição 1', function () {
      var store = storeAuto();
      var s = store.sugerirAnestesista(cirurgia({ anestesista: '' }));
      igual(s.nome, 'Alene Cunha');
      igual(s.posicao, 1);
    });

    it('encostar horário não é conflito: 07-13 e 13-19 ficam com a mesma pessoa', function () {
      var store = storeAuto();
      store.adicionarCirurgia(cirurgia({ inicioPrev: '07:00', fimPrev: '13:00' }));

      var s = store.sugerirAnestesista(cirurgia({ anestesista: '', inicioPrev: '13:00', fimPrev: '19:00' }));
      igual(s.nome, 'Alene Cunha', 'o dia dela fecha antes de sobrar para o próximo');
      igual(s.posicao, 1);
    });

    it('horário sobreposto empurra para a próxima posição', function () {
      var store = storeAuto();
      store.adicionarCirurgia(cirurgia({ inicioPrev: '07:00', fimPrev: '13:00' }));

      var s = store.sugerirAnestesista(cirurgia({ anestesista: '', inicioPrev: '08:00', fimPrev: '12:00' }));
      igual(s.nome, 'Amanda de Souza');
      igual(s.posicao, 2);
    });

    it('vai descendo até achar quem está livre', function () {
      var store = storeAuto();
      ['Alene Cunha', 'Amanda de Souza', 'Brunna Cintra'].forEach(function (nome) {
        store.adicionarCirurgia(cirurgia({ anestesista: nome, inicioPrev: '08:00', fimPrev: '12:00' }));
      });

      var s = store.sugerirAnestesista(cirurgia({ anestesista: '', inicioPrev: '09:00', fimPrev: '11:00' }));
      igual(s.nome, 'Carlos Eduardo Lopes');
      igual(s.posicao, 4);
    });

    it('com os 5 ocupados devolve vazio e explica — nunca escala quem tem conflito', function () {
      var store = storeAuto();
      ['Alene Cunha', 'Amanda de Souza', 'Brunna Cintra',
       'Carlos Eduardo Lopes', 'Fabrício Tavares'].forEach(function (nome) {
        store.adicionarCirurgia(cirurgia({ anestesista: nome, inicioPrev: '08:00', fimPrev: '12:00' }));
      });

      var s = store.sugerirAnestesista(cirurgia({ anestesista: '', inicioPrev: '09:00', fimPrev: '11:00' }));
      igual(s.nome, '');
      verdadeiro(s.motivo.length > 0, 'deveria explicar o porquê');
    });

    it('cirurgia cancelada não ocupa ninguém', function () {
      var store = storeAuto();
      store.adicionarCirurgia(cirurgia({ status: 'Cancelada', inicioPrev: '08:00', fimPrev: '12:00' }));

      var s = store.sugerirAnestesista(cirurgia({ anestesista: '', inicioPrev: '09:00', fimPrev: '11:00' }));
      igual(s.nome, 'Alene Cunha', 'a vaga da cancelada volta a ficar livre');
    });

    it('editando uma cirurgia, ela não conflita consigo mesma', function () {
      var store = storeAuto();
      var r = store.adicionarCirurgia(cirurgia({ inicioPrev: '08:00', fimPrev: '12:00' }));
      var id = store.estado.cirurgias[0].id;
      verdadeiro(r.ok);

      var s = store.sugerirAnestesista(
        cirurgia({ anestesista: '', inicioPrev: '08:00', fimPrev: '12:00' }), id);
      igual(s.nome, 'Alene Cunha');
    });

    it('sem horário preenchido ainda assim sugere a posição 1', function () {
      var store = storeAuto();
      var s = store.sugerirAnestesista(cirurgia({ anestesista: '', inicioPrev: '', fimPrev: '' }));
      igual(s.nome, 'Alene Cunha');
    });

    it('domingo não tem escala: devolve vazio', function () {
      var store = storeAuto();
      var s = store.sugerirAnestesista(cirurgia({ anestesista: '', data: '2026-10-04' }));
      igual(s.nome, '');
    });
  });

  /* ==================================================================== */

  describe('Remanejamento quando alguém falta', function () {

    it('propõe destino para cada cirurgia de quem faltou', function () {
      var store = storeAuto();
      store.adicionarCirurgia(cirurgia({ anestesista: 'Alene Cunha', inicioPrev: '07:00', fimPrev: '13:00' }));
      store.adicionarCirurgia(cirurgia({ anestesista: 'Alene Cunha', inicioPrev: '14:00', fimPrev: '17:00' }));

      var p = store.proporRemanejamento(QUINTA_1A, 'Alene Cunha');
      igual(p.movimentos.length, 2);
      igual(p.semDestino.length, 0);
      p.movimentos.forEach(function (m) {
        igual(m.de, 'Alene Cunha');
        falso(m.para === 'Alene Cunha', 'não pode devolver para quem faltou');
      });
    });

    it('não altera nada: é só proposta', function () {
      var store = storeAuto();
      store.adicionarCirurgia(cirurgia({ anestesista: 'Alene Cunha' }));

      store.proporRemanejamento(QUINTA_1A, 'Alene Cunha');
      igual(store.estado.cirurgias[0].anestesista, 'Alene Cunha');
    });

    it('respeita quem já está ocupado no horário', function () {
      var store = storeAuto();
      store.adicionarCirurgia(cirurgia({ anestesista: 'Alene Cunha', inicioPrev: '07:00', fimPrev: '13:00' }));
      store.adicionarCirurgia(cirurgia({ anestesista: 'Amanda de Souza', inicioPrev: '09:00', fimPrev: '11:00' }));

      var p = store.proporRemanejamento(QUINTA_1A, 'Alene Cunha');
      igual(p.movimentos.length, 1);
      igual(p.movimentos[0].para, 'Brunna Cintra', 'pula a Amanda, que está ocupada');
    });

    it('duas cirurgias no mesmo horário não caem na mesma pessoa', function () {
      var store = storeAuto();
      store.adicionarCirurgia(cirurgia({ anestesista: 'Alene Cunha', inicioPrev: '08:00', fimPrev: '12:00', paciente: 'A' }));
      store.adicionarCirurgia(cirurgia({ anestesista: 'Alene Cunha', inicioPrev: '08:00', fimPrev: '12:00', paciente: 'B' }));

      var p = store.proporRemanejamento(QUINTA_1A, 'Alene Cunha');
      igual(p.movimentos.length, 2);
      falso(p.movimentos[0].para === p.movimentos[1].para,
        'a primeira já ocupa o novo dono antes de decidir a segunda');
    });

    it('não remaneja cirurgia cancelada', function () {
      var store = storeAuto();
      store.adicionarCirurgia(cirurgia({ anestesista: 'Alene Cunha', status: 'Cancelada' }));

      var p = store.proporRemanejamento(QUINTA_1A, 'Alene Cunha');
      igual(p.movimentos.length, 0);
    });

    it('sem destino possível, a cirurgia aparece em semDestino', function () {
      var store = storeAuto();
      ['Amanda de Souza', 'Brunna Cintra', 'Carlos Eduardo Lopes', 'Fabrício Tavares']
        .forEach(function (nome) {
          store.adicionarCirurgia(cirurgia({ anestesista: nome, inicioPrev: '08:00', fimPrev: '12:00' }));
        });
      store.adicionarCirurgia(cirurgia({ anestesista: 'Alene Cunha', inicioPrev: '09:00', fimPrev: '11:00' }));

      var p = store.proporRemanejamento(QUINTA_1A, 'Alene Cunha');
      igual(p.movimentos.length, 0);
      igual(p.semDestino.length, 1);
      verdadeiro(p.semDestino[0].motivo.length > 0);
    });

    it('aplicar troca o anestesista e registra na auditoria', function () {
      var store = storeAuto();
      store.adicionarCirurgia(cirurgia({ anestesista: 'Alene Cunha', inicioPrev: '07:00', fimPrev: '13:00' }));
      var logAntes = store.estado.log.length;

      var p = store.proporRemanejamento(QUINTA_1A, 'Alene Cunha');
      var r = store.aplicarRemanejamento(p.movimentos);

      verdadeiro(r.ok, 'erros: ' + (r.erros || []).map(function (e) { return e.msg; }).join(' | '));
      igual(store.estado.cirurgias[0].anestesista, p.movimentos[0].para);
      verdadeiro(store.estado.log.length > logAntes, 'a troca tem de ficar no log');
    });

    it('aplicar é tudo ou nada', function () {
      var store = storeAuto();
      store.adicionarCirurgia(cirurgia({ anestesista: 'Alene Cunha', inicioPrev: '07:00', fimPrev: '13:00' }));
      store.adicionarCirurgia(cirurgia({ anestesista: 'Alene Cunha', inicioPrev: '14:00', fimPrev: '17:00' }));

      var p = store.proporRemanejamento(QUINTA_1A, 'Alene Cunha');
      p.movimentos[1].para = 'Fulano Que Não Existe';

      var r = store.aplicarRemanejamento(p.movimentos);
      falso(r.ok);
      store.estado.cirurgias.forEach(function (c) {
        igual(c.anestesista, 'Alene Cunha', 'nenhuma troca pode ter ficado de pé');
      });
    });
  });

  /* ==================================================================== */

  describe('Modo automático no store', function () {

    it('nasce desligado — não reescreve escala de quem já tem dado', function () {
      var store = core.criarStoreComSeed(seed, { usuario: 'qa' });
      falso(store.escalaBaseAutomatica());
      igual(store.estado.escalaBase[0].nome, 'Brunna Cintra', 'segue a base da planilha');
    });

    it('ligando, a base vira a alfabética e fica registrado', function () {
      var store = core.criarStoreComSeed(seed, { usuario: 'qa' });
      var r = store.definirModoEscalaBase(true);

      verdadeiro(r.ok);
      verdadeiro(store.escalaBaseAutomatica());
      igual(store.estado.escalaBase[0].nome, 'Alene Cunha');
      verdadeiro(store.estado.log.some(function (l) {
        return l.campo === 'ESCALA-BASE AUTOMÁTICA';
      }), 'a virada de modo tem de ficar no log');
    });

    it('com o modo ligado, desativar alguém refaz a escala sozinho', function () {
      var store = storeAuto();
      igual(store.estado.escalaBase[0].nome, 'Alene Cunha');

      var alene = store.estado.anestesistas.filter(function (a) { return a.nome === 'Alene Cunha'; })[0];
      store.salvarAnestesista(Object.assign({}, alene, { ativo: 'Não' }));

      igual(store.estado.escalaBase[0].nome, 'Amanda de Souza', 'a fila andou sozinha');
    });

    it('desligando, congela a última base gerada', function () {
      var store = storeAuto();
      store.definirModoEscalaBase(false);

      falso(store.escalaBaseAutomatica());
      igual(store.estado.escalaBase[0].nome, 'Alene Cunha', 'ninguém fica sem escala no meio do caminho');
    });

    it('o recálculo continua idempotente com o modo ligado', function () {
      var store = storeAuto();
      var antes = JSON.stringify(store.estado.consolidada);
      store.recalcular();
      store.recalcular();
      igual(JSON.stringify(store.estado.consolidada), antes);
    });
  });
};
