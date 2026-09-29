/**
 * ============================================================================
 * 03D_GUARDA — Onde o dado mora no navegador, e como ele dura
 * ============================================================================
 * Requisito: o que é lançado precisa continuar disponível por pelo menos um
 * ano. No modo "um computador" (sem servidor), isso depende do navegador, e
 * o navegador tem três jeitos de perder dado. Cada um tem sua defesa aqui:
 *
 *   1. COTA — o localStorage guarda uns 5 MB; um ano de cirurgias, avaliações
 *      e LOG passa disso. O estado mora no IndexedDB (cota de centenas de MB
 *      a GB). O que estava no localStorage migra sozinho na primeira abertura.
 *
 *   2. DESPEJO — sem espaço em disco, o navegador apaga dado de site "não
 *      persistente". Pedimos persistência (navigator.storage.persist()).
 *
 *   3. LIMPEZA / DEFEITO — alguém limpa o navegador, ou uma gravação sai
 *      errada. Três camadas de cópia:
 *        - cópias automáticas no próprio IndexedDB: uma por dia (35 dias), a
 *          primeira de cada mês (24 meses) e uma antes de toda operação
 *          arriscada ("apagar tudo", importar backup) guardada por 400 dias;
 *        - backup automático numa PASTA do computador (pode ser do OneDrive):
 *          o estado inteiro compactado, uma vez por dia, e os PDFs de exame
 *          copiados um a um — sobrevive à limpeza do navegador;
 *        - backup manual (.json, com ou sem PDFs) e um lembrete quando passam
 *          7 dias sem nenhum backup fora do navegador.
 *
 * Sem IndexedDB (navegador muito antigo, modo privado restrito), cai para o
 * localStorage e avisa. Toda operação devolve Promise; nada aqui trava a tela.
 * ============================================================================
 */
'use strict';

var GUARDA = (function () {

  var BANCO = 'anestesia.dados';
  var VERSAO = 1;

  // Regra de retenção: a mesma do servidor (core/10b_retencao.js).
  var RETENCAO = RETENCAO_COPIAS;
  var DIAS_LEMBRETE = 7;

  var db = null;
  var abrindo = null;
  var canal = null;
  var idAba = 'aba-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  /* ============================================================ base == */

  function idbDisponivel() {
    try { return typeof indexedDB !== 'undefined' && indexedDB !== null; } catch (e) { return false; }
  }

  function abrir() {
    if (db) return Promise.resolve(db);
    if (abrindo) return abrindo;
    if (!idbDisponivel()) return Promise.reject(new Error('IndexedDB indisponível.'));

    abrindo = new Promise(function (resolver, rejeitar) {
      var req;
      try { req = indexedDB.open(BANCO, VERSAO); } catch (e) { abrindo = null; rejeitar(e); return; }
      var prazo = setTimeout(function () {
        abrindo = null;
        rejeitar(new Error('Outra aba do sistema está usando o banco de dados. Feche as outras abas e recarregue.'));
      }, 8000);
      req.onupgradeneeded = function () {
        var b = req.result;
        if (!b.objectStoreNames.contains('estado')) b.createObjectStore('estado', { keyPath: 'chave' });
        if (!b.objectStoreNames.contains('copias')) b.createObjectStore('copias', { keyPath: 'id' });
        if (!b.objectStoreNames.contains('config')) b.createObjectStore('config', { keyPath: 'chave' });
      };
      req.onsuccess = function () {
        clearTimeout(prazo);
        db = req.result;
        // Outra aba atualizou a versão do banco: fecha esta conexão para não travá-la.
        db.onversionchange = function () { db.close(); db = null; abrindo = null; };
        resolver(db);
      };
      req.onerror = function () { clearTimeout(prazo); abrindo = null; rejeitar(req.error || new Error('Falha ao abrir o banco.')); };
      req.onblocked = function () { /* outra aba segura a versão antiga; segue esperando */ };
    });
    return abrindo;
  }

  /** Transação: resolve com o que `trabalho` devolver, depois de gravada. */
  function transacao(lojas, modo, trabalho) {
    return abrir().then(function (b) {
      return new Promise(function (resolver, rejeitar) {
        var tx = b.transaction(lojas, modo);
        var saida;
        tx.oncomplete = function () { resolver(saida); };
        tx.onerror = function () { rejeitar(tx.error); };
        tx.onabort = function () { rejeitar(tx.error || new Error('Gravação cancelada pelo navegador (espaço?).')); };
        saida = trabalho(tx);
      });
    });
  }

  function ler(loja, chave) {
    return transacao([loja], 'readonly', function (tx) {
      var s = {};
      var r = tx.objectStore(loja).get(chave);
      r.onsuccess = function () { s.v = r.result; };
      return s;
    }).then(function (s) { return s.v; });
  }

  function gravar(loja, registro) {
    return transacao([loja], 'readwrite', function (tx) { tx.objectStore(loja).put(registro); });
  }

  function lerTodos(loja) {
    return transacao([loja], 'readonly', function (tx) {
      var s = {};
      var r = tx.objectStore(loja).getAll();
      r.onsuccess = function () { s.v = r.result || []; };
      return s;
    }).then(function (s) { return s.v; });
  }

  function apagarChaves(loja, chaves) {
    if (!chaves.length) return Promise.resolve(0);
    return transacao([loja], 'readwrite', function (tx) {
      chaves.forEach(function (k) { tx.objectStore(loja).delete(k); });
    }).then(function () { return chaves.length; });
  }

  /* ===================================================== compactação == */

  /** Texto -> Blob gzip (ou texto puro, se o navegador não compactar). */
  function compactar(texto) {
    if (typeof CompressionStream === 'undefined' || typeof Response === 'undefined') {
      return Promise.resolve(new Blob([texto], { type: 'application/json' }));
    }
    var fluxo = new Blob([texto]).stream().pipeThrough(new CompressionStream('gzip'));
    return new Response(fluxo).blob().then(function (b) { return new Blob([b], { type: 'application/gzip' }); });
  }

  /** Blob/File (gzip ou texto) -> texto. Reconhece o gzip pelos 2 primeiros bytes. */
  function lerTexto(blob) {
    return blob.slice(0, 2).arrayBuffer().then(function (buf) {
      var b = new Uint8Array(buf);
      var gzip = b.length === 2 && b[0] === 0x1f && b[1] === 0x8b;
      if (!gzip) return blob.text();
      if (typeof DecompressionStream === 'undefined') {
        throw new Error('Este navegador não abre arquivo compactado (.gz). Use Chrome ou Edge atualizados.');
      }
      return new Response(blob.stream().pipeThrough(new DecompressionStream('gzip'))).text();
    });
  }

  /* ================================================== estado atual ===== */

  /**
   * Lê o estado guardado. Devolve { estado, origem:'navegador' } ou
   * { estado:null } (nada salvo ainda), com `corrompido` quando havia dado
   * ilegível (que é preservado numa cópia, nunca descartado).
   */
  function carregar() {
    if (!idbDisponivel()) {
      var l = DADOS.carregarLocal();
      return Promise.resolve({ estado: l.estado ? DADOS.sanearEstado(l.estado) : null,
        origem: l.estado ? 'navegador' : null, corrompido: l.corrompido, semIndexedDB: true });
    }

    return ler('estado', 'atual').then(function (reg) {
      if (reg && reg.estado && DADOS.formatoValido(reg.estado)) {
        return { estado: DADOS.sanearEstado(reg.estado), origem: 'navegador', salvoEm: reg.salvoEm };
      }
      if (reg && reg.estado) {
        // Registro ilegível: guarda como cópia antes de qualquer gravação nova.
        return guardarCopia(reg.estado, 'corrompido', true).then(function () {
          return { estado: null, corrompido: 'cópia "corrompido" em Dados e backup' };
        });
      }

      // Nada no IndexedDB: migra o que existir no localStorage (versões antigas).
      var legado = DADOS.carregarLocal();
      if (!legado.estado) return { estado: null, corrompido: legado.corrompido };

      var estado = DADOS.sanearEstado(legado.estado);
      return gravarAtual(DADOS.enxugar(estado))
        .then(function () { return guardarCopia(DADOS.enxugar(estado), 'migracao'); })
        .then(function () {
          DADOS.apagarLocal();   // o IndexedDB passa a ser a fonte; localStorage libera a cota
          return { estado: estado, origem: 'navegador', migrado: true };
        });
    }).catch(function (e) {
      // IndexedDB existe mas falhou (bloqueado, cota zero): usa o localStorage.
      var l = DADOS.carregarLocal();
      return { estado: l.estado ? DADOS.sanearEstado(l.estado) : null, origem: l.estado ? 'navegador' : null,
        corrompido: l.corrompido, semIndexedDB: true, erro: e };
    });
  }

  function gravarAtual(obj) {
    return gravar('estado', { chave: 'atual', estado: obj, salvoEm: new Date().toISOString() });
  }

  /*
   * Fila de gravação: cada transação do sistema pede uma gravação, mas elas
   * são assíncronas. Gravações sobrepostas poderiam terminar fora de ordem
   * (a mais velha por último). Aqui há no máximo UMA em andamento; pedidos
   * que chegam enquanto isso viram um só — o estado mais recente.
   */
  var emAndamento = null;
  var proximo = null;

  function salvar(estado) {
    var obj = DADOS.enxugar(estado);
    if (!idbDisponivel()) {
      var r = DADOS.salvarLocal(obj);
      return r.ok ? Promise.resolve(r) : Promise.reject(Object.assign(new Error(r.motivo), r));
    }
    proximo = obj;
    if (!emAndamento) emAndamento = rodarFila();
    return emAndamento;
  }

  function rodarFila() {
    var alvo = proximo;
    proximo = null;
    return gravarAtual(alvo).then(function () {
      avisarOutrasAbas();
      garantirCopiaDoDia(alvo).catch(function () { /* a cópia do dia tenta de novo na próxima gravação */ });
      if (proximo) return rodarFila();
      emAndamento = null;
      return { ok: true };
    }, function (e) {
      emAndamento = null;
      throw e;
    });
  }

  /** Apaga o estado atual (depois de guardar uma cópia de segurança). */
  function apagarAtual(estado) {
    var antes = estado ? guardarCopia(DADOS.enxugar(estado), 'antes-de-apagar') : Promise.resolve();
    return antes.then(function () {
      DADOS.apagarLocal();
      if (!idbDisponivel()) return true;
      return apagarChaves('estado', ['atual']).then(function () { return true; });
    });
  }

  /* ========================================================= cópias ===== */

  function hoje() { return hojeISO(); }

  /**
   * Guarda uma cópia do estado. `tipo`: 'diaria' (uma por dia), ou um marco
   * ('antes-de-apagar', 'antes-de-importar', 'migracao', 'corrompido').
   */
  function guardarCopia(obj, tipo, cru) {
    var texto;
    try { texto = cru && typeof obj === 'string' ? obj : JSON.stringify(obj); } catch (e) { texto = String(obj); }
    return compactar(texto).then(function (blob) {
      var dia = hoje();
      var id = tipo === 'diaria' ? 'dia-' + dia : tipo + '-' + new Date().toISOString();
      return gravar('copias', {
        id: id, tipo: tipo, dia: dia, criadoEm: new Date().toISOString(),
        tamanho: blob.size, cirurgias: obj && obj.cirurgias ? obj.cirurgias.length : null,
        dados: blob
      }).then(function () { return id; });
    });
  }

  var diaDaUltimaCopia = '';

  function garantirCopiaDoDia(obj) {
    var dia = hoje();
    if (diaDaUltimaCopia === dia) return Promise.resolve(false);
    return ler('copias', 'dia-' + dia).then(function (existe) {
      diaDaUltimaCopia = dia;
      if (existe) return false;
      return guardarCopia(obj, 'diaria').then(aplicarRetencao).then(function () { return true; });
    });
  }

  // copiasParaApagar (quais cópias saem) é a função do core: a regra é uma só.

  function aplicarRetencao() {
    return listarCopias().then(function (copias) {
      return apagarChaves('copias', copiasParaApagar(copias, hoje()));
    });
  }

  /** Metadados das cópias, mais recentes primeiro (sem o conteúdo). */
  function listarCopias() {
    if (!idbDisponivel()) return Promise.resolve([]);
    return lerTodos('copias').then(function (lista) {
      return lista.map(function (c) {
        return { id: c.id, tipo: c.tipo, dia: c.dia, criadoEm: c.criadoEm, tamanho: c.tamanho, cirurgias: c.cirurgias };
      }).sort(function (a, b) { return a.criadoEm < b.criadoEm ? 1 : -1; });
    }).catch(function () { return []; });
  }

  /** Conteúdo de uma cópia, já como objeto de estado saneado. */
  function lerCopia(id) {
    return ler('copias', id).then(function (c) {
      if (!c) throw new Error('Cópia não encontrada.');
      return lerTexto(c.dados);
    }).then(function (texto) {
      var r = DADOS.importarJSON(texto);
      if (!r.ok) throw new Error(r.erro);
      return r.estado;
    });
  }

  /* ================================================ persistência ======= */

  /** Pede ao navegador para não despejar os dados. Devolve true/false. */
  function pedirPersistencia() {
    try {
      if (navigator.storage && navigator.storage.persist) {
        return navigator.storage.persisted().then(function (ja) {
          return ja ? true : navigator.storage.persist();
        }).catch(function () { return false; });
      }
    } catch (e) { /* sem API */ }
    return Promise.resolve(false);
  }

  /** { persistente, usado, cota } — para a tela de Dados e backup. */
  function situacao() {
    var s = { persistente: null, usado: null, cota: null, indexedDB: idbDisponivel() };
    try {
      if (!navigator.storage) return Promise.resolve(s);
      return Promise.all([
        navigator.storage.persisted ? navigator.storage.persisted().catch(function () { return null; }) : null,
        navigator.storage.estimate ? navigator.storage.estimate().catch(function () { return {}; }) : {}
      ]).then(function (r) {
        s.persistente = r[0];
        s.usado = r[1] && r[1].usage;
        s.cota = r[1] && r[1].quota;
        return s;
      });
    } catch (e) { return Promise.resolve(s); }
  }

  /* ================================================== outras abas ====== */

  function avisarOutrasAbas() {
    try {
      if (!canal && typeof BroadcastChannel !== 'undefined') canal = new BroadcastChannel(BANCO);
      if (canal) canal.postMessage({ tipo: 'gravou', aba: idAba, quando: Date.now() });
    } catch (e) { /* sem canal: o evento storage do modo antigo cobre */ }
  }

  /** Chama `aoMudar` quando OUTRA aba grava o estado. */
  function observarOutrasAbas(aoMudar) {
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        if (!canal) canal = new BroadcastChannel(BANCO);
        canal.addEventListener('message', function (ev) {
          if (ev.data && ev.data.tipo === 'gravou' && ev.data.aba !== idAba) aoMudar();
        });
      }
    } catch (e) { /* ignora */ }
    DADOS.observarOutrasAbas(function () { aoMudar(); });   // modo localStorage
  }

  /* ================================================ config e marcas ==== */

  function lerConfig(chave) {
    if (!idbDisponivel()) return Promise.resolve(null);
    return ler('config', chave).then(function (r) { return r ? r.valor : null; }).catch(function () { return null; });
  }

  function gravarConfig(chave, valor) {
    if (!idbDisponivel()) return Promise.resolve();
    return gravar('config', { chave: chave, valor: valor });
  }

  /** Registra um backup feito fora do navegador ('download' ou 'pasta'). */
  function marcarBackupExterno(como) {
    return gravarConfig('ultimoBackupExterno', { quando: new Date().toISOString(), como: como });
  }

  /** Dias desde o último backup fora do navegador (null = nunca). */
  function diasSemBackup() {
    return lerConfig('ultimoBackupExterno').then(function (u) {
      if (!u || !u.quando) return null;
      return Math.max(0, diasEntre(paraData(new Date(u.quando)), hoje()));
    });
  }

  /* ============================================ pasta de backup ======== */

  /** O navegador deixa escolher uma pasta e gravar nela? (Chrome e Edge) */
  function suportaPasta() {
    return typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function' && !window.MODO_ONLINE;
  }

  /** Escolhe a pasta (precisa de clique do usuário). Devolve o nome. */
  function escolherPasta() {
    if (!suportaPasta()) return Promise.reject(new Error('Este navegador não grava em pasta. Use Chrome ou Edge.'));
    return window.showDirectoryPicker({ id: 'anestesia-backup', mode: 'readwrite' }).then(function (h) {
      return gravarConfig('pasta', h).then(function () { return h.name; });
    });
  }

  /** { configurada, nome, permissao: 'granted' | 'prompt' | 'denied' } */
  function situacaoPasta() {
    if (!suportaPasta()) return Promise.resolve({ configurada: false, suportada: false });
    return lerConfig('pasta').then(function (h) {
      if (!h) return { configurada: false, suportada: true };
      return h.queryPermission({ mode: 'readwrite' }).then(function (p) {
        return { configurada: true, suportada: true, nome: h.name, permissao: p };
      }).catch(function () { return { configurada: true, suportada: true, nome: h.name, permissao: 'prompt' }; });
    });
  }

  /** Pede de novo a permissão da pasta (o navegador exige um clique). */
  function retomarPasta() {
    return lerConfig('pasta').then(function (h) {
      if (!h) throw new Error('Nenhuma pasta escolhida.');
      return h.requestPermission({ mode: 'readwrite' });
    });
  }

  function esquecerPasta() {
    return gravarConfig('pasta', null);
  }

  function gravarArquivo(pasta, nome, blob) {
    return pasta.getFileHandle(nome, { create: true }).then(function (fh) {
      return fh.createWritable();
    }).then(function (w) {
      return w.write(blob).then(function () { return w.close(); });
    });
  }

  function existeArquivo(pasta, nome) {
    return pasta.getFileHandle(nome).then(function () { return true; }, function () { return false; });
  }

  /**
   * Backup do dia na pasta: 'anestesia_AAAA-MM-DD.json.gz' (reescrito ao
   * longo do dia) + PDFs de exame que ainda não estão em 'exames/'. Só roda
   * com permissão já concedida — sem clique, o navegador não deixa pedir.
   * Devolve { feito, motivo?, arquivo?, pdfs? }.
   */
  function backupNaPasta(estado) {
    return lerConfig('pasta').then(function (pasta) {
      if (!pasta) return { feito: false, motivo: 'sem-pasta' };
      return pasta.queryPermission({ mode: 'readwrite' }).then(function (p) {
        if (p !== 'granted') return { feito: false, motivo: 'permissao' };

        var texto = DADOS.exportarJSON(estado);
        var nome = 'anestesia_' + hoje() + (typeof CompressionStream !== 'undefined' ? '.json.gz' : '.json');
        var pdfs = 0;

        return compactar(texto)
          .then(function (blob) { return gravarArquivo(pasta, nome, blob); })
          .then(function () { return pasta.getDirectoryHandle('exames', { create: true }); })
          .then(function (dirExames) {
            return ANEXOS.todasAsMetas().reduce(function (fila, m) {
              return fila.then(function () {
                var arq = m.id + '.pdf';
                return existeArquivo(dirExames, arq).then(function (ja) {
                  if (ja) return;
                  return ANEXOS.obter(m.id).then(function (b) { pdfs++; return gravarArquivo(dirExames, arq, b); });
                });
              });
            }, Promise.resolve());
          })
          .then(function () { return limparPasta(pasta); })
          .then(function () { return marcarBackupExterno('pasta'); })
          .then(function () { return gravarConfig('ultimoBackupPasta', hoje()); })
          .then(function () { return { feito: true, arquivo: nome, pdfs: pdfs }; });
      });
    });
  }

  /** Na pasta: diários além de 60 dias saem; o primeiro de cada mês fica. */
  function limparPasta(pasta) {
    if (!pasta.entries) return Promise.resolve();
    var nomes = [];
    var it = pasta.entries();
    function passo() {
      return it.next().then(function (r) {
        if (r.done) return;
        var nome = r.value[0];
        if (/^anestesia_\d{4}-\d{2}-\d{2}\.json(\.gz)?$/.test(nome)) nomes.push(nome);
        return passo();
      });
    }
    return passo().then(function () {
      var copias = nomes.map(function (n) { return { id: n, tipo: 'diaria', dia: n.slice(10, 20) }; });
      var sair = copiasParaApagar(copias, hoje(), {
        diasDiarios: RETENCAO.diasPasta, mesesMensais: 1200, diasMarcos: RETENCAO.diasMarcos
      });
      return sair.reduce(function (fila, n) {
        return fila.then(function () { return pasta.removeEntry(n).catch(function () {}); });
      }, Promise.resolve());
    });
  }

  /** Faz o backup na pasta uma vez por dia, se já não fez hoje. */
  function backupDiarioNaPasta(estado) {
    return lerConfig('ultimoBackupPasta').then(function (ultimo) {
      if (ultimo === hoje()) return { feito: false, motivo: 'ja-feito' };
      return backupNaPasta(estado);
    }).catch(function (e) { return { feito: false, motivo: 'erro', erro: e }; });
  }

  /* ==================================================================== */

  return {
    RETENCAO: RETENCAO,
    DIAS_LEMBRETE: DIAS_LEMBRETE,
    disponivel: idbDisponivel,
    carregar: carregar,
    salvar: salvar,
    apagarAtual: apagarAtual,
    guardarCopia: function (estado, tipo) { return guardarCopia(DADOS.enxugar(estado), tipo); },
    listarCopias: listarCopias,
    lerCopia: lerCopia,
    copiasParaApagar: copiasParaApagar,
    pedirPersistencia: pedirPersistencia,
    situacao: situacao,
    observarOutrasAbas: observarOutrasAbas,
    marcarBackupExterno: marcarBackupExterno,
    diasSemBackup: diasSemBackup,
    suportaPasta: suportaPasta,
    escolherPasta: escolherPasta,
    situacaoPasta: situacaoPasta,
    retomarPasta: retomarPasta,
    esquecerPasta: esquecerPasta,
    backupNaPasta: backupNaPasta,
    backupDiarioNaPasta: backupDiarioNaPasta,
    compactar: compactar,
    lerTexto: lerTexto
  };
})();
