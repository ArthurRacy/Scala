/**
 * QA 18 — Entrega de arquivos
 *   - .zip das planilhas: estrutura, CRC-32 e nomes com acento
 *   - versão online: o arquivo sai pela capacidade "downloads" da página
 *     (confirmação de quem vê); recusa não vira erro; sem a capacidade, avisa
 */
'use strict';

var fs = require('fs');
var path = require('path');
var vm = require('vm');
var zlib = require('zlib');

module.exports = function (t, core, dados) {
  var describe = t.describe, it = t.it, igual = t.igual, verdadeiro = t.verdadeiro, falso = t.falso;

  var RAIZ = path.join(__dirname, '..');

  function carregar(arquivos, extras) {
    var ctx = vm.createContext(Object.assign({}, core, {
      Blob: Blob, TextEncoder: TextEncoder, DataView: DataView, ArrayBuffer: ArrayBuffer, Uint8Array: Uint8Array,
      Promise: Promise, console: console, SEED_INICIAL: dados.seed
    }, extras || {}));
    arquivos.forEach(function (f) {
      vm.runInContext(fs.readFileSync(path.join(RAIZ, 'webapp', 'js', f), 'utf8'), ctx);
    });
    return ctx;
  }

  /** Lê o diretório central de um .zip: [{ nome, crc, tamanho, bandeiras, dados }]. */
  function lerZip(buf) {
    var v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    var fim = buf.byteLength - 22;
    igual(v.getUint32(fim, true), 0x06054b50, 'fim do diretório central');
    var n = v.getUint16(fim + 10, true), pos = v.getUint32(fim + 16, true);
    var saida = [];
    for (var i = 0; i < n; i++) {
      igual(v.getUint32(pos, true), 0x02014b50, 'entrada do diretório');
      var tamNome = v.getUint16(pos + 28, true), local = v.getUint32(pos + 42, true);
      var e = {
        bandeiras: v.getUint16(pos + 8, true), crc: v.getUint32(pos + 16, true), tamanho: v.getUint32(pos + 24, true),
        nome: Buffer.from(buf.subarray(pos + 46, pos + 46 + tamNome)).toString('utf8')
      };
      igual(v.getUint32(local, true), 0x04034b50, 'cabeçalho local');
      var ini = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
      e.dados = buf.subarray(ini, ini + e.tamanho);
      saida.push(e);
      pos += 46 + tamNome + v.getUint16(pos + 30, true) + v.getUint16(pos + 32, true);
    }
    return saida;
  }

  describe('Planilhas num .zip', function () {

    it('CRC-32 igual ao do zlib', function () {
      var ctx = carregar(['03_dados.js'], { UI: {} });
      var DADOS = vm.runInContext('DADOS', ctx);
      ['', 'abc', 'AVALIAÇÕES PRÉ;R$ 1.500,00\n'.repeat(50)].forEach(function (s) {
        igual(DADOS.crc32(new TextEncoder().encode(s)), zlib.crc32(Buffer.from(s, 'utf8')), JSON.stringify(s.slice(0, 12)));
      });
    });

    it('um .csv por aba, nomes com acento em UTF-8 e conteúdo intacto', function () {
      var ctx = carregar(['03_dados.js'], { UI: {} });
      var DADOS = vm.runInContext('DADOS', ctx);
      var st = core.criarStoreComSeed(dados.seed, { usuario: 'qa' });
      var arquivos = DADOS.exportarCSVs(st, 10, 2026).map(function (a) {
        return { nome: a.nome + '.csv', dados: '﻿' + a.conteudo };
      });
      return DADOS.zip(arquivos).arrayBuffer().then(function (ab) {
        var lidos = lerZip(new Uint8Array(ab));
        igual(lidos.length, arquivos.length);
        var aval = lidos.filter(function (e) { return e.nome === 'AVALIAÇÕES PRÉ.csv'; })[0];
        verdadeiro(!!aval, 'nome com acento preservado');
        verdadeiro((aval.bandeiras & 0x0800) !== 0, 'bandeira de nome UTF-8');
        lidos.forEach(function (e, i) {
          igual(e.crc, zlib.crc32(Buffer.from(e.dados)), e.nome + ': CRC');
          igual(Buffer.from(e.dados).toString('utf8'), arquivos[i].dados, e.nome + ': conteúdo');
        });
      });
    });
  });

  describe('Versão online: arquivo pela capacidade "downloads"', function () {

    function uiOnline(capacidade) {
      var janela = {
        MODO_ONLINE: true,
        claude: { use: function (nome) { return Promise.resolve(nome === 'downloads' ? capacidade : null); } }
      };
      var ctx = carregar(['01_ui.js'], { window: janela, document: {} });
      return { UI: vm.runInContext('UI', ctx) };
    }

    it('entrega com nome e conteúdo, e resolve true quando a pessoa aceita', function () {
      var pedido = null;
      var u = uiOnline({ save: function (r) { pedido = r; return Promise.resolve({ status: 'saved' }); } });
      return u.UI.baixarTexto('LOG.csv', 'a;b', 'text/csv').then(function (ok) {
        verdadeiro(ok);
        igual(pedido.filename, 'LOG.csv');
        return pedido.data.arrayBuffer();
      }).then(function (ab) {
        // Bytes, não .text(): o decodificador de texto engole o BOM.
        igual(Buffer.from(ab).toString('hex'), 'efbbbf613b62', 'CSV com BOM, para o Excel reconhecer UTF-8');
      });
    });

    it('recusa de quem vê não é erro nem aviso', function () {
      var u = uiOnline({ save: function () { return Promise.reject({ code: 'declined', message: 'não' }); } });
      return u.UI.salvarArquivo('boletim.pdf', new Blob(['%PDF'])).then(function (ok) {
        falso(ok);   // e nenhum aviso: document é um objeto vazio, qualquer torrada quebraria aqui
      });
    });
  });
};
