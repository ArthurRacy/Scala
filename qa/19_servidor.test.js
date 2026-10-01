/**
 * QA 19 — Modo servidor (server/servidor.js)
 *   Cada cenário sobe um servidor próprio, numa porta livre e numa pasta
 *   temporária, e conversa com ele por HTTP como o navegador conversaria.
 *   - estáticos: só webapp/ e core/, sem travessia de pasta, cabeçalhos
 *   - primeiro acesso, entrada, sessão, CSRF, trava por tentativas
 *   - comando reexecutado no servidor chega EXATAMENTE ao estado da tela
 *   - concorrência: criar é recusado se alguém gravou no meio; editar passa
 *   - papéis: equipe não mexe em cadastro nem em usuários
 *   - anexos: PDF de verdade, leitura, remoção, cascada com a avaliação
 *   - disco: reiniciar mantém tudo; o diário reaplica o que faltou
 *   - SSE, backup e importação
 */
'use strict';

var fs = require('fs');
var os = require('os');
var path = require('path');
var vm = require('vm');

module.exports = function (t, core, dados) {
  var describe = t.describe, it = t.it, igual = t.igual, verdadeiro = t.verdadeiro, falso = t.falso;

  var RAIZ = path.join(__dirname, '..');
  var criarServidor = require(path.join(RAIZ, 'server', 'servidor.js')).criarServidor;
  var HOJE = '2026-10-05';

  var ctxDados = vm.createContext(Object.assign({}, core, { UI: {}, console: console }));
  vm.runInContext(fs.readFileSync(path.join(RAIZ, 'webapp', 'js', '03_dados.js'), 'utf8'), ctxDados);
  var DADOS = vm.runInContext('DADOS', ctxDados);

  function pastaTemp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'anestesia-qa-')); }

  /** Sobe um servidor, roda `fn(cli)` e desliga (mesmo se falhar). */
  function comServidor(fn, pasta) {
    pasta = pasta || pastaTemp();
    var srv = criarServidor({ dados: pasta, porta: 0, host: '127.0.0.1', silencioso: true, hoje: HOJE });
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
      var h = Object.assign({ 'X-Anestesia': '1' }, extra || {});
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
      get: function (c, h) { return pedir('GET', c, undefined, h); },
      post: function (c, corpo, h) { return pedir('POST', c, corpo, h); },
      del: function (c, h) { return pedir('DELETE', c, undefined, h); },
      semCabecalho: function (c, corpo) {
        return fetch(base + c, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify(corpo) })
          .then(function (r) { return r.status; });
      }
    };
  }

  function codigoDe(pasta) {
    return /: ([0-9A-F]+)/.exec(fs.readFileSync(path.join(pasta, 'PRIMEIRO_ACESSO.txt'), 'utf8'))[1];
  }

  /** Cria o administrador e deixa o cliente logado. */
  function administrador(cli, pasta) {
    return cli.post('/api/primeiro-acesso', { codigo: codigoDe(pasta), login: 'admin', nome: 'Admin da Clínica', senha: 'senha-forte-1' });
  }

  /** Réplica do estado do servidor + envio de comandos, como a tela faz. */
  function replica(cli) {
    return cli.get('/api/estado').then(function (r) {
      var st = core.criarStore(DADOS.sanearEstado(r.corpo.estado), { usuario: r.corpo.usuario.nome, horizonte: 'movel', hoje: r.corpo.hoje });
      st.recalcular();
      var rep = { store: st, revisao: r.corpo.revisao, hoje: r.corpo.hoje };
      var n = 0;
      rep.comando = function (nome) {
        var args = Array.prototype.slice.call(arguments, 1);
        var ctx = { agora: core.agoraTexto(new Date()), semente: 'q' + (++n) + 'x' + Math.random().toString(36).slice(2, 8) };
        var local = core.executarComContexto(ctx, function () { return st[nome].apply(st, JSON.parse(JSON.stringify(args))); });
        return cli.post('/api/comando', { nome: nome, args: args, contexto: ctx, base: rep.revisao, hoje: rep.hoje, cliente: 'qa' })
          .then(function (resp) { if (resp.corpo && resp.corpo.ok) rep.revisao = resp.corpo.revisao; return { local: local, resp: resp }; });
      };
      return rep;
    });
  }

  function semCarimbo(estado) {
    var e = JSON.parse(JSON.stringify(estado));
    delete e.salvoEm;
    return JSON.stringify(e);
  }

  var CIRURGIA = { status: 'Realizada', data: '2026-10-05', inicioPrev: '07:00', fimPrev: '09:00', paciente: 'Paciente Servidor',
    procedimento: 'Rinoplastia', anestesista: 'Fabrício Tavares', avaliacaoNec: 'Não' };
  var PDF = Buffer.from('%PDF-1.4\n1 0 obj\n<< >>\nendobj\ntrailer\n<< >>\n%%EOF\n');

  describe('Servidor: arquivos servidos', function () {

    it('só webapp/ e core/, com cabeçalhos de segurança; travessia de pasta não passa', function () {
      return comServidor(function (cli, srv, pasta) {
        return Promise.all([
          cli.get('/'), cli.get('/webapp/index.html'), cli.get('/webapp/js/00_modo.js'),
          cli.get('/webapp/%2e%2e/server/contas.js'), cli.get('/webapp/..%5c..%5cpackage.json'),
          cli.get('/core/../data/seed.json'), cli.get('/webapp/js/')
        ]).then(function (r) {
          igual(r[0].status, 302);
          igual(r[1].status, 200);
          verdadeiro(/frame-ancestors 'none'/.test(r[1].headers.get('content-security-policy')));
          igual(r[1].headers.get('x-content-type-options'), 'nosniff');
          verdadeiro(/MODO_SERVIDOR = true/.test(r[2].corpo.toString()), 'o web app sabe que está em rede');
          igual(r[3].status, 404, '%2e%2e');
          igual(r[4].status, 404, 'barra invertida codificada');
          igual(r[5].status, 404, '/core/../data');
          igual(r[6].status, 404, 'sem listagem de pasta');
        });
      });
    });
  });

  describe('Servidor: entrada e sessão', function () {

    it('primeiro acesso com código, cookie seguro, CSRF e saída', function () {
      return comServidor(function (cli, srv, pasta) {
        return cli.get('/api/eu').then(function (r) {
          igual(r.status, 401);
          verdadeiro(r.corpo.primeiroAcesso);
          return cli.post('/api/primeiro-acesso', { codigo: 'ERRADO', login: 'admin', nome: 'Admin', senha: 'senha-forte-1' });
        }).then(function (r) {
          igual(r.status, 403, 'código errado');
          return cli.semCabecalho('/api/primeiro-acesso', { codigo: codigoDe(pasta), login: 'admin', nome: 'Admin', senha: 'senha-forte-1' });
        }).then(function (status) {
          igual(status, 403, 'sem o cabeçalho X-Anestesia (CSRF)');
          return administrador(cli, pasta);
        }).then(function (r) {
          igual(r.status, 200);
          verdadeiro(/HttpOnly/.test(r.cookieBruto) && /SameSite=Strict/.test(r.cookieBruto));
          falso(fs.existsSync(path.join(pasta, 'PRIMEIRO_ACESSO.txt')), 'código usado some');
          var usuarios = fs.readFileSync(path.join(pasta, 'usuarios.json'), 'utf8');
          falso(/senha-forte-1/.test(usuarios), 'senha nunca em texto');
          return cli.get('/api/eu');
        }).then(function (r) {
          igual(r.corpo.usuario.papel, 'admin');
          return cli.post('/api/sair', {});
        }).then(function () { return cli.get('/api/estado'); }).then(function (r) {
          igual(r.status, 401, 'depois de sair');
        });
      });
    });

    it('cinco senhas erradas travam o login', function () {
      return comServidor(function (cli, srv, pasta) {
        return administrador(cli, pasta).then(function () {
          var tentativas = [];
          var fila = Promise.resolve();
          for (var i = 0; i < 6; i++) {
            fila = fila.then(function () { return cli.post('/api/entrar', { login: 'admin', senha: 'errada' }).then(function (r) { tentativas.push(r.status); }); });
          }
          return fila.then(function () {
            igual(tentativas.slice(0, 5).join(','), '401,401,401,401,401');
            igual(tentativas[5], 429);
            return cli.post('/api/entrar', { login: 'admin', senha: 'senha-forte-1' });
          }).then(function (r) { igual(r.status, 429, 'nem a senha certa entra durante a trava'); });
        });
      });
    });
  });

  describe('Servidor: comandos', function () {

    it('o comando reexecutado no servidor chega exatamente ao estado da tela', function () {
      return comServidor(function (cli, srv, pasta) {
        var rep;
        return administrador(cli, pasta).then(function () { return replica(cli); }).then(function (r) {
          rep = r;
          return rep.comando('adicionarCirurgia', CIRURGIA);
        }).then(function (x) {
          verdadeiro(x.resp.corpo.ok, JSON.stringify(x.resp.corpo));
          return rep.comando('atualizarCirurgia', 'CIR0001', { avaliacaoNec: 'Sim' });   // cria avaliação (com uid)
        }).then(function () { return rep.comando('criarBoletim', 'CIR0001'); })
          .then(function () {
            return rep.comando('salvarBoletim', 'BOL0001', { paciente: { peso: '70' }, pre: { asa: 'I' }, tecnicas: ['Sedação'],
              monitorizacao: core.MONITORIZACAO_BASICA, destino: 'SRPA', semIntercorrencias: true,
              tempos: { inicioAnestesia: '07:00', fimAnestesia: '08:40' } });
          }).then(function () {
            return rep.comando('alterarLinhaBoletim', 'BOL0001', 'sinais', { acao: 'adicionar', linha: { hora: '07:05', pas: '120', pad: '80' } });
          }).then(function () {
            return rep.comando('finalizarBoletim', 'BOL0001', { tracos: [[[0.1, 0.2], [0.5, 0.6]]], nome: 'Fabrício Tavares', crm: '1234-DF' });
          }).then(function (x) {
            verdadeiro(x.resp.corpo.ok, JSON.stringify(x.resp.corpo));
            igual(x.resp.corpo.revisao, 6);
            return cli.get('/api/estado');
          }).then(function (r) {
            igual(semCarimbo(r.corpo.estado), semCarimbo(DADOS.enxugar(rep.store.estado)), 'estado do servidor = estado da tela');
            igual(r.corpo.estado.avaliacoes[0].uid, rep.store.estado.avaliacoes[0].uid, 'uid igual pela semente');
            verdadeiro(core.codigoConfereBoletim(core.normalizarBoletim(r.corpo.estado.boletins[0])), 'assinatura confere');
          });
      });
    });

    it('concorrência: criar é recusado se alguém gravou no meio; editar campo passa', function () {
      return comServidor(function (a, srv, pasta, base) {
        var b = cliente(base), ra, rb;
        return administrador(a, pasta).then(function () {
          return b.post('/api/entrar', { login: 'admin', senha: 'senha-forte-1' });
        }).then(function () { return Promise.all([replica(a), replica(b)]); }).then(function (rs) {
          ra = rs[0]; rb = rs[1];
          return ra.comando('adicionarCirurgia', CIRURGIA);
        }).then(function () {
          return rb.comando('adicionarCirurgia', Object.assign({}, CIRURGIA, { paciente: 'Outro' }));   // base velha
        }).then(function (x) {
          igual(x.resp.status, 409);
          igual(x.resp.corpo.motivo, 'concorrencia');
          return rb.comando('atualizarCirurgia', 'CIR0001', { sala: 'Sala 3' });   // base velha, mas só edita
        }).then(function (x) {
          verdadeiro(x.resp.corpo.ok && x.resp.corpo.concorrente, JSON.stringify(x.resp.corpo));
          return a.get('/api/comandos?desde=1');
        }).then(function (r) {
          igual(r.corpo.comandos.length, 1);
          igual(r.corpo.comandos[0].nome, 'atualizarCirurgia');
          return a.get('/api/comandos?desde=-5');
        }).then(function (r) { verdadeiro(r.corpo.recarregar, 'pedido fora do diário: recarregar'); });
      });
    });

    it('papéis: a equipe opera, mas não mexe no cadastro nem nos usuários', function () {
      return comServidor(function (adm, srv, pasta, base) {
        var eq = cliente(base), req;
        return administrador(adm, pasta).then(function () {
          return adm.post('/api/usuarios', { novo: true, login: 'secretaria', nome: 'Secretaria', papel: 'equipe', senha: 'secretaria-1' });
        }).then(function (r) {
          igual(r.status, 200, JSON.stringify(r.corpo));
          return eq.post('/api/entrar', { login: 'secretaria', senha: 'secretaria-1' });
        }).then(function () { return replica(eq); }).then(function (r) {
          req = r;
          return req.comando('salvarAnestesista', { id: 'A01', pix: 'golpe@x.com' });
        }).then(function (x) {
          igual(x.resp.status, 403, 'chave PIX só pelo administrador');
          return eq.get('/api/usuarios');
        }).then(function (r) {
          igual(r.status, 403);
          return req.comando('adicionarCirurgia', CIRURGIA);
        }).then(function (x) {
          verdadeiro(x.resp.corpo.ok, 'lançar cirurgia pode');
          return adm.post('/api/usuarios', { login: 'secretaria', ativo: false });
        }).then(function () { return eq.get('/api/estado'); }).then(function (r) {
          igual(r.status, 401, 'desativado perde a sessão na hora');
          return adm.post('/api/usuarios', { login: 'admin', papel: 'equipe' });
        }).then(function (r) {
          igual(r.status, 400, 'o único administrador não perde o papel');
        });
      });
    });
  });

  describe('Servidor: qualidade e segurança', function () {

    it('a ficha chega ao servidor idêntica à da tela e sobrevive ao backup e ao reinício', function () {
      var pasta = pastaTemp();
      var esperado;
      return comServidor(function (cli, srv, p) {
        var rep;
        return administrador(cli, p).then(function () { return replica(cli); }).then(function (r) {
          rep = r;
          return rep.comando('adicionarCirurgia', CIRURGIA);
        }).then(function () { return rep.comando('criarFichaQualidade', 'CIR0001'); })
          .then(function (x) {
            verdadeiro(x.resp.corpo.ok, JSON.stringify(x.resp.corpo));
            return rep.comando('salvarFichaQualidade', 'FQA0001', {
              atendimento: { asa: 'II', peso: '70', tecnicas: ['Geral balanceada'] },
              respostas: { pcrSala: 'Não' }, srpa: { dorPontuacao: '8' }
            });
          }).then(function () {
            return rep.comando('alterarEventoQualidade', 'FQA0001', { acao: 'adicionar', evento: {
              tipo: 'lesaoCornea', data: '2026-10-05', descricao: 'olho direito', dados: { lado: 'Direito' } } });
          }).then(function () {
            return rep.comando('registrarSeguimentoQualidade', 'FQA0001', 'h24',
              { situacao: 'Realizado', data: '2026-10-06' });
          }).then(function (x) {
            verdadeiro(x.resp.corpo.ok, JSON.stringify(x.resp.corpo));
            return cli.get('/api/estado');
          }).then(function (r) {
            esperado = semCarimbo(DADOS.enxugar(rep.store.estado));
            igual(semCarimbo(r.corpo.estado), esperado, 'estado do servidor = estado da tela');
            igual(r.corpo.estado.fichasQualidade.length, 1);
            igual(r.corpo.estado.fichasQualidade[0].eventos.length, 1);
            igual(r.corpo.estado.fichasQualidade[0].respostas.pcrSala, 'Não');
            igual(r.corpo.estado.fichasQualidade[0].respostas.lesaoCornea, '', 'o que não foi respondido continua em branco');
          });
      }, pasta).then(function () {
        return comServidor(function (cli) {
          return cli.post('/api/entrar', { login: 'admin', senha: 'senha-forte-1' })
            .then(function () { return cli.get('/api/estado'); }).then(function (r) {
              igual(r.corpo.estado.fichasQualidade.length, 1, 'a ficha sobreviveu ao reinício');
              igual(r.corpo.estado.fichasQualidade[0].seguimentos.h24.situacao, 'Realizado');
              igual(r.corpo.estado.config.sequencias.qualidade, 1, 'a sequência de IDs também');
            });
        }, pasta);
      });
    });

    it('papéis: a equipe preenche a ficha; estrutura e configuração clínica são do administrador', function () {
      return comServidor(function (adm, srv, pasta, base) {
        var eq = cliente(base), req;
        return administrador(adm, pasta).then(function () {
          return adm.post('/api/usuarios', { novo: true, login: 'anest', nome: 'Anestesista', papel: 'equipe', senha: 'anestesista-1' });
        }).then(function () { return eq.post('/api/entrar', { login: 'anest', senha: 'anestesista-1' }); })
          .then(function () { return replica(eq); }).then(function (r) {
            req = r;
            return req.comando('adicionarCirurgia', CIRURGIA);
          }).then(function () { return req.comando('criarFichaQualidade', 'CIR0001'); })
          .then(function (x) {
            verdadeiro(x.resp.corpo.ok, 'criar a ficha pode: ' + JSON.stringify(x.resp.corpo));
            return req.comando('salvarFichaQualidade', 'FQA0001', { atendimento: { asa: 'I' } });
          }).then(function (x) {
            verdadeiro(x.resp.corpo.ok, 'preencher pode');
            return req.comando('salvarRegistroEstrutura', { data: '2026-10-05', turno: 'Manhã', unidade: 'CC' });
          }).then(function (x) {
            igual(x.resp.status, 403, 'estrutura só pelo administrador');
            return req.comando('salvarConfigQualidade', { limiares: { spo2: 80 } });
          }).then(function (x) {
            igual(x.resp.status, 403, 'configuração clínica só pelo administrador');
            return adm.get('/api/estado');
          }).then(function (r) {
            igual(r.corpo.estado.estrutura.length, 0, 'a recusa não deixou rastro');
            igual(r.corpo.estado.config.qualidade.limiares.spo2, 90, 'o limiar não mudou');
          });
      });
    });
  });

  describe('Servidor: exames em PDF', function () {

    it('guarda, lê, recusa o que não é PDF e remove em cascata com a avaliação', function () {
      return comServidor(function (cli, srv, pasta) {
        var rep, uid, meta;
        return administrador(cli, pasta).then(function () { return replica(cli); }).then(function (r) {
          rep = r;
          return rep.comando('adicionarCirurgia', Object.assign({}, CIRURGIA, { avaliacaoNec: 'Sim' }));
        }).then(function () {
          uid = rep.store.estado.avaliacoes[0].uid;
          return cli.post('/api/anexos', Buffer.from('não sou pdf'), { 'X-Uid-Avaliacao': uid, 'X-Nome': 'x.pdf', 'Content-Type': 'application/pdf' });
        }).then(function (r) {
          igual(r.status, 400);
          return cli.post('/api/anexos', PDF, { 'X-Uid-Avaliacao': uid, 'X-Nome': encodeURIComponent('Hemograma ç.pdf'), 'Content-Type': 'application/pdf' });
        }).then(function (r) {
          igual(r.status, 200, JSON.stringify(r.corpo));
          meta = r.corpo.meta;
          igual(meta.nome, 'Hemograma ç.pdf');
          return cli.get('/api/anexos/' + meta.id);
        }).then(function (r) {
          igual(r.corpo.toString(), PDF.toString(), 'mesmo conteúdo');
          return rep.comando('removerCirurgia', 'CIR0001', { comAvaliacoes: true });
        }).then(function (x) {
          verdadeiro(x.resp.corpo.ok);
          return cli.get('/api/anexos');
        }).then(function (r) {
          igual(r.corpo.metas.length, 0, 'saiu com a avaliação');
          igual(fs.readdirSync(path.join(pasta, 'anexos', 'removidos')).length, 1, 'mas fica guardado em removidos/');
        });
      });
    });

    it('PDF para avaliação que o servidor não conhece é recusado — cirurgia recusada por concorrência não deixa exame órfão', function () {
      // A tela de cirurgia nova só envia os PDFs depois de o comando ser confirmado; se o servidor recusou o
      // comando (alguém gravou no mesmo instante), a avaliação criada na tela não existe aqui.
      return comServidor(function (cli, srv, pasta) {
        return administrador(cli, pasta).then(function () {
          return cli.post('/api/anexos', PDF, { 'X-Uid-Avaliacao': 'uQueNuncaExistiu', 'X-Nome': 'hemograma.pdf', 'Content-Type': 'application/pdf' });
        }).then(function (r) {
          igual(r.status, 400);
          verdadeiro(/Avaliação não encontrada/.test(r.corpo.erro), JSON.stringify(r.corpo));
          return cli.get('/api/anexos');
        }).then(function (r) {
          igual(r.corpo.metas.length, 0, 'nada foi guardado');
          igual(fs.readdirSync(path.join(pasta, 'anexos')).filter(function (f) { return /\.pdf$/.test(f); }).length, 0, 'nem no disco');
        });
      });
    });
  });

  describe('Servidor: disco, avisos e backup', function () {

    it('reiniciar mantém tudo; o diário reaplica o que faltava no estado', function () {
      var pasta = pastaTemp(), estadoAntes;
      return comServidor(function (cli, srv) {
        return administrador(cli, pasta).then(function () { return replica(cli); }).then(function (rep) {
          return rep.comando('adicionarCirurgia', CIRURGIA).then(function () { return rep.comando('criarBoletim', 'CIR0001'); });
        }).then(function () { return cli.get('/api/estado'); }).then(function (r) { estadoAntes = r.corpo; });
      }, pasta).then(function () {
        // "Queda de luz": um comando no diário que o estado.json ainda não tem.
        var entrada = { revisao: estadoAntes.revisao + 1, nome: 'salvarBoletim', args: ['BOL0001', { destino: 'UTI' }],
          contexto: { agora: '2026-10-05 10:00:00', semente: 'diario1' }, usuario: 'Admin da Clínica', login: 'admin', hoje: HOJE };
        fs.appendFileSync(path.join(pasta, 'diario.jsonl'), JSON.stringify(entrada) + '\n');
        return comServidor(function (cli) {
          return cli.post('/api/entrar', { login: 'admin', senha: 'senha-forte-1' }).then(function () { return cli.get('/api/estado'); })
            .then(function (r) {
              igual(r.corpo.revisao, estadoAntes.revisao + 1);
              igual(r.corpo.estado.cirurgias.length, 1);
              igual(r.corpo.estado.boletins[0].destino, 'UTI', 'comando do diário reaplicado');
              verdadeiro(fs.readdirSync(path.join(pasta, 'copias')).some(function (n) { return /^estado_/.test(n); }), 'cópia do dia');
            });
        }, pasta);
      });
    });

    it('avisa as outras telas por SSE a cada gravação', function () {
      return comServidor(function (cli, srv, pasta, base) {
        return administrador(cli, pasta).then(function () {
          var controle = new AbortController();
          var eventos = [];
          var cookie;
          return cli.get('/api/eu').then(function () {
            // O cliente guarda o cookie internamente: pega-o de novo pelo login.
            return fetch(base + '/api/entrar', { method: 'POST', headers: { 'X-Anestesia': '1', 'Content-Type': 'application/json' },
              body: JSON.stringify({ login: 'admin', senha: 'senha-forte-1' }) });
          }).then(function (r) {
            cookie = r.headers.get('set-cookie').split(';')[0];
            return fetch(base + '/api/eventos', { headers: { Cookie: cookie }, signal: controle.signal });
          }).then(function (r) {
            var leitor = r.body.getReader(), texto = '';
            function ler() {
              return leitor.read().then(function (p) {
                if (p.done) return;
                texto += Buffer.from(p.value).toString();
                var m = texto.match(/event: (\w+)/g) || [];
                eventos = m.map(function (x) { return x.slice(7); });
                if (eventos.indexOf('comando') >= 0) { controle.abort(); return; }
                return ler();
              });
            }
            var leitura = ler().catch(function () { /* abortado */ });
            return replica(cli).then(function (rep) { return rep.comando('adicionarCirurgia', CIRURGIA); }).then(function () { return leitura; });
          }).then(function () {
            igual(eventos.join(','), 'ola,comando');
          });
        });
      });
    });

    it('backup e importação pelo administrador, com marco antes da troca', function () {
      return comServidor(function (cli, srv, pasta) {
        var backup;
        return administrador(cli, pasta).then(function () { return replica(cli); }).then(function (rep) {
          return rep.comando('adicionarCirurgia', CIRURGIA);
        }).then(function () { return cli.get('/api/backup'); }).then(function (r) {
          igual(r.status, 200);
          verdadeiro(/attachment/.test(r.headers.get('content-disposition')), 'sai como arquivo');
          backup = Buffer.isBuffer(r.corpo) ? JSON.parse(r.corpo.toString()) : r.corpo;
          igual(backup.dados.cirurgias.length, 1);
          backup.dados.cirurgias[0].paciente = 'Importada';
          return cli.post('/api/importar', Buffer.from(JSON.stringify(backup)), { 'Content-Type': 'application/json' });
        }).then(function (r) {
          verdadeiro(r.corpo.ok, JSON.stringify(r.corpo));
          return cli.get('/api/estado');
        }).then(function (r) {
          igual(r.corpo.estado.cirurgias[0].paciente, 'Importada');
          verdadeiro(fs.readdirSync(path.join(pasta, 'copias')).some(function (n) { return /^marco_antes-de-importar/.test(n); }));
          var ultimo = r.corpo.estado.log[r.corpo.estado.log.length - 1];
          igual(ultimo.campo, 'ESTADO SUBSTITUÍDO');
        });
      });
    });
  });
};
