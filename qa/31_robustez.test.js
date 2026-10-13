/**
 * QA 31 — Robustez do núcleo (achados do QA geral de 05/10/2026)
 *   - dado com nome de propriedade do JavaScript (constructor, __proto__, toString) não derruba o recálculo
 *     nem suja o `Object` (backup estragado ou adulterado)
 *   - horas() com argumento que não é lista
 *   - mudar a escala-base (ou o cadastro, com a base automática) é RECUSADO quando uma substituição antiga deixaria a mesma
 *     pessoa em duas posições no mesmo dia (decisão do dono do produto, 05/10/2026)
 */
'use strict';

module.exports = function (t, core, dados) {
  var describe = t.describe, it = t.it, igual = t.igual, verdadeiro = t.verdadeiro, falso = t.falso;

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
  describe('Cirurgia que vira a meia-noite (auditoria F13)', function () {

    function cir(id, data, ini, fim, quem) {
      return { id: id, status: 'Agendada', data: data, inicioPrev: ini, fimPrev: fim, anestesista: quem || 'Ana', paciente: 'P', procedimento: 'X' };
    }

    it('a das 23h às 2h se cruza com a das 1h do dia seguinte (e só se for a mesma pessoa e houver cruzamento de verdade)', function () {
      igual(core.detectarConflitos([cir('C1', '2026-10-10', '23:00', '02:00'), cir('C2', '2026-10-11', '01:00', '03:00')]).length, 1);
      igual(core.detectarConflitos([cir('C2', '2026-10-11', '01:00', '03:00'), cir('C1', '2026-10-10', '23:00', '02:00')]).length, 1, 'a ordem da lista não importa');
      igual(core.detectarConflitos([cir('C1', '2026-10-10', '23:00', '02:00'), cir('C2', '2026-10-11', '02:00', '04:00')]).length, 0, 'encostar não conta');
      igual(core.detectarConflitos([cir('C1', '2026-10-10', '23:00', '02:00'), cir('C2', '2026-10-11', '01:00', '03:00', 'Bia')]).length, 0, 'outra pessoa');
      igual(core.detectarConflitos([cir('C1', '2026-10-10', '23:00', '02:00'), cir('C2', '2026-10-12', '01:00', '03:00')]).length, 0, 'dois dias depois não cruza');
      igual(core.detectarConflitos([cir('C1', '2026-10-10', '08:00', '10:00'), cir('C2', '2026-10-11', '08:00', '10:00')]).length, 0, 'mesmo horário em dias diferentes não conflita');
      igual(core.detectarConflitos([cir('C1', '2026-10-10', '08:00', '10:00'), cir('C2', '2026-10-10', '09:00', '11:00')]).length, 1, 'o caso do mesmo dia continua igual');
    });

    it('horariosSobrepostos compara os dois dias; sem data nenhuma, só os horários (como antes)', function () {
      verdadeiro(core.horariosSobrepostos(cir('a', '2026-10-10', '23:00', '02:00'), cir('b', '2026-10-11', '01:00', '03:00')));
      verdadeiro(core.horariosSobrepostos(cir('b', '2026-10-11', '01:00', '03:00'), cir('a', '2026-10-10', '23:00', '02:00')));
      falso(core.horariosSobrepostos(cir('a', '2026-10-10', '23:00', '02:00'), cir('b', '2026-10-10', '01:00', '03:00')), 'no MESMO dia a das 01h é de antes');
      verdadeiro(core.horariosSobrepostos({ inicioPrev: '22:00', fimPrev: '02:00' }, { inicioPrev: '23:00', fimPrev: '23:30' }));
    });

    it('a cirurgia nova avisa do conflito do dia anterior, e a sugestão não escolhe quem está operando na virada', function () {
      var st = novoStore();
      var d1 = '2026-12-08', d2 = '2026-12-09';
      var pos1 = st.estado.consolidada.filter(function (l) { return l.data === d2 && l.posicao === 1; })[0].efetivo;
      var base = { status: 'Agendada', procedimento: 'X', cirurgiao: 'Dr', avaliacaoNec: 'Não', sala: 'S1', paciente: 'P' };
      verdadeiro(st.adicionarCirurgia(Object.assign({}, base, { data: d1, inicioPrev: '23:00', fimPrev: '02:00', anestesista: pos1 })).ok);
      var sug = st.sugerirAnestesista({ data: d2, status: 'Agendada', inicioPrev: '01:00', fimPrev: '03:00' });
      verdadeiro(sug.nome && sug.nome !== pos1, 'não sugere ' + pos1 + ', que opera até as 02h: sugeriu ' + sug.nome);
      var r = st.adicionarCirurgia(Object.assign({}, base, { data: d2, inicioPrev: '01:00', fimPrev: '03:00', anestesista: pos1 }));
      verdadeiro(r.ok, 'é só aviso, não bloqueio');
      verdadeiro(r.avisos.some(function (a) { return /se sobrepõe/.test(a.msg); }), JSON.stringify(r.avisos));
    });
  });

  /* ====================================================================== */
  describe('Mudar a escala-base com substituição antiga', function () {

    it('a mesma pessoa em duas posições no mesmo dia: a mudança é RECUSADA, diz qual dia, e nada muda', function () {
      var st = novoStore();
      verdadeiro(st.ajustarEscala('2026-11-07', 1, { substituto: 'Tiago Tolentino', motivo: 'troca combinada' }).ok);
      var antes = core.jsonCanonico({ base: st.estado.escalaBase, cons: st.estado.consolidada, cfg: st.estado.config });
      var logAntes = st.estado.log.length;
      var r = st.definirModoEscalaBase(true);   // na base alfabética o Tiago passa a trabalhar sábado
      falso(r.ok, 'decisão do dono do produto: recusar');
      igual(r.erros[0].campo, 'substituicao');
      verdadeiro(/07\/11 \(Tiago Tolentino\)/.test(r.erros[0].msg), r.erros[0].msg);
      igual(core.jsonCanonico({ base: st.estado.escalaBase, cons: st.estado.consolidada, cfg: st.estado.config }), antes, 'base, escala e configuração ficam como estavam');
      igual(st.estado.log.length, logAntes, 'nada vai para o LOG');
      igual(st.escalaBaseAutomatica(), false);
      // desfeita a substituição, a mesma mudança passa
      verdadeiro(st.ajustarEscala('2026-11-07', 1, { ajuste: false }).ok);
      verdadeiro(st.definirModoEscalaBase(true).ok);
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

    it('com a escala-base automática, mexer no cadastro é recusado exatamente quando uma substituição antiga passaria a duplicar alguém', function () {
      var recusados = 0, aceitos = 0;
      var dia = '2026-12-03';   // quinta: na base alfabética trabalham os 5 primeiros da lista
      // o sexto da lista alfabética não trabalha nesse dia, mas entra no lugar de quem sair dos 5 primeiros
      var substituto = novoStore().estado.anestesistas.map(function (x) { return x.nome; })
        .sort(function (x, y) { return x.localeCompare(y, 'pt-BR'); })[5];
      novoStore().estado.anestesistas.forEach(function (a) {
        // o que a nova base faria naquele dia, sem a substituição no caminho
        var limpo = novoStore();
        limpo.definirModoEscalaBase(true);
        limpo.salvarAnestesista({ id: a.id, ativo: 'Não' });
        var novosDoDia = limpo.estado.consolidada.filter(function (l) { return l.data === dia; }).map(function (l) { return l.efetivo; });
        var esperaConflito = novosDoDia.slice(1).indexOf(substituto) >= 0;   // fora da posição 1, onde a substituição cai

        var st = novoStore();
        verdadeiro(st.definirModoEscalaBase(true).ok);
        verdadeiro(st.ajustarEscala(dia, 1, { substituto: substituto, motivo: 'troca' }).ok);
        var antes = core.jsonCanonico({ cad: st.estado.anestesistas, cons: st.estado.consolidada, base: st.estado.escalaBase });
        var r = st.salvarAnestesista({ id: a.id, ativo: 'Não' });
        igual(r.ok, !esperaConflito, 'desativar ' + a.nome + ': esperava ' + (esperaConflito ? 'recusa' : 'aceite') + ' e veio ' + JSON.stringify(r.erros));
        if (!r.ok) {
          recusados++;
          igual(r.erros[0].campo, 'substituicao');
          igual(core.jsonCanonico({ cad: st.estado.anestesistas, cons: st.estado.consolidada, base: st.estado.escalaBase }), antes, 'recusado: tudo como estava');
        } else aceitos++;
      });
      verdadeiro(recusados >= 1 && aceitos >= 1, 'o teste tem de ter os dois casos (' + recusados + ' recusados, ' + aceitos + ' aceitos)');
    });

    it('definirEscalaBase também recusa, e a base continua a de antes', function () {
      var st = novoStore();
      st.ajustarEscala('2026-11-07', 1, { substituto: 'Tiago Tolentino', motivo: 'troca combinada' });
      var linhas = JSON.parse(JSON.stringify(st.estado.escalaBase));
      var original = core.jsonCanonico(st.estado.escalaBase);
      // põe o Tiago também no sábado, em outra posição
      var i = linhas.findIndex(function (l, k) { return k >= 25 && l.posicao === 5; });
      linhas[i].nome = 'Tiago Tolentino'; linhas[i].id = 'A07';
      var r = st.definirEscalaBase(linhas);
      falso(r.ok);
      igual(r.erros[0].campo, 'substituicao');
      igual(core.jsonCanonico(st.estado.escalaBase), original);
    });
  });
};
