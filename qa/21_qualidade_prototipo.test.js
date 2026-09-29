/**
 * QA 21 — Qualidade e segurança: protótipo com dados fictícios
 *   - a demonstração monta fichas, eventos, acompanhamentos e estrutura sem erro
 *   - o painel calculado sobre ela bate com contas feitas à mão
 *   - a exportação por atendimento não identifica ninguém
 *   - a demonstração sai por inteiro com "Tirar exemplos"
 */
'use strict';

var fs = require('fs');
var path = require('path');
var vm = require('vm');

module.exports = function (t, core, dados) {
  var describe = t.describe, it = t.it, igual = t.igual, verdadeiro = t.verdadeiro, falso = t.falso;
  var RAIZ = path.join(__dirname, '..');

  var HOJE = '2026-11-20';

  /** Monta a demonstração como a versão online monta: numa loja nova, com a data de hoje fixa. */
  function demo() {
    var ctx = vm.createContext(Object.assign({}, core, {
      UI: { info: function () {}, ok: function () {} }, console: console,
      hojeISO: function () { return HOJE; }
    }));
    vm.runInContext(fs.readFileSync(path.join(RAIZ, 'webapp', 'js', 'demo_online.js'), 'utf8'), ctx);
    var DEMO = vm.runInContext('DEMO', ctx);
    var st = core.criarStoreComSeed(dados.seed, { usuario: 'demo', horizonte: 'movel', hoje: HOJE });
    DEMO.popular(st);
    return { st: st, DEMO: DEMO };
  }

  function ind(painel, chave) {
    return painel.indicadores.filter(function (i) { return i.chave === chave; })[0];
  }

  describe('Protótipo — a demonstração monta o módulo inteiro', function () {

    it('fichas, eventos, acompanhamentos e estrutura entram sem erro e a integridade fecha', function () {
      var d = demo();
      var fichas = d.st.fichasQualidade();
      igual(fichas.length, 18, 'dezoito atendimentos de exemplo');
      verdadeiro(d.st.estrutura().length >= 30, 'estrutura de vários turnos');
      var integ = d.st.verificarIntegridade();
      igual(integ.erros.length, 0, JSON.stringify(integ.erros.slice(0, 3)));
      verdadeiro(fichas.every(function (f) { return Object.isFrozen(f); }), 'fichas guardadas congeladas');
    });

    it('tem de tudo: evento, "não", campo sem resposta, perda de seguimento e acompanhamento vencido', function () {
      var d = demo();
      var p = d.st.painelQualidade({}, { hoje: HOJE });
      verdadeiro(p.indicadores.some(function (i) { return i.eventos > 0; }), 'algum evento');
      verdadeiro(p.indicadores.some(function (i) { return i.taxa === 0; }), 'algum "não" em todos os respondidos');
      verdadeiro(p.indicadores.some(function (i) { return i.semInformacao > 0; }), 'algum sem informação');
      verdadeiro(p.completude.semAcompanhamento > 0, 'acompanhamento vencido');
      verdadeiro(p.completude.incompletas > 0, 'ficha incompleta');
      verdadeiro(d.st.fichasQualidade().some(function (f) {
        return f.seguimentos.d30.situacao === 'Perda de seguimento' && f.seguimentos.d30.justificativa;
      }), 'perda de seguimento com justificativa');
      verdadeiro(p.completude.revisadas === 3, 'três revisões clínicas');
    });

    it('nada nasce atribuído à anestesia sem avaliação, e a revisão não apaga o registro original', function () {
      var d = demo();
      var comEvento = d.st.fichasQualidade().filter(function (f) { return f.revisao.revisadoEm && f.eventos.length; })[0];
      verdadeiro(comEvento, 'há ficha revisada com evento');
      comEvento.eventos.forEach(function (e) {
        igual(e.origem, 'Anestesista', 'quem registrou continua registrado');
        igual(e.confirmado, 'Confirmado');
        verdadeiro(e.descricao.length > 10, 'a descrição do anestesista permanece');
      });
    });

    it('a demonstração é sempre a mesma para a mesma data', function () {
      var a = demo().st.painelQualidade({}, { hoje: HOJE });
      var b = demo().st.painelQualidade({}, { hoje: HOJE });
      igual(core.jsonCanonico(a.indicadores.map(function (i) { return [i.chave, i.eventos, i.respondidos, i.elegiveis]; })),
        core.jsonCanonico(b.indicadores.map(function (i) { return [i.chave, i.eventos, i.respondidos, i.elegiveis]; })));
    });
  });

  describe('Protótipo — os números do painel batem com a conta feita à mão', function () {

    it('cada indicador é recontado direto das fichas', function () {
      var d = demo();
      var fichas = d.st.fichasQualidade();
      var p = d.st.painelQualidade({}, { hoje: HOJE });

      // pergunta de evento simples: recontagem independente do motor
      ['pcrSala', 'broncoaspiracao', 'lesaoCornea', 'vasopressorNaoPlanejado'].forEach(function (chave) {
        var sim = fichas.filter(function (f) { return f.respostas[chave] === 'Sim'; }).length;
        var nao = fichas.filter(function (f) { return f.respostas[chave] === 'Não'; }).length;
        var sem = fichas.filter(function (f) { return f.respostas[chave] === '' || f.respostas[chave] === 'Não avaliado/sem informação'; }).length;
        var i = ind(p, chave);
        igual(i.eventos, sim, chave + ': eventos');
        igual(i.respondidos, sim + nao, chave + ': denominador é só quem respondeu');
        igual(i.semInformacao, sem, chave + ': sem informação contada à parte');
        igual(i.elegiveis, sim + nao + sem, chave + ': elegíveis');
      });

      // hipotensão: PAM mínima abaixo de 65 ou tempo acumulado abaixo maior que zero
      var hipo = fichas.filter(function (f) {
        return (f.intra.pamMinima !== null && f.intra.pamMinima < 65) || (f.intra.minutosPamAbaixo || 0) > 0;
      }).length;
      var comPam = fichas.filter(function (f) { return f.intra.pamMinima !== null || f.intra.minutosPamAbaixo !== null; }).length;
      igual(ind(p, 'hipotensao').eventos, hipo);
      igual(ind(p, 'hipotensao').respondidos, comPam);

      // dor forte: primeira pontuação acima de 7
      var dor = fichas.filter(function (f) { return f.srpa.dorPontuacao !== null && f.srpa.dorPontuacao > 7; }).length;
      var dorAval = fichas.filter(function (f) { return f.srpa.dorPontuacao !== null; }).length;
      igual(ind(p, 'dorForte').eventos, dor);
      igual(ind(p, 'dorForte').respondidos, dorAval);

      // hipotermia: temperatura de chegada abaixo de 36
      var frio = fichas.filter(function (f) { return f.srpa.temperaturaChegada !== null && f.srpa.temperaturaChegada < 36; }).length;
      igual(ind(p, 'hipotermiaSrpa').eventos, frio);
    });

    it('a soma dos grupos fecha: eventos + "não" + sem informação = elegíveis, em todos os indicadores', function () {
      var d = demo();
      var resultados = d.st.resultadosQualidade({});
      var p = d.st.painelQualidade({}, { hoje: HOJE });
      p.indicadores.forEach(function (i) {
        var sim = 0, nao = 0, sem = 0, fora = 0;
        resultados.forEach(function (r) {
          var v = r.resultados[i.chave];
          if (v === 'Sim') sim++; else if (v === 'Não') nao++;
          else if (v === 'Sem informação') sem++; else fora++;
        });
        igual(sim, i.eventos, i.chave + ': Sim');
        igual(sim + nao, i.respondidos, i.chave + ': denominador');
        igual(sem, i.semInformacao, i.chave + ': sem informação');
        igual(sim + nao + sem, i.elegiveis, i.chave + ': elegíveis');
        igual(sim + nao + sem + fora, resultados.length, i.chave + ': todo atendimento cai em algum grupo');
      });
    });

    it('a comparação por profissional soma o mesmo que o painel geral', function () {
      var d = demo();
      var atend = d.st.atendimentosQualidade({});
      var geral = ind(d.st.painelQualidade({}, { hoje: HOJE }), 'hipotensao');
      var linhas = core.comparativoQualidade(atend, 'hipotensao', { hoje: HOJE });
      igual(linhas.reduce(function (s, l) { return s + l.eventos; }, 0), geral.eventos);
      igual(linhas.reduce(function (s, l) { return s + l.respondidos; }, 0), geral.respondidos);
      igual(linhas.reduce(function (s, l) { return s + l.atendimentos; }, 0), atend.length);
    });

    it('a evolução mês a mês soma o total do período', function () {
      var d = demo();
      var i = ind(d.st.painelQualidade({}, { hoje: HOJE }), 'hipotensao');
      verdadeiro(i.serie.length >= 2, 'a demonstração cobre mais de um mês');
      igual(i.serie.reduce(function (s, p) { return s + p.eventos; }, 0), i.eventos);
      igual(i.serie.reduce(function (s, p) { return s + p.respondidos; }, 0), i.respondidos);
    });

    it('indicador sem população elegível fica sem taxa, não em 0%', function () {
      var d = demo();
      var st = d.st;
      // ninguém com via aérea difícil prevista além de um caso: tira esse também
      var alvo = st.fichasQualidade().filter(function (f) { return f.pre.viaAereaDificilPrevista === 'Sim'; })[0];
      verdadeiro(alvo, 'a demonstração tem um caso previsto');
      // a ficha de exemplo está concluída: reabre (com motivo) antes de mexer
      if (alvo.status === core.FICHA_CONCLUIDA) {
        verdadeiro(st.reabrirFichaQualidade(alvo.id, 'Ajuste de teste para esvaziar a população elegível.').ok);
      }
      verdadeiro(st.salvarFichaQualidade(alvo.id, { pre: { viaAereaDificilPrevista: 'Não' } }).ok);
      var i = ind(st.painelQualidade({}, { hoje: HOJE }), 'protocoloViaAerea');
      igual(i.elegiveis, 0);
      igual(i.taxa, null);
    });
  });

  describe('Protótipo — exportação sem identificação', function () {

    it('a planilha por atendimento não traz nome, prontuário, telefone nem data exata', function () {
      var d = demo();
      var st = d.st;
      var resultados = st.resultadosQualidade({});
      igual(resultados.length, 18);
      var texto = JSON.stringify(resultados);
      // nada de paciente (EXEMPLO · Paciente…), prontuário (EX-…) nem data completa
      falso(/Paciente/.test(texto), 'nome do paciente vazou');
      falso(/EX-\d/.test(texto), 'prontuário vazou');
      falso(/\d{4}-\d{2}-\d{2}/.test(texto), 'data exata vazou (só o mês pode sair)');
      resultados.forEach(function (r) {
        verdadeiro(/^FQA\d{4}$/.test(r.ficha), 'a ficha é identificada pelo ID');
        verdadeiro(/^\d{4}-\d{2}$/.test(r.mes), 'a data vira mês: ' + r.mes);
      });
    });

    it('o relatório em PDF do painel agregado não cita paciente', function () {
      var d = demo();
      var ctx = vm.createContext(Object.assign({}, core, {
        UI: { baixarTexto: function () {} }, SEED_INICIAL: dados.seed, Blob: Blob, TextEncoder: TextEncoder, console: console
      }));
      ['03_dados.js', '03b_pdf.js', '03f_qualidade_pdf.js'].forEach(function (f) {
        vm.runInContext(fs.readFileSync(path.join(RAIZ, 'webapp', 'js', f), 'utf8'), ctx);
      });
      var QUALIDADE_PDF = vm.runInContext('QUALIDADE_PDF', ctx);
      var texto = QUALIDADE_PDF.fonteRelatorio(d.st.painelQualidade({}, { hoje: HOJE }), { anonimo: true });
      falso(/Paciente/.test(texto), 'o relatório agregado não pode citar paciente');
      falso(/EX-\d/.test(texto), 'nem prontuário');
      verdadeiro(texto.indexOf('n\\343o identifica') > 0 || /identifica/.test(texto), 'e diz que é agregado');
    });

    it('a comparação por profissional e a configuração são da coordenação (regra do painel)', function () {
      var fonte = fs.readFileSync(path.join(RAIZ, 'webapp', 'js', 'telas', 'painel_qualidade.js'), 'utf8');
      verdadeiro(/function ehCoordenacao\(app\)/.test(fonte), 'a regra existe');
      verdadeiro(/if \(!ehCoordenacao\(app\)\) return areaDaCoordenacao/.test(fonte), 'a comparação a usa');
      verdadeiro(/var podeConfigurar = ehCoordenacao/.test(fonte), 'a configuração a usa');
    });
  });

  describe('Protótipo — "Tirar exemplos" limpa tudo', function () {

    it('cirurgias, fichas e registros de estrutura de exemplo saem juntos', function () {
      var d = demo();
      var st = d.st;
      verdadeiro(st.fichasQualidade().length > 0 && st.estrutura().length > 0);
      var app = { store: st, salvarEredesenhar: function () {} };
      d.DEMO.limpar(app);
      igual(st.fichasQualidade().length, 0, 'fichas');
      igual(st.estrutura().length, 0, 'estrutura');
      igual(st.boletins().length, 0, 'boletins');
      igual(st.estado.cirurgias.filter(function (c) { return /EXEMPLO/.test(c.paciente); }).length, 0, 'cirurgias');
      var integ = st.verificarIntegridade();
      igual(integ.erros.length, 0, JSON.stringify(integ.erros.slice(0, 3)));
    });

    it('cirurgia com ficha de qualidade não pode ser excluída (evita ficha órfã)', function () {
      var st = core.criarStoreComSeed(dados.seed, { usuario: 'qa', horizonte: 'movel', hoje: HOJE });
      st.adicionarCirurgia({ status: 'Realizada', data: '2026-11-10', inicioPrev: '07:00', fimPrev: '09:00',
        paciente: 'Teste', procedimento: 'Rinoplastia', anestesista: 'Roberta Almeida', avaliacaoNec: 'Não' });
      var cid = st.estado.cirurgias[0].id;
      var f = st.criarFichaQualidade(cid).ficha;
      var r = st.removerCirurgia(cid);
      falso(r.ok);
      verdadeiro(/ficha de qualidade/.test(r.erros[0].msg), r.erros[0].msg);
      verdadeiro(/descarte antes a ficha/.test(r.erros[0].msg), 'oferece o caminho quando a ficha é intocada');
      verdadeiro(st.descartarFichaQualidade(f.id).ok);
      verdadeiro(st.removerCirurgia(cid).ok, 'sem a ficha, exclui');
    });
  });
};
