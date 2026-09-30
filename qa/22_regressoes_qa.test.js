/**
 * QA 22 — Regressões da rodada de QA de 29/09/2026
 * Cada bloco leva o número do achado (ISSUE-NNN) do relatório
 * .gstack/qa-reports/qa-report-localhost-2026-09-29.md e prende o defeito no
 * lugar: o teste falha se o comportamento antigo voltar.
 */
'use strict';

module.exports = function (t, core, dados) {
  var describe = t.describe, it = t.it, igual = t.igual, verdadeiro = t.verdadeiro, falso = t.falso;

  function novoStore() { return core.criarStoreComSeed(dados.seed, { usuario: 'qa' }); }

  function cirurgia(extra) {
    return Object.assign({
      status: 'Agendada', data: '2026-10-15', inicioPrev: '07:00', fimPrev: '09:00',
      paciente: 'Maria Teste', procedimento: 'Rinoplastia', cirurgiao: 'Dr. X', anestesista: 'Fabrício Tavares',
      avaliacaoNec: 'Não', sala: 'Sala 1', valor: 1000, pago: 'Não'
    }, extra || {});
  }

  function comBoletim() {
    var st = novoStore();
    st.adicionarCirurgia(cirurgia({ status: 'Realizada' }));
    var cid = st.estado.cirurgias[0].id;
    return { st: st, id: st.criarBoletim(cid).boletim.id };
  }

  /* ------------------------------------------------------------------ */

  describe('ISSUE-006 — dose do fármaco no boletim', function () {
    // Regression: ISSUE-006 — dose "-5" entrava no prontuário assinado
    // Found by /qa on 2026-09-29
    // Report: .gstack/qa-reports/qa-report-localhost-2026-09-29.md

    function adicionarFarmaco(x, dose) {
      return x.st.alterarLinhaBoletim(x.id, 'farmacos',
        { acao: 'adicionar', linha: { hora: '07:10', nome: 'Propofol', dose: dose, unidade: 'mg', via: 'IV' } });
    }

    it('dose negativa, zero, texto e absurda são recusadas e nada é gravado', function () {
      var x = comBoletim();
      ['-5', '0', 'abc', '5 mg', '100001', '-0,5'].forEach(function (d) {
        var r = adicionarFarmaco(x, d);
        falso(r.ok, 'dose "' + d + '" deveria ser recusada');
        verdadeiro(/dose/i.test(r.erros.map(function (e) { return e.msg; }).join(' ')), 'mensagem cita a dose: ' + d);
      });
      igual(x.st.boletim(x.id).farmacos.length, 0, 'nenhum fármaco entrou');
    });

    it('doses válidas (inteira, vírgula decimal, milhar) continuam entrando', function () {
      var x = comBoletim();
      ['150', '0,05', '2.5', '1.000'].forEach(function (d) {
        verdadeiro(adicionarFarmaco(x, d).ok, 'dose "' + d + '" deveria entrar');
      });
      igual(x.st.boletim(x.id).farmacos.length, 4);
    });

    it('a dose inválida também aparece na validação do boletim (Integridade)', function () {
      var b = core.normalizarBoletim({ farmacos: [{ hora: '07:00', nome: 'Propofol', dose: '-5', unidade: 'mg', via: 'IV' }] });
      var msgs = core.validarBoletim(b).erros.map(function (e) { return e.msg; }).join(' | ');
      verdadeiro(/maior que zero/.test(msgs), msgs);
    });
  });
};
