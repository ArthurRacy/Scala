/**
 * QA 35 — O boletim só é assinado por quem entrou no sistema (auditoria F05)
 *   No servidor da clínica, cada login de chefe ou de anestesista é ligado a um anestesista do cadastro; o boletim sai
 *   no nome e no CRM dele, e o servidor recusa qualquer outro nome. Sem login (um computador só), a assinatura é livre.
 */
'use strict';

module.exports = function (t, core, dados) {
  var describe = t.describe, it = t.it, igual = t.igual, verdadeiro = t.verdadeiro, falso = t.falso;

  var U = require('./_servidor_util.js')(core);
  var TRACOS = [[[0.1, 0.5], [0.3, 0.3], [0.5, 0.6], [0.8, 0.4]]];

  /* ====================================================================== */
  describe('A regra, sem servidor', function () {

    var anestesistas = [{ id: 'A06', nome: 'Fabrício Tavares', crm: '12345-DF' }, { id: 'A07', nome: 'Tiago Tolentino', crm: '' }];

    it('o contexto vem do cadastro: nome e CRM de quem está ligado; sem vínculo, nenhum', function () {
      igual(core.contextoDeAssinatura('A06', anestesistas).anestesista.nome, 'Fabrício Tavares');
      igual(core.contextoDeAssinatura('A06', anestesistas).anestesista.crm, '12345-DF');
      igual(core.contextoDeAssinatura('', anestesistas).anestesista, null);
      igual(core.contextoDeAssinatura('A99', anestesistas).anestesista, null);
      igual(core.contextoDeAssinatura(undefined, undefined).anestesista, null);
    });

    it('sem contexto (um computador só) a assinatura é livre; com contexto, só o nome e o CRM do próprio', function () {
      var args = ['BOL0001', { tracos: TRACOS, nome: 'Qualquer Um', crm: '1' }];
      verdadeiro(core.perfilPodeExecutar('chefe', 'finalizarBoletim', args).ok);
      var ctx = core.contextoDeAssinatura('A06', anestesistas);
      falso(core.perfilPodeExecutar('chefe', 'finalizarBoletim', args, ctx).ok, 'outro nome');
      falso(core.perfilPodeExecutar('chefe', 'finalizarBoletim', ['B', { nome: 'Fabrício Tavares', crm: '999' }], ctx).ok, 'CRM diferente do cadastro');
      verdadeiro(core.perfilPodeExecutar('chefe', 'finalizarBoletim', ['B', { nome: 'fabricio tavares', crm: '12345-df' }], ctx).ok, 'acento e caixa não importam');
      verdadeiro(core.perfilPodeExecutar('anestesista', 'finalizarBoletim', ['B', { nome: 'Tiago Tolentino', crm: '777-DF' }],
        core.contextoDeAssinatura('A07', anestesistas)).ok, 'cadastro sem CRM: vale o digitado (e vai para o cadastro)');
      var semVinculo = core.perfilPodeExecutar('anestesista', 'finalizarBoletim', args, core.contextoDeAssinatura('', anestesistas));
      falso(semVinculo.ok);
      igual(semVinculo.motivo, 'vinculo');
    });

    it('a secretária continua sem assinar, com ou sem vínculo', function () {
      var r = core.perfilPodeExecutar('secretaria', 'finalizarBoletim', ['B', {}], core.contextoDeAssinatura('A06', anestesistas));
      falso(r.ok);
      igual(r.motivo, 'perfil');
    });
  });

  /* ====================================================================== */
  describe('No servidor da clínica', function () {

    /** Cirurgia + boletim preenchido, pronto para assinar. Devolve o id do boletim. */
    function prepararBoletim(cli, paciente) {
      var cid, bid;
      return U.comando(cli, 'adicionarCirurgia', Object.assign({}, U.CIRURGIA, { paciente: paciente || 'Paciente Assinatura' })).then(function (x) {
        verdadeiro(x.resp.corpo.ok, JSON.stringify(x.resp.corpo));
        cid = x.store.estado.cirurgias[x.store.estado.cirurgias.length - 1].id;
        return U.comando(cli, 'criarBoletim', cid);
      }).then(function (x) {
        verdadeiro(x.resp.corpo.ok, JSON.stringify(x.resp.corpo));
        bid = x.local.boletim.id;
        return U.comando(cli, 'salvarBoletim', bid, {
          paciente: { peso: '70', idade: '40', sexo: 'M' }, pre: { asa: 'I' }, tecnicas: ['Sedação'],
          monitorizacao: core.MONITORIZACAO_BASICA, destino: 'SRPA', semIntercorrencias: true,
          tempos: { inicioAnestesia: '07:00', fimAnestesia: '08:30' }
        });
      }).then(function (x) {
        verdadeiro(x.resp.corpo.ok, JSON.stringify(x.resp.corpo));
        return U.comando(cli, 'alterarLinhaBoletim', bid, 'sinais', { acao: 'adicionar', linha: { hora: '07:05', pas: '120', pad: '80', fc: '70' } });
      }).then(function (x) {
        verdadeiro(x.resp.corpo.ok, JSON.stringify(x.resp.corpo));
        return bid;
      });
    }

    function assinar(cli, bid, nome, crm) {
      return U.comando(cli, 'finalizarBoletim', bid, { tracos: TRACOS, nome: nome, crm: crm });
    }

    it('sem vínculo ninguém assina; ligado, só no próprio nome; o CRM do cadastro manda; o boletim fica em nome de quem entrou', function () {
      var pasta = U.pastaTemp(), bid, bid2;
      return U.comServidor(function (chefe, srv, p, base) {
        return U.chefe(chefe, pasta).then(function () { return prepararBoletim(chefe); }).then(function (id) {
          bid = id;
          return assinar(chefe, bid, 'Fabrício Tavares', '12345-DF');
        }).then(function (x) {
          igual(x.resp.status, 403, 'chefe sem vínculo não assina');
          igual(x.resp.corpo.motivo, 'vinculo');
          verdadeiro(/ligado a um anestesista/.test(x.resp.corpo.erro), x.resp.corpo.erro);
          return chefe.post('/api/usuarios', { login: 'admin', anestesistaId: 'A06' });
        }).then(function (r) {
          igual(r.status, 200, JSON.stringify(r.corpo));
          igual(r.corpo.usuario.anestesistaId, 'A06');
          return chefe.get('/api/eu');
        }).then(function (r) {
          igual(r.corpo.usuario.anestesistaId, 'A06', 'a tela fica sabendo');
          return assinar(chefe, bid, 'Tiago Tolentino', '777-DF');
        }).then(function (x) {
          igual(x.resp.status, 403, 'em nome de outra pessoa não');
          verdadeiro(/em nome de Fabrício Tavares/.test(x.resp.corpo.erro), x.resp.corpo.erro);
          return assinar(chefe, bid, 'Fabrício Tavares', '12345-DF');
        }).then(function (x) {
          verdadeiro(x.resp.corpo.ok, JSON.stringify(x.resp.corpo));
          return chefe.get('/api/estado');
        }).then(function (r) {
          var b = r.corpo.estado.boletins.filter(function (x) { return x.id === bid; })[0];
          igual(b.assinatura.nome, 'Fabrício Tavares');
          igual(b.assinatura.crm, '12345-DF');
          return prepararBoletim(chefe, 'Segundo Paciente');
        }).then(function (id) {
          bid2 = id;
          return assinar(chefe, bid2, 'Fabrício Tavares', '99999-DF');
        }).then(function (x) {
          igual(x.resp.status, 403, 'o CRM já está no cadastro: o digitado diferente é recusado');
          verdadeiro(/12345-DF/.test(x.resp.corpo.erro), x.resp.corpo.erro);
          return assinar(chefe, bid2, 'Fabrício Tavares', '12345-DF');
        }).then(function (x) { verdadeiro(x.resp.corpo.ok, JSON.stringify(x.resp.corpo)); });
      }, pasta);
    });

    it('o anestesista ligado assina no próprio nome; a secretária não assina nem pode ser ligada', function () {
      var pasta = U.pastaTemp();
      return U.comServidor(function (chefe, srv, p, base) {
        var dra, sec, bid;
        return U.chefe(chefe, pasta).then(function () {
          return Promise.all([U.novoUsuario(chefe, base, 'dra1', 'Doutora Um', 'anestesista'), U.novoUsuario(chefe, base, 'sec1', 'Secretária Um', 'secretaria')]);
        }).then(function (o) {
          dra = o[0]; sec = o[1];
          return prepararBoletim(chefe);
        }).then(function (id) {
          bid = id;
          return assinar(dra, bid, 'Tiago Tolentino', '777-DF');
        }).then(function (x) {
          igual(x.resp.status, 403, 'anestesista sem vínculo');
          return chefe.post('/api/usuarios', { login: 'dra1', anestesistaId: 'A07' });
        }).then(function (r) {
          igual(r.status, 200, JSON.stringify(r.corpo));
          return dra.post('/api/entrar', { login: 'dra1', senha: U.SENHA });
        }).then(function () {
          return assinar(dra, bid, 'Tiago Tolentino', '777-DF');
        }).then(function (x) {
          verdadeiro(x.resp.corpo.ok, JSON.stringify(x.resp.corpo));
          return assinar(sec, bid, 'Tiago Tolentino', '777-DF');
        }).then(function (x) {
          igual(x.resp.status, 403, 'secretária não assina');
          igual(x.resp.corpo.motivo, 'perfil');
          return chefe.post('/api/usuarios', { login: 'sec1', anestesistaId: 'A05' });
        }).then(function (r) {
          igual(r.status, 400, 'secretária não é ligada');
          verdadeiro(/não assina boletim/.test(r.corpo.erros[0].msg), JSON.stringify(r.corpo));
        });
      }, pasta);
    });

    it('o vínculo é de uma pessoa só, tem de existir no cadastro e pode ser desfeito', function () {
      var pasta = U.pastaTemp();
      return U.comServidor(function (chefe, srv, p, base) {
        return U.chefe(chefe, pasta).then(function () {
          return U.novoUsuario(chefe, base, 'dra1', 'Doutora Um', 'anestesista');
        }).then(function () {
          return chefe.post('/api/usuarios', { login: 'admin', anestesistaId: 'A06' });
        }).then(function (r) {
          igual(r.status, 200);
          return chefe.post('/api/usuarios', { login: 'dra1', anestesistaId: 'A06' });
        }).then(function (r) {
          igual(r.status, 400, 'o mesmo anestesista em dois logins');
          verdadeiro(/já está ligado ao usuário "admin"/.test(r.corpo.erros[0].msg), JSON.stringify(r.corpo));
          return chefe.post('/api/usuarios', { login: 'dra1', anestesistaId: 'A99' });
        }).then(function (r) {
          igual(r.status, 400, 'anestesista que não existe');
          return chefe.post('/api/usuarios', { login: 'admin', anestesistaId: '' });
        }).then(function (r) {
          igual(r.status, 200, 'desligar sempre pode');
          igual(r.corpo.usuario.anestesistaId, '');
          return chefe.post('/api/usuarios', { login: 'dra1', anestesistaId: 'A06' });
        }).then(function (r) { igual(r.status, 200, 'liberado depois de desligar'); });
      }, pasta);
    });
  });
};
