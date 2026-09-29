/**
 * QA 20 — Indicadores de qualidade e segurança
 *   - ficha: leitura estrita x tolerante, nada pré-selecionado, cálculos
 *   - store: ciclo de vida, eventos repetidos, acompanhamento, revisão clínica
 *   - indicadores: dado ausente nunca vira "não", elegibilidade, limiares
 *   - estrutura: vínculo com o atendimento, duplicidade, resumo
 *   - configuração clínica, integridade, backup, PDF e PPTX
 */
'use strict';

var fs = require('fs');
var path = require('path');
var vm = require('vm');

module.exports = function (t, core, dados) {
  var describe = t.describe, it = t.it, igual = t.igual, verdadeiro = t.verdadeiro, falso = t.falso;

  var RAIZ = path.join(__dirname, '..');
  var ctx = vm.createContext(Object.assign({}, core, {
    UI: { baixarTexto: function () {}, downloadBloqueado: function () { return false; } },
    SEED_INICIAL: dados.seed, Blob: Blob, TextEncoder: TextEncoder, console: console
  }));
  ['03_dados.js', '03b_pdf.js', '03f_qualidade_pdf.js', '03h_pptx.js'].forEach(function (f) {
    vm.runInContext(fs.readFileSync(path.join(RAIZ, 'webapp', 'js', f), 'utf8'), ctx);
  });
  var DADOS = vm.runInContext('DADOS', ctx);
  var QUALIDADE_PDF = vm.runInContext('QUALIDADE_PDF', ctx);
  var PPTX = vm.runInContext('PPTX', ctx);

  var HOJE = '2026-11-30';

  function novoStore() {
    return core.criarStoreComSeed(dados.seed, { usuario: 'qa', horizonte: 'movel', hoje: HOJE });
  }

  function cirurgia(extra) {
    return Object.assign({
      status: 'Realizada', data: '2026-10-15', inicioPrev: '07:00', fimPrev: '09:00',
      paciente: 'Maria Teste', procedimento: 'Rinoplastia', cirurgiao: 'Dr. X',
      anestesista: 'Fabrício Tavares', avaliacaoNec: 'Não', sala: 'Sala 1', convenio: 'Particular'
    }, extra || {});
  }

  /** Store com uma cirurgia e a ficha dela criada. */
  function comFicha(extraCir) {
    var st = novoStore();
    st.adicionarCirurgia(cirurgia(extraCir));
    var cid = st.estado.cirurgias[st.estado.cirurgias.length - 1].id;
    var r = st.criarFichaQualidade(cid);
    verdadeiro(r.ok, JSON.stringify(r.erros));
    return { st: st, cid: cid, id: r.ficha.id };
  }

  /** Preenche o mínimo de um atendimento completo. */
  function preencher(st, id, extra) {
    var r = st.salvarFichaQualidade(id, Object.assign({
      atendimento: {
        prontuario: '12345', vinculo: 'Particular', especialidade: 'Cirurgia plástica',
        unidade: 'Centro cirúrgico', sala: 'Sala 1', carater: 'Eletivo', asa: 'II',
        idade: '40', peso: '70', altura: '165', tecnicas: ['Geral balanceada'],
        inicioAnestesia: '07:10', fimAnestesia: '09:20', entradaSrpa: '09:30', saidaSrpa: '10:40',
        destino: 'Enfermaria'
      },
      pre: { avaliacaoDocumentada: 'Sim', avaliacaoCompleta: 'Sim', viaAereaAvaliada: 'Sim',
        viaAereaDificilPrevista: 'Não', carrinhoDisponivel: 'Sim', carrinhoChecado: 'Sim',
        jejumData: '2026-10-14', jejumHora: '22:00', jejumTipo: 'Sólidos' },
      processo: { checklistRealizado: 'Sim', checklistCompleto: 'Sim',
        capnografiaIndicada: 'Sim', capnografiaUsada: 'Sim',
        atbIndicada: 'Sim', atbNome: 'Cefazolina', atbHora: '06:40', incisaoHora: '07:30',
        bnmUsado: 'Sim', bnmMonitorizado: 'Sim', tofValor: '0,95',
        aquecimentoAtivo: 'Sim', monitorTemperatura: 'Sim' },
      intra: { intubacao: 'Sim', spo2Minima: '97', pamMinima: '70', pasMaxima: '140' },
      srpa: { temperaturaChegada: '36,4', nausea: 'Não', vomito: 'Não',
        dorEscala: 'EVA (0–10)', dorPontuacao: '3', dorHora: '09:45' }
    }, extra || {}));
    verdadeiro(r.ok, JSON.stringify(r.erros));
    return r;
  }

  /* ==================================================== leitura da ficha */

  describe('Qualidade — a ficha e o que ela garante', function () {

    it('nenhuma resposta clínica nasce preenchida', function () {
      var f = core.normalizarFicha({ idCirurgia: 'CIR0001' });
      core.EVENTOS_QUALIDADE.forEach(function (e) {
        igual(f.respostas[e.chave], '', 'resposta de ' + e.chave);
      });
      igual(f.pre.avaliacaoDocumentada, '');
      igual(f.processo.checklistRealizado, '');
      igual(f.srpa.nausea, '');
      core.SEGUIMENTOS_QUALIDADE.forEach(function (s) {
        igual(f.seguimentos[s.chave].situacao, '', 'acompanhamento ' + s.chave);
      });
    });

    it('as quatro respostas existem e o vazio é uma quinta situação', function () {
      igual(core.RESPOSTAS_QUALIDADE.length, 4);
      igual(core.RESPOSTAS_QUALIDADE.join('|'), 'Sim|Não|Não se aplica|Não avaliado/sem informação');
    });

    it('leitura estrita recusa valor fora da lista; a tolerante só descarta', function () {
      var bruto = { idCirurgia: 'CIR0001', pre: { avaliacaoDocumentada: 'Talvez' } };
      var estrito = core.lerFicha(bruto, true);
      verdadeiro(estrito.erros.length > 0, 'devia reclamar');
      var tolerante = core.lerFicha(bruto, false);
      igual(tolerante.erros.length, 0);
      igual(tolerante.ficha.pre.avaliacaoDocumentada, '');
    });

    it('ler o que já foi lido dá exatamente a mesma ficha', function () {
      var f = core.normalizarFicha({
        idCirurgia: 'CIR0001', atendimento: { asa: 'III', peso: '70,5' },
        respostas: { pcrSala: 'Não' },
        eventos: [{ tipo: 'lesaoCornea', data: '2026-10-15', descricao: 'olho direito', dados: { lado: 'Direito' } }]
      });
      igual(core.jsonCanonico(core.normalizarFicha(f)), core.jsonCanonico(f));
    });

    it('evento de tipo desconhecido não entra', function () {
      var f = core.normalizarFicha({ idCirurgia: 'CIR0001', eventos: [{ tipo: 'inventado', descricao: 'x' }] });
      igual(f.eventos.length, 0);
    });

    it('campo fora do formato não entra pela gravação', function () {
      var c = comFicha();
      var r = c.st.salvarFichaQualidade(c.id, { atendimento: { peso: '900' } });
      falso(r.ok, 'peso de 900 kg devia ser recusado');
      var r2 = c.st.salvarFichaQualidade(c.id, { status: 'Concluída', id: 'FQA9999' });
      verdadeiro(r2.ok);
      igual(c.st.fichaQualidade(c.id).status, core.FICHA_RASCUNHO, 'a tela não muda a situação');
      igual(c.st.fichaQualidade(c.id).id, c.id, 'a tela não troca o ID');
    });

    it('a ficha guardada é imutável', function () {
      var c = comFicha();
      var f = c.st.fichaQualidade(c.id);
      verdadeiro(Object.isFrozen(f));
      try { f.atendimento.asa = 'V'; } catch (e) { /* modo estrito lança */ }
      igual(c.st.fichaQualidade(c.id).atendimento.asa, '');
    });
  });

  /* ============================================================ cálculos */

  describe('Qualidade — intervalos calculados dos horários', function () {

    it('duração da anestesia, permanência na SRPA e jejum', function () {
      var c = comFicha();
      preencher(c.st, c.id);
      var f = c.st.fichaQualidade(c.id);
      var r = core.resumoQualidade(f, c.st.estado.cirurgias[0]);
      igual(r.duracaoAnestesia, 130, 'de 07:10 a 09:20');
      igual(r.permanenciaSrpa, 70, 'de 09:30 a 10:40');
      igual(r.jejumHoras, 9.2, 'de 14/10 22:00 a 15/10 07:10');
      igual(r.antibioticoAntesDaIncisao, 50, 'de 06:40 a 07:30');
    });

    it('anestesia que atravessa a meia-noite não vira duração negativa', function () {
      var c = comFicha();
      preencher(c.st, c.id, { atendimento: { inicioAnestesia: '23:30', fimAnestesia: '01:10' } });
      var f = c.st.fichaQualidade(c.id);
      igual(core.resumoQualidade(f, c.st.estado.cirurgias[0]).duracaoAnestesia, 100);
    });

    it('saída da SRPA antes da entrada é recusada', function () {
      var c = comFicha();
      var r = c.st.salvarFichaQualidade(c.id, {
        atendimento: { inicioAnestesia: '07:00', entradaSrpa: '09:00', saidaSrpa: '08:00' }
      });
      falso(r.ok);
    });
  });

  /* ========================================================== pendências */

  describe('Qualidade — pendência acompanha, não bloqueia', function () {

    it('ficha nova tem pendências e mesmo assim pode ser concluída', function () {
      var c = comFicha();
      var f = c.st.fichaQualidade(c.id);
      verdadeiro(core.totalPendenciasFicha(f, HOJE, c.st.estado.cirurgias[0]) > 0);
      var r = c.st.concluirFichaQualidade(c.id);
      verdadeiro(r.ok, 'pendência não pode impedir');
      verdadeiro(r.avisos.length > 0, 'mas tem de avisar o que falta');
      igual(c.st.fichaQualidade(c.id).status, core.FICHA_CONCLUIDA);
    });

    it('"sem informação" no acompanhamento exige justificativa', function () {
      var c = comFicha();
      var r = c.st.registrarSeguimentoQualidade(c.id, 'h24', { situacao: 'Sem informação' });
      falso(r.ok, 'sem justificativa não passa');
      var r2 = c.st.registrarSeguimentoQualidade(c.id, 'h24',
        { situacao: 'Perda de seguimento', justificativa: 'Paciente não atendeu em três tentativas.' });
      verdadeiro(r2.ok, JSON.stringify(r2.erros));
      igual(c.st.fichaQualidade(c.id).seguimentos.h24.situacao, 'Perda de seguimento');
    });

    it('janela realizada sem responder as perguntas dela vira pendência (o dado não some calado)', function () {
      var c = comFicha();
      var cir = c.st.estado.cirurgias[0];
      c.st.registrarSeguimentoQualidade(c.id, 'h24', { situacao: 'Realizado', data: '2026-10-16' });
      var itens = core.pendenciasFicha(c.st.fichaQualidade(c.id), HOJE, cir)
        .reduce(function (l, g) { return l.concat(g.itens); }, []);
      verdadeiro(itens.some(function (i) { return /Óbito em até 24 horas \(acompanhamento de 24 horas realizado\)/.test(i); }), itens.join(' | '));
      verdadeiro(!itens.some(function (i) { return /Óbito em até 48 horas \(acompanhamento/.test(i); }), 'só as da janela realizada');
      c.st.salvarFichaQualidade(c.id, { respostas: { obito24h: 'Não', despertar: 'Não', reintubacao24h: 'Não' } });
      var depois = core.pendenciasFicha(c.st.fichaQualidade(c.id), HOJE, cir)
        .reduce(function (l, g) { return l.concat(g.itens); }, []);
      verdadeiro(!depois.some(function (i) { return /acompanhamento de 24 horas realizado/.test(i); }), 'respondidas, some');
    });

    it('janela vencida sem resposta aparece como acompanhamento pendente', function () {
      var c = comFicha();
      var f = c.st.fichaQualidade(c.id);
      var cir = c.st.estado.cirurgias[0];
      igual(core.seguimentosPendentes(f, '2026-10-16', cir).length, 1, 'só 24 h venceu em 16/10');
      igual(core.seguimentosPendentes(f, '2026-11-20', cir).length, 3, 'em 20/11 as três venceram');
      igual(core.seguimentosPendentes(f, '2026-10-15', cir).length, 0, 'no próprio dia, nenhuma');
    });
  });

  /* ============================================================== store */

  describe('Qualidade — ciclo de vida no store', function () {

    it('uma ficha por cirurgia', function () {
      var c = comFicha();
      var r = c.st.criarFichaQualidade(c.cid);
      falso(r.ok);
      verdadeiro(/já tem a ficha/.test(r.erros[0].msg), r.erros[0].msg);
    });

    it('o mesmo tipo de evento pode ser registrado várias vezes', function () {
      var c = comFicha();
      ['08:00', '08:40'].forEach(function (h) {
        var r = c.st.alterarEventoQualidade(c.id, { acao: 'adicionar', evento: {
          tipo: 'vasopressorNaoPlanejado', data: '2026-10-15', hora: h, descricao: 'Hipotensão às ' + h,
          gravidade: 'Moderada', conduta: 'Metaraminol', relacao: 'Possível',
          dados: { medicamento: 'Metaraminol', motivo: 'Hipotensão', intervencao: 'Bolus' }
        } });
        verdadeiro(r.ok, JSON.stringify(r.erros));
      });
      var f = c.st.fichaQualidade(c.id);
      igual(f.eventos.length, 2);
      igual(f.eventos[0].hora, '08:00', 'ordenados por horário');
      igual(f.eventos[0].dados.medicamento, 'Metaraminol');
      igual(f.eventos[0].origem, 'Anestesista');
      verdadeiro(f.eventos[0].registradoEm.length >= 10, 'carimbo de quando foi registrado');
    });

    it('a relação com a anestesia é campo separado e nunca é presumida', function () {
      var c = comFicha();
      c.st.alterarEventoQualidade(c.id, { acao: 'adicionar', evento: {
        tipo: 'pcrSala', data: '2026-10-15', hora: '08:00', descricao: 'PCR em ritmo de AESP'
      } });
      igual(c.st.fichaQualidade(c.id).eventos[0].relacao, '', 'sem relação atribuída');
      igual(c.st.fichaQualidade(c.id).eventos[0].investigacao, '');
    });

    it('editar um evento que mudou no meio do caminho é recusado', function () {
      var c = comFicha();
      c.st.alterarEventoQualidade(c.id, { acao: 'adicionar', evento: {
        tipo: 'lesaoCornea', data: '2026-10-15', descricao: 'olho direito' } });
      var visto = c.st.fichaQualidade(c.id).eventos[0];
      c.st.alterarEventoQualidade(c.id, { acao: 'alterar', indice: 0, conferir: visto,
        evento: Object.assign({}, visto, { descricao: 'olho esquerdo' }) });
      var r = c.st.alterarEventoQualidade(c.id, { acao: 'alterar', indice: 0, conferir: visto,
        evento: Object.assign({}, visto, { descricao: 'outra coisa' }) });
      falso(r.ok, 'a conferência tem de barrar');
    });

    it('o histórico guarda autor, data e horário de cada mudança', function () {
      var c = comFicha();
      c.st.salvarFichaQualidade(c.id, { atendimento: { asa: 'II' } });
      c.st.salvarFichaQualidade(c.id, { atendimento: { asa: 'III' } });
      var h = c.st.fichaQualidade(c.id).historico;
      verdadeiro(h.length >= 2, 'duas mudanças, dois registros');
      var ultima = h[h.length - 1];
      igual(ultima.campo, 'asa');
      igual(ultima.de, 'II');
      igual(ultima.para, 'III');
      igual(ultima.quem, 'qa');
      verdadeiro(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(ultima.quando), ultima.quando);
    });

    it('concluída não se edita, mas o acompanhamento e a revisão continuam abertos', function () {
      var c = comFicha();
      preencher(c.st, c.id);
      verdadeiro(c.st.concluirFichaQualidade(c.id).ok);

      var r = c.st.salvarFichaQualidade(c.id, { atendimento: { asa: 'IV' } });
      falso(r.ok, 'campo do centro cirúrgico trava');

      var r2 = c.st.registrarSeguimentoQualidade(c.id, 'h24', { situacao: 'Realizado', data: '2026-10-16' });
      verdadeiro(r2.ok, 'acompanhamento segue aberto: ' + JSON.stringify(r2.erros));

      var r3 = c.st.revisarFichaQualidade(c.id, { revisadoPor: 'Dra. Revisora', parecer: 'Sem achados.' });
      verdadeiro(r3.ok, JSON.stringify(r3.erros));
      igual(c.st.fichaQualidade(c.id).revisao.revisadoPor, 'Dra. Revisora');
    });

    it('reabrir exige motivo de 10 letras e sobe a versão', function () {
      var c = comFicha();
      preencher(c.st, c.id);
      c.st.concluirFichaQualidade(c.id);
      falso(c.st.reabrirFichaQualidade(c.id, 'erro').ok);
      var r = c.st.reabrirFichaQualidade(c.id, 'Faltou registrar a temperatura da SRPA.');
      verdadeiro(r.ok, JSON.stringify(r.erros));
      var f = c.st.fichaQualidade(c.id);
      igual(f.status, core.FICHA_RASCUNHO);
      igual(f.versao, 2);
      verdadeiro(c.st.estado.log.some(function (l) { return /REABERTA/.test(l.campo); }), 'vai para o LOG');
    });

    it('a revisão clínica confirma sem apagar o que o anestesista registrou', function () {
      var c = comFicha();
      c.st.alterarEventoQualidade(c.id, { acao: 'adicionar', evento: {
        tipo: 'broncoaspiracao', data: '2026-10-15', hora: '08:00', descricao: 'Suspeita clínica' } });
      var r = c.st.revisarFichaQualidade(c.id, {
        revisadoPor: 'Dra. Revisora', parecer: 'Confirmado por imagem.',
        eventos: [{ indice: 0, confirmado: 'Confirmado', relacao: 'Provável', investigacao: 'Concluída' }]
      });
      verdadeiro(r.ok, JSON.stringify(r.erros));
      var ev = c.st.fichaQualidade(c.id).eventos[0];
      igual(ev.origem, 'Anestesista', 'quem registrou continua registrado');
      igual(ev.descricao, 'Suspeita clínica', 'o texto original fica');
      igual(ev.confirmado, 'Confirmado');
      igual(ev.confirmadoPor, 'Dra. Revisora');
      igual(ev.relacao, 'Provável');
    });

    it('ficha concluída ou revisada não é descartável', function () {
      var c = comFicha();
      verdadeiro(c.st.descartarFichaQualidade(c.id).ok, 'rascunho intocado pode');
      var c2 = comFicha();
      c2.st.revisarFichaQualidade(c2.id, { revisadoPor: 'Dra. Revisora' });
      falso(c2.st.descartarFichaQualidade(c2.id).ok);
    });

    it('todas as operações novas entram nas listas de mutação', function () {
      ['criarFichaQualidade', 'salvarFichaQualidade', 'alterarEventoQualidade', 'registrarSeguimentoQualidade',
        'revisarFichaQualidade', 'concluirFichaQualidade', 'reabrirFichaQualidade', 'descartarFichaQualidade',
        'salvarRegistroEstrutura', 'removerRegistroEstrutura', 'salvarConfigQualidade'].forEach(function (nome) {
        verdadeiro(core.MUTACOES_STORE.indexOf(nome) >= 0, nome + ' fora de MUTACOES_STORE');
      });
      ['salvarRegistroEstrutura', 'removerRegistroEstrutura', 'salvarConfigQualidade'].forEach(function (nome) {
        verdadeiro(core.MUTACOES_SO_ADMIN.indexOf(nome) >= 0, nome + ' devia ser só do administrador');
      });
      verdadeiro(core.MUTACOES_SEGURAS_EM_CONCORRENCIA.indexOf('salvarFichaQualidade') >= 0);
      falso(core.MUTACOES_SEGURAS_EM_CONCORRENCIA.indexOf('alterarEventoQualidade') >= 0,
        'apontar por índice não pode ser seguro em concorrência');
    });

    it('IDs de ficha não renascem', function () {
      var c = comFicha();
      igual(c.id, 'FQA0001');
      c.st.descartarFichaQualidade(c.id);
      c.st.adicionarCirurgia(cirurgia({ paciente: 'Outro' }));
      var outra = c.st.criarFichaQualidade(c.st.estado.cirurgias[1].id);
      igual(outra.ficha.id, 'FQA0002');
    });
  });

  /* ========================================================= indicadores */

  describe('Qualidade — cálculo dos indicadores', function () {

    function painelDe(st, filtros) {
      return st.painelQualidade(filtros || {}, { hoje: HOJE });
    }

    function ind(painel, chave) {
      return painel.indicadores.filter(function (i) { return i.chave === chave; })[0];
    }

    it('dado ausente nunca é contado como "não"', function () {
      var c = comFicha();
      var i = ind(painelDe(c.st), 'pcrSala');
      igual(i.elegiveis, 1);
      igual(i.respondidos, 0, 'sem resposta, fora do denominador');
      igual(i.eventos, 0);
      igual(i.semInformacao, 1);
      igual(i.taxa, null, 'sem denominador não há taxa');
    });

    it('"não avaliado/sem informação" também fica fora do denominador', function () {
      var c = comFicha();
      c.st.salvarFichaQualidade(c.id, { respostas: { pcrSala: 'Não avaliado/sem informação' } });
      var i = ind(painelDe(c.st), 'pcrSala');
      igual(i.respondidos, 0);
      igual(i.semInformacao, 1);
    });

    it('"não se aplica" sai da população elegível', function () {
      var c = comFicha();
      c.st.salvarFichaQualidade(c.id, { respostas: { lesaoCornea: 'Não se aplica' } });
      var i = ind(painelDe(c.st), 'lesaoCornea');
      igual(i.elegiveis, 0);
      igual(i.semInformacao, 0);
    });

    it('taxa, numerador e denominador com duas fichas', function () {
      var c = comFicha();
      c.st.salvarFichaQualidade(c.id, { respostas: { broncoaspiracao: 'Sim' } });
      c.st.adicionarCirurgia(cirurgia({ paciente: 'Segundo' }));
      var r2 = c.st.criarFichaQualidade(c.st.estado.cirurgias[1].id);
      c.st.salvarFichaQualidade(r2.ficha.id, { respostas: { broncoaspiracao: 'Não' } });
      var i = ind(painelDe(c.st), 'broncoaspiracao');
      igual(i.elegiveis, 2);
      igual(i.respondidos, 2);
      igual(i.eventos, 1);
      igual(i.taxa, 50);
      igual(i.cobertura, 100);
    });

    it('elegibilidade: despertar só conta em anestesia geral', function () {
      var c = comFicha();
      c.st.salvarFichaQualidade(c.id, { atendimento: { tecnicas: ['Raquianestesia'] },
        respostas: { despertar: 'Não' } });
      igual(ind(painelDe(c.st), 'despertar').elegiveis, 0);
      c.st.salvarFichaQualidade(c.id, { atendimento: { tecnicas: ['Geral balanceada'] } });
      igual(ind(painelDe(c.st), 'despertar').elegiveis, 1);
    });

    it('elegibilidade: capnografia só entra quando foi indicada', function () {
      var c = comFicha();
      c.st.salvarFichaQualidade(c.id, { processo: { capnografiaIndicada: 'Não', capnografiaUsada: 'Não' } });
      igual(ind(painelDe(c.st), 'capnografia').elegiveis, 0);
      c.st.salvarFichaQualidade(c.id, { processo: { capnografiaIndicada: 'Sim' } });
      igual(ind(painelDe(c.st), 'capnografia').elegiveis, 1);
      igual(ind(painelDe(c.st), 'capnografia').eventos, 0, 'indicada e não usada: sem adesão');
    });

    it('hipoxemia e hipotensão saem dos números medidos, com o limiar configurado', function () {
      var c = comFicha();
      preencher(c.st, c.id, { intra: { intubacao: 'Sim', spo2Minima: '88', pamMinima: '60', pasMaxima: '150' } });
      var p = painelDe(c.st);
      igual(ind(p, 'hipoxemia').eventos, 1, 'SpO2 88 < 90');
      igual(ind(p, 'hipotensao').eventos, 1, 'PAM 60 < 65');

      c.st.salvarConfigQualidade({ limiares: { spo2: 85, pam: 55 } });
      var p2 = painelDe(c.st);
      igual(ind(p2, 'hipoxemia').eventos, 0, 'com o limiar em 85, 88 não é hipoxemia');
      igual(ind(p2, 'hipotensao').eventos, 0);
    });

    it('tempo acumulado abaixo do limiar caracteriza o evento mesmo com o mínimo normal', function () {
      var c = comFicha();
      preencher(c.st, c.id, { intra: { intubacao: 'Sim', spo2Minima: '95', minutosSpo2Abaixo: '4' } });
      igual(ind(painelDe(c.st), 'hipoxemia').eventos, 1);
    });

    it('antibiótico no tempo usa a janela configurada', function () {
      var c = comFicha();
      preencher(c.st, c.id);
      igual(ind(painelDe(c.st), 'antibioticoNoTempo').eventos, 1, '50 min antes da incisão');
      c.st.salvarConfigQualidade({ limiares: { antibioticoJanela: 30 } });
      igual(ind(painelDe(c.st), 'antibioticoNoTempo').eventos, 0, 'com janela de 30 min, 50 min fica fora');
    });

    it('jejum adequado compara com o mínimo do tipo informado', function () {
      var c = comFicha();
      preencher(c.st, c.id);
      igual(ind(painelDe(c.st), 'jejumAdequado').eventos, 1, '9,2 h de sólidos');
      c.st.salvarFichaQualidade(c.id, { pre: { jejumHora: '05:00', jejumData: '2026-10-15' } });
      igual(ind(painelDe(c.st), 'jejumAdequado').eventos, 0, '2,2 h de sólidos não atende');
      c.st.salvarFichaQualidade(c.id, { pre: { jejumTipo: 'Líquidos sem resíduo' } });
      igual(ind(painelDe(c.st), 'jejumAdequado').eventos, 1, '2,2 h de líquidos atende');
    });

    it('acompanhamento em aberto é contado à parte de "sem informação"', function () {
      var c = comFicha();
      var i = ind(painelDe(c.st), 'obito24h');
      igual(i.semInformacao, 1);
      igual(i.semAcompanhamento, 1, 'a janela de 24 h já venceu em 30/11');
      c.st.registrarSeguimentoQualidade(c.id, 'h24', { situacao: 'Realizado', data: '2026-10-16' });
      igual(ind(painelDe(c.st), 'obito24h').semAcompanhamento, 0);
    });

    it('cada indicador traz definição, fórmula e população elegível', function () {
      var c = comFicha();
      painelDe(c.st).indicadores.forEach(function (i) {
        verdadeiro(i.definicao && i.definicao.length > 20, i.chave + ' sem definição');
        verdadeiro(/÷/.test(i.formula), i.chave + ' sem fórmula: ' + i.formula);
        verdadeiro(!!i.elegibilidade, i.chave + ' sem população elegível');
      });
    });

    it('nenhum indicador nasce atribuído a entidade nenhuma', function () {
      var c = comFicha();
      painelDe(c.st).indicadores.forEach(function (i) {
        igual(i.referencia, null, i.chave + ' não pode nascer com fonte');
      });
      var texto = JSON.stringify(core.INDICADORES_QUALIDADE);
      falso(/SBA|ANVISA|Patient Safety/i.test(texto), 'o catálogo não pode citar entidade por conta própria');
    });

    it('a evolução mês a mês acompanha a data da cirurgia', function () {
      var c = comFicha();
      c.st.salvarFichaQualidade(c.id, { respostas: { broncoaspiracao: 'Sim' } });
      c.st.adicionarCirurgia(cirurgia({ paciente: 'Novembro', data: '2026-11-10' }));
      var r2 = c.st.criarFichaQualidade(c.st.estado.cirurgias[1].id);
      c.st.salvarFichaQualidade(r2.ficha.id, { respostas: { broncoaspiracao: 'Não' } });
      var serie = ind(painelDe(c.st), 'broncoaspiracao').serie;
      igual(serie.length, 2);
      igual(serie[0].mes, '2026-10');
      igual(serie[0].taxa, 100);
      igual(serie[1].mes, '2026-11');
      igual(serie[1].taxa, 0);
    });

    it('filtros recortam por período, profissional e ASA', function () {
      var c = comFicha();
      preencher(c.st, c.id);
      c.st.adicionarCirurgia(cirurgia({ paciente: 'Outro', data: '2026-11-10', anestesista: 'Roberta Almeida' }));
      var r2 = c.st.criarFichaQualidade(c.st.estado.cirurgias[1].id);
      c.st.salvarFichaQualidade(r2.ficha.id, { atendimento: { asa: 'IV' } });

      igual(painelDe(c.st, { de: '2026-11-01' }).completude.atendimentos, 1);
      igual(painelDe(c.st, { asa: 'IV' }).completude.atendimentos, 1);
      igual(painelDe(c.st, { anestesista: 'Roberta Almeida' }).completude.atendimentos, 1);
      igual(painelDe(c.st, {}).completude.atendimentos, 2);
    });

    it('a comparação por profissional vem com o perfil dos pacientes', function () {
      var c = comFicha();
      c.st.salvarFichaQualidade(c.id, { atendimento: { asa: 'IV', carater: 'Urgência' },
        respostas: { broncoaspiracao: 'Sim' } });
      var linhas = core.comparativoQualidade(c.st.atendimentosQualidade({}), 'broncoaspiracao', { hoje: HOJE });
      igual(linhas.length, 1);
      igual(linhas[0].taxa, 100);
      igual(linhas[0].pctAsa3mais, 100, 'ASA IV entra no perfil');
      igual(linhas[0].pctNaoEletivo, 100, 'urgência entra no perfil');
    });

    it('a completude do conjunto conta fichas incompletas e acompanhamentos', function () {
      var c = comFicha();
      var comp = painelDe(c.st).completude;
      igual(comp.atendimentos, 1);
      igual(comp.incompletas, 1);
      verdadeiro(comp.itensPendentes > 5);
      igual(comp.semAcompanhamento, 1);
      igual(comp.concluidas, 0);
    });
  });

  /* ===================================== pertinência e comparação por risco */

  describe('Qualidade — pertinência à técnica e comparação estratificada', function () {

    function nomesPendentes(st, id, cirurgia) {
      var f = st.fichaQualidade(id);
      return core.pendenciasFicha(f, HOJE, cirurgia).reduce(function (l, g) { return l.concat(g.itens); }, []);
    }

    it('sedação não cobra bloqueador neuromuscular, via aérea difícil nem intubação esofágica', function () {
      var c = comFicha();
      var cir = c.st.estado.cirurgias[0];
      var geral = nomesPendentes(c.st, c.id, cir);
      verdadeiro(geral.indexOf('Uso de bloqueador neuromuscular') >= 0, 'sem técnica escolhida, tudo é pertinente');
      c.st.salvarFichaQualidade(c.id, { atendimento: { tecnicas: ['Geral balanceada'] } });
      verdadeiro(nomesPendentes(c.st, c.id, cir).indexOf('Uso de bloqueador neuromuscular') >= 0);
      c.st.salvarFichaQualidade(c.id, { atendimento: { tecnicas: ['Sedação'] } });
      var sedacao = nomesPendentes(c.st, c.id, cir);
      igual(sedacao.indexOf('Uso de bloqueador neuromuscular'), -1);
      igual(sedacao.indexOf('Intubação ou ventilação difícil'), -1);
      igual(sedacao.indexOf('Intubação esofágica'), -1);
      verdadeiro(sedacao.indexOf('Parada cardiorrespiratória na sala cirúrgica') >= 0, 'o que vale para toda técnica continua');
    });

    it('as perguntas de anestesia geral estão marcadas no catálogo', function () {
      ['viaAereaDificil', 'intubacaoEsofagica', 'reintubacao24h', 'despertar', 'bnmResidual'].forEach(function (k) {
        igual(core.eventoQualidade(k).aplicaA, 'geral', k);
      });
      igual(core.eventoQualidade('pcrSala').aplicaA, undefined, 'PCR vale em qualquer técnica');
    });

    it('a comparação separa a taxa por risco do paciente (ASA I–II x III+)', function () {
      var st = novoStore();
      function caso(paciente, asa, sim) {
        st.adicionarCirurgia(cirurgia({ paciente: paciente }));
        var cid = st.estado.cirurgias[st.estado.cirurgias.length - 1].id;
        var f = st.criarFichaQualidade(cid).ficha;
        st.salvarFichaQualidade(f.id, { atendimento: { asa: asa }, respostas: { broncoaspiracao: sim ? 'Sim' : 'Não' } });
      }
      caso('A', 'I', false); caso('B', 'II', false); caso('C', 'II', false);
      caso('D', 'III', true); caso('E', 'IV', false);
      var linha = core.comparativoQualidade(st.atendimentosQualidade({}), 'broncoaspiracao', { hoje: HOJE })[0];
      igual(linha.taxa, 20, 'geral: 1 em 5');
      igual(linha.estratoBaixo.respondidos, 3);
      igual(linha.estratoBaixo.eventos, 0);
      igual(linha.estratoBaixo.taxa, 0, 'ASA I–II: 0 em 3');
      igual(linha.estratoAlto.respondidos, 2);
      igual(linha.estratoAlto.eventos, 1);
      igual(linha.estratoAlto.taxa, 50, 'ASA III+: 1 em 2');
      igual(linha.estratoBaixo.atendimentos + linha.estratoAlto.atendimentos + linha.semAsa, linha.atendimentos,
        'todo atendimento cai em algum estrato (ou sem ASA)');
    });

    it('atendimento sem ASA não entra em nenhum estrato, mas é contado', function () {
      var c = comFicha();
      c.st.salvarFichaQualidade(c.id, { respostas: { broncoaspiracao: 'Não' } });
      var l = core.comparativoQualidade(c.st.atendimentosQualidade({}), 'broncoaspiracao', { hoje: HOJE })[0];
      igual(l.estratoBaixo.atendimentos, 0);
      igual(l.estratoAlto.atendimentos, 0);
      igual(l.semAsa, 1);
      igual(l.estratoBaixo.taxa, null, 'sem elegível no estrato não há taxa');
    });
  });

  /* =========================================================== estrutura */

  describe('Qualidade — indicadores de estrutura', function () {

    function registro(extra) {
      return Object.assign({
        data: '2026-10-15', turno: 'Manhã', unidade: 'Centro cirúrgico', sala: 'Sala 1',
        equipamentos: { capnografo: 'Disponível e funcionando', monitor: 'Disponível e funcionando' },
        carroParada: { disponivel: 'Sim', checado: 'Sim', dataChecagem: '2026-10-15' },
        anestesiologistas: '3', salasFuncionando: '2',
        sangue: { disponivel: 'Sim' }
      }, extra || {});
    }

    it('cria, atualiza e recusa duplicidade de data, turno, unidade e sala', function () {
      var st = novoStore();
      var r = st.salvarRegistroEstrutura(registro());
      verdadeiro(r.ok, JSON.stringify(r.erros));
      igual(r.registro.id, 'EST0001');

      var dup = st.salvarRegistroEstrutura(registro());
      falso(dup.ok, 'dois registros iguais deixariam o vínculo ambíguo');

      var up = st.salvarRegistroEstrutura({ id: 'EST0001', anestesiologistas: '4' });
      verdadeiro(up.ok, JSON.stringify(up.erros));
      igual(st.registroEstrutura('EST0001').anestesiologistas, 4);
      igual(st.registroEstrutura('EST0001').unidade, 'Centro cirúrgico', 'o que não veio no pedido fica');
    });

    it('unidade e turno são obrigatórios; checagem do carro pede a data', function () {
      var st = novoStore();
      falso(st.salvarRegistroEstrutura({ data: '2026-10-15' }).ok);
      falso(st.salvarRegistroEstrutura(registro({ carroParada: { checado: 'Sim', dataChecagem: '' } })).ok);
    });

    it('o atendimento acha o registro do turno certo, do mais específico ao mais geral', function () {
      var st = novoStore();
      st.salvarRegistroEstrutura(registro({ sala: '', turno: 'Dia inteiro' }));
      st.salvarRegistroEstrutura(registro({ sala: 'Sala 1', turno: 'Manhã' }));
      st.adicionarCirurgia(cirurgia());
      var cid = st.estado.cirurgias[0].id;
      var f = st.criarFichaQualidade(cid).ficha;
      st.salvarFichaQualidade(f.id, { atendimento: { unidade: 'Centro cirúrgico', sala: 'Sala 1',
        inicioAnestesia: '07:10' } });
      var achado = st.estruturaDoAtendimento(st.fichaQualidade(f.id), st.estado.cirurgias[0]);
      verdadeiro(achado, 'devia achar');
      igual(achado.sala, 'Sala 1', 'sala específica vence a unidade inteira');

      st.salvarFichaQualidade(f.id, { atendimento: { sala: 'Sala 9' } });
      var geral = st.estruturaDoAtendimento(st.fichaQualidade(f.id), st.estado.cirurgias[0]);
      igual(geral.sala, '', 'sem registro da sala, vale o da unidade');
    });

    it('item não verificado não conta como disponível nem como falta', function () {
      var st = novoStore();
      st.salvarRegistroEstrutura(registro());
      var resumo = core.resumoEstrutura(st.estrutura());
      var capno = resumo.itens.filter(function (i) { return i.chave === 'capnografo'; })[0];
      igual(capno.verificados, 1);
      igual(capno.disponiveis, 1);
      igual(capno.taxa, 100);
      var desfib = resumo.itens.filter(function (i) { return i.chave === 'desfibrilador'; })[0];
      igual(desfib.verificados, 0);
      igual(desfib.naoVerificados, 1);
      igual(desfib.taxa, null, 'sem verificação não há taxa');
    });

    it('treinamentos e simulações entram no resumo do período', function () {
      var st = novoStore();
      st.salvarRegistroEstrutura(registro({ treinamentos: [
        { data: '2026-10-10', tema: 'Parada cardiorrespiratória', tipo: 'Simulação de emergência',
          participantes: 'Equipe do CC', numParticipantes: '12', horas: '2' }
      ] }));
      var resumo = core.resumoEstrutura(st.estrutura());
      igual(resumo.treinamentos.length, 1);
      igual(resumo.treinamentos[0].numParticipantes, 12);
      igual(resumo.equipe.anestesiologistasPorSala, 1.5);
    });

    it('remover o registro tira do estado e vai para o LOG', function () {
      var st = novoStore();
      st.salvarRegistroEstrutura(registro());
      verdadeiro(st.removerRegistroEstrutura('EST0001').ok);
      igual(st.estrutura().length, 0);
      verdadeiro(st.estado.log.some(function (l) { return l.campo === 'ESTRUTURA REMOVIDA'; }));
    });
  });

  /* ================================================ configuração clínica */

  describe('Qualidade — configuração clínica e proteção dos dados', function () {

    it('nasce sem aprovação e o painel avisa', function () {
      var c = comFicha();
      var p = c.st.painelQualidade({}, { hoje: HOJE });
      falso(p.aprovada);
      verdadeiro(c.st.verificarIntegridade().avisos.some(function (a) {
        return a.area === 'QUALIDADE' && /não foram aprovadas/.test(a.msg);
      }), 'a integridade tem de apontar');
    });

    it('aprovação registrada muda a situação do painel', function () {
      var c = comFicha();
      var r = c.st.salvarConfigQualidade({
        aprovacao: { responsavel: 'Dr. Responsável Técnico', crm: '12345', em: '2026-09-01', versao: 'v1.0' }
      });
      verdadeiro(r.ok, JSON.stringify(r.erros));
      verdadeiro(c.st.painelQualidade({}, { hoje: HOJE }).aprovada);
      verdadeiro(c.st.estado.log.some(function (l) { return l.campo === 'CONFIGURAÇÃO CLÍNICA'; }));
    });

    it('limiar fora de faixa e meta estranha não entram', function () {
      var cfg = core.lerConfigQualidade({
        limiares: { spo2: 'oitenta', pam: -5, temperatura: 35.5 },
        metas: { obito24h: 500, pcrSala: '0,5' },
        referencias: { obito24h: { fonte: '', versao: 'x' }, pcrSala: { fonte: 'Protocolo interno', versao: '2', revisadaEm: '2026-01-10' } }
      });
      igual(cfg.limiares.spo2, core.LIMIARES_QUALIDADE_PADRAO.spo2, 'texto não vira limiar');
      igual(cfg.limiares.pam, core.LIMIARES_QUALIDADE_PADRAO.pam, 'negativo não passa');
      igual(cfg.limiares.temperatura, 35.5);
      igual(cfg.metas.obito24h, undefined, 'meta de 500% não existe');
      igual(cfg.metas.pcrSala, 0.5);
      igual(cfg.referencias.obito24h, undefined, 'referência sem fonte não entra');
      igual(cfg.referencias.pcrSala.fonte, 'Protocolo interno');
    });

    it('indicador desativado sai do painel', function () {
      var c = comFicha();
      var antes = c.st.painelQualidade({}, { hoje: HOJE }).indicadores.length;
      c.st.salvarConfigQualidade({ desativados: { lesaoCornea: true } });
      igual(c.st.painelQualidade({}, { hoje: HOJE }).indicadores.length, antes - 1);
    });

    it('a referência configurada aparece no indicador', function () {
      var c = comFicha();
      c.st.salvarConfigQualidade({ referencias: {
        pcrSala: { fonte: 'Protocolo institucional de PCR', versao: '3', revisadaEm: '2026-05-20' } } });
      var i = c.st.painelQualidade({}, { hoje: HOJE }).indicadores
        .filter(function (x) { return x.chave === 'pcrSala'; })[0];
      igual(i.referencia.fonte, 'Protocolo institucional de PCR');
      igual(i.referencia.revisadaEm, '2026-05-20');
    });
  });

  /* ==================================================== integridade/backup */

  describe('Qualidade — integridade e backup', function () {

    it('ficha órfã e ficha duplicada são erro', function () {
      var c = comFicha();
      preencher(c.st, c.id);
      verdadeiro(c.st.verificarIntegridade().ok, JSON.stringify(c.st.verificarIntegridade().erros));

      var estado = JSON.parse(JSON.stringify(DADOS.enxugar(c.st.estado)));
      estado.fichasQualidade[0].idCirurgia = 'CIR9999';
      var st2 = core.criarStore(DADOS.sanearEstado(estado), { usuario: 'qa', hoje: HOJE });
      st2.recalcular();
      verdadeiro(st2.verificarIntegridade().erros.some(function (e) { return e.area === 'QUALIDADE'; }));
    });

    it('registros de estrutura ambíguos são erro', function () {
      var st = novoStore();
      st.salvarRegistroEstrutura({ data: '2026-10-15', turno: 'Manhã', unidade: 'CC' });
      var estado = DADOS.enxugar(st.estado);
      estado.estrutura.push(JSON.parse(JSON.stringify(estado.estrutura[0])));
      estado.estrutura[1].id = 'EST0002';
      var st2 = core.criarStore(DADOS.sanearEstado(estado), { usuario: 'qa', hoje: HOJE });
      verdadeiro(st2.verificarIntegridade().erros.some(function (e) { return e.area === 'ESTRUTURA'; }));
    });

    it('o backup leva e traz fichas, estrutura e configuração', function () {
      var c = comFicha();
      preencher(c.st, c.id);
      c.st.alterarEventoQualidade(c.id, { acao: 'adicionar', evento: {
        tipo: 'lesaoCornea', data: '2026-10-15', descricao: 'olho direito', dados: { lado: 'Direito' } } });
      c.st.salvarRegistroEstrutura({ data: '2026-10-15', turno: 'Manhã', unidade: 'CC' });
      c.st.salvarConfigQualidade({ limiares: { dor: 6 },
        aprovacao: { responsavel: 'Dr. RT', em: '2026-09-01' } });

      var json = DADOS.exportarJSON(c.st.estado);
      var lido = DADOS.sanearEstado(JSON.parse(json).dados);
      igual(lido.fichasQualidade.length, 1);
      igual(lido.fichasQualidade[0].eventos.length, 1);
      igual(lido.fichasQualidade[0].eventos[0].dados.lado, 'Direito');
      igual(lido.estrutura.length, 1);
      igual(lido.config.qualidade.limiares.dor, 6);
      igual(lido.config.qualidade.aprovacao.responsavel, 'Dr. RT');
      igual(lido.config.sequencias.qualidade, 1);
    });

    it('backup adulterado não injeta campo estranho na ficha', function () {
      var lido = DADOS.sanearEstado({
        anestesistas: [], escalaBase: [], cirurgias: [], avaliacoes: [],
        fichasQualidade: [{ idCirurgia: 'CIR0001', __proto__: { mau: 1 }, inventado: 'x',
          atendimento: { asa: 'II', inventado: 'y' } }]
      });
      igual(lido.fichasQualidade.length, 1);
      igual(lido.fichasQualidade[0].inventado, undefined);
      igual(lido.fichasQualidade[0].atendimento.inventado, undefined);
      igual(lido.fichasQualidade[0].atendimento.asa, 'II');
    });
  });

  /* ============================================================ relatórios */

  describe('Qualidade — PDF, planilha e apresentação', function () {

    it('o PDF da ficha traz identificação, etapas e o que ficou sem informação', function () {
      var c = comFicha();
      preencher(c.st, c.id);
      c.st.alterarEventoQualidade(c.id, { acao: 'adicionar', evento: {
        tipo: 'vasopressorNaoPlanejado', data: '2026-10-15', hora: '08:00',
        descricao: 'Hipotensao sustentada', gravidade: 'Moderada', conduta: 'Metaraminol',
        evolucao: 'Estavel', relacao: 'Possivel',
        dados: { medicamento: 'Metaraminol', motivo: 'Hipotensao', intervencao: 'Bolus' } } });
      var f = c.st.fichaQualidade(c.id);
      var texto = QUALIDADE_PDF.fonteFicha(f, c.st.estado.cirurgias[0], { hoje: HOJE });

      verdadeiro(texto.indexOf('%PDF-1.4') === 0, 'cabeçalho do PDF');
      ['IDENTIFICA', 'ACOMPANHAMENTO POSTERIOR', 'TRANSI', 'SATISFA', 'EVENTOS CL']
        .forEach(function (p) { verdadeiro(texto.indexOf(p) > 0, 'faltou "' + p + '" no PDF'); });
      verdadeiro(texto.indexOf('Metaraminol') > 0, 'o evento tem de sair no PDF');
    });

    it('o relatório do painel traz definição, fórmula e a ressalva do dado ausente', function () {
      var c = comFicha();
      preencher(c.st, c.id);
      var painel = c.st.painelQualidade({}, { hoje: HOJE });
      var texto = QUALIDADE_PDF.fonteRelatorio(painel, {});
      verdadeiro(texto.indexOf('%PDF-1.4') === 0);
      verdadeiro(texto.indexOf('rmula') > 0, 'fórmula');
      verdadeiro(texto.indexOf('nenhuma fonte normativa') > 0, 'indicador sem fonte tem de dizer isso');
      verdadeiro(texto.indexOf('n\\343o \\351 resultado negativo') > 0 || texto.indexOf('resultado negativo') > 0,
        'a ressalva do dado ausente');
    });

    it('a apresentação sai com as partes obrigatórias de um .pptx', function () {
      var c = comFicha();
      preencher(c.st, c.id);
      var painel = c.st.painelQualidade({}, { hoje: HOJE });
      var slides = [
        { titulo: 'Indicadores', subtitulo: 'Período', linhas: painel.indicadores.slice(0, 6).map(function (i) {
          return { rotulo: i.nome, valor: i.taxa === null ? 'sem informação' : i.taxa + '%' };
        }), rodape: 'QA' }
      ];
      var partes = PPTX.partes(slides, 'Indicadores de qualidade');
      var nomes = partes.map(function (p) { return p.nome; });
      ['[Content_Types].xml', '_rels/.rels', 'ppt/presentation.xml', 'ppt/_rels/presentation.xml.rels',
        'ppt/slideMasters/slideMaster1.xml', 'ppt/slideLayouts/slideLayout1.xml', 'ppt/theme/theme1.xml',
        'ppt/slides/slide1.xml', 'ppt/slides/_rels/slide1.xml.rels'].forEach(function (n) {
        verdadeiro(nomes.indexOf(n) >= 0, 'faltou a parte ' + n);
      });
      var slide1 = partes.filter(function (p) { return p.nome === 'ppt/slides/slide1.xml'; })[0].dados;
      verdadeiro(slide1.indexOf('<?xml version="1.0"') === 0);
      verdadeiro(slide1.indexOf('Indicadores') > 0);
      // Tags abertas e fechadas em igual número (o suficiente para pegar XML quebrado).
      igual((slide1.match(/<a:p>/g) || []).length, (slide1.match(/<\/a:p>/g) || []).length, 'parágrafos');
      igual((slide1.match(/<p:sp>/g) || []).length, (slide1.match(/<\/p:sp>/g) || []).length, 'formas');
    });

    it('o XML escapa o que vem do texto digitado', function () {
      igual(PPTX.esc('Dor <7> & "forte"'), 'Dor &lt;7&gt; &amp; &quot;forte&quot;');
    });

    it('a planilha do painel traz numerador, denominador e definição', function () {
      var c = comFicha();
      preencher(c.st, c.id);
      var painel = c.st.painelQualidade({}, { hoje: HOJE });
      var linhas = [['INDICADOR', 'EVENTOS', 'COM INFORMAÇÃO', 'ELEGÍVEIS', 'SEM INFORMAÇÃO', 'TAXA', 'DEFINIÇÃO']];
      painel.indicadores.forEach(function (i) {
        linhas.push([i.nome, i.eventos, i.respondidos, i.elegiveis, i.semInformacao,
          i.taxa === null ? '' : i.taxa, i.definicao].map(function (v) {
          return DADOS.paraCelula(v, typeof v === 'number' ? 'numero' : 'texto');
        }));
      });
      var csv = DADOS.paraCSV(linhas);
      verdadeiro(csv.indexOf('SEM INFORMAÇÃO') > 0);
      verdadeiro(csv.split('\n').length > painel.indicadores.length, 'uma linha por indicador');
    });
  });
};
