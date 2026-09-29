/**
 * QA 07 — Store: transações, integridade e LOG
 * Estes testes são os que garantem o "não vai quebrar": rollback em caso de
 * erro, recálculo idempotente, integridade auditável e trilha de auditoria.
 */
'use strict';

module.exports = function (t, core, dados) {
  var describe = t.describe, it = t.it, igual = t.igual, verdadeiro = t.verdadeiro,
      falso = t.falso;

  var seed = dados.seed;

  function novoStore() { return core.criarStoreComSeed(seed, { usuario: 'qa' }); }

  function dadosCirurgia(extra) {
    return Object.assign({
      status: 'Agendada', data: '2026-10-01',
      inicioPrev: '07:00', fimPrev: '13:00',
      paciente: 'Paciente', convenio: 'Particular',
      procedimento: 'Proc', cirurgiao: 'Dr.',
      anestesista: 'Fabrício Tavares', sala: 'S1',
      avaliacaoNec: 'Não', valor: 1000, pago: 'Não'
    }, extra || {});
  }

  describe('Estado inicial', function () {

    it('nasce com as 11 áreas e os dados mestres carregados', function () {
      var store = novoStore();
      igual(store.estado.anestesistas.length, 15);
      igual(store.estado.escalaBase.length, 30);
      igual(store.estado.consolidada.length, 395);
      igual(store.estado.cirurgias.length, 0);
      igual(store.estado.avaliacoes.length, 0);
      igual(store.estado.log.length, 0);
    });

    it('gera as três escalas mensais', function () {
      var store = novoStore();
      igual(store.escalaDoMes(10).length, 135);
      igual(store.escalaDoMes(11).length, 125);
      igual(store.escalaDoMes(12).length, 135);
    });

    it('o estado vazio também é válido (sistema novo, sem seed)', function () {
      var store = core.criarStore(core.estadoVazio());
      store.recalcular();
      igual(store.estado.consolidada.length, 0);
      verdadeiro(store.verificarIntegridade() !== null);
    });
  });

  describe('Transações — tudo ou nada', function () {

    it('rejeita cirurgia inválida e não grava nada', function () {
      var store = novoStore();
      var r = store.adicionarCirurgia({ data: '', paciente: '' });
      falso(r.ok);
      igual(store.estado.cirurgias.length, 0, 'nada foi gravado');
      igual(store.estado.log.length, 0, 'nem log');
    });

    it('desfaz por completo quando a validação falha no meio', function () {
      var store = novoStore();
      store.adicionarCirurgia(dadosCirurgia());
      var antes = JSON.stringify(store.estado.cirurgias);

      var r = store.adicionarCirurgia(dadosCirurgia({ anestesista: 'Dr. Inventado' }));
      falso(r.ok);
      igual(JSON.stringify(store.estado.cirurgias), antes, 'estado intacto');
    });

    it('desfaz quando a função de transação lança exceção', function () {
      var store = novoStore();
      store.adicionarCirurgia(dadosCirurgia());
      var antes = JSON.stringify(store.estado.cirurgias);

      var r = store.transacao(function (st) {
        st.cirurgias.push({ id: 'LIXO' });
        throw new Error('falha simulada');
      });

      falso(r.ok);
      verdadeiro(/falha simulada/.test(r.erros[0].msg));
      igual(JSON.stringify(store.estado.cirurgias), antes, 'rollback completo');
    });

    it('recusa ID_CIRURGIA duplicado', function () {
      var store = novoStore();
      store.adicionarCirurgia(dadosCirurgia({ id: 'CIR0001' }));
      var r = store.adicionarCirurgia(dadosCirurgia({ id: 'CIR0001', inicioPrev: '14:00', fimPrev: '15:00' }));
      falso(r.ok);
      igual(store.estado.cirurgias.length, 1);
    });

    it('gera IDs sequenciais sem repetir', function () {
      var store = novoStore();
      for (var i = 0; i < 5; i++) {
        store.adicionarCirurgia(dadosCirurgia({ paciente: 'P' + i }));
      }
      var ids = store.estado.cirurgias.map(function (c) { return c.id; });
      igual(ids.join(','), 'CIR0001,CIR0002,CIR0003,CIR0004,CIR0005');
    });

    it('o snapshot permite voltar o estado por completo', function () {
      var store = novoStore();
      store.adicionarCirurgia(dadosCirurgia());
      var snap = store.snapshot();

      store.adicionarCirurgia(dadosCirurgia({ paciente: 'Outro', inicioPrev: '14:00', fimPrev: '15:00' }));
      igual(store.estado.cirurgias.length, 2);

      store.restaurar(snap);
      igual(store.estado.cirurgias.length, 1);
    });

    it('avisa o ouvinte a cada transação bem-sucedida', function () {
      var chamadas = 0;
      var store = core.criarStoreComSeed(seed, { usuario: 'qa', aoMudar: function () { chamadas++; } });
      store.adicionarCirurgia(dadosCirurgia());
      verdadeiro(chamadas >= 1);

      var antes = chamadas;
      store.adicionarCirurgia({ data: '', paciente: '' });
      igual(chamadas, antes, 'transação recusada não notifica');
    });

    it('um ouvinte que quebra não derruba a transação', function () {
      var store = core.criarStoreComSeed(seed, {
        usuario: 'qa', aoMudar: function () { throw new Error('ouvinte ruim'); }
      });
      var r = store.adicionarCirurgia(dadosCirurgia());
      verdadeiro(r.ok);
      igual(store.estado.cirurgias.length, 1);
    });
  });

  describe('Recálculo idempotente', function () {

    it('recalcular várias vezes não muda o resultado', function () {
      var store = novoStore();
      store.adicionarCirurgia(dadosCirurgia({ avaliacaoNec: 'Sim' }));

      var a = JSON.stringify(store.estado);
      store.recalcular();
      var b = JSON.stringify(store.estado);
      store.recalcular();
      store.recalcular();
      var c = JSON.stringify(store.estado);

      igual(a, b);
      igual(b, c);
    });

    it('preserva os ajustes manuais da escala ao recalcular', function () {
      var store = novoStore();
      var r = store.ajustarEscala('2026-10-01', 1, { substituto: 'Alene Cunha', motivo: 'Congresso' });
      verdadeiro(r.ok, JSON.stringify(r.erros));

      store.recalcular();
      store.recalcular();

      var linha = store.escalaDoMes(10).filter(function (l) {
        return l.data === '2026-10-01' && l.posicao === 1;
      })[0];
      igual(linha.ajuste, 'Sim');
      igual(linha.substituto, 'Alene Cunha');
      igual(linha.efetivo, 'Alene Cunha');
      igual(linha.motivo, 'Congresso');
      igual(linha.calculado, 'Fabrício Tavares', 'o calculado nunca é sobrescrito');
    });

    it('o ajuste reflete na consolidada e na busca de posição', function () {
      var store = novoStore();
      store.ajustarEscala('2026-10-01', 1, { substituto: 'Alene Cunha', motivo: 'Troca' });

      igual(store.indices.escala.posicaoDe('2026-10-01', 'Alene Cunha'), 1);
      igual(store.indices.escala.posicaoDe('2026-10-01', 'Fabrício Tavares'), 'fora da escala-base');
    });

    it('desfazer o ajuste volta ao calculado', function () {
      var store = novoStore();
      store.ajustarEscala('2026-10-01', 1, { substituto: 'Alene Cunha' });
      store.ajustarEscala('2026-10-01', 1, { ajuste: false });

      var linha = store.escalaDoMes(10)[0];
      igual(linha.ajuste, 'Não');
      igual(linha.efetivo, 'Fabrício Tavares');
    });

    it('recusa ajuste sem substituto', function () {
      var store = novoStore();
      var r = store.ajustarEscala('2026-10-01', 1, { motivo: 'sem substituto' });
      falso(r.ok);
    });

    it('recusa substituto que não existe no cadastro', function () {
      var store = novoStore();
      var r = store.ajustarEscala('2026-10-01', 1, { substituto: 'Dr. Inventado' });
      falso(r.ok);
    });

    it('recusa ajuste em data sem escala (domingo)', function () {
      var store = novoStore();
      var r = store.ajustarEscala('2026-10-04', 1, { substituto: 'Alene Cunha' });
      falso(r.ok);
    });
  });

  describe('Cadastro de anestesistas', function () {

    it('recusa nome duplicado (o nome é chave de vínculo)', function () {
      var store = novoStore();
      var r = store.salvarAnestesista({ nome: 'Fabrício Tavares' });
      falso(r.ok);
      verdadeiro(r.erros.some(function (e) { return /duplicado/i.test(e.msg); }));
    });

    it('cria um novo com ID sequencial', function () {
      var store = novoStore();
      var r = store.salvarAnestesista({ nome: 'Novo Anestesista' });
      verdadeiro(r.ok, JSON.stringify(r.erros));
      igual(store.estado.anestesistas.length, 16);
      igual(store.estado.anestesistas[15].id, 'A16');
    });

    it('atualiza um existente sem duplicar', function () {
      var store = novoStore();
      var r = store.salvarAnestesista({ id: 'A06', nome: 'Fabrício Tavares', telefone: '(11) 99999-0000' });
      verdadeiro(r.ok, JSON.stringify(r.erros));
      igual(store.estado.anestesistas.length, 15);
      igual(store.estado.anestesistas[5].telefone, '(11) 99999-0000');
    });

    it('inativar não apaga o histórico de cirurgias', function () {
      var store = novoStore();
      store.adicionarCirurgia(dadosCirurgia());
      store.salvarAnestesista({ id: 'A06', nome: 'Fabrício Tavares', ativo: 'Não' });

      igual(store.estado.cirurgias.length, 1);
      igual(store.estado.cirurgias[0].idAnestesista, 'A06');
      igual(store.indicadores('Fabrício Tavares', 10, 2026).horasEstimadas, 6);
    });
  });

  describe('Integridade', function () {

    it('estado recém-criado está íntegro', function () {
      var store = novoStore();
      var r = store.verificarIntegridade();
      verdadeiro(r.ok, r.erros.map(function (e) { return e.msg; }).join(' | '));
    });

    it('estado com dados válidos continua íntegro', function () {
      var store = novoStore();
      store.adicionarCirurgia(dadosCirurgia({
        status: 'Realizada', inicioReal: '07:00', fimReal: '13:00', avaliacaoNec: 'Sim'
      }));
      var r = store.verificarIntegridade();
      verdadeiro(r.ok, r.erros.map(function (e) { return e.msg; }).join(' | '));
    });

    it('acusa nome de anestesista duplicado', function () {
      var store = novoStore();
      store.estado.anestesistas.push({ id: 'A99', nome: 'Fabrício Tavares', ativo: 'Sim' });
      var r = store.verificarIntegridade();
      falso(r.ok);
      verdadeiro(r.erros.some(function (e) { return /NOME duplicado/i.test(e.msg); }));
    });

    it('acusa cirurgia sem ID', function () {
      var store = novoStore();
      store.estado.cirurgias.push({ id: '', paciente: 'Sem Id', data: '2026-10-01' });
      var r = store.verificarIntegridade();
      falso(r.ok);
    });

    it('acusa avaliação apontando para cirurgia inexistente', function () {
      var store = novoStore();
      store.estado.avaliacoes.push({ id: 'AVP9999', idCirurgia: 'CIR9999', realizada: 'Não' });
      var r = store.verificarIntegridade();
      falso(r.ok);
      verdadeiro(r.erros.some(function (e) { return /não existe em CIRURGIAS/i.test(e.msg); }));
    });

    it('avisa (sem reprovar) quando o anestesista não está na escala do dia', function () {
      var store = novoStore();
      store.adicionarCirurgia(dadosCirurgia({ anestesista: 'Alene Cunha' }));
      var r = store.verificarIntegridade();
      verdadeiro(r.ok, 'é aviso, não erro');
      verdadeiro(r.avisos.some(function (a) { return /não está na escala/i.test(a.msg); }));
    });

    it('avisa sobre pendência de horário (TASK-401)', function () {
      var store = novoStore();
      store.adicionarCirurgia(dadosCirurgia({ status: 'Realizada', inicioReal: '', fimReal: '' }));
      var r = store.verificarIntegridade();
      verdadeiro(r.ok);
      verdadeiro(r.avisos.some(function (a) { return a.area === 'HORAS'; }));
    });

    it('avisa sobre conflito de agenda', function () {
      var store = novoStore();
      store.adicionarCirurgia(dadosCirurgia({ inicioPrev: '07:00', fimPrev: '10:00' }));
      store.adicionarCirurgia(dadosCirurgia({ inicioPrev: '09:00', fimPrev: '12:00', paciente: 'Outro' }));
      var r = store.verificarIntegridade();
      verdadeiro(r.avisos.some(function (a) { return /sobrepostas/i.test(a.msg); }));
    });

    it('o reparo gera ID faltante e devolve o que fez', function () {
      var store = novoStore();
      store.estado.cirurgias.push(Object.assign(dadosCirurgia({ paciente: 'Sem Id' }), { id: '' }));

      var rep = store.reparar();
      verdadeiro(rep.acoes.length >= 1, 'deveria relatar a ação');
      verdadeiro(!core.vazio(store.estado.cirurgias[0].id), 'ID foi gerado');
      verdadeiro(rep.integridade.ok, rep.integridade.erros.map(function (e) { return e.msg; }).join(' | '));
    });

    it('o reparo cria a avaliação faltante de uma cirurgia marcada "Sim"', function () {
      var store = novoStore();
      store.estado.cirurgias.push(dadosCirurgia({ id: 'CIR0500', avaliacaoNec: 'Sim' }));
      // Sem recalcular, a avaliação não existe.
      igual(store.estado.avaliacoes.length, 0);

      store.reparar();
      igual(store.estado.avaliacoes.length, 1);
      igual(store.estado.avaliacoes[0].idCirurgia, 'CIR0500');
    });

    it('o reparo NÃO apaga dado nem resolve nome duplicado sozinho', function () {
      var store = novoStore();
      store.estado.anestesistas.push({ id: 'A99', nome: 'Fabrício Tavares', ativo: 'Sim' });
      store.reparar();
      igual(store.estado.anestesistas.length, 16, 'nada foi removido');
      falso(store.verificarIntegridade().ok, 'o problema segue sinalizado para decisão humana');
    });

    it('normaliza Sim/Não fora do padrão no reparo', function () {
      var store = novoStore();
      store.estado.anestesistas[0].ativo = 'SIM';
      store.reparar();
      igual(store.estado.anestesistas[0].ativo, 'Sim');
    });
  });

  describe('LOG — audit trail', function () {

    it('registra a criação de cirurgia', function () {
      var store = novoStore();
      store.adicionarCirurgia(dadosCirurgia());
      var l = store.estado.log[0];
      igual(l.aba, 'CIRURGIAS');
      igual(l.campo, 'REGISTRO CRIADO');
      igual(l.usuario, 'qa');
      verdadeiro(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(l.quando), 'timestamp: ' + l.quando);
    });

    it('registra alteração de campo crítico com valor antes e depois', function () {
      var store = novoStore();
      store.adicionarCirurgia(dadosCirurgia());
      var id = store.estado.cirurgias[0].id;

      store.atualizarCirurgia(id, { valor: 2500 });
      var l = store.estado.log.filter(function (x) { return x.campo === 'VALOR DA ANESTESIA'; })[0];
      verdadeiro(l, 'deveria haver entrada para VALOR DA ANESTESIA');
      igual(l.de, '1000');
      igual(l.para, '2500');
      igual(l.idCirurgia, id);
    });

    it('usa o rótulo da coluna da planilha no campo alterado', function () {
      var store = novoStore();
      store.adicionarCirurgia(dadosCirurgia());
      var id = store.estado.cirurgias[0].id;
      store.atualizarCirurgia(id, { status: 'Realizada', inicioReal: '07:00', fimReal: '13:00' });

      var campos = store.estado.log.map(function (l) { return l.campo; });
      verdadeiro(campos.indexOf('STATUS') >= 0);
      verdadeiro(campos.indexOf('HORA INÍCIO REAL') >= 0);
      verdadeiro(campos.indexOf('HORA TÉRMINO REAL') >= 0);
    });

    it('NÃO registra campo não crítico', function () {
      var store = novoStore();
      store.adicionarCirurgia(dadosCirurgia());
      var id = store.estado.cirurgias[0].id;
      var antes = store.estado.log.length;

      store.atualizarCirurgia(id, { obs: 'anotação qualquer', sala: 'S9' });
      igual(store.estado.log.length, antes, 'observação e sala não poluem o log');
    });

    it('NÃO registra quando o valor não mudou de fato', function () {
      var store = novoStore();
      store.adicionarCirurgia(dadosCirurgia({ inicioPrev: '07:00' }));
      var id = store.estado.cirurgias[0].id;
      var antes = store.estado.log.length;

      store.atualizarCirurgia(id, { valor: 1000 });
      igual(store.estado.log.length, antes, 'mesmo valor não gera linha');
    });

    it('mostra "(vazio)" quando o campo estava em branco', function () {
      var store = novoStore();
      store.adicionarCirurgia(dadosCirurgia());
      var id = store.estado.cirurgias[0].id;
      store.atualizarCirurgia(id, { nf: 'NF-77' });

      var l = store.estado.log.filter(function (x) { return x.campo === 'NÚMERO DA NOTA FISCAL'; })[0];
      igual(l.de, '(vazio)');
      igual(l.para, 'NF-77');
    });

    it('registra o ajuste de escala com a aba mensal correta', function () {
      var store = novoStore();
      store.ajustarEscala('2026-10-01', 1, { substituto: 'Alene Cunha', motivo: 'Congresso' });
      var l = store.estado.log.filter(function (x) { return x.aba === 'ESCALA OUTUBRO 2026'; });
      verdadeiro(l.length >= 1, 'deveria registrar na aba de outubro');
      verdadeiro(l.some(function (x) { return x.campo === 'ANESTESISTA SUBSTITUTO (se ajuste)'; }));
    });

    it('registra exclusão de cirurgia e das avaliações em cascata', function () {
      var store = novoStore();
      store.adicionarCirurgia(dadosCirurgia({ avaliacaoNec: 'Sim' }));
      var id = store.estado.cirurgias[0].id;
      store.removerCirurgia(id, { comAvaliacoes: true });

      var excl = store.estado.log.filter(function (l) { return l.campo === 'REGISTRO EXCLUÍDO'; });
      igual(excl.length, 2, 'a cirurgia e a avaliação');
    });

    it('o log é append-only: nada é reescrito', function () {
      var store = novoStore();
      store.adicionarCirurgia(dadosCirurgia());
      var id = store.estado.cirurgias[0].id;
      var primeira = JSON.stringify(store.estado.log[0]);

      store.atualizarCirurgia(id, { valor: 5000 });
      store.atualizarCirurgia(id, { valor: 6000 });

      igual(JSON.stringify(store.estado.log[0]), primeira, 'a primeira entrada segue intacta');
      verdadeiro(store.estado.log.length >= 3);
    });

    it('filtra o log por cirurgia, aba e texto', function () {
      var store = novoStore();
      store.adicionarCirurgia(dadosCirurgia());
      var id = store.estado.cirurgias[0].id;
      store.atualizarCirurgia(id, { valor: 2000 });

      igual(core.filtrarLog(store.estado.log, { idCirurgia: id }).length, store.estado.log.length);
      igual(core.filtrarLog(store.estado.log, { aba: 'CIRURGIAS' }).length, store.estado.log.length);
      verdadeiro(core.filtrarLog(store.estado.log, { texto: 'VALOR' }).length >= 1);
      igual(core.filtrarLog(store.estado.log, { idCirurgia: 'CIR9999' }).length, 0);
    });

    it('o usuário do log acompanha a sessão', function () {
      var store = novoStore();
      store.usuario = 'secretaria';
      store.adicionarCirurgia(dadosCirurgia());
      igual(store.estado.log[0].usuario, 'secretaria');
    });
  });

  describe('Robustez com entrada suja', function () {

    it('aguenta lista vazia em todos os cálculos', function () {
      var store = core.criarStore(core.estadoVazio());
      store.recalcular();
      igual(store.horas().length, 0);
      igual(store.ledger().length, 0);
      igual(store.financeiro(10, 2026).totalRecebido, 0);
      igual(store.comparativo(10, 2026).length, 0);
      igual(store.dashboard(10, 2026).kpis.cirurgiasRealizadas, 0);
      igual(store.pendencias().length, 0);
    });

    it('aguenta campos null e undefined sem lançar', function () {
      var store = novoStore();
      var r = store.adicionarCirurgia({
        data: '2026-10-01', paciente: 'X', anestesista: 'Fabrício Tavares',
        inicioPrev: null, fimPrev: undefined, valor: null, nf: null, obs: undefined
      });
      verdadeiro(r.ok, JSON.stringify(r.erros));
      igual(store.estado.cirurgias[0].tempoEstimado, null);
    });

    it('aguenta 500 cirurgias sem degradar o resultado', function () {
      var store = novoStore();
      for (var i = 0; i < 500; i++) {
        store.estado.cirurgias.push(Object.assign(dadosCirurgia({
          paciente: 'P' + i, status: 'Realizada', inicioReal: '07:00', fimReal: '08:00'
        }), { id: 'CIR' + String(1000 + i) }));
      }
      store.recalcular();

      igual(store.estado.cirurgias.length, 500);
      igual(store.indicadores('Fabrício Tavares', 10, 2026).numCirurgias, 500);
      igual(store.indicadores('Fabrício Tavares', 10, 2026).horasReais, 500);
      verdadeiro(store.verificarIntegridade().ok === true || store.verificarIntegridade().erros.length === 0);
    });

    it('data inválida é recusada, não gravada torta', function () {
      var store = novoStore();
      var r = store.adicionarCirurgia(dadosCirurgia({ data: '2026-02-30' }));
      falso(r.ok);
      igual(store.estado.cirurgias.length, 0);
    });

    it('hora inválida é recusada', function () {
      var store = novoStore();
      var r = store.adicionarCirurgia(dadosCirurgia({ inicioPrev: '25:99' }));
      falso(r.ok);
    });

    it('valor negativo é recusado', function () {
      var store = novoStore();
      falso(store.adicionarCirurgia(dadosCirurgia({ valor: -100 })).ok);
    });
  });
};
