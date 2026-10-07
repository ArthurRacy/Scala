/**
 * QA 37 — Limites de dinheiro (auditoria F11, decisão do dono do produto em 05/10/2026)
 *   - teto de R$ 100 milhões por mês de competência (cada lançamento e o total do mês)
 *   - no máximo 2 casas decimais (centavos), nas cirurgias, nas avaliações e nas despesas do repasse
 *   - objeto ou lista no lugar de texto (só pela rede) não vira "[object Object]" gravado
 */
'use strict';

module.exports = function (t, core, dados) {
  var describe = t.describe, it = t.it, igual = t.igual, verdadeiro = t.verdadeiro, falso = t.falso;

  function novoStore() { return core.criarStoreComSeed(dados.seed, { usuario: 'qa', horizonte: 'movel', hoje: '2026-11-30' }); }

  function cir(extra) {
    return Object.assign({ status: 'Realizada', data: '2026-10-15', inicioPrev: '07:00', fimPrev: '09:00', paciente: 'Teste', procedimento: 'X',
      cirurgiao: 'Dr', anestesista: 'Fabrício Tavares', avaliacaoNec: 'Não', sala: 'S1' }, extra || {});
  }

  describe('Duas casas decimais e teto por lançamento', function () {

    it('R$ 100.000.000,00 passa; um centavo a mais não', function () {
      var st = novoStore();
      verdadeiro(st.adicionarCirurgia(cir({ valor: 100000000 })).ok);
      var r = st.adicionarCirurgia(cir({ data: '2026-11-15', valor: 100000000.01 }));
      falso(r.ok);
      verdadeiro(/teto/.test(r.erros[0].msg), r.erros[0].msg);
      igual(st.estado.cirurgias.length, 1, 'a recusada não ficou');
    });

    it('mais de 2 casas decimais é recusado; centavos certos passam, em qualquer formato digitado', function () {
      var st = novoStore();
      falso(st.adicionarCirurgia(cir({ valor: '1.234,567' })).ok);
      falso(st.adicionarCirurgia(cir({ valor: 12.345 })).ok);
      falso(st.adicionarCirurgia(cir({ valor: '1e-3' })).ok);
      var meses = ['2026-10-10', '2026-11-10', '2026-12-10', '2027-01-10', '2027-02-10', '2027-03-10', '2027-04-10'];   // um mês para cada, por causa do teto mensal
      ['1.234,56', 1234.56, '1234,5', 0.01, 99999999.99, '0', 10].forEach(function (v, i) {
        var r = st.adicionarCirurgia(cir({ valor: v, data: meses[i] }));
        verdadeiro(r.ok, String(v) + ' => ' + JSON.stringify(r.erros));
      });
    });

    it('a avaliação tem as mesmas regras', function () {
      var st = novoStore();
      st.adicionarCirurgia(cir({ avaliacaoNec: 'Sim' }));
      var id = st.estado.avaliacoes[0].id;
      falso(st.atualizarAvaliacao(id, { valor: 100000000.5 }).ok);
      falso(st.atualizarAvaliacao(id, { valor: 10.005 }).ok);
      verdadeiro(st.atualizarAvaliacao(id, { valor: 350.5 }).ok);
    });

    it('as despesas do repasse também', function () {
      var st = novoStore();
      falso(st.salvarDespesasRepasse(2026, 10, 100000001, 'x').ok);
      falso(st.salvarDespesasRepasse(2026, 10, 12.345, 'x').ok);
      verdadeiro(st.salvarDespesasRepasse(2026, 10, 100000000, 'x').ok);
    });
  });

  describe('Teto de R$ 100 milhões por mês (a soma)', function () {

    it('a soma do mês não passa; outro mês é outra conta; cancelada não entra; a recusada não deixa rastro', function () {
      var st = novoStore();
      verdadeiro(st.adicionarCirurgia(cir({ valor: 60000000 })).ok);
      var antes = core.jsonCanonico(st.estado.cirurgias);
      var logAntes = st.estado.log.length;
      var r = st.adicionarCirurgia(cir({ valor: 50000000, paciente: 'Estoura' }));
      falso(r.ok);
      verdadeiro(/10\/2026/.test(r.erros[0].msg) && /teto/.test(r.erros[0].msg), r.erros[0].msg);
      igual(core.jsonCanonico(st.estado.cirurgias), antes);
      igual(st.estado.log.length, logAntes, 'nada no LOG');
      verdadeiro(st.adicionarCirurgia(cir({ valor: 50000000, data: '2026-11-15' })).ok, 'novembro é outro mês');
      verdadeiro(st.adicionarCirurgia(cir({ valor: 50000000, status: 'Cancelada' })).ok, 'cancelada não conta para o teto');
      verdadeiro(st.adicionarCirurgia(cir({ valor: 40000000, paciente: 'Fecha o mês' })).ok, '60 + 40 = 100 milhões: no teto, pode');
      falso(st.adicionarCirurgia(cir({ valor: 0.01, paciente: 'Um centavo a mais' })).ok);
    });

    it('subir o valor de uma cirurgia que estoura o mês é recusado; a cirurgia fica como estava', function () {
      var st = novoStore();
      st.adicionarCirurgia(cir({ valor: 60000000 }));
      st.adicionarCirurgia(cir({ valor: 30000000, paciente: 'Outra' }));
      var id = st.estado.cirurgias[1].id;
      var r = st.atualizarCirurgia(id, { valor: 45000000 });
      falso(r.ok);
      igual(st.estado.cirurgias[1].valor, 30000000);
      verdadeiro(st.atualizarCirurgia(id, { valor: 40000000 }).ok);
    });

    it('a avaliação entra na mesma conta do mês', function () {
      var st = novoStore();
      st.adicionarCirurgia(cir({ valor: 99999000, avaliacaoNec: 'Sim' }));
      var id = st.estado.avaliacoes[0].id;
      falso(st.atualizarAvaliacao(id, { valor: 1500 }).ok, '99.999.000 + 1.500 passa de 100 milhões');
      verdadeiro(st.atualizarAvaliacao(id, { valor: 1000 }).ok);
    });

    it('mudar a data de uma cirurgia para um mês cheio é recusado', function () {
      var st = novoStore();
      st.adicionarCirurgia(cir({ valor: 90000000 }));
      st.adicionarCirurgia(cir({ valor: 20000000, data: '2026-11-10', paciente: 'Novembro' }));
      var r = st.atualizarCirurgia(st.estado.cirurgias[1].id, { data: '2026-10-20' });
      falso(r.ok);
      igual(st.estado.cirurgias[1].data, '2026-11-10');
    });
  });

  describe('Objeto no lugar de texto (só pela rede)', function () {

    it('nome que é objeto ou lista não é gravado como "[object Object]"', function () {
      var st = novoStore();
      var r = st.salvarAnestesista({ nome: { a: 1 } });
      falso(r.ok);
      igual(st.estado.anestesistas.length, 15);
      var ok = st.salvarAnestesista({ nome: 'Fulano de Tal', obs: { x: 1 }, telefone: [1, 2] });
      verdadeiro(ok.ok, JSON.stringify(ok.erros));
      var a = st.estado.anestesistas[st.estado.anestesistas.length - 1];
      igual(a.obs, '');
      igual(a.telefone, '');
      igual(JSON.stringify(st.estado).indexOf('[object Object]'), -1);
    });
  });
};
