/**
 * QA 23 — Ficha de qualidade preenchida a partir do boletim anestésico
 *   - resumoSinaisBoletim: menor SpO₂, menor PAM (calculada) e maior PAS
 *   - sugestoesDoBoletim: o que o boletim sabe, o que a ficha tem, o que difere
 *   - preencherFichaDoBoletim (store): só o que foi escolhido, com origem no histórico e no LOG
 *   - o painel enxerga o valor copiado; resposta Sim/Não nunca é preenchida
 */
'use strict';

var fs = require('fs');
var path = require('path');

module.exports = function (t, core, dados) {
  var describe = t.describe, it = t.it, igual = t.igual, verdadeiro = t.verdadeiro, falso = t.falso;

  function novoStore() { return core.criarStoreComSeed(dados.seed, { usuario: 'qa' }); }

  function msgs(r) { return (r.erros || []).map(function (e) { return e.msg; }).join(' | '); }

  /** Cirurgia + boletim + ficha, com o boletim preenchido como um caso real. */
  function cenario(opcoes) {
    opcoes = opcoes || {};
    var st = novoStore();
    st.adicionarCirurgia(Object.assign({
      status: 'Realizada', data: '2026-10-15', inicioPrev: '07:00', fimPrev: '09:00',
      paciente: 'Maria Teste', procedimento: 'Rinoplastia', cirurgiao: 'Dr. X', anestesista: 'Fabrício Tavares',
      avaliacaoNec: 'Não', sala: 'Sala 1', convenio: 'Unimed'
    }, opcoes.cirurgia || {}));
    var cid = st.estado.cirurgias[0].id;
    var bid = st.criarBoletim(cid).boletim.id;
    if (opcoes.boletim !== false) {
      var r = st.salvarBoletim(bid, Object.assign({
        paciente: { idade: '40', peso: '70', altura: '170', prontuario: 'P123' },
        pre: { asa: 'II', viaAereaDificil: true },
        tecnicas: ['Geral balanceada', 'Sedação'],
        viaAerea: { dispositivo: 'Tubo orotraqueal' },
        destino: 'Quarto / enfermaria',
        tempos: { inicioAnestesia: '07:00', fimAnestesia: '08:30' },
        semIntercorrencias: true
      }, opcoes.boletim || {}));
      verdadeiro(r.ok, msgs(r));
    }
    if (opcoes.sinais !== false) {
      (opcoes.sinais || [
        { hora: '07:05', pas: 120, pad: 80, fc: 70, spo2: 98 },
        { hora: '07:20', pas: 90, pad: 50, fc: 90, spo2: 88 }
      ]).forEach(function (linha) {
        var r2 = st.alterarLinhaBoletim(bid, 'sinais', { acao: 'adicionar', linha: linha });
        verdadeiro(r2.ok, msgs(r2));
      });
    }
    var fid = st.criarFichaQualidade(cid).ficha.id;
    return { st: st, cid: cid, bid: bid, fid: fid };
  }

  function sugestoes(x) { return core.sugestoesDoBoletim(x.st.fichaQualidade(x.fid), x.st.boletim(x.bid)); }
  function porCampo(lista) { var m = {}; lista.forEach(function (s) { m[s.campo] = s; }); return m; }
  function indicador(st, chave) {
    return st.painelQualidade({}).indicadores.filter(function (i) { return i.chave === chave; })[0];
  }

  /* ================================================================== */

  describe('Sinais vitais do boletim: as piores medidas', function () {

    it('menor SpO₂, menor PAM (PAS + 2 × PAD ÷ 3, inteiro) e maior PAS', function () {
      var r = core.resumoSinaisBoletim({ sinais: [
        { spo2: 98, pas: 120, pad: 80 },        // PAM 93
        { spo2: 88, pas: 90, pad: 50 },         // PAM 63
        { spo2: null, pas: null, pad: null },
        { spo2: 95, pas: 150, pad: null }       // sem PAD: entra na PAS máxima, não na PAM
      ] });
      igual(r.registros, 4);
      igual(r.spo2Minima, 88);
      igual(r.pamMinima, 63);
      igual(r.pasMaxima, 150);
    });

    it('parâmetro que ninguém registrou fica null, nunca zero', function () {
      var r = core.resumoSinaisBoletim({ sinais: [{ fc: 70 }, { fc: 72 }] });
      igual(r.spo2Minima, null);
      igual(r.pamMinima, null);
      igual(r.pasMaxima, null);
      igual(core.resumoSinaisBoletim({ sinais: [] }).registros, 0);
      igual(core.resumoSinaisBoletim(null).spo2Minima, null);
    });
  });

  /* ================================================================== */

  describe('Boletim → ficha: o que é sugerido', function () {

    it('boletim vazio não sugere nada (nada é inventado)', function () {
      var x = cenario({ boletim: false, sinais: false });
      igual(sugestoes(x).length, 0);
    });

    it('boletim preenchido sugere dados do paciente, ASA, técnica, horários, destino e as medidas dos sinais', function () {
      var x = cenario();
      var m = porCampo(sugestoes(x));
      var esperado = {
        'atendimento.prontuario': 'P123', 'atendimento.idade': 40, 'atendimento.peso': 70, 'atendimento.altura': 170,
        'atendimento.asa': 'II', 'atendimento.inicioAnestesia': '07:00', 'atendimento.fimAnestesia': '08:30',
        'atendimento.destino': 'Enfermaria', 'intra.spo2Minima': 88, 'intra.pamMinima': 63, 'intra.pasMaxima': 120
      };
      Object.keys(esperado).forEach(function (c) {
        verdadeiro(m[c], 'falta a sugestão de ' + c);
        igual(m[c].novo, esperado[c], c);
        igual(m[c].situacao, 'vazio', c + ' (a ficha nasce sem isso)');
      });
      igual(m['atendimento.tecnicas'].novo.join(' + '), 'Geral balanceada + Sedação');
      igual(m['atendimento.tecnicas'].novoTexto, 'Geral balanceada + Sedação');
      igual(m['intra.pamMinima'].novoTexto, '63 mmHg');
    });

    it('igual, vazio e diferente: a ficha que já tem valor não é sobrescrita por padrão', function () {
      // Horários reais da cirurgia = os do boletim: a ficha já nasce com eles.
      var x = cenario({ cirurgia: { inicioReal: '07:00', fimReal: '08:30' } });
      igual(x.st.fichaQualidade(x.fid).atendimento.inicioAnestesia, '07:00', 'a ficha herda o horário real da cirurgia');
      x.st.salvarFichaQualidade(x.fid, { atendimento: { peso: '65' } });
      var m = porCampo(sugestoes(x));
      igual(m['atendimento.inicioAnestesia'].situacao, 'igual');
      igual(m['atendimento.peso'].situacao, 'diferente');
      igual(m['atendimento.peso'].atualTexto, '65 kg');
      igual(m['atendimento.peso'].novoTexto, '70 kg');
      igual(m['atendimento.idade'].situacao, 'vazio');
    });

    it('destino: UTI, enfermaria e alta viram o destino da ficha; SRPA não é destino final e não entra', function () {
      [['UTI', 'UTI'], ['Quarto / enfermaria', 'Enfermaria'], ['Alta ambulatorial', 'Alta']].forEach(function (c) {
        var x = cenario({ boletim: { destino: c[0] } });
        igual(porCampo(sugestoes(x))['atendimento.destino'].novo, c[1], c[0]);
      });
      var srpa = cenario({ boletim: { destino: 'SRPA' } });
      falso('atendimento.destino' in porCampo(sugestoes(srpa)), 'SRPA não vira destino');
    });

    it('NUNCA sugere resposta Sim/Não: nem via aérea difícil prevista, nem intubação, nem eventos', function () {
      var x = cenario();   // o boletim marca via aérea difícil prevista e tubo orotraqueal
      var permitidas = { atendimento: true, intra: true };
      sugestoes(x).forEach(function (s) {
        verdadeiro(permitidas[s.secao], 'seção ' + s.secao + ' não deveria receber sugestão');
        falso(s.nome === 'intubacao', 'intubação é resposta');
      });
      var antes = core.jsonCanonico(x.st.fichaQualidade(x.fid).respostas);
      x.st.preencherFichaDoBoletim(x.fid);
      var f = x.st.fichaQualidade(x.fid);
      igual(core.jsonCanonico(f.respostas), antes, 'respostas de evento intactas');
      igual(f.intra.intubacao, '', 'intubação continua sem resposta');
      igual(f.pre.viaAereaDificilPrevista, '', 'via aérea difícil prevista continua sem resposta');
    });

    it('valor que a ficha recusaria (PA sistólica máxima abaixo de 40) não é sugerido, e o resto copia sem erro', function () {
      var x = cenario({ sinais: [{ hora: '07:05', pas: 30, pad: 15, spo2: 92 }] });
      var m = porCampo(sugestoes(x));
      falso('intra.pasMaxima' in m, 'PAS 30 está fora da faixa da ficha');
      igual(m['intra.spo2Minima'].novo, 92);
      var r = x.st.preencherFichaDoBoletim(x.fid);
      verdadeiro(r.ok, msgs(r));
    });
  });

  /* ================================================================== */

  describe('preencherFichaDoBoletim (store)', function () {

    it('sem lista copia SÓ o que a ficha ainda não tem, e devolve quais campos foram', function () {
      var x = cenario();
      x.st.salvarFichaQualidade(x.fid, { atendimento: { peso: '65' } });
      var r = x.st.preencherFichaDoBoletim(x.fid);
      verdadeiro(r.ok, msgs(r));
      verdadeiro(r.preenchidos.indexOf('atendimento.idade') >= 0 && r.preenchidos.indexOf('intra.spo2Minima') >= 0);
      falso(r.preenchidos.indexOf('atendimento.peso') >= 0, 'peso já preenchido não é trocado');
      var f = x.st.fichaQualidade(x.fid);
      igual(f.atendimento.peso, 65);
      igual(f.atendimento.idade, 40);
      igual(f.atendimento.asa, 'II');
      igual(f.atendimento.tecnicas.join(','), 'Geral balanceada,Sedação');
      igual(f.intra.spo2Minima, 88);
      igual(f.intra.pamMinima, 63);
      igual(f.intra.pasMaxima, 120);
    });

    it('a origem fica no histórico da ficha (campo a campo, com autor) e no LOG (com o ID do boletim)', function () {
      var x = cenario();
      x.st.preencherFichaDoBoletim(x.fid);
      var f = x.st.fichaQualidade(x.fid);
      var h = f.historico.filter(function (e) { return /do boletim BOL0001/.test(e.campo); });
      verdadeiro(h.length >= 8, 'histórico com origem: ' + h.length);
      igual(h[0].quem, 'qa');
      verdadeiro(h.some(function (e) { return /^peso · do boletim BOL0001$/.test(e.campo) && e.de === '—' && e.para === '70'; }));
      var ultimo = x.st.estado.log[x.st.estado.log.length - 1];
      verdadeiro(/FICHA PREENCHIDA DO BOLETIM BOL0001/.test(ultimo.campo), ultimo.campo);
    });

    it('com lista: troca o campo marcado mesmo já preenchido; ignora "igual" e chave que não existe', function () {
      var x = cenario({ cirurgia: { inicioReal: '07:00', fimReal: '08:30' } });
      x.st.salvarFichaQualidade(x.fid, { atendimento: { peso: '65', idade: '33' } });
      var r = x.st.preencherFichaDoBoletim(x.fid, ['atendimento.peso', 'atendimento.inicioAnestesia', 'atendimento.nao_existe', 'respostas.obito24h']);
      verdadeiro(r.ok, msgs(r));
      igual(r.preenchidos.join(','), 'atendimento.peso', 'só o peso: o horário já era igual e o resto não é campo do boletim');
      var f = x.st.fichaQualidade(x.fid);
      igual(f.atendimento.peso, 70, 'marcado: trocou');
      igual(f.atendimento.idade, 33, 'não marcado: ficou');
      igual(f.respostas.obito24h, '', 'resposta nunca entra por aqui');
    });

    it('nada novo para copiar: recusa com o motivo e não mexe no LOG', function () {
      var x = cenario();
      verdadeiro(x.st.preencherFichaDoBoletim(x.fid).ok);
      var tamLog = x.st.estado.log.length;
      var r = x.st.preencherFichaDoBoletim(x.fid);
      falso(r.ok);
      verdadeiro(/Nada para copiar/.test(msgs(r)), msgs(r));
      igual(x.st.estado.log.length, tamLog);
    });

    it('cirurgia sem boletim: recusa com o motivo', function () {
      var st = novoStore();
      st.adicionarCirurgia({ status: 'Realizada', data: '2026-10-15', inicioPrev: '07:00', fimPrev: '09:00', paciente: 'Sem Boletim',
        anestesista: 'Fabrício Tavares', avaliacaoNec: 'Não' });
      var fid = st.criarFichaQualidade(st.estado.cirurgias[0].id).ficha.id;
      var r = st.preencherFichaDoBoletim(fid);
      falso(r.ok);
      verdadeiro(/ainda não tem boletim/.test(msgs(r)), msgs(r));
    });

    it('ficha concluída não recebe cópia até ser reaberta (com motivo)', function () {
      var x = cenario();
      verdadeiro(x.st.concluirFichaQualidade(x.fid).ok);
      var r = x.st.preencherFichaDoBoletim(x.fid);
      falso(r.ok);
      verdadeiro(/concluída/.test(msgs(r)), msgs(r));
      verdadeiro(x.st.reabrirFichaQualidade(x.fid, 'Faltou copiar os dados do boletim').ok);
      verdadeiro(x.st.preencherFichaDoBoletim(x.fid).ok);
    });

    it('vale como comando do servidor: aceito com concorrência (campos de um registro que já existe) e não é só do administrador', function () {
      verdadeiro(core.MUTACOES_STORE.indexOf('preencherFichaDoBoletim') >= 0);
      verdadeiro(core.MUTACOES_SEGURAS_EM_CONCORRENCIA.indexOf('preencherFichaDoBoletim') >= 0);
      falso(core.MUTACOES_SO_ADMIN.indexOf('preencherFichaDoBoletim') >= 0, 'quem preenche a ficha é a equipe');
    });
  });

  /* ================================================================== */

  describe('O painel de qualidade enxerga o que veio do boletim', function () {

    it('SpO₂ 88 e PAM 63 (limiares 90 e 65) viram hipoxemia e hipotensão; sem cópia é "sem informação"', function () {
      var x = cenario();
      igual(indicador(x.st, 'hipoxemia').semInformacao, 1, 'antes: sem informação');
      igual(indicador(x.st, 'hipoxemia').eventos, 0);
      x.st.preencherFichaDoBoletim(x.fid);
      var h = indicador(x.st, 'hipoxemia'), p = indicador(x.st, 'hipotensao');
      igual(h.eventos, 1); igual(h.respondidos, 1); igual(h.semInformacao, 0);
      igual(p.eventos, 1); igual(p.respondidos, 1);
    });

    it('sinais normais contam como respondido sem evento; boletim sem SpO₂ segue "sem informação"', function () {
      var normal = cenario({ sinais: [{ hora: '07:05', pas: 120, pad: 80, spo2: 99 }] });
      normal.st.preencherFichaDoBoletim(normal.fid);
      igual(indicador(normal.st, 'hipoxemia').eventos, 0);
      igual(indicador(normal.st, 'hipoxemia').respondidos, 1);

      var semSpo2 = cenario({ sinais: [{ hora: '07:05', pas: 120, pad: 80, fc: 70 }] });
      semSpo2.st.preencherFichaDoBoletim(semSpo2.fid);
      igual(indicador(semSpo2.st, 'hipoxemia').semInformacao, 1, 'ausência não vira "normal"');
      igual(indicador(semSpo2.st, 'hipotensao').respondidos, 1, 'a PAM veio; a SpO₂ não');
    });

    it('as pendências da ficha caem: prontuário, ASA, peso, técnica, horários e destino saem da lista', function () {
      var x = cenario();
      var antes = core.totalPendenciasFicha(x.st.fichaQualidade(x.fid), '2026-10-16', x.st.estado.cirurgias[0]);
      x.st.preencherFichaDoBoletim(x.fid);
      var depois = core.totalPendenciasFicha(x.st.fichaQualidade(x.fid), '2026-10-16', x.st.estado.cirurgias[0]);
      verdadeiro(antes - depois >= 6, 'caiu ' + (antes - depois) + ' de ' + antes);
    });
  });

  /* ================================================================== */

  describe('Tela da ficha: botão "Do boletim"', function () {
    var fonte = fs.readFileSync(path.join(__dirname, '..', 'webapp', 'js', 'telas', 'qualidade.js'), 'utf8');

    it('o botão usa a comparação do core e grava só pelo store (nada de gravar direto)', function () {
      verdadeiro(/sugestoesDoBoletim\(f, bol\)/.test(fonte));
      verdadeiro(/store\.preencherFichaDoBoletim\(id, chaves\)/.test(fonte));
      verdadeiro(/aoMudarFixo\(function \(f\) \{\s*var motivo = motivoSemBoletim\(\)/.test(fonte), 'o botão precisa atualizar junto com a ficha');
    });

    it('a tela avisa que resposta Sim/Não continua com quem preenche, e o que já está na ficha só troca se marcado', function () {
      verdadeiro(/respostas Sim\/Não/.test(fonte));
      verdadeiro(/só troca se você marcar/.test(fonte));
      verdadeiro(/c\.checked = s\.situacao === 'vazio'/.test(fonte), 'só o que está vazio nasce marcado');
    });
  });
};
