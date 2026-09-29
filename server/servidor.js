#!/usr/bin/env node
/**
 * ============================================================================
 * SERVIDOR — O sistema em rede, para os computadores da clínica
 * ============================================================================
 * Node puro, sem "npm install". Na pasta do projeto:
 *     node server/servidor.js                    (porta 8080, toda a rede local)
 *     node server/servidor.js --porta 9000 --dados D:\anestesia
 * ou dois cliques em "Abrir servidor da clínica.bat".
 *
 * COMO OS DADOS FICAM IGUAIS EM TODOS OS COMPUTADORES
 * O servidor guarda o estado oficial. Cada tela aplica a alteração na hora
 * (a resposta é imediata) e manda o COMANDO ao servidor: o nome da operação
 * do store, os argumentos, a hora e a semente dos identificadores. O
 * servidor reexecuta o comando com o mesmo core, a mesma hora e a mesma
 * semente — e chega ao mesmo estado; depois avisa as outras telas (SSE), que
 * reexecutam também. A revisão numerada mostra quem ficou para trás:
 *   - comando que só muda campos de um registro existente é aceito mesmo se
 *     outra pessoa gravou no meio (a tela recarrega depois, para ficar igual);
 *   - comando que cria, remove, aponta por posição ou assina é recusado se
 *     houve gravação no meio — a tela recarrega e avisa para refazer.
 * A alteração de uma pessoa nunca apaga a de outra em silêncio.
 *
 * SEGURANÇA
 *   - login com senha (scrypt) e sessão em cookie HttpOnly + SameSite=Strict;
 *   - chamada que muda dado exige o cabeçalho X-Anestesia e, quando o
 *     navegador manda Origin, a mesma origem (contra CSRF);
 *   - serve só webapp/ e core/: a pasta de dados nunca sai pela rede;
 *   - papel "admin" para usuários, cadastro, financeiro e backup;
 *   - HTTPS: com <dados>/https/chave.pem e certificado.pem, sobe em https.
 *     Sem eles, use só em rede local confiável (Wi-Fi com senha).
 * ============================================================================
 */
'use strict';

var http = require('http');
var https = require('https');
var fs = require('fs');
var path = require('path');
var vm = require('vm');
var os = require('os');
var crypto = require('crypto');

var core = require('../core');
var criarArmazem = require('./armazem').criarArmazem;
var criarContas = require('./contas').criarContas;

var RAIZ = path.join(__dirname, '..');
var PUBLICAS = ['webapp', 'core'];
var COOKIE = 'anestesia_sessao';
var POLITICA = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
  "img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; " +
  "base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
var TIPOS = {
  '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2'
};
var LIMITE_BACKUP = 200 * 1024 * 1024;   // backup completo, com PDFs em base64
var LIMITE_COMANDO = 4 * 1024 * 1024;
var LIMITE_PDF = 25 * 1024 * 1024;
var MAX_DIARIO_MEMORIA = 5000;
var DESVIO_MAXIMO_MS = 5 * 60 * 1000;
var AGORA_TEXTO = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;
var SEMENTE = /^[a-z0-9]{6,24}$/;

/* ================================================================ ajuda */

/** O código de formatos do web app (saneamento, backup, seed) — o mesmo, não uma cópia. */
function carregarDados() {
  var ctx = vm.createContext(Object.assign({}, core, {
    UI: { baixarTexto: function () {} }, console: console,
    Blob: Blob, TextEncoder: TextEncoder, DataView: DataView, ArrayBuffer: ArrayBuffer, Uint8Array: Uint8Array
  }));
  ['seed.js', '03_dados.js'].forEach(function (f) {
    vm.runInContext(fs.readFileSync(path.join(RAIZ, 'webapp', 'js', f), 'utf8'), ctx, { filename: f });
  });
  return vm.runInContext('DADOS', ctx);
}

function dentro(pasta, raiz) {
  var rel = path.relative(raiz, pasta);
  return rel === '' || (!!rel && rel.split(path.sep)[0] !== '..' && !path.isAbsolute(rel));
}

function cabecalhos(extras) {
  return Object.assign({
    'Content-Security-Policy': POLITICA,
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cache-Control': 'no-store'
  }, extras || {});
}

function json(res, status, obj, extras) {
  var corpo = JSON.stringify(obj);
  res.writeHead(status, cabecalhos(Object.assign({ 'Content-Type': 'application/json; charset=utf-8' }, extras || {})));
  res.end(corpo);
}

function falha(status, msg) { var e = new Error(msg); e.status = status; return e; }

function lerCorpo(req, limite) {
  return new Promise(function (resolver, rejeitar) {
    var partes = [], total = 0, acabou = false;
    req.on('data', function (c) {
      if (acabou) return;
      total += c.length;
      if (total > limite) { acabou = true; rejeitar(falha(413, 'Envio grande demais.')); req.resume(); return; }
      partes.push(c);
    });
    req.on('end', function () { if (!acabou) { acabou = true; resolver(Buffer.concat(partes)); } });
    req.on('error', function (e) { if (!acabou) { acabou = true; rejeitar(e); } });
  });
}

function lerJson(req, limite) {
  return lerCorpo(req, limite).then(function (buf) {
    try { return JSON.parse(buf.toString('utf8') || '{}'); } catch (e) { throw falha(400, 'Pedido ilegível.'); }
  });
}

function lerCookie(req, nome) {
  var achado = null;
  String(req.headers.cookie || '').split(';').forEach(function (p) {
    var i = p.indexOf('=');
    if (i > 0 && p.slice(0, i).trim() === nome) achado = p.slice(i + 1).trim();
  });
  return achado;
}

/** Contra CSRF: cabeçalho próprio (formulário de outro site não consegue mandar) e mesma origem. */
function origemValida(req) {
  if (req.headers['x-anestesia'] !== '1') return false;
  var o = req.headers.origin;
  if (!o) return true;
  try { return new URL(o).host === req.headers.host; } catch (e) { return false; }
}

function enderecosDaRede() {
  var saida = [];
  var ifs = os.networkInterfaces();
  Object.keys(ifs).forEach(function (k) {
    (ifs[k] || []).forEach(function (a) { if (a.family === 'IPv4' && !a.internal) saida.push(a.address); });
  });
  return saida;
}

/* ============================================================ servidor */

/**
 * Monta o servidor (sem abrir a porta). `opcoes`: { dados (pasta),
 * porta, host, silencioso, hoje (só testes) }. Devolve
 * { iniciar() -> Promise<{ url, porta }>, fechar() -> Promise }.
 */
function criarServidor(opcoes) {
  opcoes = opcoes || {};
  var pastaDados = path.resolve(opcoes.dados || path.join(RAIZ, 'dados_servidor'));
  PUBLICAS.forEach(function (p) {
    if (dentro(pastaDados, path.join(RAIZ, p))) throw new Error('A pasta de dados não pode ficar dentro de ' + p + '/ (seria servida na rede).');
  });

  var registrar = opcoes.silencioso ? function () {} : function (m) {
    console.log(new Date().toTimeString().slice(0, 8) + '  ' + m);
  };
  var DADOS = carregarDados();
  var armazem = criarArmazem(pastaDados, core);
  var contas = criarContas(pastaDados);
  var arqAcessos = path.join(pastaDados, 'acessos.log');

  function anotarAcesso(texto, req) {
    var linha = new Date().toISOString() + '  ' + (req ? (req.socket.remoteAddress || '?') + '  ' : '') + texto + '\n';
    try { fs.appendFileSync(arqAcessos, linha); } catch (e) { /* segue */ }
    registrar(texto);
  }

  var hojeAtual = opcoes.hoje || core.hojeISO();
  var revisao = 0;
  var store = null;
  var diario = [];                 // comandos desde a última troca do estado inteiro
  var revisaoInicioDiario = 0;     // antes disto, só recarregando
  var fluxos = new Set();          // conexões SSE abertas

  function montarStore(estado) {
    var st = core.criarStore(DADOS.sanearEstado(estado), { usuario: 'sistema', horizonte: 'movel', hoje: hojeAtual });
    st.recalcular();
    return st;
  }

  function aplicar(entrada) {
    store.usuario = entrada.usuario;
    return core.executarComContexto(entrada.contexto, function () {
      return store[entrada.nome].apply(store, entrada.args);
    });
  }

  function okDoResultado(nome, r) { return nome === 'reparar' ? true : !!(r && r.ok); }

  /* ------------------------------------------------------------ partida */

  var lido = armazem.lerEstado();
  if (lido) {
    store = montarStore(lido.estado);
    revisao = lido.revisao;
    if (lido.recuperadoDe) registrar('ATENÇÃO: estado.json estava ilegível; recomeçou da cópia ' + lido.recuperadoDe + '.');
  } else {
    store = montarStore(DADOS.estadoDoSeed().estado);
    armazem.gravarEstado(0, DADOS.enxugar(store.estado));
  }
  // Comandos gravados no diário depois do último estado (queda de luz, por exemplo).
  var aReaplicar = armazem.lerDiario(revisao);
  aReaplicar.forEach(function (c) {
    if (c.revisao !== revisao + 1) return;
    aplicar(c);
    revisao = c.revisao;
  });
  if (aReaplicar.length) {
    armazem.gravarEstado(revisao, DADOS.enxugar(store.estado));
    registrar(aReaplicar.length + ' comando(s) do diário reaplicado(s) na partida.');
  }
  armazem.podarDiario(revisao);
  revisaoInicioDiario = revisao;

  /* -------------------------------------------------------- gravação */

  var gravacaoAgendada = null;
  function gravarAgora() {
    if (gravacaoAgendada) { clearTimeout(gravacaoAgendada); gravacaoAgendada = null; }
    var enxuto = DADOS.enxugar(store.estado);
    armazem.gravarEstado(revisao, enxuto);
    armazem.podarDiario(revisao);
    if (armazem.copiaDoDia(revisao, enxuto)) registrar('Cópia do dia gravada.');
  }
  function agendarGravacao() {
    if (gravacaoAgendada) return;
    gravacaoAgendada = setTimeout(gravarAgora, 1500);
  }

  /* ------------------------------------------------------------- SSE */

  function emitir(tipo, dados) {
    var msg = 'event: ' + tipo + '\ndata: ' + JSON.stringify(dados) + '\n\n';
    fluxos.forEach(function (f) { try { f.res.write(msg); } catch (e) { /* conexão caiu */ } });
  }

  function fecharFluxosDe(login) {
    fluxos.forEach(function (f) { if (f.login === login) { try { f.res.end(); } catch (e) { /* ok */ } fluxos.delete(f); } });
  }

  var batida = setInterval(function () {
    fluxos.forEach(function (f) { try { f.res.write(': ping\n\n'); } catch (e) { /* ok */ } });
  }, 25000);
  batida.unref();

  /** Troca o estado inteiro (importar, apagar tudo, restaurar cópia): marco antes, telas recarregam. */
  function trocarEstadoInteiro(novoEstado, motivo, quem) {
    armazem.marco('antes-de-' + motivo, revisao, DADOS.enxugar(store.estado));
    store = montarStore(novoEstado);
    store.transacao(function (st, api) {
      api.registrar([core.novaEntradaLog({ usuario: quem.nome, aba: 'SISTEMA', idCirurgia: '', campo: 'ESTADO SUBSTITUÍDO', de: '', para: motivo })]);
      return { ok: true, semRecalculo: true };
    });
    revisao++;
    diario = [];
    revisaoInicioDiario = revisao;
    gravarAgora();
    emitir('recarregar', { revisao: revisao, motivo: motivo, usuario: quem.nome });
    anotarAcesso('estado substituído (' + motivo + ') por ' + quem.login);
  }

  // Virada do dia: o horizonte da escala e a cópia do dia dependem de "hoje".
  var relogioDia = setInterval(function () {
    var h = core.hojeISO();
    if (opcoes.hoje || h === hojeAtual) return;
    hojeAtual = h;
    store = montarStore(DADOS.enxugar(store.estado));
    gravarAgora();
    emitir('recarregar', { revisao: revisao, motivo: 'dia' });
  }, 60000);
  relogioDia.unref();

  /* -------------------------------------------------------- comandos */

  /**
   * Um comando vindo de uma tela. Devolve [status, corpo].
   * corpo pedido: { nome, args, contexto:{agora, semente}, base, hoje, cliente }
   */
  function executarComando(c, eu) {
    var nome = String(c.nome || '');
    if (core.MUTACOES_STORE.indexOf(nome) < 0) return [400, { erro: 'Operação desconhecida.' }];
    if (core.MUTACOES_SO_ADMIN.indexOf(nome) >= 0 && eu.papel !== 'admin') {
      return [403, { erro: 'Só o administrador do sistema pode fazer isso.' }];
    }
    if (!Array.isArray(c.args) || c.args.length > 6) return [400, { erro: 'Argumentos inválidos.' }];
    var ctx = c.contexto || {};
    if (!AGORA_TEXTO.test(String(ctx.agora)) || !SEMENTE.test(String(ctx.semente))) return [400, { erro: 'Contexto inválido.' }];
    var desvio = Math.abs(new Date(String(ctx.agora).replace(' ', 'T')).getTime() - Date.now());
    if (!(desvio <= DESVIO_MAXIMO_MS)) return [409, { motivo: 'relogio', revisao: revisao }];
    if (c.hoje !== hojeAtual) return [409, { motivo: 'dia', revisao: revisao, hoje: hojeAtual }];

    var concorrente = Number(c.base) !== revisao;
    if (concorrente && core.MUTACOES_SEGURAS_EM_CONCORRENCIA.indexOf(nome) < 0) {
      return [409, { motivo: 'concorrencia', revisao: revisao }];
    }

    var entrada = { revisao: revisao + 1, nome: nome, args: c.args, contexto: { agora: ctx.agora, semente: ctx.semente },
      usuario: eu.nome, login: eu.login, hoje: hojeAtual, cliente: String(c.cliente || '').slice(0, 40) };
    var r;
    try {
      r = aplicar(entrada);
    } catch (e) {
      return [500, { erro: 'Erro interno ao aplicar: ' + (e && e.message) }];
    }
    if (!okDoResultado(nome, r)) {
      return [200, { ok: false, erros: (r && r.erros) || [{ msg: 'Operação recusada.' }], revisao: revisao }];
    }

    revisao = entrada.revisao;
    armazem.anotarComando(entrada);          // no disco antes de responder
    diario.push(entrada);
    if (diario.length > MAX_DIARIO_MEMORIA) {
      diario.splice(0, diario.length - MAX_DIARIO_MEMORIA);
      revisaoInicioDiario = diario[0].revisao - 1;
    }
    agendarGravacao();

    // Avaliações apagadas em cascata levam os PDFs de exame junto (vão para removidos/).
    var removidos = 0;
    ((r && r.removidas) || []).forEach(function (a) { if (a.uid) removidos += armazem.removerAnexosDaAvaliacao(a.uid); });
    if (removidos) emitir('anexos', { cliente: '' });

    emitir('comando', { revisao: revisao, usuario: eu.nome, cliente: entrada.cliente, nome: nome });
    return [200, { ok: true, revisao: revisao, concorrente: concorrente, avisos: (r && r.avisos) || [] }];
  }

  /* ---------------------------------------------------------- anexos */

  function receberAnexo(req, eu) {
    var uid = String(req.headers['x-uid-avaliacao'] || '');
    var aval = store.estado.avaliacoes.filter(function (a) { return a.uid && a.uid === uid; })[0];
    if (!aval) return Promise.resolve([400, { erro: 'Avaliação não encontrada — recarregue a página.' }]);
    var nome;
    try { nome = decodeURIComponent(String(req.headers['x-nome'] || 'exame.pdf')); } catch (e) { nome = 'exame.pdf'; }
    return lerCorpo(req, LIMITE_PDF).then(function (buf) {
      if (!buf.length) return [400, { erro: 'Arquivo vazio.' }];
      if (buf.subarray(0, 1024).toString('latin1').indexOf('%PDF-') < 0) return [400, { erro: '"' + nome + '" não é um PDF.' }];
      var meta = {
        id: 'EX' + Date.now().toString(36) + crypto.randomBytes(5).toString('hex'),
        uidAvaliacao: uid, idAvaliacao: String(aval.id || ''), nome: nome.replace(/[\u0000-\u001f]/g, '').slice(0, 200) || 'exame.pdf',
        tamanho: buf.length, tipo: 'application/pdf', criadoEm: new Date().toISOString(), criadoPor: eu.nome
      };
      armazem.salvarAnexo(meta, buf);
      emitir('anexos', { cliente: String(req.headers['x-cliente'] || '') });
      return [200, { meta: meta }];
    });
  }

  /* ----------------------------------------------------------- rotas */

  function api(req, res, caminho, busca) {
    var metodo = req.method;
    var token = lerCookie(req, COOKIE);
    if (metodo !== 'GET' && !origemValida(req)) return Promise.resolve(json(res, 403, { erro: 'Pedido recusado (origem).' }));
    var eu = contas.sessao(token);

    function responder(par) { json(res, par[0], par[1]); }
    function cookie(t, apagar) {
      return COOKIE + '=' + (apagar ? '' : t) + '; Path=/; HttpOnly; SameSite=Strict' + (usaHttps ? '; Secure' : '') +
        (apagar ? '; Max-Age=0' : '; Max-Age=' + 7 * 86400);
    }

    /* --- sem sessão --- */
    if (caminho === '/api/eu' && metodo === 'GET') {
      if (!eu) return Promise.resolve(json(res, 401, { primeiroAcesso: !contas.temUsuarios() }));
      return Promise.resolve(json(res, 200, { usuario: eu, hoje: hojeAtual, revisao: revisao }));
    }
    if (caminho === '/api/entrar' && metodo === 'POST') {
      return lerJson(req, 16384).then(function (c) {
        var r = contas.entrar(c.login, c.senha, req.socket.remoteAddress || '');
        if (!r.ok) {
          anotarAcesso('entrada recusada: ' + String(c.login || '').slice(0, 30) + (r.travado ? ' (travado)' : ''), req);
          return json(res, r.travado ? 429 : 401, { erro: r.travado
            ? 'Muitas tentativas erradas. Espere 15 minutos e tente de novo.' : 'Login ou senha não conferem.' });
        }
        anotarAcesso('entrou: ' + r.usuario.login, req);
        json(res, 200, { usuario: r.usuario }, { 'Set-Cookie': cookie(contas.iniciarSessao(r.usuario.login)) });
      });
    }
    if (caminho === '/api/primeiro-acesso' && metodo === 'POST') {
      return lerJson(req, 16384).then(function (c) {
        var codigo = contas.codigoPrimeiroAcesso();
        if (!codigo) return json(res, 409, { erro: 'O administrador já foi criado. Entre com login e senha.' });
        var informado = Buffer.from(String(c.codigo || '').trim().toUpperCase());
        var certo = Buffer.from(codigo);
        if (informado.length !== certo.length || !crypto.timingSafeEqual(informado, certo)) {
          anotarAcesso('primeiro acesso: código errado', req);
          return json(res, 403, { erro: 'Código de primeiro acesso não confere. Ele aparece na janela do servidor.' });
        }
        var r = contas.criarUsuario({ login: c.login, nome: c.nome, senha: c.senha, papel: 'admin' });
        if (!r.ok) return json(res, 400, { erros: r.erros });
        anotarAcesso('administrador criado: ' + r.usuario.login, req);
        json(res, 200, { usuario: r.usuario }, { 'Set-Cookie': cookie(contas.iniciarSessao(r.usuario.login)) });
      });
    }
    if (caminho === '/api/sair' && metodo === 'POST') {
      if (eu) anotarAcesso('saiu: ' + eu.login, req);
      contas.encerrarSessao(token);
      return Promise.resolve(json(res, 200, { ok: true }, { 'Set-Cookie': cookie('', true) }));
    }

    if (!eu) return Promise.resolve(json(res, 401, { erro: 'Sessão encerrada. Entre de novo.' }));
    var admin = eu.papel === 'admin';
    function soAdmin() { if (!admin) json(res, 403, { erro: 'Só o administrador do sistema pode fazer isso.' }); return admin; }

    /* --- dados --- */
    if (caminho === '/api/estado' && metodo === 'GET') {
      return Promise.resolve(json(res, 200, {
        revisao: revisao, hoje: hojeAtual, agora: Date.now(), usuario: eu, estado: DADOS.enxugar(store.estado)
      }));
    }
    if (caminho === '/api/comando' && metodo === 'POST') {
      return lerJson(req, LIMITE_COMANDO).then(function (c) { responder(executarComando(c, eu)); });
    }
    if (caminho === '/api/comandos' && metodo === 'GET') {
      var desde = Number(busca.get('desde'));
      if (!(desde >= revisaoInicioDiario) || desde > revisao) return Promise.resolve(json(res, 200, { recarregar: true, revisao: revisao }));
      return Promise.resolve(json(res, 200, {
        revisao: revisao, hoje: hojeAtual,
        comandos: diario.filter(function (d) { return d.revisao > desde; })
      }));
    }
    if (caminho === '/api/eventos' && metodo === 'GET') {
      res.writeHead(200, cabecalhos({ 'Content-Type': 'text/event-stream; charset=utf-8', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' }));
      res.write('retry: 3000\n\n');
      res.write('event: ola\ndata: ' + JSON.stringify({ revisao: revisao, hoje: hojeAtual }) + '\n\n');
      var f = { res: res, login: eu.login };
      fluxos.add(f);
      req.on('close', function () { fluxos.delete(f); });
      return Promise.resolve();
    }

    /* --- anexos --- */
    var mAnexo = /^\/api\/anexos\/([A-Za-z0-9]+)$/.exec(caminho);
    if (caminho === '/api/anexos' && metodo === 'GET') return Promise.resolve(json(res, 200, { metas: armazem.metasAnexos() }));
    if (caminho === '/api/anexos' && metodo === 'POST') return receberAnexo(req, eu).then(responder);
    if (mAnexo && metodo === 'GET') {
      if (!armazem.ID_ANEXO.test(mAnexo[1])) return Promise.resolve(json(res, 404, { erro: 'Arquivo não encontrado.' }));
      var buf = armazem.lerAnexo(mAnexo[1]);
      if (!buf) return Promise.resolve(json(res, 404, { erro: 'Arquivo não encontrado.' }));
      res.writeHead(200, cabecalhos({ 'Content-Type': 'application/pdf', 'Content-Length': buf.length,
        'Content-Disposition': 'inline; filename="exame.pdf"' }));
      res.end(buf);
      return Promise.resolve();
    }
    if (mAnexo && metodo === 'DELETE') {
      if (!armazem.ID_ANEXO.test(mAnexo[1])) return Promise.resolve(json(res, 404, { erro: 'Arquivo não encontrado.' }));
      var n = armazem.removerAnexos([mAnexo[1]]);
      if (n) emitir('anexos', { cliente: String(req.headers['x-cliente'] || '') });
      return Promise.resolve(json(res, 200, { removidos: n }));
    }

    /* --- senha própria --- */
    if (caminho === '/api/minha-senha' && metodo === 'POST') {
      return lerJson(req, 16384).then(function (c) {
        var r = contas.trocarSenha(eu.login, c.atual, c.nova);
        if (r.ok) anotarAcesso('trocou a própria senha: ' + eu.login, req);
        json(res, r.ok ? 200 : 400, r);
      });
    }

    /* --- administração --- */
    if (caminho === '/api/usuarios' && metodo === 'GET') {
      if (!soAdmin()) return Promise.resolve();
      return Promise.resolve(json(res, 200, { usuarios: contas.listar() }));
    }
    if (caminho === '/api/usuarios' && metodo === 'POST') {
      if (!soAdmin()) return Promise.resolve();
      return lerJson(req, 16384).then(function (c) {
        var r = c.novo ? contas.criarUsuario(c) : contas.alterarUsuario(c.login, c);
        if (r.ok) {
          anotarAcesso((c.novo ? 'usuário criado: ' : 'usuário alterado: ') + r.usuario.login + ' por ' + eu.login, req);
          if (!r.usuario.ativo || c.senha) fecharFluxosDe(r.usuario.login);
        }
        json(res, r.ok ? 200 : 400, r);
      });
    }
    if (caminho === '/api/backup' && metodo === 'GET') {
      if (!soAdmin()) return Promise.resolve();
      var comPdfs = busca.get('pdfs') === '1';
      var anexos = comPdfs ? armazem.metasAnexos().map(function (m) {
        var b = armazem.lerAnexo(m.id);
        return b ? { meta: m, conteudo: b.toString('base64') } : null;
      }).filter(Boolean) : null;
      var nome = 'anestesia_backup_' + hojeAtual + (comPdfs ? '_com_pdfs' : '') + '.json';
      res.writeHead(200, cabecalhos({ 'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': 'attachment; filename="' + nome + '"' }));
      res.end(DADOS.exportarJSON(store.estado, anexos));
      anotarAcesso('backup baixado' + (comPdfs ? ' (com PDFs)' : '') + ' por ' + eu.login, req);
      return Promise.resolve();
    }
    if (caminho === '/api/importar' && metodo === 'POST') {
      if (!soAdmin()) return Promise.resolve();
      return lerCorpo(req, LIMITE_BACKUP).then(function (buf) {
        var r = DADOS.importarJSON(buf.toString('utf8'));
        if (!r.ok) return json(res, 400, { erro: r.erro });
        var existentes = {};
        armazem.metasAnexos().forEach(function (m) { existentes[m.id] = true; });
        var pdfs = 0;
        (r.anexos || []).forEach(function (x) {
          if (existentes[x.meta.id] || !armazem.ID_ANEXO.test(x.meta.id)) return;
          var bytes = Buffer.from(x.conteudo, 'base64');
          if (bytes.subarray(0, 1024).toString('latin1').indexOf('%PDF-') < 0) return;
          armazem.salvarAnexo(Object.assign({ tipo: 'application/pdf' }, x.meta, { tamanho: bytes.length }), bytes);
          pdfs++;
        });
        trocarEstadoInteiro(r.estado, 'importar', eu);
        if (pdfs) emitir('anexos', { cliente: '' });
        json(res, 200, { ok: true, revisao: revisao, pdfs: pdfs });
      });
    }
    if (caminho === '/api/apagar-tudo' && metodo === 'POST') {
      if (!soAdmin()) return Promise.resolve();
      return lerJson(req, 1024).then(function (c) {
        if (c.confirmacao !== 'APAGAR') return json(res, 400, { erro: 'Confirmação ausente.' });
        trocarEstadoInteiro(DADOS.estadoDoSeed().estado, 'apagar-tudo', eu);
        json(res, 200, { ok: true, revisao: revisao });
      });
    }
    if (caminho === '/api/copias' && metodo === 'GET') {
      if (!soAdmin()) return Promise.resolve();
      return Promise.resolve(json(res, 200, { copias: armazem.listarCopias() }));
    }
    if (caminho === '/api/copias/restaurar' && metodo === 'POST') {
      if (!soAdmin()) return Promise.resolve();
      return lerJson(req, 1024).then(function (c) {
        var copia;
        try { copia = armazem.lerCopia(c.id); } catch (e) { return json(res, 404, { erro: 'Cópia não encontrada.' }); }
        trocarEstadoInteiro(copia.estado, 'restaurar', eu);
        json(res, 200, { ok: true, revisao: revisao });
      });
    }

    return Promise.resolve(json(res, 404, { erro: 'Endereço desconhecido.' }));
  }

  /* ----------------------------------------------------- estáticos */

  function estatico(req, res, caminho) {
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, cabecalhos()); res.end(); return; }
    var decodificado;
    try { decodificado = decodeURIComponent(caminho); } catch (e) { res.writeHead(400, cabecalhos()); res.end(); return; }
    var normal = path.posix.normalize(decodificado);
    var raizPublica = PUBLICAS.filter(function (p) { return normal.indexOf('/' + p + '/') === 0; })[0];
    if (decodificado.indexOf('\0') >= 0 || !raizPublica) { res.writeHead(404, cabecalhos()); res.end('Não encontrado'); return; }

    // No servidor, o web app sabe que está em rede.
    if (normal === '/webapp/js/00_modo.js') {
      res.writeHead(200, cabecalhos({ 'Content-Type': TIPOS['.js'] }));
      res.end('var MODO_SERVIDOR = true;\n');
      return;
    }

    var arquivo = path.join(RAIZ, normal);
    if (normal.slice(-1) === '/') arquivo = path.join(arquivo, 'index.html');
    if (!dentro(arquivo, path.join(RAIZ, raizPublica))) { res.writeHead(404, cabecalhos()); res.end(); return; }
    fs.stat(arquivo, function (erro, st) {
      if (erro || !st.isFile()) { res.writeHead(404, cabecalhos()); res.end('Não encontrado'); return; }
      res.writeHead(200, cabecalhos({ 'Content-Type': TIPOS[path.extname(arquivo).toLowerCase()] || 'application/octet-stream',
        'Content-Length': st.size, 'Cache-Control': 'no-cache' }));
      if (req.method === 'HEAD') { res.end(); return; }
      fs.createReadStream(arquivo).pipe(res);
    });
  }

  function tratar(req, res) {
    var u;
    try { u = new URL(req.url, 'http://localhost'); } catch (e) { res.writeHead(400, cabecalhos()); res.end(); return; }
    var caminho = u.pathname;
    if (caminho === '/' || caminho === '/webapp') { res.writeHead(302, cabecalhos({ Location: '/webapp/' })); res.end(); return; }
    if (caminho.indexOf('/api/') === 0) {
      api(req, res, caminho, u.searchParams).catch(function (e) {
        if (!res.headersSent) json(res, e && e.status ? e.status : 500, { erro: e && e.status ? e.message : 'Erro interno.' });
        if (!(e && e.status)) registrar('ERRO: ' + (e && e.stack || e));
      });
      return;
    }
    estatico(req, res, caminho);
  }

  /* ----------------------------------------------------- ligar/desligar */

  var arqChave = path.join(pastaDados, 'https', 'chave.pem');
  var arqCert = path.join(pastaDados, 'https', 'certificado.pem');
  var usaHttps = fs.existsSync(arqChave) && fs.existsSync(arqCert);
  var servidor = usaHttps
    ? https.createServer({ key: fs.readFileSync(arqChave), cert: fs.readFileSync(arqCert) }, tratar)
    : http.createServer(tratar);

  function iniciar() {
    return new Promise(function (resolver, rejeitar) {
      servidor.once('error', rejeitar);
      servidor.listen(opcoes.porta === undefined ? 8080 : opcoes.porta, opcoes.host || '0.0.0.0', function () {
        var porta = servidor.address().port;
        var esquema = usaHttps ? 'https' : 'http';
        var codigo = contas.codigoPrimeiroAcesso();
        registrar('Sistema de anestesia no ar — revisão ' + revisao + ', dados em ' + pastaDados);
        registrar('  Neste computador:  ' + esquema + '://localhost:' + porta + '/');
        if ((opcoes.host || '0.0.0.0') === '0.0.0.0') {
          enderecosDaRede().forEach(function (ip) { registrar('  Na rede da clínica: ' + esquema + '://' + ip + ':' + porta + '/'); });
        }
        if (!usaHttps) registrar('  Sem HTTPS: use só na rede interna da clínica (Wi-Fi com senha).');
        if (codigo) registrar('  PRIMEIRO ACESSO — código para criar o administrador: ' + codigo);
        resolver({ porta: porta, url: esquema + '://localhost:' + porta + '/' });
      });
    });
  }

  function fechar() {
    clearInterval(batida);
    clearInterval(relogioDia);
    fluxos.forEach(function (f) { try { f.res.end(); } catch (e) { /* ok */ } });
    fluxos.clear();
    gravarAgora();
    contas.gravarSessoes();
    return new Promise(function (resolver) {
      servidor.close(function () { resolver(); });
      if (servidor.closeAllConnections) servidor.closeAllConnections();
    });
  }

  return {
    iniciar: iniciar,
    fechar: fechar,
    gravarAgora: gravarAgora,
    get revisao() { return revisao; },
    get store() { return store; },
    contas: contas,
    armazem: armazem
  };
}

/* ================================================================ linha de comando */

function argumentos(lista) {
  var o = {};
  for (var i = 0; i < lista.length; i++) {
    if (lista[i] === '--porta') o.porta = Number(lista[++i]);
    else if (lista[i] === '--host') o.host = lista[++i];
    else if (lista[i] === '--dados') o.dados = lista[++i];
  }
  return o;
}

if (require.main === module) {
  var srv = criarServidor(argumentos(process.argv.slice(2)));
  srv.iniciar().catch(function (e) {
    console.error(e && e.code === 'EADDRINUSE'
      ? 'A porta já está em uso — o servidor já está aberto em outra janela? Ou use --porta 8081.'
      : 'Não foi possível subir o servidor: ' + (e && e.message));
    process.exit(1);
  });
  var saindo = false;
  ['SIGINT', 'SIGTERM', 'SIGBREAK'].forEach(function (sinal) {
    process.on(sinal, function () {
      if (saindo) return;
      saindo = true;
      console.log('Gravando e desligando…');
      srv.fechar().then(function () { process.exit(0); });
    });
  });
}

module.exports = { criarServidor: criarServidor };
