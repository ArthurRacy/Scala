/**
 * ============================================================================
 * 03A_ANEXOS — PDFs de exames do paciente, ligados à avaliação pré
 * ============================================================================
 * Os arquivos ficam no IndexedDB do navegador, não no localStorage: um PDF de
 * exame passa fácil de 1 MB, e o localStorage inteiro tem uns 5 MB.
 *
 * Duas lojas:
 *   meta      { id, uidAvaliacao, idAvaliacao, nome, tamanho, tipo, criadoEm, criadoPor }
 *   arquivos  { id, blob }
 * A lista (meta) é lida inteira na partida e mantida em memória, para a tela
 * mostrar "3 exames" sem esperar o disco. O PDF só é lido quando alguém abre.
 *
 * VÍNCULO: pelo `uid` da avaliação, nunca pelo ID_AVALIAÇÃO. O ID sequencial
 * pode renascer em outro paciente depois de "apagar tudo" ou de importar um
 * backup; o uid não. `idAvaliacao` fica na meta só para leitura humana.
 *
 * FILA (novaFila): a tela de cirurgia nova junta os PDFs antes de a avaliação
 * existir e os manda para ela assim que a cirurgia é lançada.
 *
 * ATENÇÃO: os anexos ficam NESTE navegador e não entram no backup .json.
 *
 * MODO SERVIDOR (usarServidor): a mesma interface, mas os PDFs ficam no
 * servidor da clínica — a lista vem de lá, o envio e a leitura passam por
 * lá, e a remoção em cascata com a avaliação é feita por ele.
 * ============================================================================
 */
'use strict';

var ANEXOS = (function () {

  var BANCO = 'anestesia.anexos';
  var VERSAO = 1;
  var TAMANHO_MAXIMO = 25 * 1024 * 1024;   // 25 MB por arquivo

  var db = null;
  var abrindo = null;
  var rede = null;         // modo servidor: SERVIDOR.anexos
  var porUid = {};         // uidAvaliacao -> [meta], mais antigo primeiro
  var semVinculo = [];     // metas antigas, sem uid (ver migrarLegado)

  /** Passa a guardar os PDFs no servidor (modo servidor). */
  function usarServidor(api) { rede = api; }

  function disponivel() {
    if (rede) return true;
    try { return typeof indexedDB !== 'undefined' && indexedDB !== null; } catch (e) { return false; }
  }

  function abrir() {
    if (db) return Promise.resolve(db);
    if (abrindo) return abrindo;
    if (!disponivel()) return Promise.reject(new Error('Este navegador não permite guardar arquivos.'));

    abrindo = new Promise(function (resolver, rejeitar) {
      var req = indexedDB.open(BANCO, VERSAO);
      // Outra aba (versão antiga do sistema, por exemplo) segurando o banco:
      // sem prazo, a gravação ficaria esperando para sempre, calada.
      var prazo = setTimeout(function () {
        abrindo = null;
        rejeitar(new Error('Outra aba do sistema está usando o banco de exames. Feche as outras abas e tente de novo.'));
      }, 8000);
      req.onupgradeneeded = function () {
        var b = req.result;
        if (!b.objectStoreNames.contains('meta')) b.createObjectStore('meta', { keyPath: 'id' });
        if (!b.objectStoreNames.contains('arquivos')) b.createObjectStore('arquivos', { keyPath: 'id' });
      };
      req.onsuccess = function () {
        clearTimeout(prazo);
        db = req.result;
        // Quando outra aba precisa atualizar ou apagar o banco, esta solta a
        // conexão; sem isso as duas travam esperando uma pela outra.
        db.onversionchange = function () { db.close(); db = null; abrindo = null; };
        resolver(db);
      };
      req.onerror = function () { clearTimeout(prazo); abrindo = null; rejeitar(req.error || new Error('Falha ao abrir o banco de anexos.')); };
    });
    return abrindo;
  }

  /**
   * Roda `trabalho(tx)` numa transação e resolve com o que ele devolver,
   * só DEPOIS de a transação ser gravada (oncomplete).
   */
  function transacao(lojas, modo, trabalho) {
    return abrir().then(function (b) {
      return new Promise(function (resolver, rejeitar) {
        var tx = b.transaction(lojas, modo);
        var saida;
        tx.oncomplete = function () { resolver(saida); };
        tx.onerror = function () { rejeitar(tx.error); };
        tx.onabort = function () { rejeitar(tx.error || new Error('Operação cancelada pelo navegador.')); };
        saida = trabalho(tx);
      });
    });
  }

  function indexar(meta) {
    if (!meta.uidAvaliacao) { semVinculo.push(meta); return; }
    (porUid[meta.uidAvaliacao] = porUid[meta.uidAvaliacao] || []).push(meta);
  }

  function todasAsMetas() {
    var lista = semVinculo.slice();
    Object.keys(porUid).forEach(function (k) { lista = lista.concat(porUid[k]); });
    return lista;
  }

  /** Lê a lista de anexos para a memória. Chamar uma vez, na partida. */
  function iniciar() {
    if (rede) {
      return rede.metas().then(function (metas) {
        porUid = {};
        semVinculo = [];
        metas.sort(function (a, b) { return a.criadoEm < b.criadoEm ? -1 : 1; }).forEach(indexar);
        return true;
      });
    }
    if (!disponivel()) return Promise.resolve(false);
    return transacao(['meta'], 'readonly', function (tx) {
      var saida = {};
      var req = tx.objectStore('meta').getAll();
      req.onsuccess = function () { saida.metas = req.result || []; };
      return saida;
    }).then(function (saida) {
      porUid = {};
      semVinculo = [];
      saida.metas
        .sort(function (a, b) { return a.criadoEm < b.criadoEm ? -1 : 1; })
        .forEach(indexar);
      return true;
    });
  }

  /**
   * Anexos gravados antes do vínculo por uid tinham só o ID_AVALIAÇÃO.
   * Casa cada um com a avaliação que tem esse ID HOJE e grava o uid. Roda
   * uma vez na partida; o que não casar vira órfão (tela Integridade).
   */
  function migrarLegado(avaliacoes) {
    if (rede || !semVinculo.length) return Promise.resolve(0);
    var porId = {};
    (avaliacoes || []).forEach(function (a) { if (a.uid) porId[String(a.id)] = a.uid; });
    var casadas = semVinculo.filter(function (m) { return porId[m.idAvaliacao]; });
    if (!casadas.length) return Promise.resolve(0);

    return transacao(['meta'], 'readwrite', function (tx) {
      casadas.forEach(function (m) {
        m.uidAvaliacao = porId[m.idAvaliacao];
        tx.objectStore('meta').put(m);
      });
    }).then(function () {
      semVinculo = semVinculo.filter(function (m) { return !m.uidAvaliacao; });
      casadas.forEach(indexar);
      return casadas.length;
    });
  }

  function listar(uid) { return uid ? (porUid[uid] || []).slice() : []; }
  function contar(uid) { return uid ? (porUid[uid] || []).length : 0; }
  function total() { return todasAsMetas().length; }

  /** Anexos cuja avaliação não existe mais no estado atual. */
  function orfaos(avaliacoes) {
    var validos = {};
    (avaliacoes || []).forEach(function (a) { if (a.uid) validos[a.uid] = true; });
    return todasAsMetas().filter(function (m) { return !m.uidAvaliacao || !validos[m.uidAvaliacao]; });
  }

  /** Confere a assinatura "%PDF-" no começo do arquivo — extensão engana. */
  function assinaturaPDF(arquivo) {
    return new Promise(function (resolver) {
      var leitor = new FileReader();
      leitor.onload = function () {
        var bytes = new Uint8Array(leitor.result);
        var texto = '';
        for (var i = 0; i < bytes.length; i++) texto += String.fromCharCode(bytes[i]);
        // A especificação tolera lixo antes do cabeçalho, dentro do 1º KB.
        resolver(texto.indexOf('%PDF-') >= 0);
      };
      leitor.onerror = function () { resolver(false); };
      leitor.readAsArrayBuffer(arquivo.slice(0, 1024));
    });
  }

  /**
   * O arquivo serve? Recusa o que passa do tamanho máximo, está vazio ou não
   * é um PDF de verdade. Rejeita com uma mensagem pronta para a tela. É a
   * mesma conferência de `adicionar`, exposta para a tela recusar já na hora
   * de escolher o arquivo e não só depois de a cirurgia ser lançada.
   */
  function conferir(arquivo) {
    if (!arquivo) return Promise.reject(new Error('Nenhum arquivo.'));
    var nome = '"' + (arquivo.name || 'arquivo') + '"';
    if (arquivo.size > TAMANHO_MAXIMO) {
      return Promise.reject(new Error(nome + ' passa de ' + (TAMANHO_MAXIMO / 1048576) + ' MB.'));
    }
    if (!arquivo.size) return Promise.reject(new Error(nome + ' está vazio.'));
    return assinaturaPDF(arquivo).then(function (ehPDF) {
      if (!ehPDF) throw new Error(nome + ' não é um PDF.');
    });
  }

  /**
   * Guarda um PDF preso à avaliação. Recusa o que não for PDF de verdade
   * ou passar do tamanho máximo.
   */
  function adicionar(avaliacao, arquivo, usuario) {
    if (!avaliacao || !avaliacao.uid) {
      return Promise.reject(new Error('Avaliação sem identificador interno — salve e abra de novo.'));
    }

    return conferir(arquivo).then(function () {
      if (rede) return rede.enviar(avaliacao, arquivo).then(function (meta) { indexar(meta); return meta; });

      var meta = {
        id: 'EX' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
        uidAvaliacao: String(avaliacao.uid),
        idAvaliacao: String(avaliacao.id || ''),
        nome: String(arquivo.name || 'exame.pdf').slice(0, 200),
        tamanho: arquivo.size,
        tipo: 'application/pdf',
        criadoEm: new Date().toISOString(),
        criadoPor: usuario || ''
      };

      return transacao(['meta', 'arquivos'], 'readwrite', function (tx) {
        tx.objectStore('meta').put(meta);
        tx.objectStore('arquivos').put({ id: meta.id, blob: arquivo });
      }).then(function () { indexar(meta); return meta; });
    });
  }

  /**
   * Fila de exames à espera de uma avaliação. Na tela de cirurgia nova a
   * avaliação ainda não existe: ela nasce quando a cirurgia é lançada. Os
   * arquivos esperam aqui — em memória, como File, sem ler o disco até o envio —
   * e seguem para `enviarPara(avaliacao)` depois que a cirurgia foi gravada.
   * Cada arquivo é conferido ao entrar (PDF de verdade, até o tamanho máximo):
   * quem escolheu o arquivo errado descobre na hora, e não depois de lançar.
   */
  function novaFila() {
    var itens = [];

    function igual(a, b) { return a.name === b.name && a.size === b.size && a.lastModified === b.lastModified; }

    return {
      itens: function () { return itens.slice(); },
      tamanho: function () { return itens.length; },

      /**
       * Confere e põe na fila, um a um. Nunca rejeita: devolve o que entrou
       * (`aceitos`), o que foi recusado e por quê, e o que já estava na fila.
       */
      adicionar: function (arquivos) {
        var saida = { aceitos: [], recusados: [], repetidos: [] };
        return Array.prototype.slice.call(arquivos || []).reduce(function (fila, arq) {
          return fila.then(function () {
            return conferir(arq).then(function () {
              // A repetição é conferida aqui, sem pausa até o push: duas levas
              // soltas quase juntas não furam a checagem.
              if (itens.some(function (x) { return igual(x, arq); })) { saida.repetidos.push(arq.name); return; }
              itens.push(arq);
              saida.aceitos.push(arq);
            }, function (e) {
              saida.recusados.push({ nome: String((arq && arq.name) || 'arquivo'), motivo: e.message });
            });
          });
        }, Promise.resolve()).then(function () { return saida; });
      },

      remover: function (arquivo) {
        var i = itens.indexOf(arquivo);
        if (i >= 0) itens.splice(i, 1);
      },

      /**
       * Guarda os arquivos na avaliação, um de cada vez. Nunca rejeita: o que
       * foi guardado sai da fila, o que falhou fica nela (e vem em `falhas`).
       */
      enviarPara: function (avaliacao, usuario) {
        var saida = { feitos: 0, falhas: [] };
        return itens.slice().reduce(function (fila, arq) {
          return fila.then(function () {
            return adicionar(avaliacao, arq, usuario).then(function () {
              saida.feitos++;
              itens.splice(itens.indexOf(arq), 1);
            }, function (e) {
              saida.falhas.push({ nome: String(arq.name || 'arquivo'), motivo: (e && e.message) || 'erro desconhecido' });
            });
          });
        }, Promise.resolve()).then(function () { return saida; });
      }
    };
  }

  /** O arquivo em si (Blob). */
  function obter(id) {
    if (rede) return rede.arquivo(id).then(function (b) { return new Blob([b], { type: 'application/pdf' }); });
    return transacao(['arquivos'], 'readonly', function (tx) {
      var saida = {};
      var req = tx.objectStore('arquivos').get(id);
      req.onsuccess = function () { saida.reg = req.result; };
      return saida;
    }).then(function (saida) {
      if (!saida.reg) throw new Error('Arquivo não encontrado neste navegador.');
      return new Blob([saida.reg.blob], { type: 'application/pdf' });
    });
  }

  function tirarDoIndice(ids) {
    var fora = {};
    ids.forEach(function (id) { fora[id] = true; });
    Object.keys(porUid).forEach(function (k) {
      porUid[k] = porUid[k].filter(function (m) { return !fora[m.id]; });
      if (!porUid[k].length) delete porUid[k];
    });
    semVinculo = semVinculo.filter(function (m) { return !fora[m.id]; });
  }

  /** Remove anexos pelo id do anexo. */
  function remover(ids) {
    ids = [].concat(ids || []);
    if (!ids.length) return Promise.resolve(0);
    if (rede) {
      return ids.reduce(function (p, id) { return p.then(function () { return rede.remover(id); }); }, Promise.resolve())
        .then(function () { tirarDoIndice(ids); return ids.length; });
    }
    return transacao(['meta', 'arquivos'], 'readwrite', function (tx) {
      ids.forEach(function (id) {
        tx.objectStore('meta').delete(id);
        tx.objectStore('arquivos').delete(id);
      });
    }).then(function () { tirarDoIndice(ids); return ids.length; });
  }

  /** Remove todos os anexos de uma avaliação (quando ela é excluída). */
  function removerDaAvaliacao(uid) {
    return remover(listar(uid).map(function (m) { return m.id; }));
  }

  /** Esvazia o banco inteiro — usado por "Apagar todos os dados". */
  function apagarTudo() {
    if (rede) return Promise.resolve(0);   // no servidor, só o administrador, pela tela de dados
    if (!disponivel()) return Promise.resolve(0);
    var n = total();
    return transacao(['meta', 'arquivos'], 'readwrite', function (tx) {
      tx.objectStore('meta').clear();
      tx.objectStore('arquivos').clear();
    }).then(function () { porUid = {}; semVinculo = []; return n; });
  }

  /**
   * Abre o PDF numa aba nova do navegador. Na versão online a página não
   * abre janelas: o exame é entregue como arquivo.
   */
  function abrirEmAba(id, nome) {
    if (window.MODO_ONLINE) return baixar(id, nome || 'exame.pdf');
    return obter(id).then(function (blob) {
      var url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener');
      setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
    });
  }

  function baixar(id, nome) {
    return obter(id).then(function (blob) { return baixarBlob(blob, nome); });
  }

  /** Entrega um Blob como arquivo (ver UI.salvarArquivo). Devolve Promise<boolean>. */
  function baixarBlob(blob, nome) {
    return UI.salvarArquivo(nome, blob);
  }

  function tamanhoLegivel(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return Math.round(bytes / 1024) + ' KB';
    return (bytes / 1048576).toFixed(1).replace('.', ',') + ' MB';
  }

  /** Blob -> base64 (sem o prefixo data:). */
  function paraBase64(blob) {
    return new Promise(function (resolver, rejeitar) {
      var l = new FileReader();
      l.onload = function () { resolver(String(l.result).split(',')[1] || ''); };
      l.onerror = function () { rejeitar(l.error); };
      l.readAsDataURL(blob);
    });
  }

  /** Todos os PDFs com conteúdo, para o backup completo: [{ meta, conteudo }]. */
  function exportarTodos() {
    return todasAsMetas().reduce(function (fila, m) {
      return fila.then(function (lista) {
        return obter(m.id).then(paraBase64).then(function (b64) {
          lista.push({ meta: m, conteudo: b64 });
          return lista;
        }, function () { return lista; });   // arquivo sumido: segue com os outros
      });
    }, Promise.resolve([]));
  }

  /**
   * Restaura PDFs de um backup completo. Pula o que já existe (mesmo id).
   * Devolve quantos entraram.
   */
  function importarTodos(lista) {
    var novos = (lista || []).filter(function (x) {
      return !todasAsMetas().some(function (m) { return m.id === x.meta.id; });
    });
    if (!novos.length) return Promise.resolve(0);
    return transacao(['meta', 'arquivos'], 'readwrite', function (tx) {
      novos.forEach(function (x) {
        var bin = atob(x.conteudo);
        var bytes = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        var meta = Object.assign({ tipo: 'application/pdf' }, x.meta);
        tx.objectStore('meta').put(meta);
        tx.objectStore('arquivos').put({ id: meta.id, blob: new Blob([bytes], { type: 'application/pdf' }) });
      });
    }).then(function () {
      novos.forEach(function (x) { indexar(Object.assign({ tipo: 'application/pdf' }, x.meta)); });
      return novos.length;
    });
  }

  return {
    disponivel: disponivel,
    usarServidor: usarServidor,
    naRede: function () { return !!rede; },
    iniciar: iniciar,
    migrarLegado: migrarLegado,
    listar: listar,
    contar: contar,
    total: total,
    todasAsMetas: todasAsMetas,
    exportarTodos: exportarTodos,
    importarTodos: importarTodos,
    orfaos: orfaos,
    conferir: conferir,
    adicionar: adicionar,
    novaFila: novaFila,
    obter: obter,
    remover: remover,
    removerDaAvaliacao: removerDaAvaliacao,
    apagarTudo: apagarTudo,
    abrirEmAba: abrirEmAba,
    baixar: baixar,
    baixarBlob: baixarBlob,
    tamanhoLegivel: tamanhoLegivel,
    TAMANHO_MAXIMO: TAMANHO_MAXIMO
  };
})();
