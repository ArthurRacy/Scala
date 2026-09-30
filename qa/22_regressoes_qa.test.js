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

  /* ------------------------------------------------------------------ */

  describe('ISSUE-001 — conflito de horário avisado na hora de marcar', function () {
    // Regression: ISSUE-001 — duas cirurgias do mesmo anestesista se cruzando
    // eram gravadas sem aviso; o README promete o aviso "na hora".
    // Found by /qa on 2026-09-29
    // Report: .gstack/qa-reports/qa-report-localhost-2026-09-29.md

    function msgs(r) { return (r.avisos || []).map(function (a) { return a.msg; }).join(' | '); }

    it('adicionar cirurgia que cruza outra do mesmo anestesista grava e avisa qual é', function () {
      var st = novoStore();
      verdadeiro(st.adicionarCirurgia(cirurgia({ inicioPrev: '08:00', fimPrev: '10:30' })).ok);
      var r = st.adicionarCirurgia(cirurgia({ paciente: 'Outra', inicioPrev: '09:00', fimPrev: '11:00' }));
      verdadeiro(r.ok, 'não bloqueia');
      verdadeiro(/Fabrício Tavares já tem a cirurgia CIR0001 \(08:00–10:30\)/.test(msgs(r)), msgs(r));
      igual(st.estado.cirurgias.length, 2);
    });

    it('encostar, outro anestesista, outro dia e cancelada não geram aviso', function () {
      var st = novoStore();
      st.adicionarCirurgia(cirurgia({ inicioPrev: '07:00', fimPrev: '09:00' }));
      [
        cirurgia({ inicioPrev: '09:00', fimPrev: '11:00' }),
        cirurgia({ inicioPrev: '08:00', fimPrev: '10:00', anestesista: 'Roberta Almeida' }),
        cirurgia({ inicioPrev: '08:00', fimPrev: '10:00', data: '2026-10-16' }),
        cirurgia({ inicioPrev: '08:00', fimPrev: '10:00', status: 'Cancelada' })
      ].forEach(function (c, i) {
        var r = st.adicionarCirurgia(c);
        verdadeiro(r.ok, 'caso ' + i);
        falso(/sobrep/.test(msgs(r)), 'caso ' + i + ': ' + msgs(r));
      });
    });

    it('editar a cirurgia para cruzar outra avisa; editar sem cruzar não', function () {
      var st = novoStore();
      st.adicionarCirurgia(cirurgia({ inicioPrev: '07:00', fimPrev: '09:00' }));
      st.adicionarCirurgia(cirurgia({ paciente: 'B', inicioPrev: '10:00', fimPrev: '12:00' }));
      var r = st.atualizarCirurgia('CIR0002', { inicioPrev: '08:00', fimPrev: '11:00' });
      verdadeiro(r.ok);
      verdadeiro(/CIR0001/.test(msgs(r)), msgs(r));
      var r2 = st.atualizarCirurgia('CIR0002', { inicioPrev: '13:00', fimPrev: '15:00' });
      falso(/sobrep/.test(msgs(r2)), msgs(r2));
    });

    it('conflitosDaCirurgia não conta a própria e ignora horário incompleto', function () {
      var a = { id: 'CIR0001', data: '2026-10-15', status: 'Agendada', anestesista: 'X', inicioPrev: '08:00', fimPrev: '10:00' };
      igual(core.conflitosDaCirurgia(a, [a]).length, 0, 'a própria');
      igual(core.conflitosDaCirurgia({ id: '(novo)', data: '2026-10-15', status: 'Agendada', anestesista: 'x', inicioPrev: '09:00', fimPrev: '' }, [a]).length, 0, 'sem término');
      igual(core.conflitosDaCirurgia({ id: '(novo)', data: '2026-10-15', status: 'Agendada', anestesista: 'x', inicioPrev: '09:00', fimPrev: '11:00' }, [a]).length, 1, 'nome sem maiúscula ainda cruza');
    });
  });

  /* ------------------------------------------------------------------ */

  describe('ISSUE-009 — configuração clínica da qualidade', function () {
    // Regression: ISSUE-009 — SpO₂ mínima 150 e TOF 2 eram aceitos; "abc" e -5
    // voltavam ao padrão com o aviso "Configuração clínica salva".
    // Found by /qa on 2026-09-29
    // Report: .gstack/qa-reports/qa-report-localhost-2026-09-29.md

    function msgs(r) { return (r.erros || []).map(function (e) { return e.msg; }).join(' | '); }

    it('limiar impossível ou que não é número é recusado, com o motivo, e nada muda', function () {
      var st = novoStore();
      var antes = core.jsonCanonico(st.configQualidade());
      [
        [{ spo2: '150' }, /SpO₂ mínima aceitável 150 fora da faixa/],
        [{ spo2: '-5' }, /fora da faixa/],
        [{ spo2: 'abc' }, /"abc" não é um número/],
        [{ tof: '2' }, /Relação TOF adequada 2 fora da faixa aceita \(0,5 a 1,5\)/],
        [{ tof: '90' }, /fora da faixa/],
        [{ jejumSolidos: '-3' }, /Jejum mínimo para sólidos/],
        [{ dor: '11' }, /Pontuação de dor/],
        [{ temperatura: '10' }, /Temperatura mínima/]
      ].forEach(function (c) {
        var r = st.salvarConfigQualidade({ limiares: c[0] });
        falso(r.ok, JSON.stringify(c[0]));
        verdadeiro(c[1].test(msgs(r)), JSON.stringify(c[0]) + ' -> ' + msgs(r));
      });
      igual(core.jsonCanonico(st.configQualidade()), antes, 'a configuração guardada não mudou');
    });

    it('limiares plausíveis e campo em branco (volta ao padrão) continuam valendo', function () {
      var st = novoStore();
      var r = st.salvarConfigQualidade({ limiares: { spo2: '92', pam: '', tof: '0,9', jejumSolidos: 6 } });
      verdadeiro(r.ok, msgs(r));
      igual(st.configQualidade().limiares.spo2, 92);
      igual(st.configQualidade().limiares.pam, 65, 'em branco = padrão');
      igual(st.configQualidade().limiares.tof, 0.9);
      igual(st.configQualidade().limiares.jejumSolidos, 6);
    });

    it('meta fora de 0 a 100, texto e datas que não existem também são recusados', function () {
      var st = novoStore();
      var chave = core.INDICADORES_QUALIDADE[0].chave;
      falso(st.salvarConfigQualidade({ metas: (function () { var m = {}; m[chave] = '150'; return m; })() }).ok);
      falso(st.salvarConfigQualidade({ metas: (function () { var m = {}; m[chave] = 'x'; return m; })() }).ok);
      var r = st.salvarConfigQualidade({ aprovacao: { responsavel: 'Dr. R', em: '2026-13-45' } });
      falso(r.ok);
      verdadeiro(/Data da aprovação inválida/.test(msgs(r)), msgs(r));
      var ok = st.salvarConfigQualidade({ aprovacao: { responsavel: 'Dr. R', em: '2026-09-01' } });
      verdadeiro(ok.ok, msgs(ok));
    });

    it('a leitura de backup segue tolerante: valor ruim vira o padrão, sem erro', function () {
      var cfg = core.lerConfigQualidade({ limiares: { spo2: 'abc', pam: '-5', tof: '0,8' } });
      igual(cfg.limiares.spo2, 90);
      igual(cfg.limiares.pam, 65);
      igual(cfg.limiares.tof, 0.8);
    });
  });
};
