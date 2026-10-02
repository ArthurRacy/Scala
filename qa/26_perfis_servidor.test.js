/**
 * QA 26 — Os três perfis no servidor (server/servidor.js + server/contas.js)
 *   Quem decide é o servidor, nunca a tela:
 *   - nomes antigos ("admin", "equipe") e o arquivo de usuários antigo viram os perfis novos
 *   - cada perfil recebe o estado do seu tamanho (o anestesista, sem dinheiro)
 *   - operação fora do perfil é recusada (403), e dinheiro vindo do anestesista também
 *   - os comandos dos outros chegam ao anestesista já cortados; o aviso por SSE não diz que houve repasse
 *   - usuários, backup, cópias e restauração são só do Anestesista chefe
 *   - mudar o perfil de alguém derruba as sessões dela
 */
'use strict';

var fs = require('fs');
var path = require('path');

module.exports = function (t, core) {
  var describe = t.describe, it = t.it, igual = t.igual, verdadeiro = t.verdadeiro, falso = t.falso;
  var U = require('./_servidor_util')(core);

  /** Chefe + secretária + anestesista, cada um com seu "navegador". */
  function comTresPerfis(fn, pasta) {
    return U.comServidor(function (chefeCli, srv, p, base) {
      return U.chefe(chefeCli, p).then(function () {
        return Promise.all([
          U.novoUsuario(chefeCli, base, 'secretaria1', 'Secretária Um', 'secretaria'),
          U.novoUsuario(chefeCli, base, 'dra1', 'Doutora Um', 'anestesista')
        ]);
      }).then(function (outros) {
        return fn({ chefe: chefeCli, secretaria: outros[0], anestesista: outros[1] }, srv, p, base);
      });
    }, pasta);
  }

  describe('Perfis no servidor: entrada', function () {

    it('o primeiro acesso cria o chefe; os nomes antigos viram os novos', function () {
      return U.comServidor(function (cli, srv, pasta, base) {
        return U.chefe(cli, pasta).then(function () { return cli.get('/api/eu'); }).then(function (r) {
          igual(r.corpo.usuario.papel, 'chefe');
          return cli.post('/api/usuarios', { novo: true, login: 'velho1', nome: 'Velho Um', papel: 'admin', senha: U.SENHA });
        }).then(function (r) {
          igual(r.corpo.usuario.papel, 'chefe', 'admin = chefe');
          return cli.post('/api/usuarios', { novo: true, login: 'velho2', nome: 'Velho Dois', papel: 'equipe', senha: U.SENHA });
        }).then(function (r) {
          igual(r.corpo.usuario.papel, 'anestesista', 'equipe = anestesista');
          return cli.post('/api/usuarios', { novo: true, login: 'estranho', nome: 'Estranho', papel: 'dono', senha: U.SENHA });
        }).then(function (r) {
          igual(r.status, 400, 'perfil que não existe é recusado');
        });
      });
    });

    it('arquivo de usuários antigo (admin/equipe) é migrado ao subir, e quem tem valor estranho fica no perfil que menos vê', function () {
      var pasta = U.pastaTemp();
      return U.comServidor(function (cli, srv, p, base) {
        return U.chefe(cli, p).then(function () {
          return cli.post('/api/usuarios', { novo: true, login: 'op1', nome: 'Operador Um', papel: 'secretaria', senha: U.SENHA });
        }).then(function () {
          return cli.post('/api/usuarios', { novo: true, login: 'op2', nome: 'Operador Dois', papel: 'secretaria', senha: U.SENHA });
        });
      }, pasta).then(function () {
        var arq = path.join(pasta, 'usuarios.json');
        var lista = JSON.parse(fs.readFileSync(arq, 'utf8'));
        lista[0].papel = 'admin'; lista[1].papel = 'equipe'; lista[2].papel = 'super-usuario-inventado';
        fs.writeFileSync(arq, JSON.stringify(lista));
        return U.comServidor(function (cli, srv, p, base) {
          var c2 = U.cliente(base), c3 = U.cliente(base);
          return cli.post('/api/entrar', { login: 'admin', senha: U.SENHA }).then(function (r) {
            igual(r.corpo.usuario.papel, 'chefe');
            return c2.post('/api/entrar', { login: 'op1', senha: U.SENHA });
          }).then(function (r) {
            igual(r.corpo.usuario.papel, 'anestesista', 'equipe virou anestesista');
            return c3.post('/api/entrar', { login: 'op2', senha: U.SENHA });
          }).then(function (r) {
            igual(r.corpo.usuario.papel, 'anestesista', 'valor desconhecido nunca vira perfil mais aberto');
            var depois = JSON.parse(fs.readFileSync(arq, 'utf8')).map(function (u) { return u.papel; }).join(',');
            igual(depois, 'chefe,anestesista,anestesista', 'o arquivo foi regravado com os nomes novos');
          });
        }, pasta);
      });
    });
  });

  describe('Perfis no servidor: o que cada um recebe', function () {

    function prepararDinheiro(c) {
      return U.comando(c.chefe, 'salvarAnestesista', { id: 'A06', pix: 'fabricio-pix@exemplo.com', telefone: '(61) 97777-0000', email: 'f@exemplo.com' })
        .then(function () {
          return U.comando(c.chefe, 'adicionarCirurgia', Object.assign({}, U.CIRURGIA, { valor: 4321.5, pago: 'Sim', dataPagamento: '2026-10-06', nf: 'NF-REAL-9' }));
        }).then(function (x) {
          verdadeiro(x.resp.corpo.ok, JSON.stringify(x.resp.corpo));
          return U.comando(c.chefe, 'registrarPagamentoRepasse', 2026, 10, 'A06', 111.11, '2026-10-20');
        }).then(function (x) { verdadeiro(x.resp.corpo.ok, JSON.stringify(x.resp.corpo)); });
    }

    it('chefe recebe tudo; secretária recebe tudo menos o LOG; anestesista nada de dinheiro', function () {
      return comTresPerfis(function (c) {
        return prepararDinheiro(c).then(function () {
          return Promise.all([c.chefe.get('/api/estado'), c.secretaria.get('/api/estado'), c.anestesista.get('/api/estado')]);
        }).then(function (r) {
          var e = { chefe: r[0].corpo.estado, secretaria: r[1].corpo.estado, anestesista: r[2].corpo.estado };
          verdadeiro(e.chefe.log.length > 0 && e.chefe.repasses.length === 1);
          igual(e.chefe.cirurgias[0].valor, 4321.5);
          igual(e.secretaria.log.length, 0, 'secretária não recebe o LOG');
          igual(e.secretaria.cirurgias[0].valor, 4321.5);
          igual(e.secretaria.cirurgias[0].nf, 'NF-REAL-9');
          igual(e.secretaria.repasses.length, 1);
          igual(e.secretaria.anestesistas.filter(function (a) { return a.id === 'A06'; })[0].pix, 'fabricio-pix@exemplo.com');

          var cru = JSON.stringify(r[2].corpo);
          ['4321.5', 'NF-REAL-9', '111.11', 'fabricio-pix@exemplo.com', '(61) 97777-0000', 'f@exemplo.com'].forEach(function (segredo) {
            falso(cru.indexOf(segredo) >= 0, segredo + ' não pode chegar ao anestesista');
          });
          igual(e.anestesista.repasses.length, 0);
          igual(e.anestesista.log.length, 0);
          igual(e.anestesista.cirurgias[0].paciente, 'Paciente Perfis', 'a operação continua inteira');
          igual(e.anestesista.cirurgias[0].anestesista, 'Fabrício Tavares');
        });
      });
    });

    it('os comandos dos outros chegam ao anestesista cortados: repasse some, campos de dinheiro saem', function () {
      return comTresPerfis(function (c) {
        return prepararDinheiro(c).then(function () {
          return Promise.all([c.chefe.get('/api/comandos?desde=0'), c.anestesista.get('/api/comandos?desde=0'), c.secretaria.get('/api/comandos?desde=0')]);
        }).then(function (r) {
          var nomes = function (x) { return x.corpo.comandos.map(function (k) { return k.oculto ? '(oculto)' : k.nome; }).join(','); };
          igual(nomes(r[0]), 'salvarAnestesista,adicionarCirurgia,registrarPagamentoRepasse', 'chefe vê como foi gravado');
          igual(nomes(r[2]), 'salvarAnestesista,adicionarCirurgia,registrarPagamentoRepasse', 'secretária também');
          igual(nomes(r[1]), 'salvarAnestesista,adicionarCirurgia,(oculto)', 'anestesista: o repasse é ocultado');
          var texto = JSON.stringify(r[1].corpo);
          ['4321.5', 'NF-REAL-9', '111.11', 'fabricio-pix@exemplo.com'].forEach(function (segredo) {
            falso(texto.indexOf(segredo) >= 0, segredo + ' fora dos comandos do anestesista');
          });
          igual(r[1].corpo.comandos[1].args[0].paciente, 'Paciente Perfis');
        });
      });
    });

    it('o aviso por SSE não diz ao anestesista que houve repasse', function () {
      return comTresPerfis(function (c, srv, pasta, base) {
        var esperaA, esperaS;
        return U.ouvirEventos(base, c.anestesista.cookie(), function (ev) { return ev.some(function (e) { return e.evento === 'comando'; }); })
          .then(function (a) {
            esperaA = a.fim;
            return U.ouvirEventos(base, c.secretaria.cookie(), function (ev) { return ev.some(function (e) { return e.evento === 'comando'; }); });
          }).then(function (s) {
            esperaS = s.fim;
            return U.comando(c.chefe, 'registrarPagamentoRepasse', 2026, 10, 'A06', 50, '2026-10-20');
          }).then(function (x) {
            verdadeiro(x.resp.corpo.ok, JSON.stringify(x.resp.corpo));
            return Promise.all([esperaA, esperaS]);
          }).then(function (r) {
            var cmdA = r[0].filter(function (e) { return e.evento === 'comando'; })[0].dados;
            var cmdS = r[1].filter(function (e) { return e.evento === 'comando'; })[0].dados;
            igual(cmdS.nome, 'registrarPagamentoRepasse', 'a secretária sabe');
            igual(cmdA.nome, '', 'o anestesista não sabe o que foi');
            igual(cmdA.usuario, '', 'nem de quem');
            igual(cmdA.revisao, cmdS.revisao, 'mas acompanha a mesma revisão');
          });
      });
    });
  });

  describe('Perfis no servidor: o que cada um faz', function () {

    function status(x) { return x.resp.status; }

    it('anestesista: opera e preenche a ficha, mas não mexe em dinheiro, cadastro, repasse nem coordenação', function () {
      return comTresPerfis(function (c) {
        var a = c.anestesista;
        return U.comando(a, 'adicionarCirurgia', Object.assign({}, U.CIRURGIA, { valor: 100 })).then(function (x) {
          igual(status(x), 403); igual(x.resp.corpo.motivo, 'campo', 'dinheiro enviado pelo anestesista');
          return U.comando(a, 'adicionarCirurgia', U.CIRURGIA);
        }).then(function (x) {
          verdadeiro(x.resp.corpo.ok, 'sem dinheiro lança: ' + JSON.stringify(x.resp.corpo));
          return U.comando(a, 'atualizarCirurgia', 'CIR0001', { pago: 'Sim' });
        }).then(function (x) {
          igual(status(x), 403, 'marcar como pago');
          return U.comando(a, 'atualizarCirurgia', 'CIR0001', { sala: 'Sala 4' });
        }).then(function (x) {
          verdadeiro(x.resp.corpo.ok, 'editar sala pode');
          return U.comando(a, 'criarBoletim', 'CIR0001');
        }).then(function (x) {
          verdadeiro(x.resp.corpo.ok, 'boletim é do anestesista: ' + JSON.stringify(x.resp.corpo));
          return U.comando(a, 'criarFichaQualidade', 'CIR0001');
        }).then(function (x) {
          verdadeiro(x.resp.corpo.ok, 'ficha de qualidade pode');
          return U.comando(a, 'registrarPagamentoRepasse', 2026, 10, 'A06', 10, '2026-10-20');
        }).then(function (x) {
          igual(status(x), 403, 'repasse');
          return U.comando(a, 'salvarAnestesista', { id: 'A06', ativo: 'Não' });
        }).then(function (x) {
          igual(status(x), 403, 'cadastro');
          return U.comando(a, 'definirEscalaBase', []);
        }).then(function (x) {
          igual(status(x), 403, 'escala-base');
          return U.comando(a, 'salvarRegistroEstrutura', { data: '2026-10-05', turno: 'Manhã', unidade: 'CC' });
        }).then(function (x) {
          igual(status(x), 403, 'estrutura');
          return U.comando(a, 'reparar');
        }).then(function (x) {
          igual(status(x), 403, 'reparo geral');
        });
      });
    });

    it('secretária: operação e gestão (inclusive repasse e cadastro com PIX), sem boletim, estrutura e coordenação', function () {
      return comTresPerfis(function (c) {
        var s = c.secretaria;
        return U.comando(s, 'adicionarCirurgia', Object.assign({}, U.CIRURGIA, { valor: 900, pago: 'Sim', dataPagamento: '2026-10-06', nf: 'N1' })).then(function (x) {
          verdadeiro(x.resp.corpo.ok, 'cirurgia com valor: ' + JSON.stringify(x.resp.corpo));
          return U.comando(s, 'salvarDespesasRepasse', 2026, 10, 50, 'aluguel');
        }).then(function (x) {
          verdadeiro(x.resp.corpo.ok, 'despesas do repasse');
          return U.comando(s, 'registrarPagamentoRepasse', 2026, 10, 'A06', 20, '2026-10-20');
        }).then(function (x) {
          verdadeiro(x.resp.corpo.ok, 'repasse');
          return U.comando(s, 'salvarAnestesista', { id: 'A06', pix: 'novo-pix@exemplo.com' });
        }).then(function (x) {
          verdadeiro(x.resp.corpo.ok, 'cadastro e PIX');
          return U.comando(s, 'salvarConfigClinica', { nome: 'Clínica Teste' });
        }).then(function (x) {
          verdadeiro(x.resp.corpo.ok, 'dados da clínica: ' + JSON.stringify(x.resp.corpo));
          return U.comando(s, 'criarFichaQualidade', 'CIR0001');
        }).then(function (x) {
          verdadeiro(x.resp.corpo.ok, 'a ficha de qualidade ela acessa');
          return U.comando(s, 'criarBoletim', 'CIR0001');
        }).then(function (x) {
          igual(status(x), 403, 'boletim: criar');
          return U.comando(s, 'finalizarBoletim', 'BOL0001', {});
        }).then(function (x) {
          igual(status(x), 403, 'boletim: assinar');
          return U.comando(s, 'reabrirBoletim', 'BOL0001', 'motivo qualquer longo');
        }).then(function (x) {
          igual(status(x), 403, 'boletim: reabrir');
          return U.comando(s, 'salvarRegistroEstrutura', { data: '2026-10-05', turno: 'Manhã', unidade: 'CC' });
        }).then(function (x) {
          igual(status(x), 403, 'estrutura');
          return U.comando(s, 'salvarConfigQualidade', { limiares: { spo2: 80 } });
        }).then(function (x) {
          igual(status(x), 403, 'configuração clínica da qualidade');
          return U.comando(s, 'reparar');
        }).then(function (x) {
          igual(status(x), 403, 'reparo geral');
        });
      });
    });

    it('chefe faz tudo', function () {
      return comTresPerfis(function (c) {
        return U.comando(c.chefe, 'adicionarCirurgia', Object.assign({}, U.CIRURGIA, { valor: 10 })).then(function (x) {
          verdadeiro(x.resp.corpo.ok);
          return U.comando(c.chefe, 'salvarRegistroEstrutura', { data: '2026-10-05', turno: 'Manhã', unidade: 'CC' });
        }).then(function (x) {
          verdadeiro(x.resp.corpo.ok, 'estrutura: ' + JSON.stringify(x.resp.corpo));
          return U.comando(c.chefe, 'criarBoletim', 'CIR0001');
        }).then(function (x) {
          verdadeiro(x.resp.corpo.ok, 'boletim');
        });
      });
    });

    it('a recusa não deixa rastro no estado nem no diário', function () {
      return comTresPerfis(function (c) {
        return U.comando(c.anestesista, 'registrarPagamentoRepasse', 2026, 10, 'A06', 10, '2026-10-20').then(function (x) {
          igual(status(x), 403);
          return c.chefe.get('/api/estado');
        }).then(function (r) {
          igual(r.corpo.revisao, 0, 'nenhum comando foi aceito');
          igual(r.corpo.estado.repasses.length, 0);
        });
      });
    });
  });

  describe('Perfis no servidor: administração e exames', function () {

    it('usuários, backup, cópias, importação e apagar tudo são só do chefe', function () {
      return comTresPerfis(function (c) {
        var proibidos = [['get', '/api/usuarios'], ['get', '/api/backup'], ['get', '/api/copias'],
          ['post', '/api/importar', Buffer.from('{}')], ['post', '/api/apagar-tudo', { confirmacao: 'APAGAR' }],
          ['post', '/api/copias/restaurar', { id: 'estado_2026-10-05.json.gz' }],
          ['post', '/api/usuarios', { novo: true, login: 'intruso', nome: 'Intruso', papel: 'chefe', senha: U.SENHA }]];
        var fila = Promise.resolve();
        ['secretaria', 'anestesista'].forEach(function (quem) {
          proibidos.forEach(function (p) {
            fila = fila.then(function () { return c[quem][p[0]](p[1], p[2]); }).then(function (r) {
              igual(r.status, 403, quem + ' ' + p[1]);
            });
          });
        });
        return fila.then(function () { return c.chefe.get('/api/usuarios'); }).then(function (r) {
          igual(r.status, 200);
          igual(r.corpo.usuarios.map(function (u) { return u.login + ':' + u.papel; }).join(','),
            'admin:chefe,secretaria1:secretaria,dra1:anestesista', 'ninguém virou chefe por fora');
          return c.chefe.get('/api/backup');
        }).then(function (r) { igual(r.status, 200); });
      });
    });

    it('os três perfis anexam e leem exames (é operação), e o PDF é o mesmo', function () {
      return comTresPerfis(function (c) {
        var uid;
        return U.comando(c.chefe, 'adicionarCirurgia', Object.assign({}, U.CIRURGIA, { avaliacaoNec: 'Sim' })).then(function (x) {
          uid = x.store.estado.avaliacoes[0].uid;
          var fila = Promise.resolve(), ids = [];
          ['chefe', 'secretaria', 'anestesista'].forEach(function (quem) {
            fila = fila.then(function () {
              return c[quem].post('/api/anexos', U.PDF, { 'X-Uid-Avaliacao': uid, 'X-Nome': quem + '.pdf', 'Content-Type': 'application/pdf' });
            }).then(function (r) { igual(r.status, 200, quem + ' anexa'); ids.push(r.corpo.meta.id); });
          });
          return fila.then(function () { return ids; });
        }).then(function (ids) {
          return Promise.all(['chefe', 'secretaria', 'anestesista'].map(function (quem, i) { return c[quem].get('/api/anexos/' + ids[i]); }));
        }).then(function (rs) {
          rs.forEach(function (r) { igual(r.corpo.toString(), U.PDF.toString()); });
        });
      });
    });

    it('mudar o perfil de alguém derruba as sessões dela; a pessoa entra de novo com o perfil novo', function () {
      return comTresPerfis(function (c, srv, pasta, base) {
        var nova = U.cliente(base);
        return c.secretaria.get('/api/estado').then(function (r) {
          igual(r.status, 200);
          return c.chefe.post('/api/usuarios', { login: 'secretaria1', papel: 'anestesista' });
        }).then(function (r) {
          igual(r.status, 200, JSON.stringify(r.corpo));
          return c.secretaria.get('/api/estado');
        }).then(function (r) {
          igual(r.status, 401, 'a sessão antiga caiu');
          return nova.post('/api/entrar', { login: 'secretaria1', senha: U.SENHA });
        }).then(function (r) {
          igual(r.corpo.usuario.papel, 'anestesista');
          return nova.get('/api/estado');
        }).then(function (r) {
          igual(r.corpo.estado.repasses.length, 0);
          return nova.get('/api/usuarios');
        }).then(function (r) { igual(r.status, 403); });
      });
    });

    it('o único chefe não perde o perfil nem é desativado', function () {
      return comTresPerfis(function (c) {
        return c.chefe.post('/api/usuarios', { login: 'admin', papel: 'secretaria' }).then(function (r) {
          igual(r.status, 400);
          return c.chefe.post('/api/usuarios', { login: 'admin', ativo: false });
        }).then(function (r) { igual(r.status, 400); });
      });
    });
  });
};
