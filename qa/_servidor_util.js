/**
 * Ajudas dos testes que sobem o servidor de verdade (qa/26 em diante).
 * Cada cenário sobe um servidor próprio, numa porta livre e numa pasta temporária,
 * e conversa com ele por HTTP como o navegador conversaria.
 */
'use strict';

var fs = require('fs');
var os = require('os');
var path = require('path');
var vm = require('vm');

module.exports = function (core) {
  var RAIZ = path.join(__dirname, '..');
  var criarServidor = require(path.join(RAIZ, 'server', 'servidor.js')).criarServidor;
  var HOJE = '2026-10-05';
  var SENHA = 'senha-forte-1';

  var ctxDados = vm.createContext(Object.assign({}, core, { UI: {}, console: console }));
  vm.runInContext(fs.readFileSync(path.join(RAIZ, 'webapp', 'js', '03_dados.js'), 'utf8'), ctxDados);
  var DADOS = vm.runInContext('DADOS', ctxDados);

  function pastaTemp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'anestesia-qa-')); }

  /** Sobe um servidor, roda `fn(cli, srv, pasta, base)` e desliga (mesmo se falhar). */
  function comServidor(fn, pasta, opcoes) {
    pasta = pasta || pastaTemp();
    // custoSenhaParaTestes: scrypt barato (só aqui; o servidor de verdade usa o custo cheio).
    var srv = criarServidor(Object.assign({ dados: pasta, porta: 0, host: '127.0.0.1', silencioso: true, hoje: HOJE, custoSenhaParaTestes: 1024 }, opcoes || {}));
    return srv.iniciar().then(function (info) {
      var base = 'http://127.0.0.1:' + info.porta;
      return Promise.resolve(fn(cliente(base), srv, pasta, base)).then(
        function (v) { return srv.fechar().then(function () { return v; }); },
        function (e) { return srv.fechar().then(function () { throw e; }); });
    });
  }

  /** Um "navegador": guarda o cookie e manda os cabeçalhos de sempre. */
  function cliente(base) {
    var cookie = '';
    function pedir(metodo, caminho, corpo, extra) {
      // Connection: close — cada pedido abre a sua conexão. Sem isto, uma conexão parada que o servidor fecha no mesmo instante em que o cliente a reaproveita (o que acontece quando um teste pesado trava o processo por segundos) vira "fetch failed" à toa.
      var h = Object.assign({ 'X-Anestesia': '1', Connection: 'close' }, extra || {});
      if (cookie) h.Cookie = cookie;
      var body;
      if (corpo !== undefined) {
        if (Buffer.isBuffer(corpo)) body = corpo;
        else { body = JSON.stringify(corpo); h['Content-Type'] = 'application/json'; }
      }
      return fetch(base + caminho, { method: metodo, headers: h, body: body, redirect: 'manual' }).then(function (r) {
        var sc = r.headers.get('set-cookie');
        if (sc) cookie = sc.split(';')[0];
        var tipo = r.headers.get('content-type') || '';
        var leitura = /json/.test(tipo) ? r.json() : r.arrayBuffer().then(function (b) { return Buffer.from(b); });
        return leitura.then(function (c) { return { status: r.status, corpo: c, headers: r.headers, cookieBruto: sc }; });
      });
    }
    return {
      base: base,
      get: function (c, h) { return pedir('GET', c, undefined, h); },
      post: function (c, corpo, h) { return pedir('POST', c, corpo, h); },
      del: function (c, h) { return pedir('DELETE', c, undefined, h); },
      cookie: function () { return cookie; },
      usarCookie: function (c) { cookie = c; }
    };
  }

  function codigoDe(pasta) {
    return /: ([0-9A-F]+)/.exec(fs.readFileSync(path.join(pasta, 'PRIMEIRO_ACESSO.txt'), 'utf8'))[1];
  }

  /** Cria o Anestesista chefe (login "admin") e deixa o cliente logado. */
  function chefe(cli, pasta) {
    return cli.post('/api/primeiro-acesso', { codigo: codigoDe(pasta), login: 'admin', nome: 'Chefe da Clínica', senha: SENHA });
  }

  /** O chefe cria um usuário e devolve um cliente novo, já logado como ele. */
  function novoUsuario(cliChefe, base, login, nome, papel) {
    var cli = cliente(base);
    return cliChefe.post('/api/usuarios', { novo: true, login: login, nome: nome, papel: papel, senha: SENHA }).then(function (r) {
      if (r.status !== 200) throw new Error('não criou ' + login + ': ' + JSON.stringify(r.corpo));
      return cli.post('/api/entrar', { login: login, senha: SENHA });
    }).then(function (r) {
      if (r.status !== 200) throw new Error('não entrou como ' + login + ': ' + JSON.stringify(r.corpo));
      return cli;
    });
  }

  var contador = 0;

  /**
   * Manda um comando como a tela mandaria, com um estado novo lido do servidor agora
   * (então a base nunca está velha). Devolve { local, resp }.
   */
  function comando(cli, nome) {
    var args = Array.prototype.slice.call(arguments, 2);
    return cli.get('/api/estado').then(function (r) {
      var st = core.criarStore(DADOS.sanearEstado(r.corpo.estado), { usuario: r.corpo.usuario.nome, login: r.corpo.usuario.login, horizonte: 'movel', hoje: r.corpo.hoje });
      st.recalcular();
      var ctx = { agora: core.agoraTexto(new Date()), semente: 'q' + (++contador) + 'x' + Math.random().toString(36).slice(2, 8) };
      var local = core.executarComContexto(ctx, function () { return st[nome].apply(st, JSON.parse(JSON.stringify(args))); });
      return cli.post('/api/comando', { nome: nome, args: args, contexto: ctx, base: r.corpo.revisao, hoje: r.corpo.hoje, cliente: 'qa' })
        .then(function (resp) { return { local: local, resp: resp, store: st }; });
    });
  }

  /** Lê o fluxo de eventos (SSE) até `pronto(eventos)` ou até o tempo acabar. */
  function ouvirEventos(base, cookie, pronto, ms) {
    var controle = new AbortController();
    var eventos = [];
    // O tempo é só a rede de segurança; o normal é parar assim que o evento esperado chega.
    var temporizador = setTimeout(function () { controle.abort(); }, ms || 30000);
    return fetch(base + '/api/eventos', { headers: { Cookie: cookie, Connection: 'close' }, signal: controle.signal }).then(function (r) {
      var leitor = r.body.getReader(), texto = '';
      function ler() {
        return leitor.read().then(function (p) {
          if (p.done) return;
          texto += Buffer.from(p.value).toString();
          eventos = texto.split('\n\n').filter(Boolean).map(function (bloco) {
            var ev = /event: (\w+)/.exec(bloco), da = /data: (.*)/.exec(bloco);
            return ev ? { evento: ev[1], dados: da ? JSON.parse(da[1]) : null } : null;
          }).filter(Boolean);
          if (pronto(eventos)) { controle.abort(); return; }
          return ler();
        });
      }
      return { fim: ler().catch(function () { /* abortado */ }).then(function () { clearTimeout(temporizador); return eventos; }) };
    });
  }

  var CIRURGIA = { status: 'Realizada', data: HOJE, inicioPrev: '07:00', fimPrev: '09:00', paciente: 'Paciente Perfis',
    procedimento: 'Rinoplastia', anestesista: 'Fabrício Tavares', avaliacaoNec: 'Não' };
  var PDF = Buffer.from('%PDF-1.4\n1 0 obj\n<< >>\nendobj\ntrailer\n<< >>\n%%EOF\n');

  return {
    HOJE: HOJE, SENHA: SENHA, DADOS: DADOS, CIRURGIA: CIRURGIA, PDF: PDF,
    pastaTemp: pastaTemp, comServidor: comServidor, cliente: cliente, codigoDe: codigoDe,
    chefe: chefe, novoUsuario: novoUsuario, comando: comando, ouvirEventos: ouvirEventos
  };
};
