/**
 * QA 31 — Robustez do núcleo (achados do QA geral de 05/10/2026)
 *   - dado com nome de propriedade do JavaScript (constructor, __proto__, toString) não derruba o recálculo
 *     nem suja o `Object` (backup estragado ou adulterado)
 *   - horas() com argumento que não é lista
 *   - mudar a escala-base com substituição antiga avisa quando a mesma pessoa fica em duas posições
 */
'use strict';

module.exports = function (t, core, dados) {
  var describe = t.describe, it = t.it, igual = t.igual, verdadeiro = t.verdadeiro;

  var U = require('./_servidor_util.js')(core);
  var DADOS = U.DADOS;

  function novoStore() { return core.criarStoreComSeed(dados.seed, { usuario: 'qa', horizonte: 'movel', hoje: '2026-11-30' }); }

  /* ====================================================================== */
  describe('Nomes especiais do JavaScript em dados vindos de fora', function () {

    var PERIGOSOS = ['constructor', '__proto__', 'toString', 'hasOwnProperty', 'valueOf'];

    function estadoHostil(palavra) {
      var base = JSON.parse(JSON.stringify(DADOS.enxugar(novoStore().estado)));
      base.escalaBase[0].dia = palavra;                                   // um "dia da semana" com nome de propriedade
      var mes = Object.keys(base.escalas)[0];
      base.escalas[mes][0].data = palavra;                                // e uma linha de escala com a "data" assim
      base.escalas[mes][1].efetivo = palavra;
      base.anestesistas[0].nome = palavra;
      base.cirurgias.push({ id: 'CIR0001', status: 'Agendada', data: palavra, inicioPrev: '07:00', fimPrev: '08:00', paciente: palavra,
        procedimento: 'X', anestesista: palavra, avaliacaoNec: 'Sim' });
      base.avaliacoes.push({ id: 'AVP0001', idCirurgia: palavra, uid: 'u1' });
      return base;
    }

    PERIGOSOS.forEach(function (palavra) {
      it('"' + palavra + '" como data, dia, nome ou ID: carrega, recalcula, confere e grava sem exceção', function () {
        var estado = DADOS.sanearEstado(estadoHostil(palavra));
        var st = core.criarStore(estado, { usuario: 'qa', horizonte: 'movel', hoje: '2026-11-30' });
        st.recalcular();
        st.verificarIntegridade();
        st.reparar();
        var r = st.adicionarCirurgia({ status: 'Agendada', data: '2026-11-20', inicioPrev: '08:00', fimPrev: '09:00', paciente: 'Normal',
          procedimento: 'X', cirurgiao: 'Y', anestesista: 'Fabrício Tavares', avaliacaoNec: 'Não', sala: 'S1' });
        verdadeiro(!(r.erros || []).some(function (e) { return /Erro interno/.test(e.msg || ''); }), JSON.stringify(r.erros));
        // a leitura da escala e as contas também aguentam
        st.escalaDoMes(2026, 11); st.dashboard(11, 2026); st.financeiro(11, 2026); st.horas();
      });
    });

    it('nada vaza para o Object nem para o prototype', function () {
      PERIGOSOS.forEach(function (p) {
        var st = core.criarStore(DADOS.sanearEstado(estadoHostil(p)), { usuario: 'qa', horizonte: 'movel', hoje: '2026-11-30' });
        st.recalcular();
      });
      igual(Object.getOwnPropertyNames(Object).filter(function (n) { return /^\d+$/.test(n); }).length, 0, 'Object ganhou posição numérica');
      igual(({}).polui, undefined);
      igual(([]).polui, undefined);
    });

    it('remanejamento com movimento que não é objeto (null, texto) é recusado com mensagem, não com "Erro interno"', function () {
      var st = novoStore();
      [[null], ['x'], [7], 'texto', {}, [[]]].forEach(function (m) {
        var r = st.aplicarRemanejamento(m);
        igual(r.ok, false, JSON.stringify(m));
        verdadeiro(!/Erro interno/.test(JSON.stringify(r.erros)), JSON.stringify(m) + ' -> ' + JSON.stringify(r.erros));
      });
    });

    it('horas() com argumento que não é lista usa os meses do horizonte, em vez de lançar exceção', function () {
      var st = novoStore();
      ['abc', ' ', 7, {}, null, undefined].forEach(function (x) {
        igual(st.horas(x).length, 15, String(x));
      });
    });
  });

  /* ====================================================================== */
  describe('Mudar a escala-base com substituição antiga', function () {

    it('a mesma pessoa em duas posições no mesmo dia: a mudança vale, mas o aviso diz qual dia', function () {
      var st = novoStore();
      verdadeiro(st.ajustarEscala('2026-11-07', 1, { substituto: 'Tiago Tolentino', motivo: 'troca combinada' }).ok);
      var r = st.definirModoEscalaBase(true);   // na base alfabética o Tiago passa a trabalhar sábado
      verdadeiro(r.ok, 'a regra de negócio não muda: a mudança é aceita');
      var aviso = r.avisos.filter(function (a) { return a.campo === 'substituicao'; })[0];
      verdadeiro(aviso, 'tem de avisar: ' + JSON.stringify(r.avisos));
      verdadeiro(/07\/11 \(Tiago Tolentino\)/.test(aviso.msg), aviso.msg);
    });

    it('sem substituição antiga, nenhum aviso (e desligar o modo automático também não avisa)', function () {
      var st = novoStore();
      igual(st.definirModoEscalaBase(true).avisos.length, 0);
      igual(st.definirModoEscalaBase(false).avisos.length, 0);
    });

    it('trocar um posto da escala-base deixa linha no LOG, com quem trocou; sem mudança, sem linha', function () {
      var st = core.criarStoreComSeed(dados.seed, { usuario: 'Chefe', login: 'chefe', horizonte: 'movel', hoje: '2026-11-30' });
      var linhas = JSON.parse(JSON.stringify(st.estado.escalaBase));
      var antes = st.estado.log.length;
      verdadeiro(st.definirEscalaBase(linhas).ok);
      igual(st.estado.log.length, antes, 'a mesma base não escreve nada');
      var velho = linhas[0].nome;
      linhas[0].nome = 'Alene Cunha'; linhas[0].id = 'A09';   // SEGUNDA, posição 1
      var r = st.definirEscalaBase(linhas);
      verdadeiro(r.ok, JSON.stringify(r.erros));
      var l = st.estado.log.slice(antes).filter(function (x) { return x.campo === 'ESCALA-BASE'; })[0];
      verdadeiro(l, 'tem de haver a linha ESCALA-BASE');
      igual(l.login, 'chefe');
      verdadeiro(l.de.indexOf('SEG 1: ' + velho) >= 0 && l.para.indexOf('SEG 1: Alene Cunha') >= 0, l.de + ' => ' + l.para);
    });

    it('com a escala-base automática, mexer no cadastro avisa exatamente quando uma substituição antiga passou a duplicar alguém', function () {
      var comAviso = 0, comDuplicata = 0;
      novoStore().estado.anestesistas.forEach(function (a) {
        var st = novoStore();
        verdadeiro(st.definirModoEscalaBase(true).ok);
        var dia = '2026-12-03';   // quinta: na base alfabética trabalham os 5 primeiros da lista
        // o sexto da lista alfabética não trabalha nesse dia, mas entra no lugar de quem sair dos 5 primeiros
        var substituto = st.estado.anestesistas.map(function (x) { return x.nome; })
          .sort(function (x, y) { return x.localeCompare(y, 'pt-BR'); })[5];
        verdadeiro(st.ajustarEscala(dia, 1, { substituto: substituto, motivo: 'troca' }).ok);
        var r = st.salvarAnestesista({ id: a.id, ativo: 'Não' });
        verdadeiro(r.ok, JSON.stringify(r.erros));
        var vistos = {}, duplicou = false;
        st.estado.consolidada.forEach(function (l) { var k = l.data + '|' + l.efetivo; if (vistos[k]) duplicou = true; vistos[k] = true; });
        var avisou = r.avisos.some(function (x) { return x.campo === 'substituicao'; });
        igual(avisou, duplicou, 'desativar ' + a.nome + ': aviso=' + avisou + ' duplicou=' + duplicou);
        if (avisou) comAviso++;
        if (duplicou) comDuplicata++;
      });
      verdadeiro(comDuplicata >= 1 && comAviso === comDuplicata, 'ao menos um caso de conflito tem de existir no teste (' + comDuplicata + ')');
    });

    it('definirEscalaBase também avisa', function () {
      var st = novoStore();
      st.ajustarEscala('2026-11-07', 1, { substituto: 'Tiago Tolentino', motivo: 'troca combinada' });
      var linhas = JSON.parse(JSON.stringify(st.estado.escalaBase));
      // põe o Tiago também no sábado, em outra posição
      var i = linhas.findIndex(function (l, k) { return k >= 25 && l.posicao === 5; });
      linhas[i].nome = 'Tiago Tolentino'; linhas[i].id = 'A07';
      var r = st.definirEscalaBase(linhas);
      verdadeiro(r.ok, JSON.stringify(r.erros));
      verdadeiro(r.avisos.some(function (a) { return a.campo === 'substituicao'; }), JSON.stringify(r.avisos));
    });
  });
};
