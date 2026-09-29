/**
 * QA 17 — Boletim anestésico
 *   - SHA-256 e JSON canônico (base do código de conferência)
 *   - leitura estrita x tolerante, validação, horários que passam da meia-noite
 *   - ciclo de vida no store: criar, preencher, finalizar, reabrir, descartar
 *   - integridade: conteúdo adulterado, órfão, duplicado, identificação mudada
 *   - backup (saneamento), CSV e PDF
 */
'use strict';

var fs = require('fs');
var path = require('path');
var vm = require('vm');
var crypto = require('crypto');

module.exports = function (t, core, dados) {
  var describe = t.describe, it = t.it, igual = t.igual, verdadeiro = t.verdadeiro, falso = t.falso,
      igualProfundo = t.igualProfundo;

  var RAIZ = path.join(__dirname, '..');
  var ctx = vm.createContext(Object.assign({}, core, {
    UI: { baixarTexto: function () {}, downloadBloqueado: function () { return false; } },
    SEED_INICIAL: dados.seed, Blob: Blob, console: console
  }));
  ['03_dados.js', '03b_pdf.js', '03e_boletim_pdf.js'].forEach(function (f) {
    vm.runInContext(fs.readFileSync(path.join(RAIZ, 'webapp', 'js', f), 'utf8'), ctx);
  });
  var DADOS = vm.runInContext('DADOS', ctx);
  var BOLETIM_PDF = vm.runInContext('BOLETIM_PDF', ctx);

  var TRACOS = [[[0.1, 0.5], [0.3, 0.3], [0.5, 0.6], [0.8, 0.4]]];

  function novoStore() { return core.criarStoreComSeed(dados.seed, { usuario: 'qa' }); }

  function cirurgia(extra) {
    return Object.assign({
      status: 'Realizada', data: '2026-10-15', inicioPrev: '07:00', fimPrev: '09:00',
      paciente: 'Maria Teste', procedimento: 'Rinoplastia', cirurgiao: 'Dr. X', anestesista: 'Fabrício Tavares',
      avaliacaoNec: 'Não', sala: 'Sala 1'
    }, extra || {});
  }

  /** Store com uma cirurgia e o boletim dela criado. */
  function comBoletim(extraCir) {
    var st = novoStore();
    st.adicionarCirurgia(cirurgia(extraCir));
    var cid = st.estado.cirurgias[0].id;
    var r = st.criarBoletim(cid);
    return { st: st, cid: cid, id: r.boletim.id };
  }

  /** Preenche o mínimo para finalizar. */
  function preencher(st, id) {
    var r = st.salvarBoletim(id, {
      paciente: { peso: '70', idade: '40', sexo: 'M' }, pre: { asa: 'I' }, tecnicas: ['Sedação'],
      monitorizacao: core.MONITORIZACAO_BASICA, destino: 'SRPA', semIntercorrencias: true,
      tempos: { inicioAnestesia: '07:00', fimAnestesia: '08:30' }
    });
    verdadeiro(r.ok, JSON.stringify(r.erros));
    r = st.alterarLinhaBoletim(id, 'sinais', { acao: 'adicionar', linha: { hora: '07:05', pas: '120', pad: '80', fc: '70' } });
    verdadeiro(r.ok, JSON.stringify(r.erros));
  }

  function finalizar(st, id, extra) {
    return st.finalizarBoletim(id, Object.assign({ tracos: TRACOS, nome: 'Fabrício Tavares', crm: '12345-DF' }, extra || {}));
  }

  /* ================================================================== */

  describe('Código de conferência: SHA-256 e JSON canônico', function () {

    it('SHA-256 bate com os vetores oficiais e com o Node (UTF-8, acentos, emoji)', function () {
      igual(core.sha256Hex(''), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
      igual(core.sha256Hex('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
      ['abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq', 'Anestesia às 22h — SpO₂ 98% 😀',
        'x'.repeat(55), 'x'.repeat(56), 'x'.repeat(64), 'ç'.repeat(1000)].forEach(function (s) {
        igual(core.sha256Hex(s), crypto.createHash('sha256').update(s, 'utf8').digest('hex'), s.slice(0, 20));
      });
    });

    it('JSON canônico ordena as chaves em todos os níveis', function () {
      igual(core.jsonCanonico({ b: 1, a: [{ d: 2, c: null }], e: undefined }), '{"a":[{"c":null,"d":2}],"b":1}');
    });

    it('código legível em grupos de quatro', function () {
      igual(core.codigoLegivel('a1b2c3d4e5f60718'), 'A1B2-C3D4-E5F6-0718');
    });
  });

  describe('Leitura e validação', function () {

    it('estrito: número, faixa e horário inválidos viram erro com o nome do campo', function () {
      var r = core.lerBoletim({ paciente: { peso: 'abc', altura: '900' }, tempos: { inicioAnestesia: '25:10' } }, true);
      igual(r.erros.length, 3);
      verdadeiro(/Peso/.test(r.erros[0].msg) && /Altura/.test(r.erros[1].msg) && /Início da anestesia/.test(r.erros[2].msg));
    });

    it('tolerante (backup): o que não se entende fica de fora, sem erro, e chave estranha some', function () {
      var r = core.lerBoletim(JSON.parse('{"idCirurgia":"CIR0001","paciente":{"peso":"abc","__proto__":{"x":1}},"hack":1,' +
        '"sinais":[{"hora":"07:00","pas":"120","extra":"x"},"lixo"]}'), false);
      igual(r.erros.length, 0);
      igual(r.boletim.paciente.peso, null);
      falso('hack' in r.boletim);
      igual(r.boletim.sinais.length, 1);
      falso('extra' in r.boletim.sinais[0]);
      igual(({}).x, undefined, 'protótipo intacto');
    });

    it('vírgula decimal e texto só com espaços', function () {
      var b = core.lerBoletim({ paciente: { peso: '62,5' }, recuperacao: { atividade: '  ' } }, true).boletim;
      igual(b.paciente.peso, 62.5);
      igual(b.recuperacao.atividade, null, 'espaço não vira 0 ponto');
    });

    it('ler o que já foi lido dá o mesmo boletim', function () {
      var x = comBoletim(); preencher(x.st, x.id);
      var b = x.st.boletim(x.id);
      igual(core.jsonCanonico(core.normalizarBoletim(b)), core.jsonCanonico(core.normalizarBoletim(core.normalizarBoletim(b))));
    });

    it('horários passam da meia-noite; fora de ordem e janela absurda são recusados', function () {
      var ok = core.normalizarBoletim({ tempos: { entradaSala: '22:20', inicioAnestesia: '22:30', fimAnestesia: '01:05', saidaSala: '01:15' } });
      verdadeiro(core.validarBoletim(ok).ok);
      igual(core.duracaoNoBoletim(ok, 'inicioAnestesia', 'fimAnestesia'), 155);
      var fora = core.normalizarBoletim({ tempos: { entradaSala: '07:00', inicioAnestesia: '06:50' } });
      verdadeiro(/fora de ordem/.test(core.validarBoletim(fora).erros[0].msg));
      var longa = core.normalizarBoletim({ tempos: { entradaSala: '07:00', saidaSala: '03:00' } });
      falso(core.validarBoletim(longa).ok, '20 horas de sala é digitação errada');
    });

    it('registros em ordem de horário atravessando a meia-noite', function () {
      var b = core.normalizarBoletim({ tempos: { inicioAnestesia: '23:40' },
        sinais: [{ hora: '00:05', fc: 70 }, { hora: '23:55', fc: 72 }, { hora: '23:45', fc: 75 }] });
      igual(b.sinais.map(function (s) { return s.hora; }).join(','), '23:45,23:55,00:05');
    });

    it('PA diastólica maior ou igual à sistólica, registro vazio e fármaco sem via são erros', function () {
      var b = core.normalizarBoletim({ sinais: [{ hora: '07:00', pas: 80, pad: 90 }, { hora: '07:05' }],
        farmacos: [{ hora: '07:00', nome: 'Bupivacaína', dose: '15', unidade: 'mg' }] });
      var msgs = core.validarBoletim(b).erros.map(function (e) { return e.msg; }).join(' | ');
      verdadeiro(/diastólica/.test(msgs) && /sem nenhum valor/.test(msgs) && /via de administração/.test(msgs), msgs);
    });

    it('anestesia geral exige via aérea; sedação não', function () {
      var geral = core.normalizarBoletim({ tecnicas: ['Geral balanceada'] });
      verdadeiro(core.pendenciasBoletim(geral, cirurgia()).indexOf('Via aérea (anestesia geral)') >= 0);
      var sed = core.normalizarBoletim({ tecnicas: ['Sedação'] });
      falso(core.pendenciasBoletim(sed, cirurgia()).indexOf('Via aérea (anestesia geral)') >= 0);
    });

    it('resumo: balanço, Aldrete só com os cinco itens e IMC', function () {
      var b = core.normalizarBoletim({ paciente: { peso: 62.5, altura: 165 }, fluidos: [{ nome: 'RL', volume: 1500 }],
        perdas: { sangramento: 250, diurese: 300 },
        recuperacao: { atividade: 2, respiracao: 2, circulacao: 2, consciencia: 1 } });
      var r = core.resumoBoletim(b);
      igual(r.balanco, 950);
      igual(r.aldrete, null, 'falta saturação');
      igual(r.imc, 23);
      igual(core.aldreteTotal(Object.assign({}, b.recuperacao, { saturacao: 2 })), 9);
    });
  });

  describe('Store: ciclo de vida do boletim', function () {

    it('cria um por cirurgia, com ID próprio e os horários reais da cirurgia', function () {
      var x = comBoletim({ inicioReal: '07:10', fimReal: '09:05' });
      var b = x.st.boletim(x.id);
      igual(b.id, 'BOL0001');
      igual(b.tempos.inicioAnestesia, '07:10');
      igual(b.tempos.fimAnestesia, '09:05');
      falso(x.st.criarBoletim(x.cid).ok, 'segundo boletim da mesma cirurgia');
      igual(x.st.estado.log[x.st.estado.log.length - 1].campo, 'BOLETIM CRIADO');
    });

    it('a tela não muda identidade, situação nem assinatura pelo salvar', function () {
      var x = comBoletim();
      var r = x.st.salvarBoletim(x.id, { id: 'X', status: 'Finalizado', assinatura: { codigo: 'x' }, versao: 9, destino: 'UTI' });
      verdadeiro(r.ok);
      var b = x.st.boletim(x.id);
      igual(b.id, 'BOL0001'); igual(b.status, core.BOLETIM_RASCUNHO); igual(b.assinatura, null); igual(b.versao, 1);
      igual(b.destino, 'UTI');
    });

    it('registros: incluir, alterar e remover — e recusar alteração de quem viu versão velha', function () {
      var x = comBoletim();
      x.st.alterarLinhaBoletim(x.id, 'sinais', { acao: 'adicionar', linha: { hora: '07:00', fc: '70' } });
      x.st.alterarLinhaBoletim(x.id, 'sinais', { acao: 'adicionar', linha: { hora: '07:05', fc: '72' } });
      var visto = x.st.boletim(x.id).sinais[0];
      verdadeiro(x.st.alterarLinhaBoletim(x.id, 'sinais', { acao: 'alterar', indice: 0, conferir: visto, linha: { hora: '07:00', fc: '71' } }).ok);
      falso(x.st.alterarLinhaBoletim(x.id, 'sinais', { acao: 'remover', indice: 0, conferir: visto }).ok, 'versão velha');
      verdadeiro(x.st.alterarLinhaBoletim(x.id, 'sinais', { acao: 'remover', indice: 0, conferir: x.st.boletim(x.id).sinais[0] }).ok);
      igual(x.st.boletim(x.id).sinais.length, 1);
    });

    it('finalizar recusa com a lista do que falta, e sem assinatura ou CRM', function () {
      var x = comBoletim();
      var r = finalizar(x.st, x.id);
      falso(r.ok);
      verdadeiro(r.erros.some(function (e) { return /Falta: Classificação ASA/.test(e.msg); }));
      preencher(x.st, x.id);
      falso(finalizar(x.st, x.id, { tracos: [] }).ok, 'sem traços');
      falso(finalizar(x.st, x.id, { crm: ' ' }).ok, 'sem CRM');
      igual(x.st.boletim(x.id).status, core.BOLETIM_RASCUNHO, 'recusa não muda nada');
    });

    it('finalizar: código confere, identificação congelada, horário real e CRM levados, tudo no LOG', function () {
      var x = comBoletim();
      preencher(x.st, x.id);
      var r = finalizar(x.st, x.id);
      verdadeiro(r.ok, JSON.stringify(r.erros));
      var b = x.st.boletim(x.id);
      igual(b.status, core.BOLETIM_FINALIZADO);
      verdadeiro(core.codigoConfereBoletim(b));
      igual(b.identificacao.paciente, 'Maria Teste');
      igual(b.identificacao.crm, '12345-DF');
      var c = x.st.estado.cirurgias[0];
      igual(c.inicioReal, '07:00'); igual(c.fimReal, '08:30');
      igual(c.tempoReal, 1.5, 'horas do grupo recalculadas');
      igual(x.st.estado.anestesistas.filter(function (a) { return a.nome === 'Fabrício Tavares'; })[0].crm, '12345-DF');
      var campos = x.st.estado.log.map(function (l) { return l.campo; });
      verdadeiro(campos.indexOf('HORA INÍCIO REAL') >= 0 && campos.indexOf('CRM') >= 0 && campos.indexOf('BOLETIM FINALIZADO') >= 0);
    });

    it('avisa quando o horário real da cirurgia difere da anestesia e quando ela ainda está agendada', function () {
      var x = comBoletim({ status: 'Agendada', inicioReal: '07:30', fimReal: '09:00' });
      preencher(x.st, x.id);
      var r = finalizar(x.st, x.id);
      verdadeiro(r.ok);
      var avisos = r.avisos.map(function (a) { return a.msg; }).join(' | ');
      verdadeiro(/diferente do início e fim da anestesia/.test(avisos) && /Agendada/.test(avisos), avisos);
      igual(x.st.estado.cirurgias[0].inicioReal, '07:30', 'horário da cirurgia não é sobrescrito');
    });

    it('finalizado não se edita', function () {
      var x = comBoletim(); preencher(x.st, x.id); finalizar(x.st, x.id);
      falso(x.st.salvarBoletim(x.id, { destino: 'UTI' }).ok);
      falso(x.st.alterarLinhaBoletim(x.id, 'sinais', { acao: 'adicionar', linha: { hora: '08:00', fc: '60' } }).ok);
    });

    it('reabrir exige motivo, guarda a assinatura no histórico e vai para o LOG', function () {
      var x = comBoletim(); preencher(x.st, x.id); finalizar(x.st, x.id);
      var codigo = x.st.boletim(x.id).assinatura.codigo;
      falso(x.st.reabrirBoletim(x.id, 'curto').ok);
      verdadeiro(x.st.reabrirBoletim(x.id, 'Corrigir a dose registrada errada').ok);
      var b = x.st.boletim(x.id);
      igual(b.versao, 2); igual(b.assinatura, null); igual(b.historico.length, 1);
      igual(b.historico[0].codigo, codigo);
      var ultimo = x.st.estado.log[x.st.estado.log.length - 1];
      igual(ultimo.campo, 'BOLETIM REABERTO');
      igual(ultimo.para, 'Corrigir a dose registrada errada');
      verdadeiro(finalizar(x.st, x.id).ok, 'assina de novo');
      igual(x.st.boletim(x.id).versao, 2);
    });

    it('descartar: só rascunho que nunca foi assinado; o ID não volta a ser usado', function () {
      var x = comBoletim();
      verdadeiro(x.st.descartarBoletim(x.id).ok);
      igual(x.st.criarBoletim(x.cid).boletim.id, 'BOL0002');
      var y = comBoletim(); preencher(y.st, y.id); finalizar(y.st, y.id);
      y.st.reabrirBoletim(y.id, 'Motivo suficiente aqui');
      falso(y.st.descartarBoletim(y.id).ok, 'já foi assinado');
    });

    it('cirurgia com boletim não se exclui (nem em cascata)', function () {
      var x = comBoletim();
      var r = x.st.removerCirurgia(x.cid, { comAvaliacoes: true });
      falso(r.ok);
      verdadeiro(/boletim anestésico/.test(r.erros[0].msg));
    });

    it('boletim guardado é congelado; falha no meio da transação não toca nele', function () {
      var x = comBoletim(); preencher(x.st, x.id);
      var antes = x.st.boletim(x.id);
      verdadeiro(Object.isFrozen(antes) && Object.isFrozen(antes.sinais) && Object.isFrozen(antes.sinais[0]));
      falso(x.st.alterarLinhaBoletim(x.id, 'sinais', { acao: 'adicionar', linha: { hora: '07:10', pas: '999' } }).ok);
      verdadeiro(x.st.boletim(x.id) === antes, 'mesmo objeto de antes');
      x.st.transacao(function (st) { st.boletins.push({ id: 'X' }); return { ok: false, erros: [{ msg: 'desfaz' }] }; });
      igual(x.st.boletins().length, 1, 'rollback da lista');
    });
  });

  describe('Integridade dos boletins', function () {

    function problemas(estado) {
      var st = core.criarStore(estado, { usuario: 'qa' });
      st.recalcular();
      return st.verificarIntegridade().problemas.filter(function (p) { return p.area === 'BOLETIM'; })
        .map(function (p) { return p.nivel + ' ' + p.msg; });
    }

    it('conteúdo de boletim assinado alterado por fora é apontado', function () {
      var x = comBoletim(); preencher(x.st, x.id); finalizar(x.st, x.id);
      igual(problemas(JSON.parse(JSON.stringify(x.st.estado))).length, 0);
      var adulterado = JSON.parse(JSON.stringify(x.st.estado));
      adulterado.boletins[0].sinais[0].pas = 180;
      verdadeiro(/não confere/.test(problemas(adulterado).join(' ')));
    });

    it('boletim sem cirurgia e cirurgia com dois boletins são erros', function () {
      var x = comBoletim();
      var e = JSON.parse(JSON.stringify(x.st.estado));
      e.boletins.push(Object.assign({}, e.boletins[0], { id: 'BOL0002' }));
      e.boletins.push(Object.assign({}, e.boletins[0], { id: 'BOL0003', idCirurgia: 'CIR9999' }));
      var p = problemas(e).join(' | ');
      verdadeiro(/mais de um boletim/.test(p) && /não existe/.test(p), p);
    });

    it('paciente mudado depois da assinatura vira aviso (o boletim guarda o assinado)', function () {
      var x = comBoletim(); preencher(x.st, x.id); finalizar(x.st, x.id);
      x.st.atualizarCirurgia(x.cid, { paciente: 'Maria Teste da Silva' });
      verdadeiro(/AVISO .*mudaram depois da assinatura/.test(problemas(JSON.parse(JSON.stringify(x.st.estado))).join(' ')));
    });
  });

  describe('Backup, planilha e PDF', function () {

    it('o backup leva os boletins e volta saneado, com o código conferindo', function () {
      var x = comBoletim(); preencher(x.st, x.id); finalizar(x.st, x.id);
      var enxuto = JSON.parse(JSON.stringify(DADOS.enxugar(x.st.estado)));
      igual(enxuto.boletins.length, 1);
      enxuto.boletins.push('lixo', { semCirurgia: true });
      enxuto.config.sequencias.boletim = 7;
      var volta = DADOS.sanearEstado(enxuto);
      igual(volta.boletins.length, 1);
      igual(volta.config.sequencias.boletim, 7);
      verdadeiro(core.codigoConfereBoletim(volta.boletins[0]));
      var st = core.criarStore(volta, { usuario: 'qa' }); st.recalcular();
      igual(st.proximoIdBoletim(), 'BOL0008', 'sequência do backup respeitada');
    });

    it('CSV com uma linha por boletim', function () {
      var x = comBoletim(); preencher(x.st, x.id); finalizar(x.st, x.id);
      var csv = DADOS.exportarCSVs(x.st, 10, 2026).filter(function (a) { return a.nome === 'BOLETINS ANESTÉSICOS'; })[0];
      verdadeiro(!!csv);
      var linhas = csv.conteudo.trim().split('\n');
      igual(linhas.length, 2);
      verdadeiro(/BOL0001;CIR0001;Finalizado;1;15\/10\/2026;Maria Teste/.test(linhas[1]), linhas[1]);
    });

    function xrefConfere(fonte) {
      var inicio = Number(/startxref\n(\d+)/.exec(fonte)[1]);
      if (fonte.slice(inicio, inicio + 4) !== 'xref') return false;
      var entradas = fonte.slice(inicio).split('\n').slice(3).filter(function (l) { return / 00000 n $/.test(l); });
      return entradas.every(function (l, i) {
        var off = Number(l.slice(0, 10));
        return fonte.slice(off, off + String(i + 1).length + 6) === (i + 1) + ' 0 obj';
      });
    }

    it('PDF finalizado: válido, com paciente, assinatura e código; sem caractere perdido', function () {
      var x = comBoletim(); preencher(x.st, x.id);
      x.st.alterarLinhaBoletim(x.id, 'sinais', { acao: 'adicionar', linha: { hora: '07:10', spo2: '98' } });
      finalizar(x.st, x.id);
      var b = x.st.boletim(x.id);
      var fonte = BOLETIM_PDF.fonte(b, x.st.estado.cirurgias[0], { clinica: { nome: 'Clínica Exemplo' } });
      verdadeiro(/^%PDF-1\.4/.test(fonte) && /%%EOF\n$/.test(fonte));
      verdadeiro(xrefConfere(fonte), 'tabela xref aponta para os objetos');
      verdadeiro(fonte.indexOf('(Maria Teste)') >= 0, 'paciente');
      verdadeiro(fonte.indexOf(core.codigoLegivel(b.assinatura.codigo)) >= 0, 'código');
      verdadeiro(fonte.indexOf('SpO2') >= 0, 'SpO₂ vira SpO2');
      falso(/\(\?/.test(fonte), 'nenhum texto começando com caractere perdido');
      falso(/RASCUNHO/.test(fonte));
    });

    it('PDF de rascunho sai marcado e com a cirurgia de agora', function () {
      var x = comBoletim();
      var fonte = BOLETIM_PDF.fonte(x.st.boletim(x.id), x.st.estado.cirurgias[0], { clinica: {} });
      verdadeiro(/RASCUNHO/.test(fonte));
      verdadeiro(/\(rascunho\)\.pdf$/.test(BOLETIM_PDF.nomeArquivo(x.st.boletim(x.id), { paciente: 'Maria', data: '2026-10-15' })));
    });
  });
};
