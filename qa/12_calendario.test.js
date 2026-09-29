/**
 * QA 12 — Calendário contínuo
 *   O sistema não pode parar em 31/12/2026 (a planilha só tinha OUT/NOV/DEZ).
 *   - horizonte móvel acompanha o calendário e a última cirurgia marcada
 *   - o rodízio continua sem salto na virada do ano
 *   - mês encerrado é histórico: mudar a escala-base não o reescreve
 *   - o modo planilha (Apps Script) continua com exatamente os 3 meses
 *   - estado antigo, com a escala guardada pelo número do mês, é migrado
 */
'use strict';

module.exports = function (t, core, dados) {
  var describe = t.describe, it = t.it, igual = t.igual, verdadeiro = t.verdadeiro, falso = t.falso,
      igualProfundo = t.igualProfundo;

  var seed = dados.seed;

  function storeMovel(hoje, extra) {
    return core.criarStoreComSeed(seed, Object.assign({ usuario: 'qa', horizonte: 'movel', hoje: hoje }, extra || {}));
  }

  function cirurgia(extra) {
    return Object.assign({
      status: 'Agendada', inicioPrev: '07:00', fimPrev: '09:00',
      paciente: 'Paciente', procedimento: 'Rinoplastia', avaliacaoNec: 'Não'
    }, extra || {});
  }

  describe('Meses: descrição e horizonte', function () {

    it('infoMes reproduz exatamente as três entradas da planilha', function () {
      core.CONFIG.MESES_ESCALA.forEach(function (m) {
        var i = core.infoMes(m.ano, m.mes);
        igual(i.aba, m.aba);
        igual(i.rotulo, m.rotulo);
        igual(i.sigla, m.sigla);
        igual(i.nome, m.nome);
      });
    });

    it('nome de aba segue o padrão da planilha, com acento', function () {
      igual(core.infoMes(2027, 3).aba, 'ESCALA MARÇO 2027');
      igual(core.infoMes(2027, 1).rotulo, 'JAN/27');
    });

    it('antes de outubro/2026, o horizonte são os 3 meses da planilha', function () {
      igual(core.horizonteMovel({ hoje: '2026-09-24' }).map(function (m) { return m.chave; }).join(','),
        '2026-10,2026-11,2026-12');
    });

    it('em janeiro/2027, vai até abril/2027 (3 meses à frente)', function () {
      var h = core.horizonteMovel({ hoje: '2027-01-15' });
      igual(h[0].chave, '2026-10');
      igual(h[h.length - 1].chave, '2027-04');
      igual(h.length, 7);
    });

    it('em dezembro/2027 já passou da virada: vai até março/2028', function () {
      var h = core.horizonteMovel({ hoje: '2027-12-31' });
      igual(h[h.length - 1].chave, '2028-03');
    });

    it('cirurgia marcada mais longe estende o horizonte', function () {
      var h = core.horizonteMovel({ hoje: '2026-09-24', ultimoComDado: '2027-08-10' });
      igual(h[h.length - 1].chave, '2027-08');
    });

    it('data absurda (erro de digitação) não gera escala de décadas', function () {
      igual(core.horizonteMovel({ hoje: '2026-09-24', ultimoComDado: '2062-01-01' }).length, 3);
    });

    it('meses do ano e anos do horizonte', function () {
      var h = core.horizonteMovel({ hoje: '2027-01-15' });
      igual(core.mesesDoAno(h, 2027).length, 4);
      igualProfundo(core.anosDoHorizonte(h), [2026, 2027]);
    });
  });

  describe('Store no horizonte móvel', function () {

    it('janeiro/2027 tem escala montada (5 postos por dia útil)', function () {
      var st = storeMovel('2027-01-15');
      igual(st.escalaDoMes(2027, 1).length, core.datasUteisDoMes(2027, 1).length * 5);
      verdadeiro(st.temMes(2027, 4));
      falso(st.temMes(2027, 5));
    });

    it('cirurgia em janeiro/2027 recebe posição e anestesista sugerido', function () {
      var st = storeMovel('2027-01-15');
      var sug = st.sugerirAnestesista({ data: '2027-01-12', status: 'Agendada', inicioPrev: '07:00', fimPrev: '09:00' });
      verdadeiro(!!sug.nome, sug.motivo);
      var r = st.adicionarCirurgia(cirurgia({ data: '2027-01-12', anestesista: sug.nome }));
      verdadeiro(r.ok, JSON.stringify(r.erros));
      igual(st.estado.cirurgias[0].posicao, 1);
    });

    it('o rodízio continua na virada do ano, sem salto', function () {
      var st = storeMovel('2027-01-15');
      var idx = core.indexarEscalaBase(st.estado.escalaBase);
      // 07/01/2027 é a 15ª quinta desde 01/10/2026: 14 semanas depois -> giro 4.
      igual(core.giroDaData('2027-01-07'), 4);
      var linha = st.escalaDoMes(2027, 1).filter(function (l) { return l.data === '2027-01-07' && l.posicao === 1; })[0];
      igual(linha.calculado, idx['QUINTA-FEIRA'][5].nome);
    });

    it('marcar cirurgia além do horizonte estende a escala até ela', function () {
      var st = storeMovel('2026-09-24');
      falso(st.temMes(2027, 6));
      verdadeiro(st.adicionarCirurgia(cirurgia({ data: '2027-06-15', anestesista: 'Fabrício Tavares' })).ok);
      verdadeiro(st.temMes(2027, 6));
    });

    it('substituição funciona num mês novo (e vai ao LOG com a aba certa)', function () {
      var st = storeMovel('2027-01-15');
      var p = st.escalaDoMes(2027, 2)[0];
      var r = st.ajustarEscala(p.data, p.posicao, { substituto: 'Alene Cunha', motivo: 'férias' });
      verdadeiro(r.ok, JSON.stringify(r.erros));
      igual(st.escalaDoMes(2027, 2)[0].efetivo, 'Alene Cunha');
      igual(st.estado.log[st.estado.log.length - 1].aba, 'ESCALA FEVEREIRO 2027');
    });

    it('mês encerrado não é reescrito quando a escala-base muda', function () {
      var st = storeMovel('2027-01-15');
      var outubroAntes = JSON.stringify(st.escalaDoMes(2026, 10));
      var janeiroAntes = JSON.stringify(st.escalaDoMes(2027, 1));

      // troca as posições 1 e 2 da quinta-feira
      var base = JSON.parse(JSON.stringify(st.estado.escalaBase));
      var dia = '';
      var quinta = base.filter(function (l) { dia = l.dia || dia; l._dia = dia; return dia === 'QUINTA-FEIRA'; });
      var tmp = quinta[0].nome; quinta[0].nome = quinta[1].nome; quinta[1].nome = tmp;
      tmp = quinta[0].id; quinta[0].id = quinta[1].id; quinta[1].id = tmp;
      base.forEach(function (l) { delete l._dia; });
      verdadeiro(st.definirEscalaBase(base).ok);

      igual(JSON.stringify(st.escalaDoMes(2026, 10)), outubroAntes, 'outubro/2026 é histórico');
      verdadeiro(JSON.stringify(st.escalaDoMes(2027, 1)) !== janeiroAntes, 'janeiro/2027 segue a base nova');
    });

    it('série anual e horas usam os meses do ano pedido', function () {
      var st = storeMovel('2027-01-15');
      st.adicionarCirurgia(cirurgia({ data: '2027-01-12', status: 'Realizada', inicioReal: '07:00', fimReal: '08:30',
        anestesista: 'Fabrício Tavares' }));
      var porMes = st.dashboard(1, 2027).porMes;
      igual(porMes.map(function (m) { return m.sigla; }).join(','), 'JAN,FEV,MAR,ABR');
      igual(porMes[0].valor, 1);
      var meses = core.mesesDoAno(st.horizonte, 2027);
      var fab = st.horas(meses).filter(function (l) { return l.nome === 'Fabrício Tavares'; })[0];
      igual(fab['real_2027-01'], 1.5);
      igual(st.financeiroAnual(2027).meses.length, 4);
    });
  });

  describe('Navegação pelo calendário', function () {

    it('escolher um mês à frente monta a escala dele na hora', function () {
      var st = storeMovel('2026-09-25');
      falso(st.temMes(2027, 8));
      verdadeiro(st.estenderHorizonte(2027, 8));
      igual(st.escalaDoMes(2027, 8).length, core.datasUteisDoMes(2027, 8).length * 5);
    });

    it('não passa de 24 meses à frente nem volta antes do início do rodízio', function () {
      var st = storeMovel('2026-09-25');
      falso(st.estenderHorizonte(2028, 10), '25 meses à frente');
      verdadeiro(st.estenderHorizonte(2028, 9), '24 meses à frente');
      falso(st.estenderHorizonte(2026, 9), 'antes de out/2026');
    });

    it('substituição num mês distante mantém o mês na escala depois de recarregar', function () {
      var st = storeMovel('2026-09-25');
      st.estenderHorizonte(2027, 9);
      var p = st.escalaDoMes(2027, 9)[0];
      // alguém que NÃO está escalado nesse dia (a mesma pessoa não ocupa dois postos)
      var doDia = st.escalaDoMes(2027, 9).filter(function (l) { return l.data === p.data; }).map(function (l) { return l.efetivo; });
      var fora = st.nomesAnestesistas().filter(function (n) { return doDia.indexOf(n) < 0; })[0];
      var r = st.ajustarEscala(p.data, p.posicao, { substituto: fora, motivo: 'congresso' });
      verdadeiro(r.ok, JSON.stringify(r.erros));
      var recarregado = core.criarStore(JSON.parse(JSON.stringify(st.estado)), { usuario: 'qa', horizonte: 'movel', hoje: '2026-09-25' });
      recarregado.recalcular();
      verdadeiro(recarregado.temMes(2027, 9), 'o mês com ajuste continua visível');
      igual(recarregado.escalaDoMes(2027, 9)[0].efetivo, fora);
    });

    it('faixa navegável vai do início do rodízio a 24 meses à frente', function () {
      var f = core.faixaNavegavel('2026-09-25');
      igual(f.de.ano + '-' + f.de.mes, '2026-10');
      igual(f.ate.ano + '-' + f.ate.mes, '2028-9');
    });
  });

  describe('Compatibilidade', function () {

    it('sem opção, o store continua com os 3 meses da planilha (Apps Script)', function () {
      var st = core.criarStoreComSeed(seed, { usuario: 'qa' });
      igual(st.horizonte.map(function (m) { return m.chave; }).join(','), '2026-10,2026-11,2026-12');
      igual(st.escalaDoMes(10).length, 135);
    });

    it('estado antigo com escala pelo número do mês é migrado', function () {
      var st = core.criarStoreComSeed(seed, { usuario: 'qa' });
      var p = st.escalaDoMes(2026, 10)[0];
      st.ajustarEscala(p.data, p.posicao, { substituto: 'Alene Cunha', motivo: 'x' });
      var velho = JSON.parse(JSON.stringify(st.estado));
      velho.escalas = { 10: velho.escalas['2026-10'], 11: velho.escalas['2026-11'], 12: velho.escalas['2026-12'] };
      var novo = core.criarStore(velho, { usuario: 'qa', horizonte: 'movel', hoje: '2026-09-24' });
      novo.recalcular();
      igual(novo.escalaDoMes(2026, 10)[0].efetivo, 'Alene Cunha', 'o ajuste antigo sobreviveu');
      igual(Object.keys(novo.estado.escalas).filter(function (k) { return /^\d{1,2}$/.test(k); }).length, 0);
    });

    it('colunas de horas dos meses da planilha = cabeçalho da aba HORAS', function () {
      igualProfundo(core.colunasHoras(core.horizontePlanilha()).map(function (c) { return c.rotulo; }),
        core.schemaCabecalho('HORAS'));
    });
  });
};
