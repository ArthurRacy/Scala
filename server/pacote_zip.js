/**
 * ============================================================================
 * PACOTE ZIP — um .zip escrito aos poucos, direto na resposta
 * ============================================================================
 * Para "baixar todos os dados": anos de exames em PDF não cabem na memória de
 * uma vez. Cada arquivo é lido, entra no .zip e sai pela rede antes do próximo;
 * se a rede está mais lenta que o disco, espera ("drain") em vez de acumular.
 *
 * Formato: ZIP com nomes em UTF-8; texto comprimido (deflate), PDF guardado como
 * está (já vem comprimido). Passando de 4 GB ou de 65.535 arquivos, o fim do
 * pacote sai no formato ZIP64, que o Windows, o macOS e o Linux abrem.
 * Cada arquivo tem de ter menos de 4 GB (um PDF de exame tem até 25 MB).
 * ============================================================================
 */
'use strict';

var zlib = require('zlib');

var MAX32 = 0xffffffff;
var MAX16 = 0xffff;

var TABELA_CRC = null;
/** CRC-32 do zip. O Node 22+ já traz pronto (zlib.crc32); a tabela é só para Node mais antigo. */
function crc32(buf) {
  if (typeof zlib.crc32 === 'function') return zlib.crc32(buf) >>> 0;
  if (!TABELA_CRC) {
    TABELA_CRC = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      TABELA_CRC[n] = c >>> 0;
    }
  }
  var x = 0xffffffff;
  for (var i = 0; i < buf.length; i++) x = TABELA_CRC[(x ^ buf[i]) & 255] ^ (x >>> 8);
  return (x ^ 0xffffffff) >>> 0;
}

/** Data e hora no formato do zip (hora local, de 2 em 2 segundos). */
function dataDos(d) {
  return {
    hora: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
    data: ((Math.max(d.getFullYear(), 1980) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()
  };
}

function u64(buf, valor, pos) { buf.writeBigUInt64LE(BigInt(valor), pos); }

/**
 * `saida`: um fluxo de escrita (a resposta HTTP). `opcoes.quando`: a data que vai nos arquivos;
 * `opcoes.forcarZip64`: só para os testes (o fim ZIP64 mesmo num pacote pequeno).
 * Devolve { adicionar(nome, dados, { comprimir }) -> Promise, fechar() -> Promise<{ arquivos, bytes }> }.
 */
function criarPacoteZip(saida, opcoes) {
  opcoes = opcoes || {};
  var dt = dataDos(opcoes.quando || new Date());
  var forcar = !!opcoes.forcarZip64;
  var posicao = 0;           // bytes já escritos (é onde começa o próximo arquivo)
  var entradas = [];
  var caiu = false, fechado = false;
  if (saida.once) saida.once('close', function () { caiu = true; });

  function escrever(buf) {
    if (caiu || saida.destroyed) return Promise.reject(new Error('A conexão caiu no meio do download.'));
    posicao += buf.length;
    if (saida.write(buf)) return Promise.resolve();
    return new Promise(function (ok, falhou) {
      function drenou() { limpar(); ok(); }
      function fechou() { limpar(); falhou(new Error('A conexão caiu no meio do download.')); }
      function limpar() { saida.removeListener('drain', drenou); saida.removeListener('close', fechou); }
      saida.once('drain', drenou);
      saida.once('close', fechou);
    });
  }

  /** Um arquivo no pacote. `dados`: Buffer ou texto. `comprimir`: false para o que já vem comprimido (PDF). */
  function adicionar(nome, dados, op) {
    if (fechado) return Promise.reject(new Error('O pacote já foi fechado.'));
    var bruto = Buffer.isBuffer(dados) ? dados : Buffer.from(String(dados), 'utf8');
    if (bruto.length >= MAX32) return Promise.reject(new Error('Arquivo grande demais para o pacote: ' + nome));
    var bNome = Buffer.from(String(nome), 'utf8');
    if (bNome.length > MAX16) return Promise.reject(new Error('Nome grande demais: ' + nome));
    var metodo = 0, corpo = bruto;
    if (!(op && op.comprimir === false) && bruto.length > 64) {
      var comprimido = zlib.deflateRawSync(bruto);
      if (comprimido.length < bruto.length) { metodo = 8; corpo = comprimido; }
    }
    var e = { nome: bNome, crc: crc32(bruto), comprimido: corpo.length, tamanho: bruto.length, metodo: metodo, inicio: posicao };

    var local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);              // versão necessária: 2.0 (o tamanho de cada arquivo cabe em 32 bits)
    local.writeUInt16LE(0x0800, 6);          // nomes em UTF-8
    local.writeUInt16LE(metodo, 8);
    local.writeUInt16LE(dt.hora, 10);
    local.writeUInt16LE(dt.data, 12);
    local.writeUInt32LE(e.crc, 14);
    local.writeUInt32LE(e.comprimido, 18);
    local.writeUInt32LE(e.tamanho, 22);
    local.writeUInt16LE(bNome.length, 26);
    local.writeUInt16LE(0, 28);
    entradas.push(e);
    return escrever(Buffer.concat([local, bNome])).then(function () { return escrever(corpo); });
  }

  /** O índice do pacote (diretório central) e o fim. Sem isto o .zip não abre: só se chama no fim de tudo certo. */
  function fechar() {
    if (fechado) return Promise.reject(new Error('O pacote já foi fechado.'));
    fechado = true;
    var inicioCentral = posicao;
    var partes = [];
    entradas.forEach(function (e) {
      var longe = forcar || e.inicio >= MAX32;
      var extra = longe ? Buffer.alloc(12) : Buffer.alloc(0);
      if (longe) {
        extra.writeUInt16LE(0x0001, 0);      // "Zip64 extended information"
        extra.writeUInt16LE(8, 2);
        u64(extra, e.inicio, 4);
      }
      var c = Buffer.alloc(46);
      c.writeUInt32LE(0x02014b50, 0);
      c.writeUInt16LE(longe ? 45 : 20, 4);   // feito por: versão 4.5 quando usa ZIP64
      c.writeUInt16LE(longe ? 45 : 20, 6);
      c.writeUInt16LE(0x0800, 8);
      c.writeUInt16LE(e.metodo, 10);
      c.writeUInt16LE(dt.hora, 12);
      c.writeUInt16LE(dt.data, 14);
      c.writeUInt32LE(e.crc, 16);
      c.writeUInt32LE(e.comprimido, 20);
      c.writeUInt32LE(e.tamanho, 24);
      c.writeUInt16LE(e.nome.length, 28);
      c.writeUInt16LE(extra.length, 30);
      // 32: comentário, 34: disco, 36: atributos internos, 38: externos — tudo zero
      c.writeUInt32LE(longe ? MAX32 : e.inicio, 42);
      partes.push(c, e.nome, extra);
    });
    var central = Buffer.concat(partes);
    var tamanhoCentral = central.length;
    var n = entradas.length;
    var zip64 = forcar || n > MAX16 || inicioCentral >= MAX32 || tamanhoCentral >= MAX32;

    var fim = [];
    if (zip64) {
      var inicioFim64 = inicioCentral + tamanhoCentral;
      var f64 = Buffer.alloc(56);
      f64.writeUInt32LE(0x06064b50, 0);
      u64(f64, 44, 4);                       // tamanho do que vem depois deste campo
      f64.writeUInt16LE(45, 12);
      f64.writeUInt16LE(45, 14);
      // 16: este disco, 20: disco do índice — zero
      u64(f64, n, 24);
      u64(f64, n, 32);
      u64(f64, tamanhoCentral, 40);
      u64(f64, inicioCentral, 48);
      var loc = Buffer.alloc(20);
      loc.writeUInt32LE(0x07064b50, 0);
      u64(loc, inicioFim64, 8);
      loc.writeUInt32LE(1, 16);              // um disco só
      fim.push(f64, loc);
    }
    var eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0);
    eocd.writeUInt16LE(zip64 ? MAX16 : n, 8);
    eocd.writeUInt16LE(zip64 ? MAX16 : n, 10);
    eocd.writeUInt32LE(zip64 ? MAX32 : tamanhoCentral, 12);
    eocd.writeUInt32LE(zip64 ? MAX32 : inicioCentral, 16);
    fim.push(eocd);

    return escrever(central).then(function () { return escrever(Buffer.concat(fim)); })
      .then(function () { return { arquivos: n, bytes: posicao }; });
  }

  return { adicionar: adicionar, fechar: fechar };
}

module.exports = { criarPacoteZip: criarPacoteZip, crc32: crc32 };
