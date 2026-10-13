/**
 * QA 36 — O servidor em operação (auditoria F06, F14, F15, F17 e Q10)
 *   - uma só cópia do servidor por pasta de dados (trava), com trava velha refeita
 *   - atrás de um proxy HTTPS: cookie Secure e IP de quem entra, só quando o pedido vem do próprio computador
 *   - respostas grandes comprimidas (gzip) quando o navegador aceita, iguais depois de descomprimidas
 *   - argumentos de comando com chave perigosa ou fundos demais são recusados
 *   - limite de exames anexados por avaliação
 */
'use strict';

var fs = require('fs');
var http = require('http');
var path = require('path');
var zlib = require('zlib');

module.exports = function (t, core, dados) {
  var describe = t.describe, it = t.it, igual = t.igual, verdadeiro = t.verdadeiro, falso = t.falso;

  var U = require('./_servidor_util.js')(core);
  var criarServidor = require(path.join(__dirname, '..', 'server', 'servidor.js')).criarServidor;

  /** GET cru (sem o fetch, que descomprime sozinho e esconde o que o servidor mandou). */
  function pegarCru(base, caminho, cabecalhos) {
    return new Promise(function (resolver, rejeitar) {
      var u = new URL(base + caminho);
      var req = http.request({ host: u.hostname, port: u.port, path: u.pathname, method: 'GET', headers: Object.assign({ Connection: 'close' }, cabecalhos || {}) }, function (res) {
        var partes = [];
        res.on('data', function (c) { partes.push(c); });
        res.on('end', function () { resolver({ status: res.statusCode, headers: res.headers, corpo: Buffer.concat(partes) }); });
      });
      req.on('error', rejeitar);
      req.end();
    });
  }

  /* ====================================================================== */
  describe('Uma só cópia do servidor por pasta (F14)', function () {

    it('um segundo servidor na mesma pasta é recusado com mensagem clara; fechado o primeiro, abre', function () {
      var pasta = U.pastaTemp();
      return U.comServidor(function () {
        var erro = null;
        try { criarServidor({ dados: pasta, porta: 0, host: '127.0.0.1', silencioso: true }); } catch (e) { erro = e; }
        verdadeiro(erro, 'tinha de recusar');
        verdadeiro(/Já existe um servidor usando esta pasta de dados/.test(erro.message), erro.message);
        verdadeiro(fs.existsSync(path.join(pasta, 'servidor.trava')), 'a trava do primeiro continua');
      }, pasta).then(function () {
        falso(fs.existsSync(path.join(pasta, 'servidor.trava')), 'fechar solta a trava');
        return U.comServidor(function () { return 'abriu'; }, pasta);
      }).then(function (v) { igual(v, 'abriu'); });
    });

    it('trava velha (processo que já não existe, ou arquivo ilegível) é refeita sem pedir nada a ninguém', function () {
      var pasta = U.pastaTemp();
      fs.writeFileSync(path.join(pasta, 'servidor.trava'), JSON.stringify({ pid: 2147483000, desde: '2020-01-01T00:00:00Z' }));
      return U.comServidor(function () {
        var dono = JSON.parse(fs.readFileSync(path.join(pasta, 'servidor.trava'), 'utf8'));
        igual(dono.pid, process.pid, 'agora a trava é deste processo');
      }, pasta).then(function () {
        fs.writeFileSync(path.join(pasta, 'servidor.trava'), 'lixo que não é json');
        return U.comServidor(function () { return 'abriu'; }, pasta);
      }).then(function (v) { igual(v, 'abriu'); });
    });

    it('pastas diferentes não se atrapalham', function () {
      return U.comServidor(function () {
        return U.comServidor(function () { return 'os dois abertos'; });
      }).then(function (v) { igual(v, 'os dois abertos'); });
    });
  });

  /* ====================================================================== */
  describe('Recuperar a senha do chefe (tools/redefinir_senha.js)', function () {

    var cp = require('child_process');
    var criarContas = require(path.join(__dirname, '..', 'server', 'contas.js')).criarContas;
    var FERRAMENTA = path.join(__dirname, '..', 'tools', 'redefinir_senha.js');

    function rodar(pasta, login) {
      return cp.spawnSync(process.execPath, [FERRAMENTA, pasta, login], { encoding: 'utf8', timeout: 30000 });
    }

    it('com o servidor fechado: gera senha nova, a antiga deixa de valer, a nova entra, e fica registrado', function () {
      var pasta = U.pastaTemp();
      return U.comServidor(function (cli) { return U.chefe(cli, pasta); }, pasta).then(function () {
        var r = rodar(pasta, 'admin');
        igual(r.status, 0, r.stdout + r.stderr);
        var m = /Nova senha temporária: (\S{12})\b/.exec(r.stdout);
        verdadeiro(m, r.stdout);
        var contas = criarContas(pasta);
        falso(contas.entrar('admin', U.SENHA, '10.0.0.1').ok, 'a senha antiga não vale mais');
        verdadeiro(contas.entrar('admin', m[1], '10.0.0.2').ok, 'a temporária entra');
        verdadeiro(/senha_redefinida_no_servidor/.test(fs.readFileSync(path.join(pasta, 'logs', 'acessos.jsonl'), 'utf8')), 'registrado');
        falso(fs.existsSync(path.join(pasta, 'servidor.trava')), 'a ferramenta solta a trava');
      });
    });

    it('com o servidor aberto, ou com login que não existe, ela recusa e não muda nada', function () {
      var pasta = U.pastaTemp();
      return U.comServidor(function (cli) {
        return U.chefe(cli, pasta).then(function () {
          var r = rodar(pasta, 'admin');
          igual(r.status, 1);
          verdadeiro(/Já existe um servidor/.test(r.stderr), r.stderr);
        });
      }, pasta).then(function () {
        var r = rodar(pasta, 'ninguem');
        igual(r.status, 1);
        verdadeiro(/Não existe o usuário "ninguem"/.test(r.stderr), r.stderr);
        verdadeiro(criarContas(pasta, { custo: 1024 }).entrar('admin', U.SENHA, '10.0.0.3').ok, 'a senha continua a de antes (criada com o custo barato dos testes)');
      });
    });
  });

  /* ====================================================================== */
  describe('Atrás de um proxy HTTPS (F06 e F17)', function () {

    it('com --atras-de-proxy, X-Forwarded-Proto: https põe Secure no cookie e X-Forwarded-For vira o IP do LOG', function () {
      var pasta = U.pastaTemp();
      return U.comServidor(function (cli) {
        return cli.post('/api/primeiro-acesso', { codigo: U.codigoDe(pasta), login: 'admin', nome: 'Chefe', senha: U.SENHA }, { 'X-Forwarded-Proto': 'https', 'X-Forwarded-For': '203.0.113.9' })
          .then(function (r) {
            igual(r.status, 200, JSON.stringify(r.corpo));
            verdadeiro(/;\s*Secure/i.test(r.cookieBruto || ''), 'cookie Secure: ' + r.cookieBruto);
            verdadeiro(/HttpOnly/i.test(r.cookieBruto) && /SameSite=Strict/i.test(r.cookieBruto));
            return cli.post('/api/entrar', { login: 'admin', senha: 'errada-errada' }, { 'X-Forwarded-For': '198.51.100.7, 203.0.113.50' });
          }).then(function (r) {
            igual(r.status, 401);
            return cli.get('/api/auditoria/acessos?evento=entrada_recusada');
          }).then(function (r) {
            var ips = r.corpo.eventos.map(function (e) { return e.ip; });
            verdadeiro(ips.indexOf('203.0.113.50') >= 0, 'o IP é o último da lista (o que o proxy acrescentou): ' + ips.join(','));
            falso(ips.indexOf('198.51.100.7') >= 0, 'o que veio escrito pelo cliente não vale');
          });
      }, pasta, { atrasDeProxy: true });
    });

    it('sem a opção, os cabeçalhos de proxy são ignorados (ninguém se passa por HTTPS nem por outro IP)', function () {
      var pasta = U.pastaTemp();
      return U.comServidor(function (cli) {
        return cli.post('/api/primeiro-acesso', { codigo: U.codigoDe(pasta), login: 'admin', nome: 'Chefe', senha: U.SENHA }, { 'X-Forwarded-Proto': 'https', 'X-Forwarded-For': '203.0.113.9' })
          .then(function (r) {
            igual(r.status, 200);
            falso(/;\s*Secure/i.test(r.cookieBruto || ''), 'sem proxy confiável não é Secure: ' + r.cookieBruto);
            return cli.post('/api/entrar', { login: 'admin', senha: 'errada-errada' }, { 'X-Forwarded-For': '198.51.100.7' });
          }).then(function () { return cli.get('/api/auditoria/acessos?evento=entrada_recusada'); })
          .then(function (r) {
            falso(r.corpo.eventos.some(function (e) { return e.ip === '198.51.100.7'; }), 'o IP escrito pelo cliente não entra');
          });
      }, pasta);
    });
  });

  /* ====================================================================== */
  describe('Respostas comprimidas', function () {

    it('o estado vai em gzip quando o navegador aceita, e descomprimido é o mesmo; sem aceitar, vai puro', function () {
      var pasta = U.pastaTemp();
      return U.comServidor(function (cli, srv, p, base) {
        return U.chefe(cli, pasta).then(function () {
          return pegarCru(base, '/api/estado', { Cookie: cli.cookie(), 'X-Anestesia': '1', 'Accept-Encoding': 'gzip' });
        }).then(function (g) {
          igual(g.status, 200);
          igual(g.headers['content-encoding'], 'gzip');
          return pegarCru(base, '/api/estado', { Cookie: cli.cookie(), 'X-Anestesia': '1' }).then(function (puro) {
            igual(puro.headers['content-encoding'], undefined);
            var a = JSON.parse(zlib.gunzipSync(g.corpo).toString('utf8')), b = JSON.parse(puro.corpo.toString('utf8'));
            // salvoEm é a hora de cada resposta: dois pedidos que atravessam a virada do segundo diferem nele.
            delete a.estado.salvoEm;
            delete b.estado.salvoEm;
            igual(core.jsonCanonico(a.estado), core.jsonCanonico(b.estado), 'o mesmo estado');
            verdadeiro(g.corpo.length < puro.corpo.length / 3, 'comprimiu de verdade: ' + g.corpo.length + ' contra ' + puro.corpo.length);
          });
        });
      }, pasta);
    });

    it('os arquivos do sistema (js) também, e voltam idênticos', function () {
      return U.comServidor(function (cli, srv, p, base) {
        return pegarCru(base, '/core/12_store.js', { 'Accept-Encoding': 'gzip, deflate' }).then(function (g) {
          igual(g.status, 200);
          igual(g.headers['content-encoding'], 'gzip');
          var original = fs.readFileSync(path.join(__dirname, '..', 'core', '12_store.js'));
          igual(zlib.gunzipSync(g.corpo).equals(original), true);
          return pegarCru(base, '/core/12_store.js');
        }).then(function (puro) {
          igual(puro.headers['content-encoding'], undefined);
          verdadeiro(Number(puro.headers['content-length']) > 1000);
        });
      });
    });
  });

  /* ====================================================================== */
  describe('Argumentos de comando e exames anexados', function () {

    function contexto() { return { agora: core.agoraTexto(new Date()), semente: 'q' + Math.random().toString(36).slice(2, 10) }; }

    it('chave __proto__/constructor/prototype nos argumentos, ou fundo demais, é recusado (400) antes de rodar', function () {
      var pasta = U.pastaTemp();
      return U.comServidor(function (cli) {
        var fundo = {}, no = fundo;
        for (var i = 0; i < 20; i++) { no.x = {}; no = no.x; }
        return U.chefe(cli, pasta).then(function () { return cli.get('/api/estado'); }).then(function (r) {
          var base = { nome: 'salvarAnestesista', contexto: contexto(), base: r.corpo.revisao, hoje: r.corpo.hoje };
          var casos = [
            JSON.parse('{"__proto__":{"polui":1},"nome":"Fulano Teste"}'),
            JSON.parse('{"constructor":{"prototype":{"polui":1}},"nome":"Fulano Teste"}'),
            { nome: 'Fulano Teste', prototype: { a: 1 } },
            { nome: fundo }
          ];
          var seguinte = Promise.resolve();
          casos.forEach(function (c, i) {
            seguinte = seguinte.then(function () {
              return cli.post('/api/comando', Object.assign({ args: [c] }, base)).then(function (x) {
                igual(x.status, 400, 'caso ' + i + ': ' + JSON.stringify(x.corpo));
                igual(x.corpo.erro, 'Argumentos inválidos.');
              });
            });
          });
          return seguinte.then(function () { return cli.get('/api/estado'); });
        }).then(function (r) {
          igual(r.corpo.estado.anestesistas.length, 15, 'nada foi gravado');
          igual(({}).polui, undefined);
        });
      }, pasta);
    });

    it('cada avaliação aceita no máximo 30 exames', function () {
      var pasta = U.pastaTemp();
      return U.comServidor(function (cli) {
        var uid;
        return U.chefe(cli, pasta).then(function () {
          return U.comando(cli, 'adicionarCirurgia', Object.assign({}, U.CIRURGIA, { avaliacaoNec: 'Sim' }));
        }).then(function (x) {
          verdadeiro(x.resp.corpo.ok, JSON.stringify(x.resp.corpo));
          return cli.get('/api/estado');
        }).then(function (r) {
          uid = r.corpo.estado.avaliacoes[0].uid;
          verdadeiro(uid, 'a avaliação tem de ter uid');
          var seguinte = Promise.resolve();
          for (var i = 0; i < 30; i++) {
            (function (n) {
              seguinte = seguinte.then(function () {
                return cli.post('/api/anexos', U.PDF, { 'X-Uid-Avaliacao': uid, 'X-Nome': encodeURIComponent('exame' + n + '.pdf') }).then(function (x) {
                  igual(x.status, 200, 'anexo ' + n + ': ' + JSON.stringify(x.corpo));
                });
              });
            })(i);
          }
          return seguinte;
        }).then(function () {
          return cli.post('/api/anexos', U.PDF, { 'X-Uid-Avaliacao': uid, 'X-Nome': 'um-a-mais.pdf' });
        }).then(function (x) {
          igual(x.status, 400);
          verdadeiro(/limite é 30/.test(x.corpo.erro), x.corpo.erro);
        });
      }, pasta);
    });
  });
};
