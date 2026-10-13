/**
 * QA 39 — Versão online: uma conta de demonstração por perfil (webapp/js/demo_online.js)
 *   - três contas, uma para cada perfil de core/12b_permissoes.js, com login e senha próprios
 *   - a entrada fica guardada na aba (sessionStorage) e "Sair" a apaga
 *   - chefe e anestesista assinam o boletim em nome de anestesistas diferentes do cadastro (ativos);
 *     a secretária não assina
 *   - com essa ligação, a tabela de perfis prende a assinatura a quem entrou, como no servidor
 */
'use strict';

var fs = require('fs');
var path = require('path');
var vm = require('vm');

module.exports = function (t, core, dados) {
  var describe = t.describe, it = t.it, igual = t.igual, verdadeiro = t.verdadeiro, falso = t.falso;
  var RAIZ = path.join(__dirname, '..');

  /** Carrega o demo_online.js com um sessionStorage de mentira (ou um que recusa tudo, como a janela privada). */
  function carregar(opcoes) {
    opcoes = opcoes || {};
    var guardado = {};
    var recarregou = { vezes: 0 };
    var sessao = opcoes.semArmazenamento ? {
      getItem: function () { throw new Error('bloqueado'); },
      setItem: function () { throw new Error('bloqueado'); },
      removeItem: function () { throw new Error('bloqueado'); }
    } : {
      getItem: function (k) { return Object.prototype.hasOwnProperty.call(guardado, k) ? guardado[k] : null; },
      setItem: function (k, v) { guardado[k] = String(v); },
      removeItem: function (k) { delete guardado[k]; }
    };
    var ctx = vm.createContext(Object.assign({}, core, {
      UI: { info: function () {}, ok: function () {} }, console: console,
      sessionStorage: sessao, location: { reload: function () { recarregou.vezes++; } }
    }));
    vm.runInContext(fs.readFileSync(path.join(RAIZ, 'webapp', 'js', 'demo_online.js'), 'utf8'), ctx);
    return { DEMO: vm.runInContext('DEMO', ctx), guardado: guardado, recarregou: recarregou };
  }

  function anestesistas() {
    return core.criarStoreComSeed(dados.seed, { usuario: 'demo', horizonte: 'movel', hoje: '2026-10-13' }).estado.anestesistas;
  }

  describe('Contas de demonstração — uma por perfil', function () {

    it('três contas, uma para cada perfil, com login e senha próprios', function () {
      var C = carregar().DEMO.CONTAS;
      igual(C.map(function (c) { return c.perfil; }).join(','), core.ORDEM_DOS_PERFIS.join(','));
      C.forEach(function (c) {
        igual(core.perfilCanonico(c.perfil), c.perfil, c.login);
        verdadeiro(c.login && c.senha && c.nome, 'conta incompleta: ' + c.login);
      });
      var logins = C.map(function (c) { return c.login; });
      var senhas = C.map(function (c) { return c.senha; });
      igual(new Set(logins).size, 3, 'logins repetidos');
      igual(new Set(senhas).size, 3, 'senhas repetidas');
    });

    it('a entrada fica na aba, e "Sair" apaga e recarrega a página', function () {
      var d = carregar();
      igual(d.DEMO.contaAtiva(), null, 'ninguém entrou ainda');
      d.guardado['anestesia.demo.login'] = 'secretaria';
      igual(d.DEMO.contaAtiva().perfil, 'secretaria');
      d.DEMO.sair();
      igual(d.DEMO.contaAtiva(), null);
      igual(d.recarregou.vezes, 1);
    });

    it('login desconhecido na aba não entra como ninguém', function () {
      var d = carregar();
      d.guardado['anestesia.demo.login'] = 'admin';
      igual(d.DEMO.contaAtiva(), null);
    });

    it('entrar() devolve na hora a conta de quem já entrou nesta aba', function () {
      var d = carregar();
      d.guardado['anestesia.demo.login'] = 'chefe';
      return d.DEMO.entrar().then(function (c) { igual(c.perfil, 'chefe'); });
    });

    it('sem sessionStorage (janela privada) nada quebra: ninguém fica lembrado', function () {
      var d = carregar({ semArmazenamento: true });
      igual(d.DEMO.contaAtiva(), null);
      d.DEMO.sair();
      igual(d.recarregou.vezes, 1);
    });
  });

  describe('Contas de demonstração — quem assina o boletim', function () {

    function conta(D, perfil) { return D.CONTAS.filter(function (c) { return c.perfil === perfil; })[0]; }

    it('chefe e anestesista assinam por anestesistas ativos e diferentes; a secretária não assina', function () {
      var D = carregar().DEMO;
      var lista = anestesistas();
      var idChefe = D.idDoAssinante(conta(D, 'chefe'), lista);
      var idAnest = D.idDoAssinante(conta(D, 'anestesista'), lista);
      verdadeiro(idChefe && idAnest, 'sem vínculo');
      verdadeiro(idChefe !== idAnest, 'os dois assinariam pelo mesmo anestesista');
      [idChefe, idAnest].forEach(function (id) {
        var a = lista.filter(function (x) { return x.id === id; })[0];
        verdadeiro(a && core.ehSim(a.ativo), 'vínculo com anestesista inativo ou inexistente: ' + id);
      });
      igual(D.idDoAssinante(conta(D, 'secretaria'), lista), '');
    });

    it('anestesista inativo fica de fora: o vínculo passa para o próximo ativo', function () {
      var D = carregar().DEMO;
      var lista = anestesistas().map(function (a) { return Object.assign({}, a); });
      var antes = D.idDoAssinante(conta(D, 'chefe'), lista);
      lista.filter(function (a) { return a.id === antes; })[0].ativo = 'Não';
      var depois = D.idDoAssinante(conta(D, 'chefe'), lista);
      verdadeiro(depois && depois !== antes, 'continuou ligado ao inativo');
    });

    it('com o vínculo, o boletim só se assina no nome de quem entrou (a mesma regra do servidor)', function () {
      var D = carregar().DEMO;
      var lista = anestesistas();
      var c = conta(D, 'anestesista');
      var ctx = core.contextoDeAssinatura(D.idDoAssinante(c, lista), lista);
      var eu = ctx.anestesista;
      var outro = lista.filter(function (a) { return a.id !== eu.id; })[0];
      verdadeiro(core.perfilPodeExecutar(c.perfil, 'finalizarBoletim', ['BOL0001', { nome: eu.nome, crm: eu.crm }], ctx).ok);
      falso(core.perfilPodeExecutar(c.perfil, 'finalizarBoletim', ['BOL0001', { nome: outro.nome, crm: '' }], ctx).ok);
      falso(core.perfilPodeExecutar('secretaria', 'finalizarBoletim', ['BOL0001', { nome: eu.nome }],
        core.contextoDeAssinatura(D.idDoAssinante(conta(D, 'secretaria'), lista), lista)).ok);
    });
  });
};
