/**
 * QA 28 — LOG por usuário e arquivo mensal: as regras do core
 *   - as contas do arquivo mensal (core/11b_log_arquivo.js): meses, corte, prazo, texto
 *   - toda linha do LOG leva o login de quem fez, além do nome
 *   - filtrar o LOG por pessoa (inclusive a linha antiga, sem login)
 *   - configuração (só o chefe) e a única operação que remove linha do LOG, que só o servidor aplica
 */
'use strict';

var fs = require('fs');
var path = require('path');
var vm = require('vm');

module.exports = function (t, core, dados) {
  var describe = t.describe, it = t.it, igual = t.igual, verdadeiro = t.verdadeiro, falso = t.falso, igualProfundo = t.igualProfundo;

  var ctxDados = vm.createContext(Object.assign({}, core, {
    UI: { baixarTexto: function () {} }, SEED_INICIAL: dados.seed, Blob: Blob, console: console
  }));
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'webapp', 'js', '03_dados.js'), 'utf8'), ctxDados);
  var DADOS = vm.runInContext('DADOS', ctxDados);

  function novoStore(opcoes) { return core.criarStoreComSeed(dados.seed, Object.assign({ usuario: 'qa' }, opcoes || {})); }
  function linha(quando, extra) {
    return core.novaEntradaLog(Object.assign({ quando: quando, usuario: 'Fulano', aba: 'CIRURGIAS', idCirurgia: 'CIR0001', campo: 'STATUS', de: 'Agendada', para: 'Realizada' }, extra || {}));
  }

  describe('Arquivo mensal do LOG: as contas (core/11b)', function () {

    it('configuração: padrão de 6 meses na tela e 5 anos de guarda; valor fora da faixa volta ao padrão', function () {
      igualProfundo(core.lerConfigLog(), { mesesNaTela: 6, anosDeGuarda: 5 });
      igualProfundo(core.lerConfigLog({ mesesNaTela: 12, anosDeGuarda: 10 }), { mesesNaTela: 12, anosDeGuarda: 10 });
      igualProfundo(core.lerConfigLog({ mesesNaTela: 0, anosDeGuarda: 99 }), { mesesNaTela: 6, anosDeGuarda: 5 });
      igualProfundo(core.lerConfigLog({ mesesNaTela: '8', anosDeGuarda: 0 }), { mesesNaTela: 8, anosDeGuarda: 0 }, '0 = nunca apagar sozinho');
      igualProfundo(core.lerConfigLog({ mesesNaTela: 3.5, anosDeGuarda: '' }), { mesesNaTela: 6, anosDeGuarda: 5 }, 'fração e vazio não valem');
      igualProfundo(core.lerConfigLog({ mesesNaTela: true, anosDeGuarda: null }), { mesesNaTela: 6, anosDeGuarda: 5 });
      igualProfundo(core.lerConfigLog('lixo'), { mesesNaTela: 6, anosDeGuarda: 5 });
    });

    it('soma de meses atravessa o ano nos dois sentidos', function () {
      igual(core.somarMesesAoMes('2026-10', 1), '2026-11');
      igual(core.somarMesesAoMes('2026-12', 1), '2027-01');
      igual(core.somarMesesAoMes('2026-01', -1), '2025-12');
      igual(core.somarMesesAoMes('2026-10', -6), '2026-04');
      igual(core.somarMesesAoMes('2026-03', -6), '2025-09');
      igual(core.somarMesesAoMes('2026-10', -60), '2021-10');
    });

    it('o mês de uma linha só vale com carimbo de verdade', function () {
      igual(core.mesDoLog('2026-09-30 23:59:59'), '2026-09');
      igual(core.mesDoLog('2026-02-30 10:00:00'), '', 'dia que não existe');
      igual(core.mesDoLog('05/10/2026 10:00:00'), '', 'outro formato');
      igual(core.mesDoLog(''), '');
      igual(core.mesDoLog(undefined), '');
    });

    it('agrupar por mês deixa a linha sem data à parte (ela nunca sai da tela)', function () {
      var g = core.agruparLogPorMes([linha('2026-09-01 08:00:00'), linha('2026-09-15 08:00:00'), linha('2026-10-02 08:00:00'),
        { quando: '', usuario: 'X' }, linha('sem data')]);
      igual(Object.keys(g.meses).join(','), '2026-09,2026-10');
      igual(g.meses['2026-09'].length, 2);
      igual(g.semData.length, 2);
    });

    it('o mês só vira arquivo depois de fechar e de passar mais um dia', function () {
      igual(core.mesFechadoParaArquivo('2026-09', '2026-09-30'), false, 'o mês ainda não acabou');
      igual(core.mesFechadoParaArquivo('2026-09', '2026-10-01'), false, 'primeiro dia do mês novo: ainda pode chegar linha de última hora');
      igual(core.mesFechadoParaArquivo('2026-09', '2026-10-02'), true);
      igual(core.mesFechadoParaArquivo('2026-12', '2027-01-01'), false);
      igual(core.mesFechadoParaArquivo('2026-12', '2027-01-02'), true, 'virada do ano');
      igual(core.mesFechadoParaArquivo('2026-10', '2026-10-20'), false, 'o mês corrente nunca');
      igual(core.mesFechadoParaArquivo('2026-10', ''), false);
    });

    it('o corte da tela é o primeiro dia de N meses atrás', function () {
      igual(core.corteDaTela('2026-10-02', 6), '2026-04-01');
      igual(core.corteDaTela('2027-01-15', 6), '2026-07-01');
      igual(core.corteDaTela('2026-03-10', 6), '2025-09-01');
      igual(core.corteDaTela('2026-10-31', 1), '2026-09-01');
    });

    it('o arquivo passa do prazo só depois de N anos; 0 anos = nunca', function () {
      var meses = ['2021-03', '2021-09', '2021-10', '2026-09'];
      igual(core.mesesDeArquivoParaApagar(meses, '2026-10-02', 5).join(','), '2021-03,2021-09');
      igual(core.mesesDeArquivoParaApagar(meses, '2026-10-02', 0).length, 0);
      igual(core.mesesDeArquivoParaApagar(meses, '2026-10-02', 1).join(','), '2021-03,2021-09,2021-10');
    });

    it('o texto do arquivo é o mesmo para o mesmo dado, qualquer que seja a ordem das chaves, e volta inteiro', function () {
      var a = { quando: '2026-09-01 08:00:00', usuario: 'Ana', login: 'ana', campo: 'STATUS' };
      var b = { campo: 'STATUS', login: 'ana', usuario: 'Ana', quando: '2026-09-01 08:00:00' };
      igual(core.textoDoArquivoDeLog([a]), core.textoDoArquivoDeLog([b]));
      var volta = core.entradasDoTextoDeLog(core.textoDoArquivoDeLog([a, b]));
      igual(volta.entradas.length, 2);
      igual(volta.invalidas, 0);
      var estragado = core.entradasDoTextoDeLog(core.textoDoArquivoDeLog([a]) + 'isto não é json\n[1,2]\n');
      igual(estragado.entradas.length, 1);
      igual(estragado.invalidas, 2, 'linha ilegível é contada, não escondida');
    });

    it('nome do arquivo: tipo, mês e parte, e só nome desse formato volta a ser lido', function () {
      igual(core.nomeDoArquivoDeLog('alteracoes', '2026-09', 1), 'alteracoes_2026-09.jsonl.gz');
      igual(core.nomeDoArquivoDeLog('acessos', '2026-09', 2), 'acessos_2026-09_p2.jsonl.gz');
      igualProfundo(core.lerNomeDoArquivoDeLog('acessos_2026-09_p2.jsonl.gz'), { tipo: 'acessos', mes: '2026-09', parte: 2 });
      igualProfundo(core.lerNomeDoArquivoDeLog('alteracoes_2026-09.jsonl.gz'), { tipo: 'alteracoes', mes: '2026-09', parte: 1 });
      igual(core.lerNomeDoArquivoDeLog('../alteracoes_2026-09.jsonl.gz'), null, 'nada de caminho');
      igual(core.lerNomeDoArquivoDeLog('qualquer.txt'), null);
      igual(core.lerNomeDoArquivoDeLog('alteracoes_2026-13.jsonl.gz.exe'), null);
    });
  });

  describe('LOG por usuário no store', function () {

    var CIR = { status: 'Agendada', data: '2026-10-05', inicioPrev: '07:00', fimPrev: '09:00', paciente: 'Paciente Log',
      procedimento: 'Rinoplastia', anestesista: 'Fabrício Tavares', avaliacaoNec: 'Sim', valor: 100 };

    it('toda linha do LOG leva o login de quem fez — inclusive a avaliação criada sozinha', function () {
      var st = novoStore({ usuario: 'Maria Silva', login: 'maria' });
      verdadeiro(st.adicionarCirurgia(CIR).ok);
      var novas = st.estado.log;
      verdadeiro(novas.length >= 2, 'a cirurgia e a avaliação criada sozinha');
      novas.forEach(function (l) {
        igual(l.login, 'maria', l.campo);
        igual(l.usuario, 'Maria Silva');
      });
    });

    it('trocar de usuário no mesmo store: cada linha fica com o seu autor', function () {
      var st = novoStore({ usuario: 'Maria Silva', login: 'maria' });
      st.adicionarCirurgia(CIR);
      st.usuario = 'João Souza'; st.login = 'joao';
      st.atualizarCirurgia('CIR0001', { status: 'Confirmada' });
      var doJoao = st.estado.log.filter(function (l) { return l.login === 'joao'; });
      var daMaria = st.estado.log.filter(function (l) { return l.login === 'maria'; });
      verdadeiro(doJoao.length >= 1 && daMaria.length >= 2);
      igual(doJoao[0].campo, 'STATUS');
      igual(doJoao[0].usuario, 'João Souza');
    });

    it('sem login definido (planilha, computador único), a coluna fica vazia e o nome continua', function () {
      var st = novoStore({ usuario: 'Maria' });
      st.adicionarCirurgia(CIR);
      st.estado.log.forEach(function (l) { igual(l.login, ''); igual(l.usuario, 'Maria'); });
    });

    it('filtrar por pessoa: pelo login, e a linha antiga (sem login) pelo nome', function () {
      var log = [
        linha('2026-09-01 08:00:00', { usuario: 'Maria Silva', login: 'maria' }),
        linha('2026-09-02 08:00:00', { usuario: 'Maria Silva', login: '' }),
        linha('2026-09-03 08:00:00', { usuario: 'João Souza', login: 'joao' }),
        linha('2026-09-04 08:00:00', { usuario: 'Maria Silva', login: 'outramaria' })
      ];
      igual(core.filtrarLog(log, { login: 'maria', nome: 'Maria Silva' }).length, 2, 'a de login e a antiga pelo nome; a "outramaria" não');
      igual(core.filtrarLog(log, { login: 'maria' }).length, 1, 'sem o nome, só o login');
      igual(core.filtrarLog(log, { login: 'joao', nome: 'João Souza' }).length, 1);
      igual(core.filtrarLog(log, { texto: 'outramaria' }).length, 1, 'a busca de texto também enxerga o login');
    });

    it('o LOGIN é coluna extra: sai nas exportações, mas fica fora da conferência com a planilha', function () {
      var cols = core.schemaColunas('LOG').map(function (c) { return c.campo; });
      verdadeiro(cols.indexOf('login') >= 0);
      igual(core.schemaCabecalhoPlanilha('LOG').indexOf('LOGIN'), -1);
      var st = novoStore({ usuario: 'Maria', login: 'maria' });
      st.adicionarCirurgia(CIR);
      var matriz = DADOS.matrizDaAba('LOG', st.estado.log);
      igual(matriz[0][matriz[0].length - 1], 'LOGIN');
      igual(matriz[1][matriz[1].length - 1], 'maria');
    });

    it('o login sobrevive a salvar e recarregar (saneamento da entrada)', function () {
      var st = novoStore({ usuario: 'Maria', login: 'maria' });
      st.adicionarCirurgia(CIR);
      var volta = DADOS.sanearEstado(JSON.parse(JSON.stringify(DADOS.enxugar(st.estado))));
      igual(volta.log[0].login, 'maria');
    });
  });

  describe('Configuração e arquivo do LOG no store', function () {

    it('a configuração nasce com o padrão e só aceita valor dentro da faixa', function () {
      var st = novoStore({ login: 'chefe' });
      igualProfundo(st.configLog(), { mesesNaTela: 6, anosDeGuarda: 5 });
      falso(st.salvarConfigLog(0, 5).ok);
      falso(st.salvarConfigLog(37, 5).ok);
      falso(st.salvarConfigLog(6, 31).ok);
      falso(st.salvarConfigLog(6, -1).ok);
      falso(st.salvarConfigLog('abc', 5).ok);
      falso(st.salvarConfigLog(2.5, 5).ok);
      igualProfundo(st.configLog(), { mesesNaTela: 6, anosDeGuarda: 5 }, 'recusa não muda nada');
    });

    it('mudar a configuração entra no LOG, com o login de quem mudou', function () {
      var st = novoStore({ usuario: 'Chefe', login: 'chefe' });
      var r = st.salvarConfigLog(12, 0);
      verdadeiro(r.ok, JSON.stringify(r.erros));
      igualProfundo(st.configLog(), { mesesNaTela: 12, anosDeGuarda: 0 });
      var l = st.estado.log.filter(function (x) { return x.campo === 'LOG: ANOS DE GUARDA DO ARQUIVO'; })[0];
      igual(l.de, '5'); igual(l.para, 'nunca apagar'); igual(l.login, 'chefe');
      verdadeiro(st.estado.log.some(function (x) { return x.campo === 'LOG: MESES NA TELA'; }));
      var antes = st.estado.log.length;
      st.salvarConfigLog(12, 0);
      igual(st.estado.log.length, antes, 'sem mudança, sem linha nova');
    });

    it('a configuração sobrevive a salvar e recarregar, e valor estranho num backup volta ao padrão', function () {
      var st = novoStore();
      st.salvarConfigLog(9, 3);
      var enxuto = JSON.parse(JSON.stringify(DADOS.enxugar(st.estado)));
      igualProfundo(DADOS.sanearEstado(enxuto).config.log, { mesesNaTela: 9, anosDeGuarda: 3 });
      enxuto.config.log = { mesesNaTela: -4, anosDeGuarda: 'muito' };
      igualProfundo(DADOS.sanearEstado(enxuto).config.log, { mesesNaTela: 6, anosDeGuarda: 5 });
      delete enxuto.config.log;
      igualProfundo(DADOS.sanearEstado(enxuto).config.log, { mesesNaTela: 6, anosDeGuarda: 5 }, 'backup antigo, sem a configuração');
    });

    function storeComLog() {
      var st = novoStore({ usuario: 'Chefe', login: 'chefe' });
      st.estado.log.push(linha('2026-01-10 10:00:00'), linha('2026-02-20 10:00:00'), linha('2026-04-30 23:59:59'),
        linha('2026-05-01 00:00:00'), linha('2026-09-15 12:00:00'), linha('sem data'));
      return st;
    }

    it('arquivar tira o que é anterior ao corte, deixa uma linha "LOG ARQUIVADO" e não toca no resto', function () {
      var st = storeComLog();
      var r = st.arquivarLogAte('2026-05-01', 'alteracoes_2026-01..04 · sha256 abc');
      verdadeiro(r.ok, JSON.stringify(r.erros));
      igual(r.arquivadas, 3);
      var quando = st.estado.log.map(function (l) { return l.quando; });
      verdadeiro(quando.indexOf('2026-04-30 23:59:59') < 0, 'véspera do corte saiu');
      verdadeiro(quando.indexOf('2026-05-01 00:00:00') >= 0, 'o dia do corte fica');
      verdadeiro(quando.indexOf('2026-09-15 12:00:00') >= 0);
      verdadeiro(quando.indexOf('sem data') >= 0, 'linha sem data válida nunca sai');
      var marca = st.estado.log[st.estado.log.length - 1];
      igual(marca.campo, 'LOG ARQUIVADO');
      igual(marca.usuario, 'Sistema'); igual(marca.login, 'sistema');
      verdadeiro(/^3 registro\(s\) anteriores a 01\/05\/2026$/.test(marca.de), marca.de);
      verdadeiro(/sha256 abc/.test(marca.para));
    });

    it('arquivar sem nada a tirar não faz nada (nem linha de aviso)', function () {
      var st = storeComLog();
      var antes = st.estado.log.length;
      var r = st.arquivarLogAte('2026-01-01', 'x');
      verdadeiro(r.ok); igual(r.arquivadas, 0);
      igual(st.estado.log.length, antes);
    });

    it('corte inválido é recusado e o LOG não muda', function () {
      var st = storeComLog();
      var antes = st.estado.log.length;
      falso(st.arquivarLogAte('amanhã', 'x').ok);
      falso(st.arquivarLogAte('2026-02-30', 'x').ok);
      falso(st.arquivarLogAte('', 'x').ok);
      igual(st.estado.log.length, antes);
    });

    it('uma transação que falha depois de arquivar não estraga o LOG já arquivado', function () {
      var st = storeComLog();
      st.arquivarLogAte('2026-05-01', 'x');
      var depois = st.estado.log.length;
      var r = st.transacao(function (s, api) {
        api.registrar([linha('2026-09-20 10:00:00')]);
        return { ok: false, erros: [{ msg: 'desfaz' }] };
      });
      falso(r.ok);
      igual(st.estado.log.length, depois, 'a linha da transação desfeita sumiu e o resto ficou como estava');
    });

    it('arquivar é operação do servidor (nunca de um perfil) e a configuração é só do chefe', function () {
      verdadeiro(core.MUTACOES_STORE.indexOf('arquivarLogAte') >= 0 && core.MUTACOES_STORE.indexOf('salvarConfigLog') >= 0);
      ['chefe', 'anestesista', 'secretaria'].forEach(function (p) {
        falso(core.perfilPodeExecutar(p, 'arquivarLogAte', ['2026-01-01']).ok, p + ' não manda arquivar');
      });
      verdadeiro(core.MUTACOES_SEGURAS_EM_CONCORRENCIA.indexOf('salvarConfigLog') >= 0, 'só troca um valor: aceita mesmo se alguém gravou no meio');
      falso(core.MUTACOES_SEGURAS_EM_CONCORRENCIA.indexOf('arquivarLogAte') >= 0);
      verdadeiro(core.perfilPodeExecutar('chefe', 'salvarConfigLog', [6, 5]).ok);
      falso(core.perfilPodeExecutar('secretaria', 'salvarConfigLog', [6, 5]).ok);
      falso(core.perfilPodeExecutar('anestesista', 'salvarConfigLog', [6, 5]).ok);
    });
  });
};
