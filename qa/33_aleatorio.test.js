/**
 * QA 33 — Teste aleatório do núcleo (tools/aleatorio_store.js, versão curta)
 *   Sorteia operações (as que gravam e as que só leem), com dados normais e absurdos, e confere o que NUNCA pode acontecer:
 *     - exceção que escapa, ou "Erro interno" (defeito de código escondido atrás de uma recusa);
 *     - operação recusada que mesmo assim muda o estado; operação de leitura que muda o estado;
 *     - estado que deixa de ser JSON;
 *     - refazer as operações aceitas numa réplica (como o servidor faz) dar um estado diferente.
 *   Os avisos de integridade que vêm de horário digitado fora de ordem ou de dado absurdo aceito de propósito
 *   pela tela (nome "constructor") não são falha do núcleo e não entram aqui.
 *   Para uma varredura funda: node tools/aleatorio_store.js 30 800 (leva minutos).
 */
'use strict';

var path = require('path');

module.exports = function (t, core, dados) {
  var describe = t.describe, it = t.it, igual = t.igual, verdadeiro = t.verdadeiro;
  var fuzz = require(path.join(__dirname, '..', 'tools', 'aleatorio_store.js'));

  var PROIBIDOS = /^(EXCECAO|ERRO_INTERNO|RECUSA_MUDOU_ESTADO|LEITURA_MUDOU_ESTADO|ESTADO_NAO_SERIALIZA|REPLICA_|GERADOR)/;

  describe('Operações sorteadas (3 sementes de 120 passos)', function () {

    it('nenhuma exceção, nenhum "Erro interno", recusa não muda o estado, leitura não muda o estado, e a réplica fica igual', function () {
      fuzz.reiniciar();
      var aceitas = 0;
      [1, 2, 3].forEach(function (semente) { aceitas += fuzz.rodar(semente, 120).registro; });
      verdadeiro(aceitas > 150, 'o sorteio tem de chegar até o miolo das operações (só ' + aceitas + ' aceitas)');
      var graves = fuzz.achados().filter(function (a) { return PROIBIDOS.test(a.tipo); });
      igual(graves.map(function (a) { return '[' + a.tipo + '] ' + a.op + ': ' + a.detalhe + ' ' + a.args; }).join('\n'), '');
    });
  });
};
