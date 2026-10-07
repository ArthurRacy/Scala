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
 *   <dados>/anexos/              PDFs de exame (<id>.pdf), a ficha de cada um
 *                                (<id>.json: avaliação, nome, quem, quando,
 *                                SHA-256) e indice.json, a lista das fichas —
 *                                se o índice se perde, é refeito delas
 *   <dados>/anexos/removidos/    PDFs removidos, com a ficha, guardados por
 *                                3 anos contados da remoção (data no nome)
 * ============================================================================
 */
'use strict';

var fs = require('fs');
var path = require('path');
var zlib = require('zlib');
var crypto = require('crypto');

var ID_ANEXO = /^EX[a-z0-9]{6,40}$/;
var PDF_ANEXO = /^(EX[a-z0-9]{6,40})\.pdf$/;
var FICHA_ANEXO = /^(EX[a-z0-9]{6,40})\.json$/;
var REMOVIDO = /^(EX[a-z0-9]{6,40})_(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})\.(pdf|json)$/;
var SHA256 = /^[0-9a-f]{64}$/;
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
  function carimbo(d) { return (d || new Date()).toISOString().replace(/[-:]/g, '').replace(/\..*/, '').replace('T', '_'); }
  function sha256(conteudo) { return crypto.createHash('sha256').update(conteudo).digest('hex'); }

  var avisos = [];      // o que se achou de errado nos exames sem ninguém pedir; o servidor leva para o LOG de acessos
  var expurgos = [];    // exames removidos que passaram do prazo e saíram de vez (idem)

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
    var tamanhoAntes = fs.fstatSync(fd).size;
    try {
      fs.writeSync(fd, JSON.stringify(entrada) + '\n');
      fs.fsyncSync(fd);
    } catch (e) {
      // Disco cheio no meio da linha: sem isto, a próxima linha grudaria nesta e as duas se perderiam na recuperação.
      // (Reabre para escrita comum: no Windows o arquivo aberto só para acrescentar não pode ser cortado.)
      try {
        var corte = fs.openSync(arqDiario, 'r+');
        try { fs.ftruncateSync(corte, tamanhoAntes); } finally { fs.closeSync(corte); }
      } catch (e2) { /* melhor esforço */ }
      throw e;
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

  var ultimoFreio = null;

  function aplicarRetencao() {
    var freios = [];
    var copias = listarCopias();
    var apagar = core.copiasParaApagar(copias, hoje());
    // Freio: uma rodada normal apaga 1 ou 2 cópias (depois de uma parada longa, as diárias antigas; as mensais ficam).
    // Querer apagar quase tudo de uma vez é o sinal de um relógio errado (data muito à frente): não apaga nada.
    if (apagar.length > 10 && apagar.length > copias.length * 0.75) {
      freios.push('A limpeza de cópias antigas quis apagar ' + apagar.length + ' de ' + copias.length +
        ' cópias de uma vez — isso só acontece com a data do computador errada. Nada foi apagado; confira o relógio.');
    } else {
      apagar.forEach(function (id) {
        try { fs.unlinkSync(path.join(dirCopias, id)); } catch (e) { /* já saiu */ }
      });
    }
    // Exames removidos: o prazo conta da REMOÇÃO, que está no nome. (Contava da data do arquivo, que é a do envio: um
    // exame antigo removido hoje saía de vez na limpeza de hoje.) Nome fora do padrão nunca sai.
    var limite = Date.now() - core.RETENCAO_COPIAS.diasExamesRemovidos * 86400000;
    var removidos = fs.readdirSync(dirRemovidos);
    var vencidos = removidos.filter(function (n) {
      var r = REMOVIDO.exec(n);
      return !!r && Date.UTC(+r[2], +r[3] - 1, +r[4], +r[5], +r[6], +r[7]) < limite;
    });
    if (vencidos.length > 10 && vencidos.length > removidos.length * 0.75) {
      freios.push('A limpeza dos exames removidos quis apagar ' + vencidos.length + ' de ' + removidos.length +
        ' arquivos de uma vez — isso só acontece com a data do computador errada. Nada foi apagado; confira o relógio.');
    } else {
      vencidos.forEach(function (n) {
        try { fs.unlinkSync(path.join(dirRemovidos, n)); expurgos.push(n); } catch (e) { /* já saiu */ }
      });
    }
    ultimoFreio = freios.length ? freios.join(' ') : null;
  }

  /* ---------------------------------------------------------- anexos --- */

  /*
   * Cada PDF tem a sua ficha (<id>.json) ao lado, gravada antes de o exame entrar no índice. O índice é só a lista
   * junta, para não ler milhares de fichas a cada pedido: ilegível ou perdido, ele é refeito das fichas. (Antes ele
   * recomeçava vazio sem avisar, e o próximo exame anexado apagava o vínculo de todos os outros com a sua avaliação.)
   */
  var indice = null;

  function arquivoDoAnexo(id) {
    if (!ID_ANEXO.test(String(id))) throw new Error('Anexo inválido.');
    return path.join(dirAnexos, id + '.pdf');
  }
  function fichaDoAnexo(id) { return arquivoDoAnexo(id).replace(/\.pdf$/, '.json'); }
  function gravarFicha(m) { gravarAtomico(fichaDoAnexo(m.id), JSON.stringify(m)); }

  function lerIndice() {
    if (indice) return indice;
    if (!fs.existsSync(arqIndice)) {
      indice = refazerIndice();
      if (indice.length) {
        avisos.push({ codigo: 'exames_indice_refeito', detalhe: 'o índice dos exames não existia; refeito das fichas: ' + indice.length + ' exame(s)' });
        gravarIndice();
      }
      return indice;
    }
    try {
      var lido = JSON.parse(fs.readFileSync(arqIndice, 'utf8'));
      if (!Array.isArray(lido) || !lido.every(function (m) { return m && ID_ANEXO.test(String(m.id)); })) throw new Error('formato inesperado');
      indice = lido;
    } catch (e) {
      var quarentena = 'indice.ilegivel_' + carimbo() + '.json';
      fs.renameSync(arqIndice, path.join(dirAnexos, quarentena));
      indice = refazerIndice();
      avisos.push({ codigo: 'exames_indice_refeito', detalhe: 'o índice dos exames estava ilegível (guardado como ' + quarentena +
        '); refeito das fichas: ' + indice.length + ' exame(s)' });
      gravarIndice();
    }
    return indice;
  }

  /** O índice refeito das fichas (o conteúdo manda). PDF sem ficha não tem como voltar à sua avaliação: fica guardado, e o aviso diz qual é. */
  function refazerIndice() {
    var nomes = fs.readdirSync(dirAnexos);
    var lista = [], comFicha = {};
    nomes.forEach(function (n) {
      var f = FICHA_ANEXO.exec(n);
      if (!f) return;
      try {
        var m = JSON.parse(fs.readFileSync(path.join(dirAnexos, n), 'utf8'));
        if (m && m.id === f[1]) { lista.push(m); comFicha[m.id] = true; }
      } catch (e) { /* ficha ilegível: o PDF aparece abaixo, como sem ficha */ }
    });
    var semFicha = nomes.filter(function (n) { var p = PDF_ANEXO.exec(n); return p && !comFicha[p[1]]; });
    if (semFicha.length) {
      avisos.push({ codigo: 'exames_com_problema', detalhe: semFicha.length + ' PDF(s) em anexos/ sem ficha — não dá para saber de que ' +
        'avaliação são; continuam guardados: ' + semFicha.slice(0, 20).join(', ') + (semFicha.length > 20 ? '…' : '') });
    }
    return lista.sort(function (a, b) {
      var x = String(a.criadoEm || ''), y = String(b.criadoEm || '');
      return x < y ? -1 : x > y ? 1 : 0;
    });
  }

  function gravarIndice() { gravarAtomico(arqIndice, JSON.stringify(lerIndice())); }

  /** Instalação de antes das fichas: cada exame do índice ganha a sua (na partida; depois disso, não há o que fazer). */
  function garantirFichas() {
    lerIndice().forEach(function (m) { if (!fs.existsSync(fichaDoAnexo(m.id))) gravarFicha(m); });
  }

  function metasAnexos() { return lerIndice().slice(); }

  /** Grava o PDF, a ficha e só então o põe no índice. Devolve a ficha, com o tamanho e o SHA-256 do que foi gravado. */
  function salvarAnexo(meta, conteudo) {
    var m = Object.assign({}, meta, { tamanho: conteudo.length, sha256: sha256(conteudo) });
    gravarAtomico(arquivoDoAnexo(m.id), conteudo);
    gravarFicha(m);
    lerIndice().push(m);
    gravarIndice();
    return m;
  }

  function lerAnexo(id) {
    var p = arquivoDoAnexo(id);
    if (!lerIndice().some(function (m) { return m.id === id; }) || !fs.existsSync(p)) return null;
    return fs.readFileSync(p);
  }

  /**
   * Tira do índice e move o PDF e a ficha (com quem removeu e quando) para removidos/. A data da remoção vai no nome:
   * é dela que contam os 3 anos de guarda. Devolve quantos saíram.
   */
  function removerAnexos(ids, quem) {
    var fora = {};
    ids.forEach(function (id) { if (ID_ANEXO.test(String(id))) fora[id] = true; });
    var saem = lerIndice().filter(function (m) { return fora[m.id]; });
    if (!saem.length) return 0;
    var resto = lerIndice().filter(function (m) { return !fora[m.id]; });
    gravarAtomico(arqIndice, JSON.stringify(resto));     // primeiro o índice: se o disco recusar, nada mudou
    indice = resto;
    var quando = new Date();
    saem.forEach(function (m) {
      var destino = path.join(dirRemovidos, m.id + '_' + carimbo(quando));
      gravarAtomico(destino + '.json', JSON.stringify(Object.assign({}, m, { removidoEm: quando.toISOString(), removidoPor: quem || '' })));
      var p = arquivoDoAnexo(m.id);
      if (fs.existsSync(p)) fs.renameSync(p, destino + '.pdf');
      try { fs.unlinkSync(fichaDoAnexo(m.id)); } catch (e) { /* não tinha */ }
    });
    return saem.length;
  }

  function removerAnexosDaAvaliacao(uid, quem) {
    return removerAnexos(lerIndice().filter(function (m) { return m.uidAvaliacao === uid; }).map(function (m) { return m.id; }), quem);
  }

  /** Os exames em removidos/, cada um com a ficha quando existe: [{ id, chave, pdf (caminho ou null), ficha }]. */
  function listarRemovidos() {
    var porChave = {};
    fs.readdirSync(dirRemovidos).forEach(function (n) {
      var r = REMOVIDO.exec(n);
      if (!r) return;
      var chave = n.replace(/\.(pdf|json)$/, '');
      var item = porChave[chave] || (porChave[chave] = { id: r[1], chave: chave, pdf: null, ficha: null });
      if (r[8] === 'pdf') { item.pdf = path.join(dirRemovidos, n); return; }
      try { item.ficha = JSON.parse(fs.readFileSync(path.join(dirRemovidos, n), 'utf8')); } catch (e) { /* ficha ilegível */ }
    });
    return Object.keys(porChave).sort().map(function (k) { return porChave[k]; });
  }

  var ultimaConferencia = null;

  /**
   * Confere os exames: todo PDF do índice existe e tem o tamanho da ficha, e o SHA-256 de uma parte deles bate com o da
   * ficha — primeiro os que ainda não têm impressão digital (os de antes dela, que a ganham aqui), depois os de conferência
   * mais antiga, `limite` por rodada (padrão 300), para não ler todos os gigas todo dia. Também acha PDF fora do índice.
   * Assíncrona: o servidor segue atendendo enquanto ela lê. `opcoes.parar()` verdadeiro interrompe entre um PDF e outro.
   */
  function conferirAnexos(opcoes) {
    opcoes = opcoes || {};
    var limite = opcoes.limite === undefined ? 300 : opcoes.limite;
    var r = { em: new Date().toISOString(), total: 0, lidos: 0, registrados: 0,
      semArquivo: [], tamanhoDiferente: [], conteudoAlterado: [], foraDoIndice: [], erro: null };
    var lista = lerIndice().slice();
    r.total = lista.length;
    var noIndice = {}, presentes = [];
    lista.forEach(function (m) {
      noIndice[m.id] = true;
      var st = null;
      try { st = fs.statSync(arquivoDoAnexo(m.id)); } catch (e) { /* não existe */ }
      if (!st) { r.semArquivo.push(m.id); return; }
      if (typeof m.tamanho === 'number' && m.tamanho !== st.size) r.tamanhoDiferente.push(m.id);
      presentes.push(m);
    });
    fs.readdirSync(dirAnexos).forEach(function (n) {
      var p = PDF_ANEXO.exec(n);
      if (p && !noIndice[p[1]]) r.foraDoIndice.push(n);
    });
    var semImpressao = presentes.filter(function (m) { return !SHA256.test(String(m.sha256 || '')); });
    var antigas = presentes.filter(function (m) { return SHA256.test(String(m.sha256 || '')); })
      .sort(function (a, b) { var x = a.conferidoEm || '', y = b.conferidoEm || ''; return x < y ? -1 : x > y ? 1 : 0; })
      .slice(0, limite);
    var fila = semImpressao.concat(antigas);

    function proximo(i) {
      if (i >= fila.length || (opcoes.parar && opcoes.parar())) return Promise.resolve();   // `parar`: o servidor está fechando
      var m = fila[i];
      return fs.promises.readFile(arquivoDoAnexo(m.id)).then(function (buf) {
        var h = sha256(buf);
        r.lidos++;
        if (!SHA256.test(String(m.sha256 || ''))) {
          m.sha256 = h;
          r.registrados++;
          if (fs.existsSync(arquivoDoAnexo(m.id))) gravarFicha(m);   // removido no meio da conferência: a ficha já foi para removidos/
        } else if (m.sha256 !== h) {
          r.conteudoAlterado.push(m.id);
        }
        m.conferidoEm = r.em;
      }, function () { r.semArquivo.push(m.id); }).then(function () { return proximo(i + 1); });
    }

    return proximo(0).then(function () {
      if (fila.length) {
        try { gravarIndice(); } catch (e) { r.erro = 'não consegui gravar o índice dos exames: ' + (e && e.message); }
      }
      r.problemas = r.semArquivo.length + r.tamanhoDiferente.length + r.conteudoAlterado.length + r.foraDoIndice.length;
      ultimaConferencia = r;
      return r;
    });
  }

  function tirar(lista) { return lista.splice(0, lista.length); }

  garantirFichas();

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
    freioDaRetencao: function () { return ultimoFreio; },
    metasAnexos: metasAnexos,
    salvarAnexo: salvarAnexo,
    lerAnexo: lerAnexo,
    caminhoDoAnexo: arquivoDoAnexo,
    removerAnexos: removerAnexos,
    removerAnexosDaAvaliacao: removerAnexosDaAvaliacao,
    listarRemovidos: listarRemovidos,
    conferirAnexos: conferirAnexos,
    ultimaConferencia: function () { return ultimaConferencia; },
    /** Avisos da partida sobre os exames (índice refeito, PDF sem ficha) — cada um sai uma vez só. */
    tirarAvisos: function () { return tirar(avisos); },
    /** Nomes dos arquivos de exame removido que passaram do prazo e saíram de vez — cada um sai uma vez só. */
    tirarExpurgos: function () { return tirar(expurgos); },
    sha256: sha256,
    ID_ANEXO: ID_ANEXO
  };
}

module.exports = { criarArmazem: criarArmazem };
