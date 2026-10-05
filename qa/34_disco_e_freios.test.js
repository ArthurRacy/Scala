/**
 * QA 34 — Disco recusando gravação e freios contra relógio errado (achados do QA geral de 05/10/2026)
 *   - disco recusando gravação: o comando é desfeito (503), nada fica pela metade, e a troca do estado inteiro não vale
 *   - o diário nunca fica com linha pela metade
 *   - freios: relógio errado não apaga as cópias nem os arquivos de LOG de uma vez
 *   - /api/saude para monitoramento
 */
'use strict';

var fs = require('fs');
var path = require('path');

module.exports = function (t, core, dados) {
  var describe = t.describe, it = t.it, igual = t.igual, verdadeiro = t.verdadeiro;

  var U = require('./_servidor_util.js')(core);
  var RAIZ = path.join(__dirname, '..');
  var criarArmazem = require(path.join(RAIZ, 'server', 'armazem.js')).criarArmazem;

  function espera(ms) { return new Promise(function (ok) { setTimeout(ok, ms); }); }

  /* ====================================================================== */
  describe('Disco recusando gravação (servidor)', function () {

    it('o diário não grava: o comando é desfeito (503), nada fica pela metade, e refazer não duplica', function () {
      var pasta = U.pastaTemp();
      var diario = path.join(pasta, 'diario.jsonl');
      return U.comServidor(function (cli) {
        var revisao;
        return U.chefe(cli, pasta).then(function () { return U.comando(cli, 'adicionarCirurgia', U.CIRURGIA); }).then(function (x) {
          verdadeiro(x.resp.corpo.ok, JSON.stringify(x.resp.corpo));
          revisao = x.resp.corpo.revisao;
          // o "disco" passa a recusar o diário: no lugar do arquivo, uma pasta
          fs.rmSync(diario, { force: true });
          fs.mkdirSync(diario);
          return U.comando(cli, 'adicionarCirurgia', Object.assign({}, U.CIRURGIA, { paciente: 'Não pode ficar' }));
        }).then(function (x) {
          igual(x.resp.status, 503, JSON.stringify(x.resp.corpo));
          verdadeiro(/Nada foi alterado/.test(x.resp.corpo.erro), x.resp.corpo.erro);
          return cli.get('/api/estado');
        }).then(function (r) {
          igual(r.corpo.revisao, revisao, 'a revisão não andou');
          igual(r.corpo.estado.cirurgias.length, 1, 'a cirurgia recusada não ficou na memória');
          verdadeiro(!r.corpo.estado.cirurgias.some(function (c) { return c.paciente === 'Não pode ficar'; }));
          fs.rmdirSync(diario);                      // o disco volta
          return U.comando(cli, 'adicionarCirurgia', Object.assign({}, U.CIRURGIA, { paciente: 'Agora sim' }));
        }).then(function (x) {
          verdadeiro(x.resp.corpo.ok, JSON.stringify(x.resp.corpo));
          igual(x.resp.corpo.revisao, revisao + 1, 'sem buraco na numeração do diário');
          return cli.get('/api/estado');
        }).then(function (r) {
          igual(r.corpo.estado.cirurgias.length, 2);
          igual(r.corpo.estado.cirurgias.filter(function (c) { return c.paciente === 'Agora sim'; }).length, 1, 'uma só, não duplicada');
        });
      }, pasta).then(function () {
        // depois de desligar e ligar (sem gravar o estado, só o diário), o que foi aceito continua lá e o recusado nunca existiu
        return U.comServidor(function (cli) {
          return cli.post('/api/entrar', { login: 'admin', senha: U.SENHA }).then(function () { return cli.get('/api/estado'); }).then(function (r) {
            igual(r.corpo.estado.cirurgias.map(function (c) { return c.paciente; }).sort().join('|'), 'Agora sim|Paciente Perfis');
          });
        }, pasta);
      });
    });

    it('trocar o estado inteiro (importar) que não grava no disco não vale: o estado velho continua', function () {
      var pasta = U.pastaTemp();
      var arqEstado = path.join(pasta, 'estado.json');
      return U.comServidor(function (cli) {
        var backup;
        return U.chefe(cli, pasta).then(function () { return U.comando(cli, 'adicionarCirurgia', U.CIRURGIA); }).then(function () {
          return cli.get('/api/backup');
        }).then(function (r) {
          backup = JSON.parse(Buffer.isBuffer(r.corpo) ? r.corpo.toString('utf8') : JSON.stringify(r.corpo));
          backup.dados.cirurgias = [];                // o backup que vai ser importado não tem a cirurgia
          backup.dados.avaliacoes = [];
          return espera(1800);                         // deixa a gravação agendada do comando acontecer antes de estragar o disco
        }).then(function () {
          fs.rmSync(arqEstado, { force: true });
          fs.mkdirSync(arqEstado);                    // o "disco" recusa gravar o estado
          return cli.post('/api/importar', Buffer.from(JSON.stringify(backup)));
        }).then(function (r) {
          verdadeiro(r.status >= 500, 'a importação tem de falhar, e falhou com ' + r.status);
          return cli.get('/api/estado');
        }).then(function (r) {
          igual(r.corpo.estado.cirurgias.length, 1, 'o estado velho continua (a importação foi desfeita)');
          return cli.get('/api/saude');
        }).then(function (r) {
          igual(r.status, 503, 'o monitor vê que o disco está recusando');
          igual(r.corpo.ok, false);
          fs.rmdirSync(arqEstado);                    // o disco volta; a próxima gravação normal limpa o alarme
          return U.comando(cli, 'adicionarCirurgia', Object.assign({}, U.CIRURGIA, { paciente: 'Depois' }));
        }).then(function () {
          // o servidor tenta de novo sozinho (a cada 30 s) ou na próxima gravação agendada (1,5 s)
          return espera(2200).then(function () { return cli.get('/api/saude'); });
        }).then(function (r) {
          igual(r.status, 200, 'voltou ao normal: ' + JSON.stringify(r.corpo));
        });
      }, pasta);
    });

    it('/api/saude responde sem login e sem expor nenhum dado', function () {
      return U.comServidor(function (cli) {
        return cli.get('/api/saude').then(function (r) {
          igual(r.status, 200);
          igualChaves(r.corpo, ['gravacao', 'ok']);
        });
      });
    });

    function igualChaves(o, esperadas) { igual(Object.keys(o).sort().join(','), esperadas.slice().sort().join(',')); }
  });

  /* ====================================================================== */
  describe('O diário nunca fica com linha pela metade', function () {

    it('disco cheio no meio da linha: volta ao tamanho de antes, e a linha seguinte não gruda na quebrada', function () {
      var pasta = U.pastaTemp();
      var arm = criarArmazem(pasta, core);
      var arq = path.join(pasta, 'diario.jsonl');
      arm.anotarComando({ revisao: 1, nome: 'a', args: [], contexto: {} });
      var tamanho = fs.statSync(arq).size;
      var original = fs.writeSync;
      fs.writeSync = function (fd, texto) { original.call(fs, fd, String(texto).slice(0, 12)); throw new Error('ENOSPC: disco cheio'); };
      var lancou = false;
      try { arm.anotarComando({ revisao: 2, nome: 'b', args: [], contexto: {} }); } catch (e) { lancou = /ENOSPC/.test(e.message); } finally { fs.writeSync = original; }
      verdadeiro(lancou, 'o erro do disco tem de chegar a quem chamou');
      igual(fs.statSync(arq).size, tamanho, 'a linha pela metade foi cortada');
      arm.anotarComando({ revisao: 2, nome: 'c', args: [], contexto: {} });
      var cmds = arm.lerDiario(0);
      igual(cmds.map(function (c) { return c.revisao + c.nome; }).join(','), '1a,2c', 'as duas linhas boas sobreviveram');
    });
  });

  /* ====================================================================== */
  describe('Freios contra relógio errado', function () {

    function copiaFalsa(pasta, dia) {
      fs.writeFileSync(path.join(pasta, 'copias', 'estado_' + dia + '.json.gz'), 'x');
    }

    it('limpeza normal de cópias continua funcionando (apaga só o que passou)', function () {
      var pasta = U.pastaTemp();
      var arm = criarArmazem(pasta, core);
      var hoje = core.hojeISO();
      for (var i = 0; i < 45; i++) copiaFalsa(pasta, core.somarDias(hoje, -i));
      arm.aplicarRetencao();
      verdadeiro(arm.freioDaRetencao() === null, 'não é caso de freio');
      var ficam = arm.listarCopias().map(function (c) { return c.dia; });
      for (var k = 0; k < 35; k++) verdadeiro(ficam.indexOf(core.somarDias(hoje, -k)) >= 0, 'dia -' + k + ' tem de ficar');
      verdadeiro(ficam.length < 45, 'as de mais de 35 dias saíram (menos as primeiras de cada mês)');
    });

    it('querer apagar quase tudo de uma vez (data do computador muito à frente) não apaga nada', function () {
      var pasta = U.pastaTemp();
      var arm = criarArmazem(pasta, core);
      // cópias de há três anos, vistas por um relógio "de hoje": todas passaram do prazo de uma vez
      var dia = '2023-01-01';
      for (var i = 0; i < 60; i++) { copiaFalsa(pasta, dia); dia = core.somarDias(dia, 1); }
      var antes = arm.listarCopias().length;
      arm.aplicarRetencao();
      igual(arm.listarCopias().length, antes, 'nenhuma cópia foi apagada');
      verdadeiro(/Nada foi apagado; confira o relógio/.test(arm.freioDaRetencao() || ''), String(arm.freioDaRetencao()));
    });

    it('arquivos de LOG: vencer mais de quatro de uma vez (relógio errado) não apaga nenhum', function () {
      var pasta = U.pastaTemp();
      var MES_REAL = core.hojeISO().slice(0, 7);
      var longe = core.somarMesesAoMes(MES_REAL, 12 * 6 + 2) + '-10';
      return U.comServidor(function (cli, srv) {
        return U.chefe(cli, pasta).then(function () {
          // seis meses de linhas de alteração (5 anos de guarda): todos viram arquivo e todos passam do prazo juntos
          for (var m = 1; m <= 6; m++) {
            srv.store.estado.log.push(core.novaEntradaLog({ quando: core.somarMesesAoMes(MES_REAL, -m) + '-10 10:00:00', usuario: 'Antigo',
              aba: 'CIRURGIAS', idCirurgia: 'CIR0001', campo: 'STATUS', de: 'a', para: 'b' }));
          }
          var r = srv.rotacionarLogs('teste', longe);
          igual(r.apagados, 0, 'nada apagado');
          verdadeiro(r.problemas.some(function (p) { return /Nada foi apagado; confira o relógio/.test(p); }), JSON.stringify(r.problemas));
          var arquivos = fs.readdirSync(path.join(pasta, 'logs')).filter(function (n) { return /^alteracoes_.*\.gz$/.test(n); });
          verdadeiro(arquivos.length >= 6, 'os arquivos continuam lá: ' + arquivos.join(','));
        });
      }, pasta);
    });
  });
};
