/**
 * QA 30 — Nenhum nome indefinido no código (tools/verificar_nomes.js)
 *   O erro que só aparece em tempo de execução, na primeira vez que alguém clica ("X is not defined"), e o seu
 *   parente do Node: um nome que existe no navegador mas ficou fora do `module.exports` do core.
 *   Confere navegador, core no Node, servidor e Apps Script. Se este Node não oferecer o analisador (sinalizador
 *   --expose-internals), o teste avisa e passa: a conferência é uma rede extra, não o único teste.
 */
'use strict';

var path = require('path');
var cp = require('child_process');

module.exports = function (t) {
  var describe = t.describe, it = t.it, igual = t.igual, verdadeiro = t.verdadeiro;

  describe('Nomes indefinidos (análise estática)', function () {

    it('nenhum identificador usado sem ser declarado, em nenhum dos quatro ambientes', function () {
      var r = cp.spawnSync(process.execPath, ['--expose-internals', path.join(__dirname, '..', 'tools', 'verificar_nomes.js')],
        { encoding: 'utf8', timeout: 60000 });
      if (r.status === 2) return;   // analisador indisponível neste Node
      verdadeiro(r.status === 0, 'nomes suspeitos:\n' + String(r.stdout).split('\n').filter(function (l) { return /não está definido/.test(l); }).join('\n'));
      igual(/TOTAL de nomes suspeitos: 0/.test(r.stdout), true);
    });
  });
};
