/**
 * ============================================================================
 * 03_DADOS — Persistência local e troca de arquivos
 * ============================================================================
 * Formatos do dado — o QUE se grava, não ONDE:
 *   - saneamento de tudo que entra de fora (backup, seed, versão antiga);
 *   - backup .json (com ou sem os PDFs de exame, em base64);
 *   - .csv por aba, para abrir na planilha.
 * Onde o estado mora e como ele dura um ano está em 03d_guarda.js
 * (IndexedDB + cópias). O localStorage aqui é só a RESERVA para navegador
 * sem IndexedDB e a origem da migração de versões antigas.
 *
 * O que NÃO fazemos: escrever direto no .xlsx pelo navegador. Isso exigiria
 * biblioteca externa via CDN, e o sistema tem de funcionar offline. A ponte
 * com a planilha fica em tools/*.py, que já usam openpyxl.
 *
 * FRONTEIRA DE CONFIANÇA: tudo que entra de fora (backup .json, seed,
 * localStorage de versão antiga) passa por `sanearEstado`, que reconstrói
 * cada registro só com os campos do schema e só com valores simples. Um
 * arquivo adulterado não consegue injetar campo estranho nem objeto aninhado.
 *
 * Toda leitura de localStorage é defensiva: modo privado, cota estourada e
 * armazenamento bloqueado acontecem de verdade e não podem derrubar a tela.
 * ============================================================================
 */
'use strict';

var DADOS = (function () {

  var CHAVE = 'anestesia.estado.v1';
  var CHAVE_PREF = 'anestesia.prefs.v1';
  var PREFIXO_QUARENTENA = 'anestesia.estado.corrompido.';

  /** Texto maior que isto num campo é truncado na importação. */
  var MAX_TEXTO = 5000;

  /**
   * Campos internos (fora do schema) que o sistema grava e precisa manter.
   * `uid` da avaliação prende os PDFs de exame — ver 06_avaliacoes.novoUid.
   */
  var CAMPOS_INTERNOS = { AVALIACOES_PRE: ['uid'] };

  /* ================================================== localStorage ===== */

  function disponivel() {
    try {
      var t = '__t';
      localStorage.setItem(t, '1');
      localStorage.removeItem(t);
      return true;
    } catch (e) { return false; }
  }

  /** Reserva: grava no localStorage (só sem IndexedDB). `obj` já enxuto. */
  function salvarLocal(obj) {
    if (!disponivel()) return { ok: false, motivo: 'indisponivel' };
    try {
      localStorage.setItem(CHAVE, JSON.stringify(obj));
      return { ok: true };
    } catch (e) {
      // QuotaExceededError é o caso realista aqui (muitas cirurgias + log).
      return { ok: false, motivo: 'cota', erro: e };
    }
  }

  /**
   * Lê o estado salvo. Devolve { estado } ou { corrompido: chaveDaCopia }.
   * Dado ilegível NÃO é descartado: vai para uma chave de quarentena antes
   * que o próximo auto-save grave por cima — quem perdeu dado ainda consegue
   * recuperar com ajuda técnica.
   */
  function carregarLocal() {
    if (!disponivel()) return {};
    var bruto;
    try { bruto = localStorage.getItem(CHAVE); } catch (e) { return {}; }
    if (!bruto) return {};

    try {
      var obj = JSON.parse(bruto);
      if (formatoValido(obj)) return { estado: obj };
    } catch (e) { /* cai na quarentena */ }

    var copia = PREFIXO_QUARENTENA + paraData(new Date()) + '.' + Date.now();
    try {
      localStorage.setItem(copia, bruto);
      localStorage.removeItem(CHAVE);
    } catch (e) { copia = null; }
    return { corrompido: copia || '(sem espaço para guardar a cópia)' };
  }

  function apagarLocal() {
    try { localStorage.removeItem(CHAVE); return true; } catch (e) { return false; }
  }

  /** Preferências de tela (mês/ano selecionados, tema, aba aberta). */
  function salvarPrefs(p) {
    try { localStorage.setItem(CHAVE_PREF, JSON.stringify(p)); } catch (e) { /* ok */ }
  }

  function carregarPrefs() {
    try {
      var b = localStorage.getItem(CHAVE_PREF);
      var p = b ? JSON.parse(b) : {};
      return p && typeof p === 'object' ? p : {};
    } catch (e) { return {}; }
  }

  /**
   * Avisa quando OUTRA aba do navegador gravou o estado. Duas abas abertas
   * gravando cada uma a sua versão fariam a última apagar o trabalho da
   * outra; ouvindo isto, a aba recarrega o que a outra salvou.
   */
  function observarOutrasAbas(aoMudar) {
    if (typeof window === 'undefined' || !window.addEventListener) return;
    window.addEventListener('storage', function (ev) {
      if (ev.key !== CHAVE || !ev.newValue) return;
      try {
        var obj = JSON.parse(ev.newValue);
        if (formatoValido(obj)) aoMudar(sanearEstado(obj));
      } catch (e) { /* ignora gravação parcial */ }
    });
  }

  /**
   * Remove o que é recalculável antes de gravar.
   * A escala consolidada tem 395 linhas e é 100% derivada — guardá-la
   * desperdiçaria metade da cota do localStorage sem nenhum ganho.
   */
  function enxugar(estado) {
    return {
      versao: estado.versao,
      config: estado.config,
      anestesistas: estado.anestesistas,
      escalaBase: estado.escalaBase,
      escalas: estado.escalas,
      cirurgias: estado.cirurgias,
      avaliacoes: estado.avaliacoes,
      repasses: estado.repasses || [],
      boletins: estado.boletins || [],
      fichasQualidade: estado.fichasQualidade || [],
      estrutura: estado.estrutura || [],
      log: estado.log,
      salvoEm: agoraTexto()
    };
  }

  /** Confere se o objeto tem cara de estado do sistema. */
  function formatoValido(o) {
    if (!o || typeof o !== 'object') return false;
    return Array.isArray(o.anestesistas) &&
           Array.isArray(o.escalaBase) &&
           Array.isArray(o.cirurgias) &&
           Array.isArray(o.avaliacoes);
  }

  /* ============================================= saneamento (fronteira) */

  /** Só texto, número finito, booleano ou nulo; texto longo é cortado. */
  function valorSimples(v) {
    if (v === null || v === undefined) return '';
    if (typeof v === 'string') return v.length > MAX_TEXTO ? v.slice(0, MAX_TEXTO) : v;
    if (typeof v === 'number') return isFinite(v) ? v : '';
    if (typeof v === 'boolean') return v;
    return '';   // objeto, array, função: não é valor de célula
  }

  /** Reconstrói um registro só com os campos do schema (+ internos). */
  function sanearRegistro(r, campos) {
    var limpo = {};
    if (!r || typeof r !== 'object' || Array.isArray(r)) return null;
    campos.forEach(function (k) {
      if (Object.prototype.hasOwnProperty.call(r, k)) limpo[k] = valorSimples(r[k]);
    });
    return limpo;
  }

  function sanearLista(lista, nomeLogico) {
    var campos = schemaColunas(nomeLogico).map(function (c) { return c.campo; })
      .concat(CAMPOS_INTERNOS[nomeLogico] || []);
    return (Array.isArray(lista) ? lista : [])
      .map(function (r) { return sanearRegistro(r, campos); })
      .filter(function (r) { return r !== null; });
  }

  /** Repasses (dado próprio do sistema, fora do schema da planilha). */
  function sanearRepasses(lista) {
    return (Array.isArray(lista) ? lista : []).filter(function (r) {
      return r && typeof r === 'object' && /^\d{4}-\d{2}$/.test(String(r.mes));
    }).map(function (r) {
      return {
        mes: String(r.mes),
        despesas: typeof r.despesas === 'number' && isFinite(r.despesas) ? r.despesas : null,
        obs: valorSimples(r.obs),
        pagamentos: (Array.isArray(r.pagamentos) ? r.pagamentos : []).filter(function (p) {
          return p && typeof p === 'object';
        }).map(function (p) {
          return sanearRegistro(p, ['idAnestesista', 'nome', 'pix', 'valor', 'data', 'registradoPor', 'registradoEm']);
        })
      };
    });
  }

  /**
   * Estado de fonte externa -> estado seguro e completo.
   * Preenche o que faltar (backup de versão antiga abre sem quebrar) e
   * descarta o que não for do schema.
   */
  function sanearEstado(o) {
    var base = estadoVazio();

    base.versao = typeof o.versao === 'string' ? o.versao : CONFIG.VERSAO;

    var cfg = o.config && typeof o.config === 'object' ? o.config : {};
    base.config.escalaBaseAuto = cfg.escalaBaseAuto === true;
    if (cfg.clinica && typeof cfg.clinica === 'object') {
      ['nome', 'cnpj', 'endereco', 'telefone', 'responsavel', 'crm', 'textoTcle'].forEach(function (k) {
        if (typeof cfg.clinica[k] === 'string') base.config.clinica[k] = cfg.clinica[k].slice(0, k === 'textoTcle' ? 20000 : 300);
      });
    }
    if (cfg.sequencias && typeof cfg.sequencias === 'object') {
      base.config.sequencias = {
        cirurgia: Math.max(0, Number(cfg.sequencias.cirurgia) || 0),
        avaliacao: Math.max(0, Number(cfg.sequencias.avaliacao) || 0),
        boletim: Math.max(0, Number(cfg.sequencias.boletim) || 0),
        qualidade: Math.max(0, Number(cfg.sequencias.qualidade) || 0),
        estrutura: Math.max(0, Number(cfg.sequencias.estrutura) || 0)
      };
    }
    // Definições clínicas do módulo de qualidade: o próprio core reconstrói
    // (limiares fora de faixa, metas estranhas e referências vazias somem).
    base.config.qualidade = lerConfigQualidade(cfg.qualidade);

    base.anestesistas = sanearLista(o.anestesistas, 'ANESTESISTAS');
    base.escalaBase = sanearLista(o.escalaBase, 'ESCALA_BASE');
    base.cirurgias = sanearLista(o.cirurgias, 'CIRURGIAS');
    base.avaliacoes = sanearLista(o.avaliacoes, 'AVALIACOES_PRE');
    base.log = sanearLista(o.log, 'LOG');
    base.repasses = sanearRepasses(o.repasses);
    // Boletins, fichas de qualidade e registros de estrutura: o próprio core
    // reconstrói cada um campo a campo (06b, 06c e 06d).
    base.boletins = sanearBoletins(o.boletins);
    base.fichasQualidade = sanearFichasQualidade(o.fichasQualidade);
    base.estrutura = sanearEstrutura(o.estrutura);

    // Todas as escalas guardadas, de qualquer mês: 'YYYY-MM' (atual) ou só o
    // número do mês (formato antigo — o store converte). Filtrar pelos meses
    // da planilha perderia as substituições de 2027 em diante.
    var escalas = o.escalas && typeof o.escalas === 'object' ? o.escalas : {};
    base.escalas = {};
    Object.keys(escalas).forEach(function (k) {
      if (/^\d{4}-\d{2}$/.test(k) || /^\d{1,2}$/.test(k)) {
        base.escalas[k] = sanearLista(escalas[k], 'ESCALA_MENSAL');
      }
    });

    return base;
  }

  /* ================================================= montar o estado === */

  /**
   * Estado de partida quando nada foi salvo ainda: o seed embutido
   * (SEED_INICIAL, gerado de data/seed.json) ou, sem ele, estado vazio.
   * Devolve { estado, origem: 'seed' | 'vazio' }.
   */
  function estadoDoSeed() {
    if (typeof SEED_INICIAL !== 'undefined' && SEED_INICIAL) {
      var e = estadoVazio();
      e.anestesistas = sanearLista(SEED_INICIAL.ANESTESISTAS, 'ANESTESISTAS');
      e.escalaBase = sanearLista(SEED_INICIAL.ESCALA_BASE, 'ESCALA_BASE');
      return { estado: e, origem: 'seed' };
    }
    return { estado: estadoVazio(), origem: 'vazio' };
  }

  /* ==================================================== exportar JSON == */

  /**
   * Backup .json. `anexos` (opcional) = [{ meta, conteudo }] com o PDF em
   * base64 — é o backup "completo", que leva também os exames.
   */
  function exportarJSON(estado, anexos) {
    var pacote = {
      sistema: CONFIG.NOME_SISTEMA,
      versao: CONFIG.VERSAO,
      exportadoEm: agoraTexto(),
      dados: enxugar(estado)
    };
    if (anexos && anexos.length) pacote.anexos = anexos;
    return JSON.stringify(pacote, null, 1);
  }

  /** PDFs de um backup: só o que tem cara de anexo passa, com campos simples. */
  function sanearAnexos(lista) {
    return (Array.isArray(lista) ? lista : []).filter(function (x) {
      return x && x.meta && typeof x.conteudo === 'string' && x.meta.id && x.meta.uidAvaliacao;
    }).map(function (x) {
      return {
        meta: {
          id: String(x.meta.id).slice(0, 80),
          uidAvaliacao: String(x.meta.uidAvaliacao).slice(0, 80),
          idAvaliacao: String(x.meta.idAvaliacao || '').slice(0, 40),
          nome: String(x.meta.nome || 'exame.pdf').slice(0, 200),
          tamanho: Number(x.meta.tamanho) || 0,
          criadoEm: String(x.meta.criadoEm || ''),
          criadoPor: String(x.meta.criadoPor || '').slice(0, 80)
        },
        conteudo: x.conteudo
      };
    });
  }

  /**
   * Lê um backup .json. Aceita tanto o pacote completo quanto o estado cru.
   * Devolve { ok, estado, erro }.
   */
  function importarJSON(texto) {
    var obj;
    try { obj = JSON.parse(texto); } catch (e) {
      return { ok: false, erro: 'O arquivo não é um JSON válido.' };
    }

    var cru = obj && obj.dados ? obj.dados : obj;
    if (!formatoValido(cru)) {
      return { ok: false, erro: 'O arquivo não parece ser um backup deste sistema (faltam as listas de anestesistas, cirurgias ou avaliações).' };
    }

    return { ok: true, estado: sanearEstado(cru), versao: obj && obj.versao, anexos: sanearAnexos(obj && obj.anexos) };
  }

  /* ===================================================== exportar CSV == */

  /** Valor pronto para célula de CSV, no formato que o Excel pt-BR espera. */
  function paraCelula(valor, tipo) {
    if (valor === null || valor === undefined || valor === '') return '';

    if (tipo === 'data') return dataBR(valor);
    if (tipo === 'hora') return paraHora(valor);
    if (tipo === 'duracao') return horasHHMM(valor);
    if (tipo === 'moeda' || tipo === 'numero') {
      var n = paraNumero(valor);
      return n === null ? '' : String(n).replace('.', ',');
    }
    return String(valor);
  }

  /**
   * Neutraliza fórmula em célula de texto (CSV/formula injection).
   * Um paciente cadastrado como "=HYPERLINK(...)" viraria fórmula ativa ao
   * abrir o CSV no Excel. Prefixar com apóstrofo faz o Excel ler como texto.
   * Número negativo ("-120,50") continua número.
   */
  function celulaSegura(s) {
    if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+([.,]\d+)?$/.test(s)) return "'" + s;
    return s;
  }

  /**
   * Matriz -> CSV com ponto-e-vírgula (o separador que o Excel em português
   * entende sem pedir importação manual), com as células neutralizadas.
   */
  function paraCSV(linhas) {
    return (linhas || []).map(function (linha) {
      return (linha || []).map(function (c) {
        if (c === null || c === undefined) return '';
        var s = celulaSegura(String(c));
        if (/[";\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
        return s;
      }).join(';');
    }).join('\r\n');
  }

  /** Matriz [cabeçalho, ...linhas] de uma aba tabular do schema. */
  function matrizDaAba(nomeLogico, registros) {
    var cols = schemaColunas(nomeLogico);
    var linhas = [cols.map(function (c) { return c.rotulo; })];

    (registros || []).forEach(function (r) {
      linhas.push(cols.map(function (c) { return paraCelula(r[c.campo], c.tipo); }));
    });

    return linhas;
  }

  /**
   * Gera todos os CSVs do sistema, um por aba, com o nome exato da aba.
   * `mes`/`ano` definem o bloco de indicadores do FINANCEIRO (o mês que está
   * selecionado na tela). Devolve [{ nome, conteudo }].
   */
  function exportarCSVs(store, mes, ano) {
    var e = store.estado;
    var saida = [];

    function add(nomeAba, matriz) {
      saida.push({ nome: nomeAba, conteudo: paraCSV(matriz) });
    }

    add('ANESTESISTAS', matrizDaAba('ANESTESISTAS', e.anestesistas));
    add('ESCALA_BASE', matrizDaAba('ESCALA_BASE', e.escalaBase));

    store.horizonte.forEach(function (m) {
      add(m.aba, matrizDaAba('ESCALA_MENSAL', e.escalas[m.chave]));
    });

    add('ESCALA_CONSOLIDADA', matrizDaAba('ESCALA_CONSOLIDADA', e.consolidada));
    add('CIRURGIAS', matrizDaAba('CIRURGIAS', e.cirurgias));
    add('AVALIAÇÕES PRÉ', matrizDaAba('AVALIACOES_PRE', e.avaliacoes));

    /* HORAS: cabeçalho próprio, com título e nota como na planilha, com as
       colunas dos meses do ano selecionado (em 2026: OUT/NOV/DEZ, igual à aba) */
    var anoH = ano || CONFIG.ANO_REFERENCIA;
    var mesesH = mesesDoAno(store.horizonte, anoH);
    var colsH = colunasHoras(mesesH);
    var mH = [
      ['HORAS TRABALHADAS POR ANESTESISTA (' + anoH + ')'],
      [SCHEMA.HORAS.nota],
      [],
      colsH.map(function (c) { return c.rotulo; })
    ];
    store.horas(mesesH).forEach(function (l) {
      mH.push(colsH.map(function (c) { return paraCelula(l[c.campo], c.tipo); }));
    });
    add('HORAS', mH);

    /* FINANCEIRO: bloco de indicadores do mês selecionado + ledger */
    var f = store.financeiro(mes || CONFIG.MESES_ESCALA[0].mes, ano || CONFIG.ANO_REFERENCIA);
    var mF = [
      [SCHEMA.FINANCEIRO.titulo], [],
      ['MÊS', f.mes], ['ANO', f.ano], []
    ];
    SCHEMA.FINANCEIRO.indicadores.forEach(function (i) {
      mF.push([i.rotulo, paraCelula(f[i.campo], 'moeda')]);
    });
    mF.push([], [SCHEMA.FINANCEIRO.ledger.nota], []);
    var colsL = SCHEMA.FINANCEIRO.ledger.colunas;
    mF.push(colsL.map(function (c) { return c.rotulo; }));
    store.ledger().forEach(function (l) {
      mF.push(colsL.map(function (c) { return paraCelula(l[c.campo], c.tipo); }));
    });
    add('FINANCEIRO', mF);

    /* BOLETINS: uma linha por boletim (o boletim inteiro sai em PDF) */
    if ((e.boletins || []).length) add('BOLETINS ANESTÉSICOS', matrizDosBoletins(e));

    /* LOG */
    add('LOG', matrizDaAba('LOG', e.log));

    return saida;
  }

  /** Resumo dos boletins para planilha: identificação, técnica, horários e desfecho. */
  function matrizDosBoletins(e) {
    var porId = {};
    e.cirurgias.forEach(function (c) { porId[txt(c.id)] = c; });
    var linhas = [['ID_BOLETIM', 'ID_CIRURGIA', 'SITUAÇÃO', 'VERSÃO', 'DATA DA CIRURGIA', 'PACIENTE', 'PROCEDIMENTO',
      'ANESTESISTA', 'ASA', 'TÉCNICA', 'INÍCIO DA ANESTESIA', 'FIM DA ANESTESIA', 'DURAÇÃO DA ANESTESIA',
      'DESTINO', 'ALDRETE', 'FINALIZADO EM', 'CÓDIGO DE CONFERÊNCIA']];
    e.boletins.forEach(function (b) {
      var c = porId[b.idCirurgia] || {};
      var id = b.identificacao || {};
      var r = resumoBoletim(b);
      linhas.push([
        b.id, b.idCirurgia, b.status, b.versao,
        paraCelula(id.data || c.data, 'data'), id.paciente || c.paciente || '', id.procedimento || c.procedimento || '',
        id.anestesista || c.anestesista || '', b.pre.asa ? b.pre.asa + (b.pre.emergencia ? 'E' : '') : '',
        b.tecnicas.concat(b.tecnicaOutra ? [b.tecnicaOutra] : []).join(' + '),
        b.tempos.inicioAnestesia, b.tempos.fimAnestesia,
        r.duracaoAnestesia === null ? '' : paraCelula(r.duracaoAnestesia / 60, 'duracao'),
        b.destino, r.aldrete === null ? '' : r.aldrete, b.finalizadoEm,
        b.assinatura ? codigoLegivel(b.assinatura.codigo) : ''
      ].map(function (v) { return v === null || v === undefined ? '' : v; }));
    });
    return linhas;
  }

  /* ========================================================= zip ====== */

  var TABELA_CRC = (function () {
    var t = [];
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(bytes) {
    var c = 0xffffffff;
    for (var i = 0; i < bytes.length; i++) c = TABELA_CRC[(c ^ bytes[i]) & 255] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  /**
   * Arquivo .zip sem compressão (método "armazenar"): junta vários arquivos
   * num só, com nomes em UTF-8 (acentos das abas preservados). CSV é pequeno;
   * juntar importa mais que comprimir. `arquivos`: [{ nome, dados }], com
   * dados em texto ou Uint8Array. Devolve um Blob.
   */
  function zip(arquivos) {
    var enc = new TextEncoder();
    var agora = new Date();
    var hora = (agora.getHours() << 11) | (agora.getMinutes() << 5) | (agora.getSeconds() >> 1);
    var data = ((agora.getFullYear() - 1980) << 9) | ((agora.getMonth() + 1) << 5) | agora.getDate();
    var partes = [], central = [], posicao = 0, tamanhoCentral = 0;

    arquivos.forEach(function (a) {
      var nome = enc.encode(a.nome);
      var dados = typeof a.dados === 'string' ? enc.encode(a.dados) : a.dados;
      var crc = crc32(dados);

      var local = new DataView(new ArrayBuffer(30));
      local.setUint32(0, 0x04034b50, true);
      local.setUint16(4, 20, true);          // versão necessária
      local.setUint16(6, 0x0800, true);      // nomes em UTF-8
      local.setUint16(8, 0, true);           // armazenado
      local.setUint16(10, hora, true);
      local.setUint16(12, data, true);
      local.setUint32(14, crc, true);
      local.setUint32(18, dados.length, true);
      local.setUint32(22, dados.length, true);
      local.setUint16(26, nome.length, true);
      local.setUint16(28, 0, true);
      partes.push(local.buffer, nome, dados);

      var dir = new DataView(new ArrayBuffer(46));
      dir.setUint32(0, 0x02014b50, true);
      dir.setUint16(4, 20, true);
      dir.setUint16(6, 20, true);
      dir.setUint16(8, 0x0800, true);
      dir.setUint16(10, 0, true);
      dir.setUint16(12, hora, true);
      dir.setUint16(14, data, true);
      dir.setUint32(16, crc, true);
      dir.setUint32(20, dados.length, true);
      dir.setUint32(24, dados.length, true);
      dir.setUint16(28, nome.length, true);
      dir.setUint32(42, posicao, true);
      central.push(dir.buffer, nome);

      posicao += 30 + nome.length + dados.length;
      tamanhoCentral += 46 + nome.length;
    });

    var fim = new DataView(new ArrayBuffer(22));
    fim.setUint32(0, 0x06054b50, true);
    fim.setUint16(8, arquivos.length, true);
    fim.setUint16(10, arquivos.length, true);
    fim.setUint32(12, tamanhoCentral, true);
    fim.setUint32(16, posicao, true);
    return new Blob(partes.concat(central, [fim.buffer]), { type: 'application/zip' });
  }

  /** Baixa um CSV só, de uma tabela já montada na tela. */
  function baixarCSV(nomeArquivo, matriz) {
    UI.baixarTexto(nomeArquivo + '.csv', paraCSV(matriz), 'text/csv');
  }

  /* ================================================== import planilha == */

  /**
   * Importa o seed (ANESTESISTAS + ESCALA_BASE) de um JSON gerado por
   * tools/extrair_dados.py. Usado para recarregar os dados mestres a partir
   * da planilha sem perder as cirurgias já lançadas.
   */
  function importarSeed(texto) {
    var obj;
    try { obj = JSON.parse(texto); } catch (e) {
      return { ok: false, erro: 'O arquivo não é um JSON válido.' };
    }

    if (!obj || !Array.isArray(obj.ANESTESISTAS) || !Array.isArray(obj.ESCALA_BASE)) {
      return { ok: false, erro: 'Esperava um arquivo com as listas ANESTESISTAS e ESCALA_BASE (gerado por tools/extrair_dados.py).' };
    }

    return {
      ok: true,
      anestesistas: sanearLista(obj.ANESTESISTAS, 'ANESTESISTAS'),
      escalaBase: sanearLista(obj.ESCALA_BASE, 'ESCALA_BASE'),
      origem: typeof obj.origem === 'string' ? obj.origem : null
    };
  }

  /* ==================================================================== */

  return {
    CHAVE: CHAVE,
    disponivel: disponivel,
    salvarLocal: salvarLocal, carregarLocal: carregarLocal, apagarLocal: apagarLocal,
    salvarPrefs: salvarPrefs, carregarPrefs: carregarPrefs,
    observarOutrasAbas: observarOutrasAbas,
    estadoDoSeed: estadoDoSeed, sanearEstado: sanearEstado,
    formatoValido: formatoValido, enxugar: enxugar,
    exportarJSON: exportarJSON, importarJSON: importarJSON,
    exportarCSVs: exportarCSVs, baixarCSV: baixarCSV, zip: zip, crc32: crc32,
    matrizDaAba: matrizDaAba, paraCelula: paraCelula, paraCSV: paraCSV,
    importarSeed: importarSeed
  };
})();
