/**
 * QA 29 — LOG por usuário e arquivo mensal no servidor de verdade
 *   - eventos de acesso por usuário (entradas, recusas, senha, usuários, backup, exames, acessos negados)
 *   - o LOG de alterações leva o login de cada pessoa
 *   - rotação mensal: o mês fechado vira arquivo conferido (SHA-256) e SÓ DEPOIS sai da tela;
 *     nenhuma linha se perde; falha no meio não tira nada; arquivo existente nunca é reescrito
 *   - a tela (réplica) acompanha a limpeza; prazo de guarda; só o chefe vê e mexe
 */
'use strict';

var fs = require('fs');
var path = require('path');
var zlib = require('zlib');

module.exports = function (t, core) {
  var describe = t.describe, it = t.it, igual = t.igual, verdadeiro = t.verdadeiro, falso = t.falso;
  var U = require('./_servidor_util')(core);
  var DADOS = U.DADOS;

  var MES_REAL = core.hojeISO().slice(0, 7);                          // o mês em que os testes gravam (o relógio local, o mesmo dos carimbos)
  var NO_FUTURO = core.somarMesesAoMes(MES_REAL, 8) + '-10';         // "hoje" forçado: o mês real já fechou e passou do corte

  function comTres(fn, pasta) {
    return U.comServidor(function (chefe, srv, p, base) {
      return U.chefe(chefe, p).then(function () {
        return Promise.all([
          U.novoUsuario(chefe, base, 'secretaria1', 'Secretária Um', 'secretaria'),
          U.novoUsuario(chefe, base, 'dra1', 'Doutora Um', 'anestesista')
        ]);
      }).then(function (o) { return fn({ chefe: chefe, secretaria: o[0], anestesista: o[1] }, srv, p, base); });
    }, pasta);
  }

  function lerArquivoGz(pasta, nome) {
    return core.entradasDoTextoDeLog(zlib.gunzipSync(fs.readFileSync(path.join(pasta, 'logs', nome))).toString('utf8')).entradas;
  }

  function semCarimbo(estado) { var e = JSON.parse(JSON.stringify(estado)); delete e.salvoEm; return e; }

  /** Caminho e valores da primeira diferença entre dois dados (texto vazio se iguais). */
  function primeiraDiferenca(a, b, caminho) {
    caminho = caminho || '$';
    if (core.jsonCanonico(a) === core.jsonCanonico(b)) return '';
    if (a && b && typeof a === 'object' && typeof b === 'object' && Array.isArray(a) === Array.isArray(b)) {
      var chaves = Object.keys(a).concat(Object.keys(b).filter(function (k) { return !(k in a); }));
      for (var i = 0; i < chaves.length; i++) {
        var d = primeiraDiferenca(a[chaves[i]], b[chaves[i]], caminho + '.' + chaves[i]);
        if (d) return d;
      }
    }
    return caminho + ': servidor=' + JSON.stringify(a).slice(0, 140) + ' | tela=' + JSON.stringify(b).slice(0, 140);
  }

  describe('Eventos de acesso por usuário', function () {

    it('entradas, recusas, saída, senha e usuários ficam registrados com login, perfil e endereço', function () {
      return comTres(function (c, srv, pasta, base) {
        var intruso = U.cliente(base);
        return intruso.post('/api/entrar', { login: 'dra1', senha: 'senha-errada' }).then(function (r) {
          igual(r.status, 401);
          return c.anestesista.post('/api/minha-senha', { atual: U.SENHA, nova: 'outra-senha-forte' });
        }).then(function (r) {
          igual(r.status, 200, JSON.stringify(r.corpo));
          return c.secretaria.post('/api/sair', {});
        }).then(function () { return c.chefe.get('/api/auditoria/acessos'); }).then(function (r) {
          igual(r.status, 200);
          var ev = r.corpo.eventos;
          function achar(evento, login) { return ev.filter(function (e) { return e.evento === evento && e.login === login; })[0]; }
          verdadeiro(achar('primeiro_acesso', 'admin'), 'o chefe criado');
          verdadeiro(achar('usuario_criado', 'admin'), 'quem criou os usuários');
          var entrou = achar('entrada', 'dra1');
          verdadeiro(entrou && entrou.papel === 'anestesista' && entrou.nome === 'Doutora Um', 'entrada com nome e perfil');
          verdadeiro(/127\.0\.0\.1|::1/.test(entrou.ip), 'o endereço de onde entrou: ' + entrou.ip);
          verdadeiro(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(entrou.quando));
          var recusa = achar('entrada_recusada', 'dra1');
          verdadeiro(recusa && /não conferem/.test(recusa.detalhe), 'senha errada registrada, sem a senha');
          falso(JSON.stringify(ev).indexOf('senha-errada') >= 0, 'a senha digitada nunca vai para o registro');
          verdadeiro(achar('senha_trocada', 'dra1'));
          verdadeiro(achar('saida', 'secretaria1'));
          var criado = ev.filter(function (e) { return e.evento === 'usuario_criado' && /dra1/.test(e.detalhe); })[0];
          verdadeiro(/perfil anestesista/.test(criado.detalhe));
        });
      });
    });

    it('cinco senhas erradas aparecem como bloqueio; a lista filtra por pessoa, por dia e por texto', function () {
      return comTres(function (c, srv, pasta, base) {
        var intruso = U.cliente(base), fila = Promise.resolve();
        for (var i = 0; i < 6; i++) fila = fila.then(function () { return intruso.post('/api/entrar', { login: 'dra1', senha: 'errada' }); });
        return fila.then(function () { return c.chefe.get('/api/auditoria/acessos?login=dra1'); }).then(function (r) {
          var tipos = r.corpo.eventos.map(function (e) { return e.evento; });
          verdadeiro(tipos.indexOf('entrada_bloqueada') >= 0, 'o bloqueio: ' + tipos.join(','));
          r.corpo.eventos.forEach(function (e) { igual(e.login, 'dra1', 'só a pessoa filtrada'); });
          return c.chefe.get('/api/auditoria/acessos?de=2100-01-01');
        }).then(function (r) {
          igual(r.corpo.eventos.length, 0, 'período no futuro: nada');
          return c.chefe.get('/api/auditoria/acessos?texto=bloqueada&limite=1');
        }).then(function (r) {
          igual(r.corpo.eventos.length, 1, 'o limite vale');
          verdadeiro(r.corpo.total >= 1);
          return c.chefe.get('/api/auditoria/acessos?evento=entrada');
        }).then(function (r) {
          r.corpo.eventos.forEach(function (e) { igual(e.evento, 'entrada'); });
        });
      });
    });

    it('acesso negado (operação ou rota) fica registrado, e só o chefe vê o registro', function () {
      return comTres(function (c) {
        return U.comando(c.anestesista, 'registrarPagamentoRepasse', 2026, 10, 'A06', 10, '2026-10-20').then(function (x) {
          igual(x.resp.status, 403);
          return c.secretaria.get('/api/usuarios');
        }).then(function (r) {
          igual(r.status, 403);
          return Promise.all([c.secretaria.get('/api/auditoria/acessos'), c.anestesista.get('/api/auditoria/arquivos'),
            c.anestesista.post('/api/auditoria/rotacionar', {}), c.secretaria.post('/api/auditoria/conferir', {})]);
        }).then(function (rs) {
          rs.forEach(function (r) { igual(r.status, 403); });
          return c.chefe.get('/api/auditoria/acessos?evento=acesso_negado');
        }).then(function (r) {
          var por = function (login) { return r.corpo.eventos.filter(function (e) { return e.login === login; }); };
          verdadeiro(por('dra1').some(function (e) { return /registrarPagamentoRepasse/.test(e.detalhe); }), 'a operação negada ao anestesista');
          verdadeiro(por('secretaria1').some(function (e) { return /\/api\/usuarios/.test(e.detalhe); }), 'a rota negada à secretária');
          verdadeiro(por('dra1').length >= 3, 'as três tentativas do anestesista');
        });
      });
    });

    it('backup, exames (anexar, abrir, remover) e restauração ficam registrados por quem fez', function () {
      return comTres(function (c) {
        var uid, idExame;
        return U.comando(c.chefe, 'adicionarCirurgia', Object.assign({}, U.CIRURGIA, { avaliacaoNec: 'Sim' })).then(function (x) {
          uid = x.store.estado.avaliacoes[0].uid;
          return c.secretaria.post('/api/anexos', U.PDF, { 'X-Uid-Avaliacao': uid, 'X-Nome': 'exame.pdf', 'Content-Type': 'application/pdf' });
        }).then(function (r) {
          idExame = r.corpo.meta.id;
          return c.anestesista.get('/api/anexos/' + idExame);
        }).then(function () { return c.anestesista.del('/api/anexos/' + idExame); })
          .then(function () { return c.chefe.get('/api/backup?pdfs=1'); })
          .then(function () { return c.chefe.get('/api/auditoria/acessos'); }).then(function (r) {
            var ev = r.corpo.eventos;
            function de(evento) { return ev.filter(function (e) { return e.evento === evento; })[0]; }
            igual(de('exame_anexado').login, 'secretaria1');
            verdadeiro(/avaliação AVP0001/.test(de('exame_anexado').detalhe) && de('exame_anexado').detalhe.indexOf(idExame) >= 0);
            igual(de('exame_aberto').login, 'dra1');
            igual(de('exame_removido').login, 'dra1');
            igual(de('backup_baixado').login, 'admin');
            verdadeiro(/com PDFs/.test(de('backup_baixado').detalhe));
            falso(JSON.stringify(ev).indexOf('Paciente Perfis') >= 0, 'nome de paciente nunca vai para o registro de acessos');
          });
      });
    });
  });

  describe('O LOG de alterações leva o login de cada pessoa', function () {

    it('cada linha tem o login de quem mandou o comando, e o chefe vê (a secretária e o anestesista não recebem o LOG)', function () {
      return comTres(function (c) {
        return U.comando(c.chefe, 'adicionarCirurgia', U.CIRURGIA).then(function () {
          return U.comando(c.secretaria, 'atualizarCirurgia', 'CIR0001', { status: 'Confirmada', valor: 500 });
        }).then(function () { return U.comando(c.anestesista, 'atualizarCirurgia', 'CIR0001', { sala: 'S9' }); })
          .then(function () { return Promise.all([c.chefe.get('/api/estado'), c.secretaria.get('/api/estado')]); })
          .then(function (r) {
            var log = r[0].corpo.estado.log;
            var logins = log.map(function (l) { return l.login + ':' + l.campo; });
            verdadeiro(logins.indexOf('admin:REGISTRO CRIADO') >= 0, logins.join(' | '));
            verdadeiro(log.some(function (l) { return l.login === 'secretaria1' && l.campo === 'STATUS' && l.usuario === 'Secretária Um'; }), 'status mudado pela secretária');
            verdadeiro(log.some(function (l) { return l.login === 'secretaria1' && l.campo === 'VALOR DA ANESTESIA'; }), 'o valor também');
            igual(r[1].corpo.estado.log.length, 0);
          });
      });
    });
  });

  describe('Rotação mensal: arquivo conferido e só depois a limpeza', function () {

    /** Dois usuários trabalhando, para o LOG de alterações e os acessos terem mais de uma pessoa. */
    function trabalhar(c) {
      return U.comando(c.chefe, 'adicionarCirurgia', U.CIRURGIA).then(function () {
        return U.comando(c.secretaria, 'atualizarCirurgia', 'CIR0001', { status: 'Confirmada' });
      }).then(function () { return U.comando(c.anestesista, 'atualizarCirurgia', 'CIR0001', { sala: 'Sala 2' }); });
    }

    it('o mês fechado vira arquivo com SHA-256, nenhuma linha se perde e só então sai da tela', function () {
      return comTres(function (c, srv, pasta) {
        var antes;
        return trabalhar(c).then(function () { return c.chefe.get('/api/estado'); }).then(function (r) {
          antes = r.corpo.estado.log.slice();
          verdadeiro(antes.length >= 2, 'a cirurgia criada e o status mudado: ' + antes.length);
          var res = srv.rotacionarLogs('teste', NO_FUTURO);
          igual(res.erros.length, 0, JSON.stringify(res.erros));
          verdadeiro(res.criados >= 2, 'arquivo das alterações e arquivo dos acessos');
          igual(res.podados, antes.length, 'todas as linhas do mês real saíram da tela');
          var arq = 'alteracoes_' + MES_REAL + '.jsonl.gz';
          verdadeiro(fs.existsSync(path.join(pasta, 'logs', arq)), arq);
          verdadeiro(fs.existsSync(path.join(pasta, 'logs', 'acessos_' + MES_REAL + '.jsonl.gz')));

          // O arquivo tem EXATAMENTE as linhas que saíram da tela.
          var noArquivo = lerArquivoGz(pasta, arq).map(core.jsonCanonico).sort();
          igual(noArquivo.join('\n'), antes.map(core.jsonCanonico).sort().join('\n'), 'nenhuma linha se perdeu nem foi inventada');
          return c.chefe.get('/api/estado');
        }).then(function (r) {
          var log = r.corpo.estado.log;
          igual(log.length, 1, 'sobra só a linha que avisa do arquivamento');
          igual(log[0].campo, 'LOG ARQUIVADO');
          igual(log[0].login, 'sistema');
          verdadeiro(new RegExp('alteracoes_' + MES_REAL).test(log[0].para), 'diz onde as linhas estão: ' + log[0].para);
          return c.chefe.get('/api/auditoria/arquivos');
        }).then(function (r) {
          var a = r.corpo.arquivos.filter(function (x) { return x.tipo === 'alteracoes'; })[0];
          igual(a.mes, MES_REAL);
          igual(a.entradas, antes.length);
          verdadeiro(/^[0-9a-f]{64}$/.test(a.sha256), 'SHA-256 completo');
          verdadeiro(a.verificadoOk);
          verdadeiro(r.corpo.ultimaRotacao.ok);
          igual(r.corpo.config.mesesNaTela, 6);
          return c.chefe.get('/api/auditoria/acessos');
        }).then(function (r) {
          var vivos = r.corpo.eventos.map(function (e) { return e.evento; });
          falso(vivos.indexOf('entrada') >= 0 || vivos.indexOf('usuario_criado') >= 0, 'os eventos do mês arquivado saíram da lista viva');
          verdadeiro(vivos.indexOf('log_arquivado') >= 0 && vivos.indexOf('log_limpo') >= 0, 'e a limpeza ficou registrada: ' + vivos.join(','));
        });
      });
    });

    it('rodar de novo não cria arquivo repetido nem mexe em nada', function () {
      return comTres(function (c, srv, pasta) {
        return trabalhar(c).then(function () {
          srv.rotacionarLogs('teste', NO_FUTURO);
          var antes = fs.readdirSync(path.join(pasta, 'logs')).sort().join(',');
          var depois = srv.rotacionarLogs('teste', NO_FUTURO);
          igual(depois.criados, 0);
          igual(depois.podados, 0);
          igual(fs.readdirSync(path.join(pasta, 'logs')).sort().join(','), antes);
        });
      });
    });

    it('o mês ainda aberto e o primeiro dia do mês seguinte não são arquivados', function () {
      return comTres(function (c, srv, pasta) {
        return trabalhar(c).then(function () {
          var r1 = srv.rotacionarLogs('teste', MES_REAL + '-15');
          igual(r1.criados, 0, 'mês corrente nunca');
          var r2 = srv.rotacionarLogs('teste', core.somarMesesAoMes(MES_REAL, 1) + '-01');
          igual(r2.criados, 0, 'no primeiro dia do mês seguinte ainda pode chegar linha de última hora');
          var r3 = srv.rotacionarLogs('teste', core.somarMesesAoMes(MES_REAL, 1) + '-02');
          verdadeiro(r3.criados >= 2, 'a partir do segundo dia, arquivo');
          igual(r3.podados, 0, 'mas ainda dentro dos 6 meses da tela: nada sai da tela');
        });
      });
    });

    it('se o arquivo não puder ser gravado, NADA sai da tela; corrigido o problema, a rotação termina o serviço', function () {
      return comTres(function (c, srv, pasta) {
        var antes;
        return trabalhar(c).then(function () { return c.chefe.get('/api/estado'); }).then(function (r) {
          antes = r.corpo.estado.log.length;
          // Uma pasta no lugar do arquivo: a gravação do mês falha.
          fs.mkdirSync(path.join(pasta, 'logs', 'alteracoes_' + MES_REAL + '.jsonl.gz'));
          var res = srv.rotacionarLogs('teste', NO_FUTURO);
          verdadeiro(res.erros.length >= 1, 'a falha é contada: ' + JSON.stringify(res));
          igual(res.podados, 0, 'e nada saiu');
          return c.chefe.get('/api/estado');
        }).then(function (r) {
          igual(r.corpo.estado.log.length, antes, 'o LOG segue inteiro na tela');
          verdadeiro(!r.corpo.estado.log.some(function (l) { return l.campo === 'LOG ARQUIVADO'; }));
          return c.chefe.get('/api/auditoria/acessos?evento=log_rotacao_falhou');
        }).then(function (r) {
          verdadeiro(r.corpo.eventos.length >= 1, 'a falha ficou no registro de acessos');
          fs.rmdirSync(path.join(pasta, 'logs', 'alteracoes_' + MES_REAL + '.jsonl.gz'));
          var ok = srv.rotacionarLogs('teste', NO_FUTURO);
          igual(ok.erros.length, 0);
          igual(ok.podados, antes);
        });
      });
    });

    it('arquivo existente nunca é reescrito: linha nova de mês já arquivado vai para uma parte nova', function () {
      return comTres(function (c, srv, pasta) {
        var estadoDoArquivo;
        return trabalhar(c).then(function () {
          srv.rotacionarLogs('teste', core.somarMesesAoMes(MES_REAL, 1) + '-02');   // arquiva o mês, sem limpar a tela
          var arq = path.join(pasta, 'logs', 'alteracoes_' + MES_REAL + '.jsonl.gz');
          estadoDoArquivo = fs.readFileSync(arq).toString('base64');
          // Chega mais uma linha com carimbo do mês já arquivado (como uma restauração de cópia antiga faria).
          srv.store.estado.log.push(core.novaEntradaLog({ quando: MES_REAL + '-20 12:00:00', usuario: 'Atrasada', aba: 'CIRURGIAS', idCirurgia: 'CIR0009', campo: 'STATUS', de: 'a', para: 'b' }));
          var r = srv.rotacionarLogs('teste', core.somarMesesAoMes(MES_REAL, 1) + '-03');
          verdadeiro(r.criados >= 1, 'só partes novas');
          igual(fs.readFileSync(arq).toString('base64'), estadoDoArquivo, 'o arquivo original ficou intacto');
          var parte2 = lerArquivoGz(pasta, 'alteracoes_' + MES_REAL + '_p2.jsonl.gz');
          igual(parte2.length, 1);
          igual(parte2[0].usuario, 'Atrasada');
          // Agora com tudo coberto, a limpeza leva as duas partes.
          var limpa = srv.rotacionarLogs('teste', NO_FUTURO);
          igual(limpa.podados, 3, 'as duas linhas do mês e a atrasada, todas cobertas');
          verdadeiro(!srv.store.estado.log.some(function (l) { return l.usuario === 'Atrasada'; }));
        });
      });
    });

    it('arquivo adulterado é denunciado na conferência e nunca serve de desculpa para tirar linha', function () {
      return comTres(function (c, srv, pasta) {
        return trabalhar(c).then(function () {
          srv.rotacionarLogs('teste', core.somarMesesAoMes(MES_REAL, 1) + '-02');
          return c.chefe.post('/api/auditoria/conferir', {});
        }).then(function (r) {
          verdadeiro(r.corpo.ok && r.corpo.total >= 2 && r.corpo.conferem === r.corpo.total, JSON.stringify(r.corpo));
          // Troca o conteúdo do arquivo por outro conteúdo válido (comprimido de verdade): só o SHA-256 pega.
          var arq = path.join(pasta, 'logs', 'alteracoes_' + MES_REAL + '.jsonl.gz');
          var original = core.entradasDoTextoDeLog(zlib.gunzipSync(fs.readFileSync(arq)).toString('utf8')).entradas;
          original[0].para = 'ADULTERADO';
          fs.writeFileSync(arq, zlib.gzipSync(core.textoDoArquivoDeLog(original)));
          return c.chefe.post('/api/auditoria/conferir', {});
        }).then(function (r) {
          falso(r.corpo.ok);
          igual(r.corpo.problemas.length, 1);
          verdadeiro(/SHA-256 não confere/.test(r.corpo.problemas[0].motivo), r.corpo.problemas[0].motivo);
          return c.chefe.get('/api/auditoria/arquivos/alteracoes_' + MES_REAL);
        }).then(function (r) {
          igual(r.status, 404, 'arquivo que não confere não é entregue como se fosse bom');
          // E a limpeza, com o arquivo estragado, recria a cobertura numa parte nova antes de tirar qualquer linha.
          var res = srv.rotacionarLogs('teste', NO_FUTURO);
          verdadeiro(res.problemas.length >= 1, 'o problema é relatado');
          verdadeiro(fs.existsSync(path.join(pasta, 'logs', 'alteracoes_' + MES_REAL + '_p2.jsonl.gz')), 'cobertura refeita numa parte nova');
          igual(res.podados > 0, true);
        });
      });
    });

    it('a tela (réplica) acompanha a limpeza e chega ao mesmo estado do servidor', function () {
      return comTres(function (c, srv, pasta) {
        var rep;
        return trabalhar(c).then(function () { return c.chefe.get('/api/estado'); }).then(function (r) {
          var st = core.criarStore(DADOS.sanearEstado(r.corpo.estado), { usuario: 'Chefe', login: 'admin', horizonte: 'movel', hoje: r.corpo.hoje });
          st.recalcular();
          rep = { store: st, revisao: r.corpo.revisao };
          srv.rotacionarLogs('teste', NO_FUTURO);
          return c.chefe.get('/api/comandos?desde=' + rep.revisao);
        }).then(function (r) {
          var nomes = r.corpo.comandos.map(function (k) { return k.nome; });
          igual(nomes.join(','), 'arquivarLogAte', 'a limpeza chega como um comando como os outros');
          r.corpo.comandos.forEach(function (k) {
            rep.store.usuario = k.usuario; rep.store.login = k.login || '';
            var res = core.executarComContexto(k.contexto, function () { return rep.store[k.nome].apply(rep.store, k.args); });
            verdadeiro(res.ok, JSON.stringify(res.erros));
          });
          return c.chefe.get('/api/estado');
        }).then(function (r) {
          igual(primeiraDiferenca(semCarimbo(r.corpo.estado), semCarimbo(DADOS.enxugar(rep.store.estado))), '', 'estado do servidor = estado da tela');
        });
      });
    });

    it('depois de reiniciar o servidor, a limpeza continua valendo (nada volta, nada some)', function () {
      var pasta = U.pastaTemp(), esperado;
      return comTres(function (c, srv) {
        return trabalhar(c).then(function () {
          srv.rotacionarLogs('teste', NO_FUTURO);
          return c.chefe.get('/api/estado');
        }).then(function (r) { esperado = r.corpo.estado.log.map(function (l) { return l.campo + '|' + l.login; }).join(','); });
      }, pasta).then(function () {
        return U.comServidor(function (cli) {
          return cli.post('/api/entrar', { login: 'admin', senha: U.SENHA }).then(function () { return cli.get('/api/estado'); }).then(function (r) {
            igual(r.corpo.estado.log.map(function (l) { return l.campo + '|' + l.login; }).join(','), esperado);
            verdadeiro(fs.existsSync(path.join(pasta, 'logs', 'alteracoes_' + MES_REAL + '.jsonl.gz')), 'o arquivo continua lá');
          });
        }, pasta);
      });
    });
  });

  describe('Prazo de guarda, configuração e download', function () {

    it('o arquivo que passou do prazo de guarda é apagado (e o apagamento fica registrado); com 0 anos, nunca', function () {
      return comTres(function (c, srv, pasta) {
        var longe = core.somarMesesAoMes(MES_REAL, 12 * 6 + 2) + '-10';   // 6 anos depois
        return U.comando(c.chefe, 'adicionarCirurgia', U.CIRURGIA).then(function () {
          srv.rotacionarLogs('teste', NO_FUTURO);
          verdadeiro(fs.existsSync(path.join(pasta, 'logs', 'alteracoes_' + MES_REAL + '.jsonl.gz')));
          return U.comando(c.chefe, 'salvarConfigLog', 6, 0);
        }).then(function (x) {
          verdadeiro(x.resp.corpo.ok, JSON.stringify(x.resp.corpo));
          var r = srv.rotacionarLogs('teste', longe);
          igual(r.apagados, 0, '0 anos = nunca apagar sozinho');
          verdadeiro(fs.existsSync(path.join(pasta, 'logs', 'alteracoes_' + MES_REAL + '.jsonl.gz')));
          return U.comando(c.chefe, 'salvarConfigLog', 6, 5);
        }).then(function () {
          var r = srv.rotacionarLogs('teste', longe);
          verdadeiro(r.apagados >= 2, 'os dois arquivos do mês passaram de 5 anos');
          falso(fs.existsSync(path.join(pasta, 'logs', 'alteracoes_' + MES_REAL + '.jsonl.gz')));
          return c.chefe.get('/api/auditoria/acessos?evento=log_arquivo_apagado');
        }).then(function (r) {
          verdadeiro(r.corpo.eventos.length >= 2, 'quem apagou o quê, e por quê, ficou registrado');
          verdadeiro(/passou de 5 ano/.test(r.corpo.eventos[0].detalhe));
          return c.chefe.get('/api/auditoria/arquivos');
        }).then(function (r) { igual(r.corpo.arquivos.length, 0); });
      });
    });

    it('só o chefe muda a configuração, e a faixa é respeitada', function () {
      return comTres(function (c) {
        return U.comando(c.secretaria, 'salvarConfigLog', 3, 2).then(function (x) {
          igual(x.resp.status, 403);
          return U.comando(c.anestesista, 'salvarConfigLog', 3, 2);
        }).then(function (x) {
          igual(x.resp.status, 403);
          return U.comando(c.chefe, 'salvarConfigLog', 99, 2);
        }).then(function (x) {
          falso(x.resp.corpo.ok, 'fora da faixa');
          return U.comando(c.chefe, 'salvarConfigLog', 3, 2);
        }).then(function (x) {
          verdadeiro(x.resp.corpo.ok);
          return c.chefe.get('/api/auditoria/arquivos');
        }).then(function (r) {
          igual(r.corpo.config.mesesNaTela, 3); igual(r.corpo.config.anosDeGuarda, 2);
        });
      });
    });

    it('ninguém, nem o chefe, manda a limpeza pela rede: é operação do próprio servidor', function () {
      return comTres(function (c) {
        return U.comando(c.chefe, 'arquivarLogAte', '2100-01-01').then(function (x) {
          igual(x.resp.status, 403);
          igual(x.resp.corpo.motivo, 'interna');
        });
      });
    });

    it('o arquivo baixa em CSV (planilha) e em JSON por linha, com o login, e o download fica registrado', function () {
      return comTres(function (c, srv) {
        return U.comando(c.secretaria, 'adicionarCirurgia', Object.assign({}, U.CIRURGIA, { valor: 321 })).then(function () {
          srv.rotacionarLogs('teste', NO_FUTURO);
          return c.chefe.get('/api/auditoria/arquivos/alteracoes_' + MES_REAL);
        }).then(function (r) {
          igual(r.status, 200);
          verdadeiro(/attachment/.test(r.headers.get('content-disposition')) && /\.csv"/.test(r.headers.get('content-disposition')));
          var csv = r.corpo.toString('utf8');
          verdadeiro(/LOGIN/.test(csv.split('\n')[0]), 'cabeçalho com LOGIN');
          verdadeiro(/secretaria1/.test(csv), 'e o login de quem fez');
          return c.chefe.get('/api/auditoria/arquivos/acessos_' + MES_REAL + '?formato=jsonl');
        }).then(function (r) {
          igual(r.status, 200);
          var linhas = core.entradasDoTextoDeLog(r.corpo.toString('utf8')).entradas;
          verdadeiro(linhas.some(function (e) { return e.evento === 'entrada' && e.login === 'secretaria1'; }), 'os acessos do mês, por usuário');
          return c.chefe.get('/api/auditoria/arquivos/alteracoes_2000-01');
        }).then(function (r) {
          igual(r.status, 404);
          return c.chefe.get('/api/auditoria/arquivos/..%2f..%2festado');
        }).then(function (r) {
          verdadeiro(r.status === 404 || r.status === 400, 'nome de arquivo fora do formato não passa: ' + r.status);
          return c.chefe.get('/api/auditoria/acessos?evento=log_arquivo_baixado');
        }).then(function (r) {
          verdadeiro(r.corpo.eventos.length >= 2, 'quem baixou o quê');
        });
      });
    });

    it('o índice perdido ou estragado é refeito a partir dos arquivos que existem', function () {
      return comTres(function (c, srv, pasta) {
        return trabalhar0(c).then(function () {
          srv.rotacionarLogs('teste', NO_FUTURO);
          fs.writeFileSync(path.join(pasta, 'logs', 'indice.json'), '{ isto não é json');
          return c.chefe.get('/api/auditoria/arquivos');
        }).then(function (r) {
          verdadeiro(r.corpo.arquivos.length >= 2, 'os arquivos continuam listados');
          verdadeiro(r.corpo.arquivos.every(function (a) { return /^[0-9a-f]{64}$/.test(a.sha256) && a.reconstruido; }));
          verdadeiro(fs.readdirSync(path.join(pasta, 'logs')).some(function (n) { return /^indice\.ilegivel_/.test(n); }), 'o índice estragado foi guardado de lado');
          return c.chefe.post('/api/auditoria/conferir', {});
        }).then(function (r) { verdadeiro(r.corpo.ok); });
      });
    });

    function trabalhar0(c) { return U.comando(c.chefe, 'adicionarCirurgia', U.CIRURGIA); }
  });
};
