/**
 * QA 27 — Fuso horário (auditoria F01)
 *   O servidor numa nuvem nasce com o relógio em UTC, e a clínica trabalha em Brasília.
 *   Antes, o servidor lia a hora que a tela mandava ("14:15:23") no fuso DELE, via 3 horas de
 *   diferença e recusava TODA gravação ("relógio fora da hora"); das 21h à meia-noite o "dia"
 *   dele (UTC) já tinha virado e também recusava.
 *   Agora o servidor trabalha sempre no horário de Brasília e a tela manda a hora de Brasília,
 *   qualquer que seja o fuso do computador dela.
 */
'use strict';

var fs = require('fs');
var os = require('os');
var path = require('path');
var cp = require('child_process');

module.exports = function (t, core) {
  var describe = t.describe, it = t.it, igual = t.igual, verdadeiro = t.verdadeiro;
  var RAIZ = path.join(__dirname, '..');

  describe('Hora de Brasília (core/02_util.js)', function () {

    it('converte qualquer instante para o relógio de Brasília, em qualquer fuso do computador', function () {
      igual(core.agoraTextoBrasilia(new Date('2026-10-02T17:15:23Z')), '2026-10-02 14:15:23');
      igual(core.agoraTextoBrasilia(new Date('2026-01-10T12:00:00Z')), '2026-01-10 09:00:00', 'sem horário de verão');
      igual(core.agoraTextoBrasilia(new Date('2026-07-01T03:00:00Z')), '2026-07-01 00:00:00', 'meia-noite em ponto');
    });

    it('perto da meia-noite o dia de Brasília e o dia UTC são diferentes — e vale o de Brasília', function () {
      var instante = new Date('2026-10-03T01:30:00Z');   // 22h30 de 02/10 em Brasília
      igual(core.hojeBrasilia(instante), '2026-10-02');
      igual(instante.toISOString().slice(0, 10), '2026-10-03', 'o UTC já virou o dia');
    });
  });

  describe('Servidor com relógio em UTC (como numa nuvem)', function () {

    /** Sobe o servidor de verdade, num processo à parte, com TZ=UTC no ambiente. */
    function subirComoNuvem() {
      var pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'anestesia-fuso-'));
      return new Promise(function (resolver, rejeitar) {
        var filho = cp.spawn(process.execPath, [path.join(RAIZ, 'server', 'servidor.js'), '--porta', '0', '--host', '127.0.0.1', '--dados', pasta],
          { env: Object.assign({}, process.env, { TZ: 'UTC' }), stdio: ['ignore', 'pipe', 'pipe'] });
        var texto = '';
        var prazo = setTimeout(function () { filho.kill(); rejeitar(new Error('o servidor não subiu a tempo: ' + texto)); }, 15000);
        filho.stdout.on('data', function (d) {
          texto += d.toString();
          var m = /localhost:(\d+)\//.exec(texto);
          if (m) { clearTimeout(prazo); resolver({ filho: filho, pasta: pasta, base: 'http://127.0.0.1:' + m[1], saida: function () { return texto; } }); }
        });
        filho.stderr.on('data', function (d) { texto += d.toString(); });
        filho.on('error', rejeitar);
      });
    }

    function pedir(base, cookie, metodo, caminho, corpo) {
      var h = { 'X-Anestesia': '1', Connection: 'close' };
      if (cookie.v) h.Cookie = cookie.v;
      if (corpo !== undefined) h['Content-Type'] = 'application/json';
      return fetch(base + caminho, { method: metodo, headers: h, body: corpo === undefined ? undefined : JSON.stringify(corpo) }).then(function (r) {
        var sc = r.headers.get('set-cookie'); if (sc) cookie.v = sc.split(';')[0];
        return r.json().then(function (j) { return { status: r.status, corpo: j }; });
      });
    }

    function desligar(s) {
      return new Promise(function (resolver) {
        s.filho.once('exit', function () { resolver(); });
        s.filho.kill();
        setTimeout(resolver, 3000);
      });
    }

    it('aceita a hora de Brasília que a tela manda e recusa uma hora 3 horas adiantada (a de UTC)', function () {
      var s, cookie = { v: '' }, estado;
      return subirComoNuvem().then(function (x) {
        s = x;
        var codigo = /: ([0-9A-F]+)/.exec(fs.readFileSync(path.join(s.pasta, 'PRIMEIRO_ACESSO.txt'), 'utf8'))[1];
        return pedir(s.base, cookie, 'POST', '/api/primeiro-acesso', { codigo: codigo, login: 'chefe', nome: 'Chefe', senha: 'senha-forte-1' });
      }).then(function (r) {
        igual(r.status, 200, JSON.stringify(r.corpo));
        return pedir(s.base, cookie, 'GET', '/api/estado');
      }).then(function (r) {
        estado = r.corpo;
        var antes = core.hojeBrasilia(new Date());
        verdadeiro(estado.hoje === antes || estado.hoje === core.hojeBrasilia(new Date()),
          'o "hoje" do servidor é o de Brasília (' + estado.hoje + '), não o do UTC');
        var cirurgia = { status: 'Agendada', data: estado.hoje, inicioPrev: '07:00', fimPrev: '09:00', paciente: 'Paciente Fuso',
          procedimento: 'Rinoplastia', anestesista: estado.estado.anestesistas[0].nome, avaliacaoNec: 'Não' };
        return pedir(s.base, cookie, 'POST', '/api/comando', { nome: 'adicionarCirurgia', args: [cirurgia],
          contexto: { agora: core.agoraTextoBrasilia(new Date()), semente: 'fusoaaaa111' }, base: estado.revisao, hoje: estado.hoje, cliente: 'qa' })
          .then(function (ok) {
            igual(ok.status, 200, 'hora de Brasília: ' + JSON.stringify(ok.corpo));
            verdadeiro(ok.corpo.ok);
            var utc = new Date().toISOString().slice(0, 19).replace('T', ' ');
            return pedir(s.base, cookie, 'POST', '/api/comando', { nome: 'adicionarCirurgia', args: [Object.assign({}, cirurgia, { paciente: 'Outro', inicioPrev: '10:00', fimPrev: '11:00' })],
              contexto: { agora: utc, semente: 'fusoaaaa222' }, base: ok.corpo.revisao, hoje: estado.hoje, cliente: 'qa' });
          });
      }).then(function (recusado) {
        igual(recusado.status, 409, 'hora de UTC é 3 h adiantada em relação a Brasília');
        igual(recusado.corpo.motivo, 'relogio');
        verdadeiro(/Fuso do servidor/.test(s.saida()), 'a janela do servidor diz em que fuso ele trabalha');
        return desligar(s);
      }, function (e) { return (s ? desligar(s) : Promise.resolve()).then(function () { throw e; }); });
    });
  });
};
