/**
 * ============================================================================
 * ARMAZEM — Onde o servidor guarda os dados, no disco
 * ============================================================================
 *   <dados>/estado.json          estado atual, com a revisão (gravação
 *                                atômica: arquivo novo + troca de nome)
 *   <dados>/diario.jsonl         um comando por linha, gravado ANTES de o
 *                                servidor responder — se a luz cair entre
 *                                duas gravações do estado, a partida
 *                                reaplica o diário e nada se perde
 *   <dados>/copias/              cópias .json.gz: uma por dia + marcos
 *                                (antes de importar, apagar ou restaurar),
 *                                com a mesma retenção do navegador
 *                                (core/10b_retencao.js)
 *   <dados>/anexos/              PDFs de exame (um arquivo por id) e
 *                                indice.json com os metadados
 *   <dados>/anexos/removidos/    PDFs removidos, guardados por 400 dias
 * ============================================================================
 */
'use strict';

var fs = require('fs');
var path = require('path');
var zlib = require('zlib');

var ID_ANEXO = /^EX[a-z0-9]{6,40}$/;
var ID_COPIA = /^(estado|marco)_[0-9A-Za-z_-]{1,80}\.json\.gz$/;

function criarArmazem(pasta, core) {
  var dirCopias = path.join(pasta, 'copias');
  var dirAnexos = path.join(pasta, 'anexos');
  var dirRemovidos = path.join(dirAnexos, 'removidos');
  [pasta, dirCopias, dirAnexos, dirRemovidos].forEach(function (d) { fs.mkdirSync(d, { recursive: true }); });

  var arqEstado = path.join(pasta, 'estado.json');
  var arqDiario = path.join(pasta, 'diario.jsonl');
  var arqIndice = path.join(dirAnexos, 'indice.json');

  /** Grava num arquivo novo, força para o disco e só então troca pelo antigo. */
  function gravarAtomico(arquivo, conteudo) {
    var tmp = arquivo + '.' + process.pid + '.tmp';
    var fd = fs.openSync(tmp, 'w');
    try {
      fs.writeSync(fd, conteudo);
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    fs.renameSync(tmp, arquivo);
  }

  function hoje() { return core.hojeISO(); }
  function carimbo() { return new Date().toISOString().replace(/[-:]/g, '').replace(/\..*/, '').replace('T', '_'); }

  /* ---------------------------------------------------------- estado --- */

  /**
   * Estado gravado: { revisao, estado, salvoEm } ou null (primeira vez).
   * Arquivo ilegível não é descartado: vai para quarentena, e a partida usa
   * a cópia mais recente (e reaplica o diário por cima).
   */
  function lerEstado() {
    if (!fs.existsSync(arqEstado)) return null;
    try {
      var obj = JSON.parse(fs.readFileSync(arqEstado, 'utf8'));
      if (obj && typeof obj.revisao === 'number' && obj.estado) return obj;
      throw new Error('formato inesperado');
    } catch (e) {
      var quarentena = arqEstado.replace(/\.json$/, '') + '.ilegivel_' + carimbo() + '.json';
      fs.renameSync(arqEstado, quarentena);
      var copias = listarCopias();
      if (!copias.length) throw new Error('estado.json ilegível (guardado em ' + path.basename(quarentena) + ') e sem cópia para recomeçar.');
      var c = lerCopia(copias[0].id);
      return { revisao: c.revisao || 0, estado: c.estado, salvoEm: c.salvoEm, recuperadoDe: copias[0].id };
    }
  }

  function gravarEstado(revisao, estadoEnxuto) {
    gravarAtomico(arqEstado, JSON.stringify({ revisao: revisao, salvoEm: new Date().toISOString(), estado: estadoEnxuto }));
  }

  /* ---------------------------------------------------------- diário --- */

  /** Anota um comando, forçado para o disco antes de voltar. */
  function anotarComando(entrada) {
    var fd = fs.openSync(arqDiario, 'a');
    try {
      fs.writeSync(fd, JSON.stringify(entrada) + '\n');
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
  }

  /** Comandos do diário com revisão maior que `desde` (linha quebrada no fim é ignorada). */
  function lerDiario(desde) {
    if (!fs.existsSync(arqDiario)) return [];
    return fs.readFileSync(arqDiario, 'utf8').split('\n').filter(Boolean).map(function (l) {
      try { return JSON.parse(l); } catch (e) { return null; }
    }).filter(function (c) { return c && c.revisao > desde; });
  }

  /** Depois de gravar o estado da revisão `ate`, o diário até ela já não é preciso. */
  function podarDiario(ate) {
    var resto = lerDiario(ate);
    gravarAtomico(arqDiario, resto.map(function (c) { return JSON.stringify(c) + '\n'; }).join(''));
  }

  /* ---------------------------------------------------------- cópias --- */

  function gravarCopia(nome, revisao, estadoEnxuto) {
    var corpo = zlib.gzipSync(JSON.stringify({ revisao: revisao, salvoEm: new Date().toISOString(), estado: estadoEnxuto }));
    gravarAtomico(path.join(dirCopias, nome), corpo);
    return nome;
  }

  /** A cópia do dia, se ainda não existe. Devolve true se gravou. */
  function copiaDoDia(revisao, estadoEnxuto) {
    var nome = 'estado_' + hoje() + '.json.gz';
    if (fs.existsSync(path.join(dirCopias, nome))) return false;
    gravarCopia(nome, revisao, estadoEnxuto);
    aplicarRetencao();
    return true;
  }

  /** Marco antes de uma troca do estado inteiro (importar, apagar, restaurar). */
  function marco(motivo, revisao, estadoEnxuto) {
    return gravarCopia('marco_' + String(motivo).replace(/[^a-z0-9-]/gi, '') + '_' + carimbo() + '.json.gz', revisao, estadoEnxuto);
  }

  function listarCopias() {
    return fs.readdirSync(dirCopias).filter(function (n) { return ID_COPIA.test(n); }).map(function (n) {
      var st = fs.statSync(path.join(dirCopias, n));
      var diaria = /^estado_(\d{4}-\d{2}-\d{2})\.json\.gz$/.exec(n);
      return {
        id: n, tipo: diaria ? 'diaria' : 'marco',
        dia: diaria ? diaria[1] : core.paraData(st.mtime),
        tamanho: st.size, criadoEm: st.mtime.toISOString()
      };
    }).sort(function (a, b) { return a.criadoEm < b.criadoEm ? 1 : -1; });
  }

  function lerCopia(id) {
    if (!ID_COPIA.test(String(id))) throw new Error('Cópia inválida.');
    return JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(dirCopias, id))).toString('utf8'));
  }

  function aplicarRetencao() {
    core.copiasParaApagar(listarCopias(), hoje()).forEach(function (id) {
      try { fs.unlinkSync(path.join(dirCopias, id)); } catch (e) { /* já saiu */ }
    });
    // PDFs removidos há mais de 400 dias saem de vez.
    var limite = Date.now() - core.RETENCAO_COPIAS.diasMarcos * 86400000;
    fs.readdirSync(dirRemovidos).forEach(function (n) {
      var p = path.join(dirRemovidos, n);
      try { if (fs.statSync(p).mtimeMs < limite) fs.unlinkSync(p); } catch (e) { /* ok */ }
    });
  }

  /* ---------------------------------------------------------- anexos --- */

  var indice = null;

  function lerIndice() {
    if (indice) return indice;
    try { indice = JSON.parse(fs.readFileSync(arqIndice, 'utf8')); } catch (e) { indice = []; }
    if (!Array.isArray(indice)) indice = [];
    return indice;
  }

  function gravarIndice() { gravarAtomico(arqIndice, JSON.stringify(lerIndice())); }

  function arquivoDoAnexo(id) {
    if (!ID_ANEXO.test(String(id))) throw new Error('Anexo inválido.');
    return path.join(dirAnexos, id + '.pdf');
  }

  function metasAnexos() { return lerIndice().slice(); }

  function salvarAnexo(meta, conteudo) {
    gravarAtomico(arquivoDoAnexo(meta.id), conteudo);
    lerIndice().push(meta);
    gravarIndice();
    return meta;
  }

  function lerAnexo(id) {
    var p = arquivoDoAnexo(id);
    if (!lerIndice().some(function (m) { return m.id === id; }) || !fs.existsSync(p)) return null;
    return fs.readFileSync(p);
  }

  /** Tira do índice e move o PDF para removidos/ (fica 400 dias). Devolve quantos saíram. */
  function removerAnexos(ids) {
    var fora = {};
    ids.forEach(function (id) { if (ID_ANEXO.test(String(id))) fora[id] = true; });
    var antes = lerIndice().length;
    indice = lerIndice().filter(function (m) { return !fora[m.id]; });
    Object.keys(fora).forEach(function (id) {
      var p = arquivoDoAnexo(id);
      if (fs.existsSync(p)) fs.renameSync(p, path.join(dirRemovidos, id + '_' + carimbo() + '.pdf'));
    });
    gravarIndice();
    return antes - indice.length;
  }

  function removerAnexosDaAvaliacao(uid) {
    return removerAnexos(lerIndice().filter(function (m) { return m.uidAvaliacao === uid; }).map(function (m) { return m.id; }));
  }

  return {
    pasta: pasta,
    lerEstado: lerEstado,
    gravarEstado: gravarEstado,
    anotarComando: anotarComando,
    lerDiario: lerDiario,
    podarDiario: podarDiario,
    copiaDoDia: copiaDoDia,
    marco: marco,
    listarCopias: listarCopias,
    lerCopia: lerCopia,
    aplicarRetencao: aplicarRetencao,
    metasAnexos: metasAnexos,
    salvarAnexo: salvarAnexo,
    lerAnexo: lerAnexo,
    removerAnexos: removerAnexos,
    removerAnexosDaAvaliacao: removerAnexosDaAvaliacao,
    ID_ANEXO: ID_ANEXO
  };
}

module.exports = { criarArmazem: criarArmazem };
