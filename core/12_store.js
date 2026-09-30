/**
 * ============================================================================
 * 12_STORE — Estado, transações e integridade
 * ============================================================================
 * É a peça que faz o sistema "não quebrar". Três garantias:
 *
 * 1. CAMINHO ÚNICO DE ESCRITA
 *    Nenhum módulo de tela mexe no estado direto. Toda alteração passa por
 *    `store.transacao()`, que faz sempre a mesma sequência:
 *        validar -> aplicar -> recalcular -> sincronizar -> registrar no log
 *    Se a validação falhar, NADA é gravado (rollback por snapshot).
 *
 * 2. ORDEM DE RECÁLCULO FIXA
 *    escala -> consolidada -> índices -> cirurgias -> avaliações -> cirurgias
 *    O segundo passe nas cirurgias existe porque a coluna T (STATUS DA
 *    AVALIAÇÃO PRÉ) depende das avaliações, que por sua vez dependem das
 *    cirurgias. Duas passadas resolvem a dependência circular de forma
 *    determinística, sem laço de convergência.
 *
 * 3. INTEGRIDADE VERIFICÁVEL
 *    `store.verificarIntegridade()` audita o estado inteiro e devolve os
 *    problemas encontrados; `store.reparar()` corrige o que é seguro corrigir
 *    automaticamente (IDs faltando, campos auto desatualizados) e deixa o
 *    resto para decisão humana.
 * ============================================================================
 */

/**
 * Cria um estado vazio com as 11 tabelas.
 * `escalas` guarda uma lista por mês, pela chave 'YYYY-MM':
 * { '2026-10': [...], '2026-11': [...], ... }.
 */
function estadoVazio() {
  var escalas = {};
  horizontePlanilha().forEach(function (m) { escalas[m.chave] = []; });

  return {
    versao: CONFIG.VERSAO,
    // Ajustes de operação que o grupo liga/desliga pela interface.
    // escalaBaseAuto: a ESCALA_BASE deixa de ser digitada e passa a ser
    // montada do cadastro, em ordem alfabética. Nasce desligado para não
    // reescrever sozinha a escala de quem já tem dado gravado.
    // sequencias: maior número de ID já emitido por tipo. Um ID apagado não
    // volta a ser usado (ver proximoId).
    // clinica: identificação que sai no termo de consentimento (TCLE) e o
    // texto do termo, quando a equipe personaliza (vazio = texto padrão).
    // qualidade: definições clínicas do módulo de indicadores (limiares,
    // metas, referências e a aprovação do responsável técnico) — 09c.
    config: {
      escalaBaseAuto: false,
      sequencias: { cirurgia: 0, avaliacao: 0, boletim: 0, qualidade: 0, estrutura: 0 },
      clinica: {},
      qualidade: configQualidadePadrao()
    },
    anestesistas: [],
    escalaBase: [],
    escalas: escalas,
    consolidada: [],
    cirurgias: [],
    avaliacoes: [],
    // Dados próprios do sistema (não são abas da planilha):
    repasses: [],   // [{ mes:'YYYY-MM', despesas, obs, pagamentos:[...] }] — 09b_repasse
    boletins: [],   // boletins anestésicos, um por cirurgia — 06b_boletim
    fichasQualidade: [],   // indicadores de qualidade, uma ficha por cirurgia — 06c
    estrutura: [],  // indicadores de estrutura por unidade/sala/turno — 06d
    log: []
  };
}

/**
 * Cria o store.
 * `opcoes.usuario`    vai para a coluna USUÁRIO do log.
 * `opcoes.aoMudar`    é chamado depois de cada transação bem-sucedida.
 * `opcoes.horizonte`  'planilha' (padrão: os 3 meses com aba, como o Apps
 *                     Script precisa) ou 'movel' (acompanha o calendário —
 *                     web app e servidor).
 * `opcoes.hoje`       data de referência do horizonte móvel (padrão: hoje).
 */
function criarStore(estadoInicial, opcoes) {
  opcoes = opcoes || {};

  var estado = estadoInicial || estadoVazio();
  var usuario = opcoes.usuario || CONFIG.USUARIO_PADRAO;
  var ouvintes = [];
  if (typeof opcoes.aoMudar === 'function') ouvintes.push(opcoes.aoMudar);

  if (!Array.isArray(estado.repasses)) estado.repasses = [];
  // Boletim guardado é IMUTÁVEL: toda mudança monta um objeto novo e troca o
  // antigo na lista. É isso que deixa a transação desfazer uma alteração de
  // boletim guardando só a lista (sem copiar o conteúdo, que é a parte do
  // estado que mais cresce) — e o congelamento garante a regra.
  estado.boletins = (Array.isArray(estado.boletins) ? estado.boletins : []).map(function (b) {
    return Object.isFrozen(b) ? b : congelarBoletim(normalizarBoletim(b));
  });
  // Ficha de qualidade e registro de estrutura seguem a mesma regra do
  // boletim: objeto imutável, trocado inteiro a cada alteração.
  estado.fichasQualidade = (Array.isArray(estado.fichasQualidade) ? estado.fichasQualidade : []).map(function (f) {
    return Object.isFrozen(f) ? f : congelarFicha(normalizarFicha(f));
  });
  estado.estrutura = (Array.isArray(estado.estrutura) ? estado.estrutura : []).map(function (r) {
    return Object.isFrozen(r) ? r : congelarRegistroEstrutura(normalizarRegistroEstrutura(r));
  });

  var modoHorizonte = opcoes.horizonte === 'movel' ? 'movel' : 'planilha';
  var hojeFixo = paraData(opcoes.hoje);
  var horizonte = [];
  var ateMesNavegado = null;   // até onde alguém navegou no calendário (só na sessão)

  migrarChavesDasEscalas();

  /**
   * Estados antigos guardavam a escala pelo número do mês ({ 10: [...] });
   * com o horizonte passando de um ano, 10 seria ambíguo (out/2026 ou
   * out/2027?). Converte para 'YYYY-MM' — os números antigos só existiam
   * para os meses da planilha.
   */
  function migrarChavesDasEscalas() {
    var antigas = estado.escalas || {};
    var novas = {};
    Object.keys(antigas).forEach(function (k) {
      if (/^\d{4}-\d{2}$/.test(k)) { novas[k] = antigas[k]; return; }
      if (/^\d{1,2}$/.test(k)) {
        var cfg = cfgMesEscala(Number(k));
        var chave = chaveMes(cfg ? cfg.ano : CONFIG.ANO_REFERENCIA, Number(k));
        if (!novas[chave] || !novas[chave].length) novas[chave] = antigas[k];
      }
    });
    estado.escalas = novas;
  }

  function hojeDoStore() { return hojeFixo || hojeISO(); }

  /**
   * Meses com escala, conforme o modo. O móvel vai até o mais distante entre:
   * hoje + meses à frente, a última cirurgia marcada, o último mês com
   * substituição registrada e o mês até onde alguém navegou no calendário.
   */
  function calcularHorizonte() {
    if (modoHorizonte !== 'movel') return horizontePlanilha();
    var ultima = '';
    estado.cirurgias.forEach(function (c) {
      var d = paraData(c.data);
      if (d > ultima) ultima = d;
    });
    Object.keys(estado.escalas || {}).forEach(function (k) {
      if (!/^\d{4}-\d{2}$/.test(k)) return;
      var temAjuste = (estado.escalas[k] || []).some(function (l) { return ehSim(l.ajuste); });
      if (temAjuste && k + '-01' > ultima) ultima = k + '-01';
    });
    return horizonteMovel({ hoje: hojeDoStore(), ultimoComDado: ultima, ateMes: ateMesNavegado });
  }

  /**
   * Leva a escala até um mês escolhido no calendário (dentro da faixa
   * navegável). Devolve true se o mês passou a ter escala.
   */
  function estenderHorizonte(ano, mes) {
    if (modoHorizonte !== 'movel') return !!buscarMes(horizonteAtual(), ano, mes);
    var pedido = { ano: Number(ano), mes: Number(mes) };
    var faixa = faixaNavegavel(hojeDoStore());
    if (compararMeses(pedido, faixa.de) < 0 || compararMeses(pedido, faixa.ate) > 0) return false;
    if (buscarMes(horizonteAtual(), ano, mes)) return true;
    ateMesNavegado = pedido;
    recalcular();
    return !!buscarMes(horizonte, ano, mes);
  }

  function horizonteAtual() {
    if (!horizonte.length) horizonte = calcularHorizonte();
    return horizonte;
  }

  // Índices derivados, refeitos a cada recálculo. Nunca serializados.
  var idx = { porNome: {}, escala: null, avaliacoesPorCirurgia: {} };

  /* ==================================================================== */
  /*                            RECÁLCULO                                 */
  /* ==================================================================== */

  /**
   * Refaz todo o estado derivado, na ordem fixa documentada no topo.
   * É idempotente: rodar duas vezes seguidas dá o mesmo resultado.
   */
  function recalcular() {
    idx.porNome = indexarAnestesistasPorNome(estado.anestesistas);

    // 0. Escala-base automática: quando ligada, ela é DERIVADA do cadastro e
    //    se refaz a cada recálculo. É o que faz a escala se reorganizar
    //    sozinha quando alguém entra, sai ou é desativado.
    if (estado.config && estado.config.escalaBaseAuto) {
      var baseAuto = gerarEscalaBaseAlfabetica(estado.anestesistas);
      // Cadastro pequeno demais devolve lista vazia; nesse caso preserva a
      // base que já existia em vez de zerar a escala do mês inteiro.
      if (baseAuto.length) estado.escalaBase = baseAuto;
    }

    // 1. Escalas mensais — preservando os ajustes manuais já registrados.
    //    No horizonte móvel, mês ENCERRADO é histórico: fica como foi
    //    gravado. Sem isso, mudar a escala-base em março reescreveria quem
    //    trabalhou em outubro, e a posição das cirurgias antigas mudaria.
    horizonte = calcularHorizonte();
    var hoje = hojeDoStore();

    horizonte.forEach(function (m) {
      var atuais = estado.escalas[m.chave] || [];
      if (modoHorizonte === 'movel' && atuais.length && mesEncerrado(m, hoje)) return;

      var ajustes = {};
      atuais.forEach(function (l) {
        if (ehSim(l.ajuste) || !vazio(l.substituto) || !vazio(l.motivo)) {
          ajustes[chaveDataPosicao(l.data, l.posicao)] = {
            ajuste: l.ajuste, substituto: l.substituto, motivo: l.motivo
          };
        }
      });
      estado.escalas[m.chave] = gerarEscalaMensal(
        m.ano, m.mes, estado.escalaBase, ajustes, estado.anestesistas);
    });

    // 2. Consolidada + índices de busca.
    estado.consolidada = gerarConsolidada(estado.escalas, estado.anestesistas, horizonte);
    idx.escala = indexarConsolidada(estado.consolidada);

    // 3. Primeira passada nas cirurgias (tudo menos a coluna T).
    idx.avaliacoesPorCirurgia = indexarAvaliacoesPorCirurgia(estado.avaliacoes);
    recalcularCirurgias(estado.cirurgias, {
      porNome: idx.porNome, idxEscala: idx.escala,
      avaliacoesPorCirurgia: idx.avaliacoesPorCirurgia
    });

    // 4. Avaliações: cria as que faltam e re-espelha as existentes.
    var sync = sincronizarAvaliacoes(estado.cirurgias, estado.avaliacoes, {
      valorPadrao: CONFIG.VALOR_PADRAO_AVALIACAO,
      pisoId: sequencias().avaliacao,
      porNome: idx.porNome
    });
    estado.avaliacoes = sync.avaliacoes;

    // 5. Segunda passada: agora a coluna T vê as avaliações finais.
    idx.avaliacoesPorCirurgia = indexarAvaliacoesPorCirurgia(estado.avaliacoes);
    recalcularCirurgias(estado.cirurgias, {
      porNome: idx.porNome, idxEscala: idx.escala,
      avaliacoesPorCirurgia: idx.avaliacoesPorCirurgia
    });

    return sync;
  }

  /* ==================================================================== */
  /*                            TRANSAÇÃO                                 */
  /* ==================================================================== */

  /**
   * Cópia profunda do estado, para rollback.
   * Na transação o LOG fica de fora da cópia: ele só cresce (append-only),
   * então desfazer é cortar de volta ao tamanho anterior. Sem isso, cada
   * gravação copiaria o histórico inteiro — custo que cresce para sempre.
   */
  function snapshot(semLog) {
    var copia = JSON.parse(JSON.stringify({
      versao: estado.versao,
      config: estado.config,
      anestesistas: estado.anestesistas,
      escalaBase: estado.escalaBase,
      escalas: estado.escalas,
      cirurgias: estado.cirurgias,
      avaliacoes: estado.avaliacoes,
      repasses: estado.repasses || [],
      log: semLog ? [] : estado.log
    }));
    if (semLog) {
      delete copia.log;
      copia.tamanhoLog = estado.log.length;
      // Boletins, fichas de qualidade e estrutura são imutáveis: basta a
      // lista com os mesmos objetos.
      copia.boletins = estado.boletins.slice();
      copia.fichasQualidade = estado.fichasQualidade.slice();
      copia.estrutura = estado.estrutura.slice();
      copia.imutaveisPorReferencia = true;
    } else {
      copia.boletins = JSON.parse(JSON.stringify(estado.boletins));
      copia.fichasQualidade = JSON.parse(JSON.stringify(estado.fichasQualidade));
      copia.estrutura = JSON.parse(JSON.stringify(estado.estrutura));
    }
    return copia;
  }

  function restaurar(snap) {
    estado.versao = snap.versao;
    if (snap.config) estado.config = snap.config;
    estado.anestesistas = snap.anestesistas;
    estado.escalaBase = snap.escalaBase;
    estado.escalas = snap.escalas;
    estado.cirurgias = snap.cirurgias;
    estado.avaliacoes = snap.avaliacoes;
    estado.repasses = snap.repasses || [];
    // `boletinsPorReferencia` é o nome antigo do mesmo marcador: snapshots
    // guardados por versões anteriores continuam restaurando.
    if (snap.imutaveisPorReferencia || snap.boletinsPorReferencia) {
      estado.boletins = snap.boletins;
      if (Array.isArray(snap.fichasQualidade)) estado.fichasQualidade = snap.fichasQualidade;
      if (Array.isArray(snap.estrutura)) estado.estrutura = snap.estrutura;
    } else {
      if (Array.isArray(snap.boletins)) {
        estado.boletins = snap.boletins.map(function (b) { return congelarBoletim(normalizarBoletim(b)); });
      }
      if (Array.isArray(snap.fichasQualidade)) {
        estado.fichasQualidade = snap.fichasQualidade.map(function (f) { return congelarFicha(normalizarFicha(f)); });
      }
      if (Array.isArray(snap.estrutura)) {
        estado.estrutura = snap.estrutura.map(function (r) { return congelarRegistroEstrutura(normalizarRegistroEstrutura(r)); });
      }
    }
    if (snap.log) estado.log = snap.log;
    else if (typeof snap.tamanhoLog === 'number') estado.log.length = snap.tamanhoLog;
  }

  /**
   * Maior número de ID já emitido, por tipo. Sobe a cada gravação e nunca
   * desce — é o que impede um ID apagado de renascer em outro registro.
   */
  function sequencias() {
    if (!estado.config) estado.config = {};
    if (!estado.config.sequencias) estado.config.sequencias = { cirurgia: 0, avaliacao: 0, boletim: 0, qualidade: 0, estrutura: 0 };
    return estado.config.sequencias;
  }

  function atualizarSequencias() {
    var s = sequencias();
    estado.cirurgias.forEach(function (c) {
      s.cirurgia = Math.max(Number(s.cirurgia) || 0, numeroDoId(CONFIG.PREFIXO_CIRURGIA, c.id));
    });
    estado.avaliacoes.forEach(function (a) {
      s.avaliacao = Math.max(Number(s.avaliacao) || 0, numeroDoId(CONFIG.PREFIXO_AVALIACAO, a.id));
    });
    s.boletim = Number(s.boletim) || 0;
    estado.boletins.forEach(function (b) {
      s.boletim = Math.max(s.boletim, numeroDoId(CONFIG.PREFIXO_BOLETIM, b.id));
    });
    s.qualidade = Number(s.qualidade) || 0;
    estado.fichasQualidade.forEach(function (f) {
      s.qualidade = Math.max(s.qualidade, numeroDoId(CONFIG.PREFIXO_QUALIDADE, f.id));
    });
    s.estrutura = Number(s.estrutura) || 0;
    estado.estrutura.forEach(function (r) {
      s.estrutura = Math.max(s.estrutura, numeroDoId(CONFIG.PREFIXO_ESTRUTURA, r.id));
    });
  }

  /**
   * Filtra o que chega de fora numa gravação: só campos MANUAIS do schema.
   * Colunas "(auto)", o uid interno e chaves estranhas (inclusive
   * "__proto__" de um JSON adulterado) nunca passam — sem isso, a tela ou um
   * backup editado poderiam trocar o ID de uma cirurgia e quebrar vínculos.
   */
  function soCamposEditaveis(nomeLogico, dados) {
    var permitidos = {};
    schemaColunas(nomeLogico).forEach(function (c) {
      if (c.origem === 'MANUAL') permitidos[c.campo] = true;
    });
    var saida = {};
    Object.keys(dados || {}).forEach(function (k) {
      if (permitidos[k] === true) saida[k] = dados[k];
    });
    return saida;
  }

  /**
   * Executa uma mutação de forma atômica.
   *
   * `fn(estado, api)` deve devolver:
   *   - undefined / { ok:true }       -> confirma
   *   - { ok:false, erros:[...] }     -> desfaz tudo
   *   - { ok:true, log:[entradas] }   -> confirma e registra no log
   *   - { ok:true, semRecalculo:true } -> confirma sem refazer o derivado
   *     (só para o que não alimenta cálculo nenhum: o boletim anestésico)
   *
   * Devolve { ok, erros, avisos, log, criadas, atualizadas, orfas }.
   */
  function transacao(fn) {
    var snap = snapshot(true);
    var resultado;

    try {
      resultado = fn(estado, {
        idx: idx,
        proximoIdCirurgia: proximoIdCirurgia,
        proximoIdAnestesista: proximoIdAnestesista,
        registrar: function (entradas) {
          (entradas || []).forEach(function (e) { estado.log.push(e); });
        }
      }) || { ok: true };
    } catch (e) {
      restaurar(snap);
      return { ok: false, erros: [{ campo: '', msg: 'Erro interno: ' + (e && e.message ? e.message : e) }], avisos: [] };
    }

    if (resultado.ok === false) {
      restaurar(snap);
      return {
        ok: false,
        erros: resultado.erros || [{ campo: '', msg: 'Operação rejeitada.' }],
        avisos: resultado.avisos || []
      };
    }

    var sync = resultado.semRecalculo ? { criadas: [], atualizadas: [], orfas: [] } : recalcular();
    atualizarSequencias();

    // Avaliações criadas pela sincronização também entram no log.
    (sync.criadas || []).forEach(function (a) {
      estado.log.push(logCriacao('AVALIACOES_PRE', a, {
        usuario: usuario,
        idCirurgia: a.idCirurgia,
        campo: 'AVALIAÇÃO CRIADA AUTOMATICAMENTE'
      }));
    });

    var saida = {
      ok: true,
      erros: [],
      avisos: resultado.avisos || [],
      criadas: sync.criadas || [],
      atualizadas: sync.atualizadas || [],
      orfas: sync.orfas || [],
      // Avaliações apagadas nesta transação (exclusão em cascata). Quem guarda
      // coisa presa a elas fora do estado — os PDFs de exame — escuta isto.
      removidas: resultado.removidas || [],
      // Boletim criado/alterado nesta transação (a tela redesenha a partir dele).
      boletim: resultado.boletim || null,
      // Idem para a ficha de qualidade e o registro de estrutura.
      ficha: resultado.ficha || null,
      registro: resultado.registro || null
    };

    ouvintes.forEach(function (f) {
      try { f(estado, saida); } catch (e) { /* ouvinte não derruba transação */ }
    });

    return saida;
  }

  /* ==================================================================== */
  /*                               IDs                                    */
  /* ==================================================================== */

  function proximoIdCirurgia() {
    return proximoId(CONFIG.PREFIXO_CIRURGIA, estado.cirurgias.map(function (c) { return c.id; }),
      4, sequencias().cirurgia);
  }

  function proximoIdAvaliacao() {
    return proximoId(CONFIG.PREFIXO_AVALIACAO, estado.avaliacoes.map(function (a) { return a.id; }),
      4, sequencias().avaliacao);
  }

  function proximoIdBoletim() {
    return proximoId(CONFIG.PREFIXO_BOLETIM, estado.boletins.map(function (b) { return b.id; }),
      4, sequencias().boletim);
  }

  function proximoIdFichaQualidade() {
    return proximoId(CONFIG.PREFIXO_QUALIDADE, estado.fichasQualidade.map(function (f) { return f.id; }),
      4, sequencias().qualidade);
  }

  function proximoIdEstrutura() {
    return proximoId(CONFIG.PREFIXO_ESTRUTURA, estado.estrutura.map(function (r) { return r.id; }),
      4, sequencias().estrutura);
  }

  function proximoIdAnestesista() {
    var ids = estado.anestesistas.map(function (a) { return a.id; });
    return proximoId(CONFIG.PREFIXO_ANESTESISTA, ids, 2);
  }

  /* ==================================================================== */
  /*                       OPERAÇÕES DE NEGÓCIO                           */
  /* ==================================================================== */

  /** Cria uma cirurgia. `dados` traz só campos manuais. */
  function adicionarCirurgia(dados) {
    return transacao(function (st, api) {
      var c = Object.assign({
        id: '', status: DOMINIOS.STATUS_CIRURGIA[0], data: '',
        inicioPrev: '', fimPrev: '', inicioReal: '', fimReal: '',
        paciente: '', convenio: '', telefone: '', procedimento: '', cirurgiao: '',
        anestesista: '', sala: '', avaliacaoNec: 'Não',
        valor: null, pago: 'Não', dataPagamento: '', nf: '', obs: ''
      }, soCamposEditaveis('CIRURGIAS', dados));

      // ID explícito só para migração (ex.: linhas vindas da planilha); o
      // fluxo normal deixa o sistema numerar.
      if (dados && !vazio(dados.id)) c.id = txt(dados.id);
      if (vazio(c.id)) c.id = api.proximoIdCirurgia();

      var rel = validarCirurgia(c, { nomesAnestesistas: nomesAnestesistas(), nomesInativos: nomesInativos(), cirurgias: st.cirurgias });
      if (!rel.ok) return { ok: false, erros: rel.erros, avisos: rel.avisos };

      if (st.cirurgias.some(function (x) { return txt(x.id) === txt(c.id); })) {
        return { ok: false, erros: [{ campo: 'id', msg: 'ID_CIRURGIA ' + c.id + ' já existe.' }] };
      }

      st.cirurgias.push(c);
      api.registrar([logCriacao('CIRURGIAS', c, { usuario: usuario, idCirurgia: c.id })]);
      return { ok: true, avisos: rel.avisos };
    });
  }

  /** Altera campos de uma cirurgia. `mudancas` traz só o que muda. */
  function atualizarCirurgia(id, mudancas) {
    return transacao(function (st, api) {
      var alvo = st.cirurgias.filter(function (c) { return txt(c.id) === txt(id); })[0];
      if (!alvo) return { ok: false, erros: [{ campo: 'id', msg: 'Cirurgia ' + id + ' não encontrada.' }] };

      var antes = JSON.parse(JSON.stringify(alvo));
      mudancas = soCamposEditaveis('CIRURGIAS', mudancas);
      var candidato = Object.assign({}, alvo, mudancas);

      var rel = validarCirurgia(candidato, {
        cirurgias: st.cirurgias,
        nomesAnestesistas: nomesAnestesistas(),
        // Só avisa de inativo quando o anestesista está sendo TROCADO — a
        // cirurgia antiga de quem saiu do grupo não precisa alertar a cada edição.
        nomesInativos: mudancas.anestesista !== undefined && !mesmoTexto(mudancas.anestesista, alvo.anestesista)
          ? nomesInativos() : null
      });
      if (!rel.ok) return { ok: false, erros: rel.erros, avisos: rel.avisos };

      Object.assign(alvo, mudancas);
      recalcularCirurgia(alvo, {
        porNome: idx.porNome, idxEscala: idx.escala,
        avaliacoesPorCirurgia: idx.avaliacoesPorCirurgia
      });

      api.registrar(diffParaLog('CIRURGIAS', antes, alvo, { usuario: usuario, idCirurgia: alvo.id }));
      return { ok: true, avisos: rel.avisos };
    });
  }

  /**
   * Remove uma cirurgia. Por padrão RECUSA se houver avaliação vinculada —
   * apagar a cirurgia deixaria a avaliação órfã e o ledger inconsistente.
   * `opcoesRemocao.comAvaliacoes = true` remove as duas coisas, registrando
   * cada exclusão no log.
   */
  function removerCirurgia(id, opcoesRemocao) {
    opcoesRemocao = opcoesRemocao || {};

    return transacao(function (st, api) {
      var i = -1;
      for (var k = 0; k < st.cirurgias.length; k++) {
        if (txt(st.cirurgias[k].id) === txt(id)) { i = k; break; }
      }
      if (i < 0) return { ok: false, erros: [{ campo: 'id', msg: 'Cirurgia ' + id + ' não encontrada.' }] };

      // O boletim anestésico é prontuário: a cirurgia dele não some.
      var bol = st.boletins.filter(function (b) { return b.idCirurgia === txt(id); })[0];
      if (bol) {
        var soRascunho = bol.status !== BOLETIM_FINALIZADO && bol.versao === 1 && !bol.historico.length;
        return { ok: false, erros: [{ campo: 'id', msg: 'A cirurgia ' + id + ' tem boletim anestésico (' + bol.id + ', ' +
          bol.status.toLowerCase() + '), que faz parte do prontuário. Em vez de excluir, mude o STATUS para Cancelada' +
          (soRascunho ? ' — ou descarte antes o boletim, se ele foi criado por engano.' : '.') }] };
      }

      // A ficha de qualidade guarda desfecho e acompanhamento do paciente: com
      // a cirurgia removida ela ficaria sem data, anestesista e procedimento.
      var fq = st.fichasQualidade.filter(function (f) { return f.idCirurgia === txt(id); })[0];
      if (fq) {
        var fqIntocada = fq.status !== FICHA_CONCLUIDA && fq.versao === 1 && !fq.revisao.revisadoEm;
        return { ok: false, erros: [{ campo: 'id', msg: 'A cirurgia ' + id + ' tem ficha de qualidade (' + fq.id + ', ' +
          fq.status.toLowerCase() + '), com desfechos do paciente. Em vez de excluir, mude o STATUS para Cancelada' +
          (fqIntocada ? ' — ou descarte antes a ficha, se ela foi criada por engano.' : '.') }] };
      }

      var vinculadas = st.avaliacoes.filter(function (a) { return txt(a.idCirurgia) === txt(id); });
      if (vinculadas.length && !opcoesRemocao.comAvaliacoes) {
        return {
          ok: false,
          erros: [{
            campo: 'id',
            msg: 'A cirurgia ' + id + ' tem ' + vinculadas.length + ' avaliação(ões) vinculada(s). ' +
              'Confirme a remoção em cascata para excluir as duas coisas.'
          }]
        };
      }

      var removida = st.cirurgias.splice(i, 1)[0];
      api.registrar([logExclusao('CIRURGIAS', removida, { usuario: usuario, idCirurgia: removida.id })]);

      if (vinculadas.length) {
        st.avaliacoes = st.avaliacoes.filter(function (a) { return txt(a.idCirurgia) !== txt(id); });
        vinculadas.forEach(function (a) {
          api.registrar([logExclusao('AVALIACOES_PRE', a, { usuario: usuario, idCirurgia: a.idCirurgia })]);
        });
      }

      return { ok: true, removidas: vinculadas };
    });
  }

  /** Altera campos de uma avaliação pré-anestésica. */
  function atualizarAvaliacao(id, mudancas) {
    return transacao(function (st, api) {
      var alvo = st.avaliacoes.filter(function (a) { return txt(a.id) === txt(id); })[0];
      if (!alvo) return { ok: false, erros: [{ campo: 'id', msg: 'Avaliação ' + id + ' não encontrada.' }] };

      var antes = JSON.parse(JSON.stringify(alvo));
      mudancas = soCamposEditaveis('AVALIACOES_PRE', mudancas);
      var candidato = Object.assign({}, alvo, mudancas);

      var rel = validarAvaliacao(candidato, {
        nomesAnestesistas: nomesAnestesistas(),
        idsCirurgia: st.cirurgias.map(function (c) { return txt(c.id); })
      });
      if (!rel.ok) return { ok: false, erros: rel.erros, avisos: rel.avisos };

      Object.assign(alvo, mudancas);
      api.registrar(diffParaLog('AVALIACOES_PRE', antes, alvo, {
        usuario: usuario, idCirurgia: alvo.idCirurgia
      }));
      return { ok: true, avisos: rel.avisos };
    });
  }

  /** Cria ou atualiza um anestesista do cadastro. */
  function salvarAnestesista(dados) {
    return transacao(function (st, api) {
      var novo = !dados.id || !st.anestesistas.some(function (a) { return txt(a.id) === txt(dados.id); });
      var alvo = novo ? null : st.anestesistas.filter(function (a) { return txt(a.id) === txt(dados.id); })[0];

      var candidato = Object.assign({
        id: '', nome: '', ativo: 'Sim', telefone: '', email: '', obs: '', pix: '', crm: ''
      }, alvo || {}, soCamposEditaveis('ANESTESISTAS', dados));

      if (vazio(candidato.id)) candidato.id = api.proximoIdAnestesista();

      var rel = validarAnestesista(candidato, {
        outrosNomes: st.anestesistas.filter(function (a) { return txt(a.id) !== txt(candidato.id); })
          .map(function (a) { return a.nome; }),
        outrosIds: st.anestesistas.filter(function (a) { return txt(a.id) !== txt(candidato.id); })
          .map(function (a) { return txt(a.id); })
      });
      if (!rel.ok) return { ok: false, erros: rel.erros, avisos: rel.avisos };

      if (alvo) {
        var antes = JSON.parse(JSON.stringify(alvo));
        var nomeAntigo = txt(alvo.nome);
        Object.assign(alvo, candidato);
        api.registrar(diffParaLog('ANESTESISTAS', antes, alvo, { usuario: usuario, idCirurgia: alvo.id }));

        // O NOME é a chave de vínculo da planilha: renomear sem levar junto
        // desligaria escala, cirurgias e avaliações de quem foi renomeado.
        var nomeNovo = txt(alvo.nome);
        if (nomeAntigo && nomeNovo !== nomeAntigo) {
          var trocados = renomearEmCascata(st, nomeAntigo, nomeNovo);
          if (trocados) {
            api.registrar([novaEntradaLog({
              usuario: usuario, aba: SCHEMA.ANESTESISTAS.aba, idCirurgia: alvo.id,
              campo: 'NOME ATUALIZADO EM CASCATA',
              de: nomeAntigo, para: nomeNovo + ' (' + trocados + ' registro(s))'
            })]);
          }
        }
      } else {
        st.anestesistas.push(candidato);
        api.registrar([logCriacao('ANESTESISTAS', candidato, { usuario: usuario, idCirurgia: candidato.id })]);
      }

      return { ok: true, avisos: rel.avisos };
    });
  }

  /**
   * Troca um nome por outro em tudo que se liga pelo nome: escala-base,
   * escalas mensais (inclusive meses encerrados — é a mesma pessoa),
   * cirurgias e avaliações. Devolve quantos registros mudaram.
   */
  function renomearEmCascata(st, de, para) {
    var n = 0;
    function trocar(obj, campo) {
      if (obj && !vazio(obj[campo]) && mesmoTexto(obj[campo], de)) { obj[campo] = para; n++; }
    }
    st.escalaBase.forEach(function (l) { trocar(l, 'nome'); });
    Object.keys(st.escalas || {}).forEach(function (k) {
      (st.escalas[k] || []).forEach(function (l) {
        trocar(l, 'calculado'); trocar(l, 'substituto'); trocar(l, 'efetivo');
      });
    });
    st.cirurgias.forEach(function (c) { trocar(c, 'anestesista'); });
    st.avaliacoes.forEach(function (a) { trocar(a, 'anestesista'); trocar(a, 'anestCirurgia'); });
    return n;
  }

  /**
   * Registra (ou desfaz) um ajuste manual na escala.
   * `posicao` é 1..5; passar ajuste=false limpa o ajuste e volta ao calculado.
   */
  function ajustarEscala(data, posicao, dadosAjuste) {
    return transacao(function (st, api) {
      // Mês ainda fora da escala montada (navegado no calendário): monta agora.
      // No modo servidor, é o que faz o servidor aceitar a substituição de um
      // mês que só a tela de quem a fez já tinha aberto.
      if (!buscarMes(horizonteAtual(), anoDe(data), mesDe(data)) && dataValida(data)) {
        estenderHorizonte(anoDe(data), mesDe(data));
      }
      var info = buscarMes(horizonteAtual(), anoDe(data), mesDe(data));
      var lista = info ? st.escalas[info.chave] : null;
      if (!lista || !lista.length) {
        return { ok: false, erros: [{ campo: 'data', msg: 'Não há escala montada para ' + (dataBR(data) || 'essa data') + '.' }] };
      }

      var alvo = lista.filter(function (l) {
        return l.data === paraData(data) && Number(l.posicao) === Number(posicao);
      })[0];
      if (!alvo) {
        return { ok: false, erros: [{ campo: 'data', msg: 'Não há posição ' + posicao + ' em ' + dataBR(data) + '.' }] };
      }

      var ligar = dadosAjuste && dadosAjuste.ajuste !== false && !vazio(dadosAjuste.substituto);
      if (dadosAjuste && dadosAjuste.ajuste !== false && vazio(dadosAjuste.substituto)) {
        return { ok: false, erros: [{ campo: 'substituto', msg: 'Informe o ANESTESISTA SUBSTITUTO para marcar ajuste manual.' }] };
      }

      if (ligar) {
        var existe = nomesAnestesistas().some(function (n) { return mesmoTexto(n, dadosAjuste.substituto); });
        if (!existe) {
          return { ok: false, erros: [{ campo: 'substituto', msg: 'Substituto "' + dadosAjuste.substituto + '" não existe no cadastro.' }] };
        }
        // A mesma pessoa em dois postos do mesmo dia deixaria a chave
        // DATA+ANESTESISTA ambígua (a posição das cirurgias dela ficaria errada).
        var outroPosto = lista.filter(function (l) {
          return l.data === alvo.data && Number(l.posicao) !== Number(posicao) &&
            mesmoTexto(l.efetivo, dadosAjuste.substituto);
        })[0];
        if (outroPosto) {
          return { ok: false, erros: [{ campo: 'substituto', msg: txt(dadosAjuste.substituto) +
            ' já está na posição ' + outroPosto.posicao + ' em ' + dataBR(alvo.data) +
            ' — a mesma pessoa não pode ocupar dois postos no dia. Troque a outra posição antes.' }] };
        }
      }

      var antes = JSON.parse(JSON.stringify(alvo));
      alvo.ajuste = ligar ? 'Sim' : 'Não';
      alvo.substituto = ligar ? nomeDoCadastro(dadosAjuste.substituto, idx.porNome) : '';
      alvo.motivo = ligar ? txt(dadosAjuste.motivo) : '';
      recalcularEfetivo(alvo);

      api.registrar(diffParaLog('ESCALA_MENSAL', antes, alvo, {
        usuario: usuario,
        idCirurgia: alvo.data + '|' + alvo.posicao,
        abaPlanilha: info.aba
      }));
      return { ok: true };
    });
  }

  /** Substitui a ESCALA_BASE inteira (as 30 linhas) de uma vez. */
  function definirEscalaBase(linhas) {
    return transacao(function (st) {
      var rel = validarEscalaBase(linhas, st.anestesistas);
      if (!rel.ok) return { ok: false, erros: rel.erros, avisos: rel.avisos };
      st.escalaBase = JSON.parse(JSON.stringify(linhas));
      return { ok: true, avisos: rel.avisos };
    });
  }

  /**
   * Liga/desliga a escala-base automática.
   * Ligando, a ESCALA_BASE passa a ser derivada do cadastro (ordem alfabética)
   * e se refaz a cada recálculo. Desligando, congela a última gerada — assim
   * ninguém fica sem escala no meio do caminho.
   */
  function definirModoEscalaBase(auto) {
    return transacao(function (st, api) {
      var antes = !!(st.config && st.config.escalaBaseAuto);
      var depois = !!auto;
      if (antes === depois) return { ok: true };

      if (!st.config) st.config = {};
      st.config.escalaBaseAuto = depois;

      if (depois) {
        var nova = gerarEscalaBaseAlfabetica(st.anestesistas);
        if (!nova.length) {
          return { ok: false, erros: [{ campo: 'anestesistas',
            msg: 'São necessários pelo menos ' + CONFIG.POSICOES.length +
                 ' anestesistas ativos para montar a escala-base sozinha.' }] };
        }
        st.escalaBase = nova;
      }

      api.registrar([novaEntradaLog({
        usuario: usuario,
        aba: 'CONFIGURAÇÃO',
        idCirurgia: 'ESCALA_BASE',
        campo: 'ESCALA-BASE AUTOMÁTICA',
        de: antes ? 'Sim' : 'Não',
        para: depois ? 'Sim' : 'Não'
      })]);
      return { ok: true };
    });
  }

  /* ------------------------------------------------------------ clínica */

  var CAMPOS_CLINICA = {
    nome: 'NOME DA CLÍNICA', cnpj: 'CNPJ', endereco: 'ENDEREÇO', telefone: 'TELEFONE',
    responsavel: 'RESPONSÁVEL TÉCNICO', crm: 'CRM DO RESPONSÁVEL', textoTcle: 'TEXTO DO TCLE'
  };

  /** Identificação da clínica e texto do termo. Cada mudança vai para o LOG. */
  function salvarConfigClinica(dados) {
    return transacao(function (st, api) {
      if (!st.config) st.config = {};
      var antes = st.config.clinica || {};
      var depois = {};
      Object.keys(CAMPOS_CLINICA).forEach(function (k) {
        var v = dados && dados[k] !== undefined ? txt(dados[k]) : txt(antes[k]);
        depois[k] = v.slice(0, k === 'textoTcle' ? 20000 : 300);
      });
      if (!vazio(depois.cnpj) && depois.cnpj.replace(/\D/g, '').length !== 14) {
        return { ok: false, erros: [{ campo: 'cnpj', msg: 'CNPJ deve ter 14 dígitos.' }] };
      }
      // Dígito verificador errado (11.111.111/1111-11 é o clássico) só avisa: o documento sai no
      // termo, e quem digitou pode ter em mãos um CNPJ que o sistema não reconhece.
      var avisosClinica = [];
      if (!vazio(depois.cnpj) && !cnpjValido(depois.cnpj)) {
        avisosClinica.push({ campo: 'cnpj', msg: 'O CNPJ ' + depois.cnpj + ' tem dígito verificador inválido — confira antes de imprimir o termo.' });
      }
      if (!vazio(depois.telefone) && !telefoneValido(depois.telefone)) {
        avisosClinica.push({ campo: 'telefone', msg: 'TELEFONE da clínica fora do padrão (DDD + número): ' + depois.telefone });
      }
      if (!vazio(depois.crm) && !crmValido(depois.crm)) {
        avisosClinica.push({ campo: 'crm', msg: 'CRM do responsável fora do padrão (número com UF, ex.: 12345-DF): ' + depois.crm });
      }
      st.config.clinica = depois;
      Object.keys(CAMPOS_CLINICA).forEach(function (k) {
        if (txt(antes[k]) === depois[k]) return;
        api.registrar([novaEntradaLog({
          usuario: usuario, aba: 'CONFIGURAÇÃO', idCirurgia: 'CLÍNICA', campo: CAMPOS_CLINICA[k],
          // O texto do termo pode ser longo: o LOG guarda o tamanho, não o texto todo.
          de: k === 'textoTcle' ? (antes[k] ? txt(antes[k]).length + ' caracteres' : '(padrão)') : antes[k],
          para: k === 'textoTcle' ? (depois[k] ? depois[k].length + ' caracteres' : '(padrão)') : depois[k]
        })]);
      });
      return { ok: true, avisos: avisosClinica };
    });
  }

  /* ------------------------------------------------------------ repasse */

  function registroDoMes(st, chave) {
    var reg = st.repasses.filter(function (r) { return r.mes === chave; })[0];
    if (!reg) { reg = { mes: chave, despesas: null, obs: '', pagamentos: [] }; st.repasses.push(reg); }
    return reg;
  }

  function entradaLogRepasse(chave, campo, de, para, id) {
    return novaEntradaLog({ usuario: usuario, aba: 'REPASSE ' + chave, idCirurgia: id || chave, campo: campo, de: de, para: para });
  }

  /** Despesas do mês (descontadas antes da divisão) e observação. */
  function salvarDespesasRepasse(ano, mes, despesas, obs) {
    return transacao(function (st, api) {
      var info = infoMes(ano, mes);
      if (!info) return { ok: false, erros: [{ campo: 'mes', msg: 'Mês inválido.' }] };
      var v = vazio(despesas) ? null : paraNumero(despesas);
      if (!vazio(despesas) && v === null) return { ok: false, erros: [{ campo: 'despesas', msg: 'Despesas: valor inválido.' }] };
      if (v !== null && v < 0) return { ok: false, erros: [{ campo: 'despesas', msg: 'Despesas não podem ser negativas.' }] };
      var reg = registroDoMes(st, info.chave);
      var antes = reg.despesas;
      reg.despesas = v;
      reg.obs = txt(obs).slice(0, 500);
      if (valorParaLog(antes) !== valorParaLog(v)) {
        api.registrar([entradaLogRepasse(info.chave, 'DESPESAS DO MÊS', antes, v)]);
      }
      return { ok: true };
    });
  }

  /** Teto de sanidade por repasse: R$ 999.999.999.999 entrava e virava "falta" negativa. */
  var LIMITE_REPASSE = 10000000;

  /** Registra um repasse feito (valor e data) para um anestesista. */
  function registrarPagamentoRepasse(ano, mes, idAnestesista, valor, data) {
    return transacao(function (st, api) {
      var info = infoMes(ano, mes);
      var a = st.anestesistas.filter(function (x) { return txt(x.id) === txt(idAnestesista); })[0];
      var v = paraNumero(valor);
      var erros = [];
      if (!info) erros.push({ campo: 'mes', msg: 'Mês inválido.' });
      if (!a) erros.push({ campo: 'anestesista', msg: 'Anestesista ' + idAnestesista + ' não existe.' });
      if (v === null || v <= 0) erros.push({ campo: 'valor', msg: 'Informe o valor repassado (maior que zero).' });
      else if (v > LIMITE_REPASSE) erros.push({ campo: 'valor', msg: 'Valor do repasse acima de ' + moedaBR(LIMITE_REPASSE) + ' — confira a digitação.' });
      if (!dataValida(data)) erros.push({ campo: 'data', msg: 'Informe a data do repasse.' });
      if (erros.length) return { ok: false, erros: erros };

      var reg = registroDoMes(st, info.chave);
      reg.pagamentos.push({
        idAnestesista: txt(a.id), nome: txt(a.nome), pix: txt(a.pix),
        valor: arredondar2(v), data: paraData(data),
        registradoPor: usuario, registradoEm: agoraTexto()
      });
      api.registrar([entradaLogRepasse(info.chave, 'REPASSE REGISTRADO', '',
        moedaBR(v) + ' · ' + txt(a.nome) + ' · ' + dataBR(data) + (vazio(a.pix) ? '' : ' · PIX ' + txt(a.pix)), a.id)]);
      return { ok: true };
    });
  }

  /** Desfaz um registro de repasse (erro de lançamento). Fica no LOG. */
  function removerPagamentoRepasse(ano, mes, indice) {
    return transacao(function (st, api) {
      var info = infoMes(ano, mes);
      var reg = info && st.repasses.filter(function (r) { return r.mes === info.chave; })[0];
      var p = reg && reg.pagamentos[indice];
      if (!p) return { ok: false, erros: [{ campo: 'indice', msg: 'Registro de repasse não encontrado.' }] };
      reg.pagamentos.splice(indice, 1);
      api.registrar([entradaLogRepasse(info.chave, 'REPASSE DESFEITO',
        moedaBR(p.valor) + ' · ' + p.nome + ' · ' + dataBR(p.data), '', p.idAnestesista)]);
      return { ok: true };
    });
  }

  /* ------------------------------------------------ boletim anestésico */

  var ABA_BOLETIM = 'BOLETIM ANESTÉSICO';

  function falhaBoletim(msg, campo) { return { ok: false, erros: [{ campo: campo || 'boletim', msg: msg }] }; }

  function posicaoDoBoletim(st, id) {
    for (var i = 0; i < st.boletins.length; i++) if (st.boletins[i].id === txt(id)) return i;
    return -1;
  }

  function cirurgiaPorId(st, id) {
    return st.cirurgias.filter(function (c) { return txt(c.id) === txt(id); })[0] || null;
  }

  function entradaLogBoletim(b, campo, de, para) {
    return novaEntradaLog({ usuario: usuario, aba: ABA_BOLETIM, idCirurgia: b.idCirurgia, campo: campo, de: de, para: para });
  }

  function descricaoAssinatura(b) {
    return b.id + ' · versão ' + b.versao + (b.assinatura ? ' · código ' + codigoLegivel(b.assinatura.codigo) : '');
  }

  /** Cria o boletim de uma cirurgia (um por cirurgia). */
  function criarBoletim(idCirurgia) {
    return transacao(function (st, api) {
      var cir = cirurgiaPorId(st, idCirurgia);
      if (!cir) return falhaBoletim('Cirurgia ' + idCirurgia + ' não encontrada.');
      var existente = st.boletins.filter(function (b) { return b.idCirurgia === txt(cir.id); })[0];
      if (existente) return falhaBoletim('A cirurgia ' + cir.id + ' já tem o boletim ' + existente.id + '.');

      var b = congelarBoletim(novoBoletim(proximoIdBoletim(), cir, usuario));
      st.boletins.push(b);
      api.registrar([entradaLogBoletim(b, 'BOLETIM CRIADO', '', b.id)]);
      return { ok: true, semRecalculo: true, boletim: b };
    });
  }

  /** O boletim em preenchimento, ou o erro para devolver. */
  function rascunhoParaEditar(st, id) {
    var i = posicaoDoBoletim(st, id);
    if (i < 0) return { erro: falhaBoletim('Boletim ' + id + ' não encontrado.') };
    var b = st.boletins[i];
    if (b.status === BOLETIM_FINALIZADO) {
      return { erro: falhaBoletim('O boletim ' + b.id + ' está finalizado. Para corrigir, reabra-o informando o motivo.') };
    }
    return { i: i, b: b };
  }

  /** Troca o rascunho pela versão nova — depois de ler e validar. */
  function gravarRascunho(st, alvo, lido) {
    if (lido.erros.length) return { ok: false, erros: lido.erros };
    var rel = validarBoletim(lido.boletim);
    if (!rel.ok) return { ok: false, erros: rel.erros, avisos: rel.avisos };
    var novo = lido.boletim;
    novo.atualizadoEm = agoraTexto();
    novo.atualizadoPor = usuario;
    st.boletins[alvo.i] = congelarBoletim(novo);
    return { ok: true, semRecalculo: true, avisos: rel.avisos, boletim: novo };
  }

  /** Muda campos de um boletim em preenchimento (as listas de registros vão por alterarLinhaBoletim). */
  function salvarBoletim(id, mudancas) {
    return transacao(function (st) {
      var alvo = rascunhoParaEditar(st, id);
      if (alvo.erro) return alvo.erro;
      return gravarRascunho(st, alvo, aplicarMudancasBoletim(alvo.b, mudancas));
    });
  }

  /**
   * Inclui, altera ou remove um registro de sinais vitais, fármacos,
   * fluidos ou intercorrências. `op`: { acao, indice, linha, conferir }.
   */
  function alterarLinhaBoletim(id, lista, op) {
    return transacao(function (st) {
      var alvo = rascunhoParaEditar(st, id);
      if (alvo.erro) return alvo.erro;
      return gravarRascunho(st, alvo, aplicarLinhaBoletim(alvo.b, lista, op));
    });
  }

  /**
   * Finaliza (assina) o boletim. `assinatura`: { tracos, nome, crm }.
   * Recusa com a lista do que falta. Congela a identificação da cirurgia e
   * calcula o código de conferência. Cirurgia ainda sem horário real ganha o
   * início e o fim da anestesia; CRM ausente no cadastro de quem assina vai
   * para o cadastro. Tudo isso na mesma transação, e tudo vai para o LOG.
   */
  function finalizarBoletim(id, assinatura) {
    return transacao(function (st, api) {
      var alvo = rascunhoParaEditar(st, id);
      if (alvo.erro) return alvo.erro;
      var b = alvo.b;
      var cir = cirurgiaPorId(st, b.idCirurgia);
      if (!cir) return falhaBoletim('A cirurgia ' + b.idCirurgia + ' deste boletim não existe mais.');

      var pend = pendenciasBoletim(b, cir);
      if (pend.length) {
        return { ok: false, erros: pend.map(function (p) { return { campo: 'pendencia', msg: 'Falta: ' + p + '.' }; }) };
      }
      var rel = validarBoletim(b);
      if (!rel.ok) return { ok: false, erros: rel.erros };

      assinatura = assinatura && typeof assinatura === 'object' ? assinatura : {};
      var tracos = lerTracosBoletim(assinatura.tracos);
      var erros = [];
      if (!tracos.length) erros.push({ campo: 'assinatura', msg: 'Falta a assinatura.' });
      if (vazio(assinatura.nome)) erros.push({ campo: 'nome', msg: 'Informe o nome de quem assina.' });
      if (vazio(assinatura.crm)) erros.push({ campo: 'crm', msg: 'Informe o CRM de quem assina.' });
      if (erros.length) return { ok: false, erros: erros };

      var final = finalizacaoBoletim(b, cir, { tracos: tracos, nome: assinatura.nome, crm: assinatura.crm },
        agoraTexto(), usuario);
      var avisos = [];
      var mexeuNaCirurgia = false;

      if (vazio(cir.inicioReal) && vazio(cir.fimReal)) {
        var antesCir = JSON.parse(JSON.stringify(cir));
        cir.inicioReal = final.tempos.inicioAnestesia;
        cir.fimReal = final.tempos.fimAnestesia;
        if (validarCirurgia(cir, { nomesAnestesistas: nomesAnestesistas() }).ok) {
          api.registrar(diffParaLog('CIRURGIAS', antesCir, cir, { usuario: usuario, idCirurgia: cir.id }));
          mexeuNaCirurgia = true;
        } else {
          cir.inicioReal = antesCir.inicioReal;
          cir.fimReal = antesCir.fimReal;
        }
      } else if (paraHora(cir.inicioReal) !== final.tempos.inicioAnestesia || paraHora(cir.fimReal) !== final.tempos.fimAnestesia) {
        avisos.push({ campo: 'tempos', msg: 'O horário real da cirurgia (' + UIhora(cir.inicioReal) + ' a ' + UIhora(cir.fimReal) +
          ') é diferente do início e fim da anestesia no boletim (' + final.tempos.inicioAnestesia + ' a ' +
          final.tempos.fimAnestesia + '). As horas do grupo seguem o horário da cirurgia.' });
      }
      if (cir.status === 'Agendada' || cir.status === 'Confirmada') {
        avisos.push({ campo: 'status', msg: 'A cirurgia ' + cir.id + ' ainda está como "' + cir.status + '" — marque como Realizada.' });
      }

      var quemAssina = st.anestesistas.filter(function (a) { return mesmoTexto(a.nome, assinatura.nome); })[0];
      if (quemAssina && vazio(quemAssina.crm)) {
        var antesAn = JSON.parse(JSON.stringify(quemAssina));
        quemAssina.crm = txt(assinatura.crm).slice(0, 30);
        api.registrar(diffParaLog('ANESTESISTAS', antesAn, quemAssina, { usuario: usuario, idCirurgia: quemAssina.id }));
      }

      st.boletins[alvo.i] = congelarBoletim(final);
      api.registrar([entradaLogBoletim(final, 'BOLETIM FINALIZADO', '', descricaoAssinatura(final))]);
      return { ok: true, semRecalculo: !mexeuNaCirurgia, avisos: avisos, boletim: final };
    });
  }

  function UIhora(h) { return paraHora(h) || '—'; }

  /** Reabre um boletim finalizado. O motivo vai para o LOG e para o histórico do próprio boletim. */
  function reabrirBoletim(id, motivo) {
    return transacao(function (st, api) {
      var i = posicaoDoBoletim(st, id);
      if (i < 0) return falhaBoletim('Boletim ' + id + ' não encontrado.');
      var b = st.boletins[i];
      if (b.status !== BOLETIM_FINALIZADO) return falhaBoletim('O boletim ' + b.id + ' não está finalizado.');
      if (txt(motivo).length < 10) {
        return falhaBoletim('Explique o motivo da reabertura (pelo menos 10 letras) — ele fica no LOG e no próprio boletim.', 'motivo');
      }
      var r = congelarBoletim(reaberturaBoletim(b, motivo, agoraTexto(), usuario));
      st.boletins[i] = r;
      api.registrar([entradaLogBoletim(r, 'BOLETIM REABERTO', descricaoAssinatura(b), txt(motivo).slice(0, 300))]);
      return { ok: true, semRecalculo: true, boletim: r };
    });
  }

  /** Descarta um boletim que nunca foi assinado (criado por engano). O assinado alguma vez fica. */
  function descartarBoletim(id) {
    return transacao(function (st, api) {
      var i = posicaoDoBoletim(st, id);
      if (i < 0) return falhaBoletim('Boletim ' + id + ' não encontrado.');
      var b = st.boletins[i];
      if (b.status === BOLETIM_FINALIZADO || b.versao > 1 || b.historico.length) {
        return falhaBoletim('O boletim ' + b.id + ' já foi assinado e faz parte do prontuário: não pode ser descartado.');
      }
      st.boletins.splice(i, 1);
      api.registrar([entradaLogBoletim(b, 'BOLETIM DESCARTADO', b.id + ' · ' + b.sinais.length + ' registro(s) de sinais · ' +
        b.farmacos.length + ' fármaco(s)', '')]);
      return { ok: true, semRecalculo: true };
    });
  }

  /* ------------------------ indicadores de qualidade e segurança (06c) */

  var ABA_QUALIDADE = 'QUALIDADE E SEGURANÇA';
  var ABA_ESTRUTURA = 'ESTRUTURA';

  function falhaFicha(msg, campo) { return { ok: false, erros: [{ campo: campo || 'ficha', msg: msg }] }; }

  function posicaoDaFicha(st, id) {
    for (var i = 0; i < st.fichasQualidade.length; i++) if (st.fichasQualidade[i].id === txt(id)) return i;
    return -1;
  }

  function entradaLogFicha(f, campo, de, para) {
    return novaEntradaLog({ usuario: usuario, aba: ABA_QUALIDADE, idCirurgia: f.idCirurgia,
      campo: campo, de: de, para: para });
  }

  /** Cria a ficha de qualidade de uma cirurgia (uma por cirurgia). */
  function criarFichaQualidade(idCirurgia) {
    return transacao(function (st, api) {
      var cir = cirurgiaPorId(st, idCirurgia);
      if (!cir) return falhaFicha('Cirurgia ' + idCirurgia + ' não encontrada.');
      var existente = st.fichasQualidade.filter(function (f) { return f.idCirurgia === txt(cir.id); })[0];
      if (existente) return falhaFicha('A cirurgia ' + cir.id + ' já tem a ficha de qualidade ' + existente.id + '.');

      var f = congelarFicha(novaFicha(proximoIdFichaQualidade(), cir, usuario));
      st.fichasQualidade.push(f);
      api.registrar([entradaLogFicha(f, 'FICHA DE QUALIDADE CRIADA', '', f.id)]);
      return { ok: true, semRecalculo: true, ficha: f };
    });
  }

  /**
   * A ficha em condição de receber a alteração pedida.
   * `soSeguimento`: a alteração é de acompanhamento ou de revisão clínica —
   * essas continuam abertas mesmo depois de a ficha ser concluída, porque o
   * seguimento de 24 h, 48 h e 30 dias acontece depois.
   */
  function fichaParaEditar(st, id, soSeguimento) {
    var i = posicaoDaFicha(st, id);
    if (i < 0) return { erro: falhaFicha('Ficha de qualidade ' + id + ' não encontrada.') };
    var f = st.fichasQualidade[i];
    if (f.status === FICHA_CONCLUIDA && !soSeguimento) {
      return { erro: falhaFicha('A ficha ' + f.id + ' está concluída. Para corrigir o que foi registrado no centro ' +
        'cirúrgico, reabra-a informando o motivo. O acompanhamento posterior continua aberto.') };
    }
    return { i: i, f: f };
  }

  /** Troca a ficha pela versão nova — depois de ler, validar e historiar. */
  function gravarFicha(st, api, alvo, lido, rotulo) {
    if (lido.erros.length) return { ok: false, erros: lido.erros };
    var rel = validarFicha(lido.ficha);
    if (!rel.ok) return { ok: false, erros: rel.erros, avisos: rel.avisos };

    var quando = agoraTexto();
    var nova = lido.ficha;
    nova.status = alvo.f.status;
    nova.versao = alvo.f.versao;
    nova.atualizadoEm = quando;
    nova.atualizadoPor = usuario;

    var mudancas = historicoDaFicha(alvo.f, nova, quando, usuario);
    comHistorico(nova, mudancas);
    st.fichasQualidade[alvo.i] = congelarFicha(nova);

    // O LOG guarda UMA entrada por gravação, com os campos tocados: o
    // detalhe campo a campo já fica no histórico da própria ficha.
    if (mudancas.length) {
      var campos = mudancas.slice(0, 6).map(function (m) { return m.campo; }).join(', ') +
        (mudancas.length > 6 ? ' e mais ' + (mudancas.length - 6) : '');
      api.registrar([entradaLogFicha(nova, rotulo || 'FICHA DE QUALIDADE ATUALIZADA', nova.id, campos)]);
    }
    return { ok: true, semRecalculo: true, avisos: rel.avisos, ficha: nova };
  }

  /** Muda campos da ficha (eventos e acompanhamento têm caminho próprio). */
  function salvarFichaQualidade(id, mudancas) {
    return transacao(function (st, api) {
      var alvo = fichaParaEditar(st, id);
      if (alvo.erro) return alvo.erro;
      return gravarFicha(st, api, alvo, aplicarMudancasFicha(alvo.f, mudancas));
    });
  }

  /**
   * Inclui, altera ou remove um evento clínico da ficha.
   * `op`: { acao, indice, evento, conferir }. O mesmo tipo de evento pode
   * entrar várias vezes no mesmo atendimento — é assim de propósito.
   */
  function alterarEventoQualidade(id, op) {
    return transacao(function (st, api) {
      var daRevisao = !!(op && op.evento && op.evento.origem === OPCOES_QUALIDADE.origemEvento[1]);
      var alvo = fichaParaEditar(st, id, daRevisao);
      if (alvo.erro) return alvo.erro;
      var pedido = op && typeof op === 'object' ? JSON.parse(JSON.stringify(op)) : {};
      if (pedido.acao === 'adicionar' && pedido.evento && typeof pedido.evento === 'object') {
        if (vazio(pedido.evento.registradoEm)) pedido.evento.registradoEm = agoraTexto();
        if (vazio(pedido.evento.registradoPor)) pedido.evento.registradoPor = usuario;
      }
      return gravarFicha(st, api, alvo, aplicarEventoFicha(alvo.f, pedido), 'EVENTO DE QUALIDADE');
    });
  }

  /**
   * Responde uma janela de acompanhamento (24 h, 48 h, 30 dias). Continua
   * valendo com a ficha concluída: é depois do centro cirúrgico que ela
   * acontece. "Sem informação" e "perda de seguimento" exigem justificativa
   * (a validação cobra).
   */
  function registrarSeguimentoQualidade(id, janela, dados) {
    return transacao(function (st, api) {
      var alvo = fichaParaEditar(st, id, true);
      if (alvo.erro) return alvo.erro;
      var pedido = dados && typeof dados === 'object' ? JSON.parse(JSON.stringify(dados)) : {};
      if (vazio(pedido.por) && !vazio(pedido.situacao)) pedido.por = usuario;
      return gravarFicha(st, api, alvo, aplicarSeguimentoFicha(alvo.f, janela, pedido), 'ACOMPANHAMENTO');
    });
  }

  /**
   * Revisão clínica: parecer e confirmação (ou não) dos eventos registrados
   * pelo anestesista. É o que separa "o anestesista registrou" de "a revisão
   * confirmou" — os dois ficam guardados, nunca um por cima do outro.
   */
  function revisarFichaQualidade(id, dados) {
    return transacao(function (st, api) {
      var alvo = fichaParaEditar(st, id, true);
      if (alvo.erro) return alvo.erro;
      dados = dados && typeof dados === 'object' ? dados : {};
      if (vazio(dados.revisadoPor)) return falhaFicha('Informe quem fez a revisão clínica.', 'revisadoPor');

      var quando = agoraTexto();
      var bruto = JSON.parse(JSON.stringify(alvo.f));
      bruto.revisao = {
        revisadoPor: txt(dados.revisadoPor).slice(0, 120),
        revisadoEm: quando,
        parecer: txt(dados.parecer).slice(0, 2000)
      };
      (Array.isArray(dados.eventos) ? dados.eventos : []).forEach(function (c) {
        var i = Number(c && c.indice);
        if (!(i >= 0 && i < bruto.eventos.length && Math.floor(i) === i)) return;
        bruto.eventos[i].confirmado = txt(c.confirmado);
        if (bruto.eventos[i].confirmado) {
          bruto.eventos[i].confirmadoPor = txt(dados.revisadoPor).slice(0, 120);
          bruto.eventos[i].confirmadoEm = quando;
        } else {
          bruto.eventos[i].confirmadoPor = '';
          bruto.eventos[i].confirmadoEm = '';
        }
        if (c.relacao !== undefined) bruto.eventos[i].relacao = txt(c.relacao);
        if (c.investigacao !== undefined) bruto.eventos[i].investigacao = txt(c.investigacao);
      });
      return gravarFicha(st, api, alvo, lerFicha(bruto, true), 'REVISÃO CLÍNICA');
    });
  }

  /**
   * Conclui a ficha: declara fechada a parte do centro cirúrgico. Pendência
   * NÃO impede — o serviço foi explícito quanto a isso; a lista do que falta
   * volta como aviso.
   */
  function concluirFichaQualidade(id) {
    return transacao(function (st, api) {
      var i = posicaoDaFicha(st, id);
      if (i < 0) return falhaFicha('Ficha de qualidade ' + id + ' não encontrada.');
      var f = st.fichasQualidade[i];
      if (f.status === FICHA_CONCLUIDA) return falhaFicha('A ficha ' + f.id + ' já está concluída.');

      var cir = cirurgiaPorId(st, f.idCirurgia);
      var rel = validarFicha(f);
      if (!rel.ok) return { ok: false, erros: rel.erros };

      var quando = agoraTexto();
      var nova = normalizarFicha(JSON.parse(JSON.stringify(f)));
      nova.status = FICHA_CONCLUIDA;
      nova.concluidaEm = quando;
      nova.concluidaPor = usuario;
      nova.atualizadoEm = quando;
      nova.atualizadoPor = usuario;
      comHistorico(nova, [{ quando: quando, quem: usuario, etapa: 'ficha', campo: 'status',
        de: FICHA_RASCUNHO, para: FICHA_CONCLUIDA }]);
      st.fichasQualidade[i] = congelarFicha(nova);

      var pend = pendenciasFicha(nova, hojeDoStore(), cir);
      var avisos = pend.map(function (g) {
        return { campo: 'pendencia', msg: g.rotulo + ': falta ' + g.itens.join(', ') + '.' };
      });
      api.registrar([entradaLogFicha(nova, 'FICHA DE QUALIDADE CONCLUÍDA', '',
        nova.id + (pend.length ? ' · com ' + totalPendenciasFicha(nova, hojeDoStore(), cir) + ' pendência(s)' : ' · completa'))]);
      return { ok: true, semRecalculo: true, avisos: avisos, ficha: nova };
    });
  }

  /** Reabre uma ficha concluída. O motivo vai para o LOG e para o histórico. */
  function reabrirFichaQualidade(id, motivo) {
    return transacao(function (st, api) {
      var i = posicaoDaFicha(st, id);
      if (i < 0) return falhaFicha('Ficha de qualidade ' + id + ' não encontrada.');
      var f = st.fichasQualidade[i];
      if (f.status !== FICHA_CONCLUIDA) return falhaFicha('A ficha ' + f.id + ' não está concluída.');
      if (txt(motivo).length < 10) {
        return falhaFicha('Explique o motivo da reabertura (pelo menos 10 letras) — ele fica no LOG e na própria ficha.', 'motivo');
      }
      var quando = agoraTexto();
      var nova = normalizarFicha(JSON.parse(JSON.stringify(f)));
      nova.status = FICHA_RASCUNHO;
      nova.versao = nova.versao + 1;
      nova.concluidaEm = '';
      nova.concluidaPor = '';
      nova.atualizadoEm = quando;
      nova.atualizadoPor = usuario;
      comHistorico(nova, [{ quando: quando, quem: usuario, etapa: 'ficha', campo: 'reabertura',
        de: FICHA_CONCLUIDA, para: txt(motivo).slice(0, 200) }]);
      st.fichasQualidade[i] = congelarFicha(nova);
      api.registrar([entradaLogFicha(nova, 'FICHA DE QUALIDADE REABERTA', f.id + ' · versão ' + f.versao,
        txt(motivo).slice(0, 300))]);
      return { ok: true, semRecalculo: true, ficha: nova };
    });
  }

  /** Descarta uma ficha criada por engano: só a que nunca foi concluída nem revisada. */
  function descartarFichaQualidade(id) {
    return transacao(function (st, api) {
      var i = posicaoDaFicha(st, id);
      if (i < 0) return falhaFicha('Ficha de qualidade ' + id + ' não encontrada.');
      var f = st.fichasQualidade[i];
      if (f.status === FICHA_CONCLUIDA || f.versao > 1 || f.revisao.revisadoEm) {
        return falhaFicha('A ficha ' + f.id + ' já foi concluída ou revisada: não pode ser descartada.');
      }
      st.fichasQualidade.splice(i, 1);
      api.registrar([entradaLogFicha(f, 'FICHA DE QUALIDADE DESCARTADA',
        f.id + ' · ' + f.eventos.length + ' evento(s)', '')]);
      return { ok: true, semRecalculo: true };
    });
  }

  /* ------------------------------ indicadores de estrutura (06d) ------ */

  function falhaEstrutura(msg, campo) { return { ok: false, erros: [{ campo: campo || 'estrutura', msg: msg }] }; }

  function entradaLogEstrutura(r, campo, de, para) {
    return novaEntradaLog({ usuario: usuario, aba: ABA_ESTRUTURA, idCirurgia: r.id,
      campo: campo, de: de, para: para });
  }

  function descricaoEstrutura(r) {
    return [dataBR(r.data), r.turno, r.unidade, r.sala].filter(function (x) { return !vazio(x); }).join(' · ');
  }

  /**
   * Cria ou atualiza um registro de estrutura. Com `dados.id`, atualiza; sem
   * ele, cria. É a área da coordenação: registra uma vez por unidade, sala e
   * turno, e os atendimentos daquele período se ligam sozinhos ao registro
   * (estruturaDoAtendimento, em 06d).
   */
  function salvarRegistroEstrutura(dados) {
    return transacao(function (st, api) {
      dados = dados && typeof dados === 'object' ? dados : {};
      var idPedido = txt(dados.id);
      var i = -1;
      if (idPedido) {
        for (var k = 0; k < st.estrutura.length; k++) if (st.estrutura[k].id === idPedido) { i = k; break; }
        if (i < 0) return falhaEstrutura('Registro de estrutura ' + idPedido + ' não encontrado.');
      }

      var anterior = i >= 0 ? st.estrutura[i] : null;
      var base = anterior ? JSON.parse(JSON.stringify(anterior)) : {};
      Object.keys(dados).forEach(function (chave) {
        if (chave === 'id' || chave === 'uid' || chave === 'registradoEm' || chave === 'registradoPor') return;
        base[chave] = dados[chave];
      });

      var lido = lerRegistroEstrutura(base, true);
      if (lido.erros.length) return { ok: false, erros: lido.erros };
      var rel = validarRegistroEstrutura(lido.registro);
      if (!rel.ok) return { ok: false, erros: rel.erros, avisos: rel.avisos };

      var quando = agoraTexto();
      var r = lido.registro;
      if (anterior) {
        r.id = anterior.id;
        r.uid = anterior.uid;
        r.registradoEm = anterior.registradoEm;
        r.registradoPor = anterior.registradoPor;
      } else {
        r.id = proximoIdEstrutura();
        r.uid = novoUid();
        r.registradoEm = quando;
        r.registradoPor = usuario;
      }
      r.atualizadoEm = quando;
      r.atualizadoPor = usuario;

      // Dois registros para a mesma data, turno, unidade e sala deixariam o
      // vínculo com o atendimento ambíguo.
      var choque = st.estrutura.filter(function (x) {
        return x.id !== r.id && x.data === r.data && x.turno === r.turno &&
          mesmoTexto(x.unidade, r.unidade) && mesmoTexto(x.sala, r.sala);
      })[0];
      if (choque) {
        return falhaEstrutura('Já existe o registro ' + choque.id + ' para ' + descricaoEstrutura(r) +
          '. Edite aquele em vez de criar outro.');
      }

      var congelado = congelarRegistroEstrutura(r);
      if (anterior) st.estrutura[i] = congelado; else st.estrutura.push(congelado);
      api.registrar([entradaLogEstrutura(congelado, anterior ? 'ESTRUTURA ATUALIZADA' : 'ESTRUTURA REGISTRADA',
        anterior ? descricaoEstrutura(anterior) : '', descricaoEstrutura(congelado))]);
      return { ok: true, semRecalculo: true, avisos: rel.avisos, registro: congelado };
    });
  }

  /** Remove um registro de estrutura (a coordenação corrige o que lançou errado). */
  function removerRegistroEstrutura(id) {
    return transacao(function (st, api) {
      for (var i = 0; i < st.estrutura.length; i++) {
        if (st.estrutura[i].id === txt(id)) {
          var r = st.estrutura[i];
          st.estrutura.splice(i, 1);
          api.registrar([entradaLogEstrutura(r, 'ESTRUTURA REMOVIDA', descricaoEstrutura(r), '')]);
          return { ok: true, semRecalculo: true };
        }
      }
      return falhaEstrutura('Registro de estrutura ' + id + ' não encontrado.');
    });
  }

  /**
   * Configuração clínica do módulo: limiares, metas, referências (fonte,
   * versão e data) e a aprovação do responsável técnico. Enquanto não houver
   * aprovação, o painel avisa que as definições ainda não foram aprovadas.
   */
  function salvarConfigQualidade(cfg) {
    return transacao(function (st, api) {
      // Valor digitado que não vale é recusado com o motivo; a leitura abaixo
      // (tolerante, feita para backup) trocaria por padrão sem avisar ninguém.
      var invalidos = validarConfigQualidade(cfg);
      if (invalidos.length) return { ok: false, erros: invalidos };

      var antes = lerConfigQualidade(st.config && st.config.qualidade);
      var nova = lerConfigQualidade(cfg);
      if (!st.config) st.config = {};
      st.config.qualidade = nova;

      var mudou = [];
      Object.keys(nova.limiares).forEach(function (k) {
        if (antes.limiares[k] !== nova.limiares[k]) mudou.push(k + ': ' + antes.limiares[k] + ' para ' + nova.limiares[k]);
      });
      if (jsonCanonico(antes.aprovacao) !== jsonCanonico(nova.aprovacao)) {
        mudou.push('aprovação: ' + (nova.aprovacao.responsavel || '—') + ' em ' + (dataBR(nova.aprovacao.em) || '—'));
      }
      if (jsonCanonico(antes.metas) !== jsonCanonico(nova.metas)) mudou.push('metas');
      if (jsonCanonico(antes.referencias) !== jsonCanonico(nova.referencias)) mudou.push('referências');
      if (jsonCanonico(antes.desativados) !== jsonCanonico(nova.desativados)) mudou.push('indicadores ativos');
      if (mudou.length) {
        api.registrar([novaEntradaLog({ usuario: usuario, aba: ABA_QUALIDADE, idCirurgia: '',
          campo: 'CONFIGURAÇÃO CLÍNICA', de: '', para: mudou.join(' · ').slice(0, 300) })]);
      }
      return { ok: true, semRecalculo: true };
    });
  }

  /* ------------------------------------------ leitura do painel ------- */

  /** Atendimentos (ficha + cirurgia) já filtrados. */
  function atendimentosQualidade(filtros) {
    return filtrarAtendimentosQualidade(
      montarAtendimentosQualidade(estado.fichasQualidade, estado.cirurgias), filtros);
  }

  /**
   * Painel completo de um recorte: indicadores, completude, satisfação e a
   * estrutura do período. Uma chamada só — a tela não recalcula em pedaços.
   */
  function painelQualidade(filtros, opcoes) {
    opcoes = opcoes || {};
    var cfg = lerConfigQualidade(estado.config && estado.config.qualidade);
    var lista = atendimentosQualidade(filtros);
    var hoje = opcoes.hoje || hojeDoStore();
    var f = filtros || {};
    var de = paraData(f.de), ate = paraData(f.ate);
    var registros = estado.estrutura.filter(function (r) {
      if (de && r.data < de) return false;
      if (ate && r.data > ate) return false;
      if (!vazio(f.unidade) && !mesmoTexto(r.unidade, f.unidade)) return false;
      return true;
    });
    return {
      filtros: f,
      config: cfg,
      aprovada: configQualidadeAprovada(cfg),
      atendimentos: lista,
      indicadores: calcularIndicadoresQualidade(lista, { cfg: cfg, hoje: hoje, serie: opcoes.serie !== false }),
      completude: completudeQualidade(lista, hoje),
      satisfacao: resumoSatisfacaoQualidade(lista),
      estrutura: resumoEstrutura(registros),
      registrosEstrutura: registros
    };
  }

  /**
   * Quem deve pegar esta cirurgia — menor posição livre do dia.
   * Só consulta: não grava nada.
   */
  function sugerirParaCirurgia(dadosCirurgia, ignorarId) {
    return sugerirAnestesista(dadosCirurgia, idx.escala, estado.cirurgias,
      { ignorarId: ignorarId });
  }

  /**
   * Proposta de remanejamento das cirurgias de quem faltou num dia.
   * Só consulta: aplicar é outro passo, com confirmação.
   */
  function proporRemanejamentoDoDia(data, nomeAusente) {
    return proporRemanejamento(data, nomeAusente, estado.cirurgias, idx.escala);
  }

  /**
   * Aplica uma proposta de remanejamento inteira, de uma vez.
   * Tudo ou nada: se uma cirurgia falhar a validação, nenhuma troca fica de pé
   * — meio remanejamento aplicado é pior que nenhum.
   */
  function aplicarRemanejamento(movimentos) {
    return transacao(function (st, api) {
      var lista = movimentos || [];
      if (!lista.length) {
        return { ok: false, erros: [{ campo: 'movimentos', msg: 'Nada a remanejar.' }] };
      }

      var nomes = nomesAnestesistas();
      var entradas = [];

      for (var i = 0; i < lista.length; i++) {
        var mov = lista[i];
        var alvo = st.cirurgias.filter(function (c) { return txt(c.id) === txt(mov.id); })[0];
        if (!alvo) {
          return { ok: false, erros: [{ campo: 'id', msg: 'Cirurgia ' + mov.id + ' não encontrada.' }] };
        }

        var existe = nomes.some(function (n) { return mesmoTexto(n, mov.para); });
        if (!existe) {
          return { ok: false, erros: [{ campo: 'anestesista',
            msg: 'Anestesista "' + mov.para + '" não existe no cadastro.' }] };
        }

        var antes = JSON.parse(JSON.stringify(alvo));
        alvo.anestesista = txt(mov.para);
        recalcularCirurgia(alvo, {
          porNome: idx.porNome, idxEscala: idx.escala,
          avaliacoesPorCirurgia: idx.avaliacoesPorCirurgia
        });
        entradas = entradas.concat(
          diffParaLog('CIRURGIAS', antes, alvo, { usuario: usuario, idCirurgia: alvo.id }));
      }

      api.registrar(entradas);
      return { ok: true };
    });
  }

  /* ==================================================================== */
  /*                           INTEGRIDADE                                */
  /* ==================================================================== */

  /**
   * Audita o estado inteiro. Devolve { ok, problemas:[{nivel,area,msg,id}] }.
   * `nivel`: 'ERRO' (dado inconsistente) | 'AVISO' (pendência operacional).
   * Não altera nada.
   */
  function verificarIntegridade() {
    var problemas = [];
    var nomes = nomesAnestesistas();

    function erro(area, msg, id) { problemas.push({ nivel: 'ERRO', area: area, msg: msg, id: id || '' }); }
    function aviso(area, msg, id) { problemas.push({ nivel: 'AVISO', area: area, msg: msg, id: id || '' }); }

    /* --- cadastro ------------------------------------------------------ */
    var vistosId = {}, vistosNome = {};
    estado.anestesistas.forEach(function (a) {
      if (vazio(a.id)) erro('ANESTESISTAS', 'Anestesista sem ID_ANESTESISTA: "' + txt(a.nome) + '".');
      else if (vistosId[txt(a.id)]) erro('ANESTESISTAS', 'ID_ANESTESISTA duplicado: ' + a.id + '.', a.id);
      else vistosId[txt(a.id)] = true;

      var kn = normalizar(a.nome);
      if (!kn) erro('ANESTESISTAS', 'Anestesista sem NOME (ID ' + txt(a.id) + ').', a.id);
      else if (vistosNome[kn]) erro('ANESTESISTAS', 'NOME duplicado: "' + txt(a.nome) + '" — quebra as chaves DATA+ANESTESISTA.', a.id);
      else vistosNome[kn] = true;
    });

    /* --- escala base --------------------------------------------------- */
    var relBase = validarEscalaBase(estado.escalaBase, estado.anestesistas);
    relBase.erros.forEach(function (e) { erro('ESCALA_BASE', e.msg); });
    relBase.avisos.forEach(function (a) { aviso('ESCALA_BASE', a.msg); });

    /* --- consolidada: chaves únicas ------------------------------------ */
    var vistasChaves = {};
    estado.consolidada.forEach(function (l) {
      if (!l.chaveNome) return;
      if (vistasChaves[l.chaveNome]) {
        erro('ESCALA_CONSOLIDADA', 'CHAVE DATA+ANESTESISTA repetida: ' + l.chaveNome +
          ' — a busca de posição no rodízio fica ambígua.');
      } else vistasChaves[l.chaveNome] = true;
    });

    /* --- cirurgias ----------------------------------------------------- */
    var vistosCir = {};
    estado.cirurgias.forEach(function (c) {
      if (vazio(c.id)) { erro('CIRURGIAS', 'Cirurgia sem ID_CIRURGIA (paciente "' + txt(c.paciente) + '").'); return; }
      if (vistosCir[txt(c.id)]) erro('CIRURGIAS', 'ID_CIRURGIA duplicado: ' + c.id + '.', c.id);
      else vistosCir[txt(c.id)] = true;

      var rel = validarCirurgia(c, { nomesAnestesistas: nomes });
      rel.erros.forEach(function (e) { erro('CIRURGIAS', c.id + ': ' + e.msg, c.id); });
      rel.avisos.forEach(function (a) { aviso('CIRURGIAS', c.id + ': ' + a.msg, c.id); });

      if (!vazio(c.anestesista) && c.posicao === CONFIG.FORA_DA_ESCALA) {
        aviso('CIRURGIAS', c.id + ': ' + txt(c.anestesista) + ' não está na escala de ' +
          dataBR(c.data) + ' — confira se houve substituição não registrada.', c.id);
      }
    });

    /* --- avaliações ---------------------------------------------------- */
    var idsCir = Object.keys(vistosCir);
    var vistosAv = {};
    estado.avaliacoes.forEach(function (a) {
      if (vazio(a.id)) { erro('AVALIAÇÕES PRÉ', 'Avaliação sem ID_AVALIAÇÃO (cirurgia ' + txt(a.idCirurgia) + ').'); return; }
      if (vistosAv[txt(a.id)]) erro('AVALIAÇÕES PRÉ', 'ID_AVALIAÇÃO duplicado: ' + a.id + '.', a.id);
      else vistosAv[txt(a.id)] = true;

      var rel = validarAvaliacao(a, { nomesAnestesistas: nomes, idsCirurgia: idsCir });
      rel.erros.forEach(function (e) { erro('AVALIAÇÕES PRÉ', a.id + ': ' + e.msg, a.id); });
      rel.avisos.forEach(function (x) { aviso('AVALIAÇÕES PRÉ', a.id + ': ' + x.msg, a.id); });
    });

    /* --- TASK-301: toda cirurgia que pede avaliação tem a linha? ------- */
    var porCir = indexarAvaliacoesPorCirurgia(estado.avaliacoes);
    estado.cirurgias.forEach(function (c) {
      if (!ehSim(c.avaliacaoNec)) return;
      if (!cirurgiaContabilizavel(c)) return;
      if ((porCir[txt(c.id)] || []).length === 0) {
        erro('AVALIAÇÕES PRÉ', 'Cirurgia ' + c.id + ' exige avaliação pré e não tem linha vinculada.', c.id);
      }
    });

    /* --- TASK-401: pendências de horário ------------------------------- */
    pendenciasDeHorario(estado.cirurgias).forEach(function (p) {
      aviso('HORAS', p.mensagem, p.id);
    });

    /* --- conflitos de agenda ------------------------------------------ */
    detectarConflitos(estado.cirurgias).forEach(function (cf) {
      aviso('CIRURGIAS', cf.motivo + ' (' + txt(cf.a.id) + ' e ' + txt(cf.b.id) + ')', cf.a.id);
    });

    /* --- boletins anestésicos ----------------------------------------- */
    var cirPorId = {};
    estado.cirurgias.forEach(function (c) { cirPorId[txt(c.id)] = c; });
    var vistosBol = {}, bolPorCir = {};
    estado.boletins.forEach(function (b) {
      var nome = 'Boletim ' + (b.id || '(sem ID)');
      if (vazio(b.id)) erro('BOLETIM', 'Boletim sem ID (cirurgia ' + txt(b.idCirurgia) + ').');
      else if (vistosBol[b.id]) erro('BOLETIM', 'ID de boletim duplicado: ' + b.id + '.', b.id);
      else vistosBol[b.id] = true;

      if (bolPorCir[b.idCirurgia]) erro('BOLETIM', 'A cirurgia ' + b.idCirurgia + ' tem mais de um boletim.', b.idCirurgia);
      bolPorCir[b.idCirurgia] = true;

      var cir = cirPorId[b.idCirurgia];
      if (!cir) erro('BOLETIM', nome + ' aponta para a cirurgia ' + b.idCirurgia + ', que não existe.', b.id);

      validarBoletim(b).erros.forEach(function (e) { erro('BOLETIM', nome + ': ' + e.msg, b.id); });

      if (b.status !== BOLETIM_FINALIZADO) return;
      if (!b.assinatura || !b.assinatura.codigo) {
        erro('BOLETIM', nome + ' está finalizado sem assinatura.', b.id);
      } else if (!codigoConfereBoletim(b)) {
        erro('BOLETIM', nome + ': o conteúdo não confere com o código da assinatura — foi alterado depois de assinado.', b.id);
      }
      if (cir && b.identificacao && (!mesmoTexto(cir.paciente, b.identificacao.paciente) ||
          paraData(cir.data) !== paraData(b.identificacao.data))) {
        aviso('BOLETIM', nome + ': paciente ou data da cirurgia ' + cir.id + ' mudaram depois da assinatura. ' +
          'O boletim guarda o que foi assinado; reabra-o se a correção precisar constar nele.', b.id);
      }
    });

    /* --- fichas de qualidade ------------------------------------------ */
    var vistasFq = {}, fqPorCir = {};
    estado.fichasQualidade.forEach(function (f) {
      var nome = 'Ficha de qualidade ' + (f.id || '(sem ID)');
      if (vazio(f.id)) erro('QUALIDADE', 'Ficha de qualidade sem ID (cirurgia ' + txt(f.idCirurgia) + ').');
      else if (vistasFq[f.id]) erro('QUALIDADE', 'ID de ficha de qualidade duplicado: ' + f.id + '.', f.id);
      else vistasFq[f.id] = true;

      if (fqPorCir[f.idCirurgia]) {
        erro('QUALIDADE', 'A cirurgia ' + f.idCirurgia + ' tem mais de uma ficha de qualidade.', f.idCirurgia);
      }
      fqPorCir[f.idCirurgia] = true;

      var cirF = cirPorId[f.idCirurgia];
      if (!cirF) erro('QUALIDADE', nome + ' aponta para a cirurgia ' + f.idCirurgia + ', que não existe.', f.id);

      validarFicha(f).erros.forEach(function (e) { erro('QUALIDADE', nome + ': ' + e.msg, f.id); });

      // Pendência não é erro: é o estado normal de uma ficha em andamento.
      var pend = totalPendenciasFicha(f, hojeDoStore(), cirF);
      if (pend > 0 && f.status === FICHA_CONCLUIDA) {
        aviso('QUALIDADE', nome + ' está concluída com ' + pend + ' item(ns) ainda sem resposta.', f.id);
      }
      seguimentosPendentes(f, hojeDoStore(), cirF).forEach(function (j) {
        aviso('QUALIDADE', nome + ': acompanhamento de ' + j.rotulo + ' vencido e sem resposta.', f.id);
      });
    });

    /* --- registros de estrutura --------------------------------------- */
    var vistosEst = {}, chavesEst = {};
    estado.estrutura.forEach(function (r) {
      var nome = 'Registro de estrutura ' + (r.id || '(sem ID)');
      if (vazio(r.id)) erro('ESTRUTURA', 'Registro de estrutura sem ID (' + txt(r.data) + ').');
      else if (vistosEst[r.id]) erro('ESTRUTURA', 'ID de registro de estrutura duplicado: ' + r.id + '.', r.id);
      else vistosEst[r.id] = true;

      var chave = [r.data, r.turno, normalizar(r.unidade), normalizar(r.sala)].join('|');
      if (chavesEst[chave]) {
        erro('ESTRUTURA', 'Há mais de um registro de estrutura para ' + dataBR(r.data) + ' · ' + r.turno +
          ' · ' + txt(r.unidade) + ' — o vínculo com o atendimento fica ambíguo.', r.id);
      }
      chavesEst[chave] = true;

      validarRegistroEstrutura(r).erros.forEach(function (e) { erro('ESTRUTURA', nome + ': ' + e.msg, r.id); });
    });

    /* --- configuração clínica do módulo de qualidade ------------------ */
    if (estado.fichasQualidade.length && !configQualidadeAprovada(estado.config && estado.config.qualidade)) {
      aviso('QUALIDADE', 'As definições clínicas dos indicadores ainda não foram aprovadas pelo responsável ' +
        'técnico de anestesiologia. Até lá, o painel usa os limiares padrão e avisa disso.');
    }

    return {
      ok: problemas.filter(function (p) { return p.nivel === 'ERRO'; }).length === 0,
      problemas: problemas,
      erros: problemas.filter(function (p) { return p.nivel === 'ERRO'; }),
      avisos: problemas.filter(function (p) { return p.nivel === 'AVISO'; })
    };
  }

  /**
   * Corrige automaticamente o que é seguro: ID faltando, campo auto
   * desatualizado, Sim/Não fora do padrão, avaliação faltando.
   * NÃO mexe em nome duplicado nem apaga nada — isso é decisão humana.
   * Devolve a lista do que foi feito.
   */
  function reparar() {
    var acoes = [];

    transacao(function (st, api) {
      st.cirurgias.forEach(function (c) {
        if (vazio(c.id)) {
          c.id = proximoId(CONFIG.PREFIXO_CIRURGIA, st.cirurgias.map(function (x) { return x.id; }),
            4, sequencias().cirurgia);
          acoes.push('ID_CIRURGIA gerado para o paciente "' + txt(c.paciente) + '": ' + c.id);
          api.registrar([logCriacao('CIRURGIAS', c, { usuario: usuario, idCirurgia: c.id, campo: 'ID GERADO NO REPARO' })]);
        }
      });

      st.avaliacoes.forEach(function (a) {
        if (vazio(a.id)) {
          a.id = proximoId(CONFIG.PREFIXO_AVALIACAO, st.avaliacoes.map(function (x) { return x.id; }),
            4, sequencias().avaliacao);
          acoes.push('ID_AVALIAÇÃO gerado para a cirurgia ' + txt(a.idCirurgia) + ': ' + a.id);
        }
      });

      st.anestesistas.forEach(function (a) {
        var canon = paraSimNao(a.ativo);
        if (canon !== a.ativo) {
          acoes.push('ATIVO normalizado em ' + txt(a.id) + ': "' + a.ativo + '" -> "' + canon + '"');
          a.ativo = canon;
        }
      });

      return { ok: true };
    });

    // O recálculo da transação já criou avaliações faltantes e refez os
    // campos auto; aqui só reportamos.
    var depois = verificarIntegridade();
    return { acoes: acoes, integridade: depois };
  }

  /* ==================================================================== */
  /*                             LEITURAS                                 */
  /* ==================================================================== */

  function nomesInativos() {
    return estado.anestesistas
      .filter(function (a) { return !ehSim(a.ativo) && !vazio(a.nome); })
      .map(function (a) { return txt(a.nome); });
  }

  function nomesAnestesistas(apenasAtivos) {
    return estado.anestesistas
      .filter(function (a) { return apenasAtivos ? ehSim(a.ativo) : true; })
      .map(function (a) { return txt(a.nome); })
      .filter(function (n) { return n !== ''; });
  }

  /** Visões calculadas, sempre a partir do estado atual. */
  /** Balanço de horas; `meses` padrão = o horizonte inteiro. */
  function horas(meses) { return calcularHoras(estado.anestesistas, estado.cirurgias, meses || horizonteAtual()); }

  function financeiro(mes, ano) {
    return calcularFinanceiro(estado.cirurgias, estado.avaliacoes, mes, ano || CONFIG.ANO_REFERENCIA);
  }

  function ledger(filtro) { return montarLedger(estado.cirurgias, estado.avaliacoes, filtro); }

  function indicadores(nome, mes, ano) {
    return indicadoresDoAnestesista(estado.cirurgias, estado.avaliacoes, nome, mes, ano || CONFIG.ANO_REFERENCIA);
  }

  function comparativo(mes, ano) {
    return compararAnestesistas(estado.anestesistas, estado.cirurgias, estado.avaliacoes, mes, ano || CONFIG.ANO_REFERENCIA);
  }

  function dashboard(mes, ano) {
    ano = ano || CONFIG.ANO_REFERENCIA;
    return montarDashboard(estado.anestesistas, estado.cirurgias, estado.avaliacoes, mes, ano,
      mesesDoAno(horizonteAtual(), ano));
  }

  function repasse(ano, mes, opcoes) {
    return calcularRepasse(estado.cirurgias, estado.avaliacoes, estado.anestesistas, estado.repasses, ano, mes, opcoes);
  }

  /** Evolução financeira do ano, nos meses do horizonte. */
  function financeiroAnual(ano) {
    ano = ano || CONFIG.ANO_REFERENCIA;
    return consolidarFinanceiroAnual(estado.cirurgias, estado.avaliacoes, ano, mesesDoAno(horizonteAtual(), ano));
  }

  /**
   * Linhas da escala de um mês: escalaDoMes(ano, mes).
   * Com um argumento só (escalaDoMes(10)), procura o mês no horizonte — é a
   * forma antiga, que só fazia sentido com os três meses de 2026.
   */
  function escalaDoMes(a, b) {
    var info = b === undefined
      ? horizonteAtual().filter(function (m) { return m.mes === Number(a); })[0]
      : buscarMes(horizonteAtual(), a, b);
    return info ? (estado.escalas[info.chave] || []).slice() : [];
  }

  function pendencias(filtro) { return pendenciasDeHorario(estado.cirurgias, filtro); }

  /* ==================================================================== */

  var store = {
    get estado() { return estado; },
    get indices() { return idx; },
    /** Meses com escala (lista de infoMes), na ordem. */
    get horizonte() { return horizonteAtual().slice(); },
    get modoHorizonte() { return modoHorizonte; },
    temMes: function (ano, mes) { return !!buscarMes(horizonteAtual(), ano, mes); },
    estenderHorizonte: estenderHorizonte,
    get usuario() { return usuario; },
    set usuario(u) { usuario = txt(u) || CONFIG.USUARIO_PADRAO; },

    aoMudar: function (fn) { if (typeof fn === 'function') ouvintes.push(fn); return store; },

    recalcular: function () { var r = recalcular(); atualizarSequencias(); return r; },
    transacao: transacao,
    snapshot: snapshot,
    restaurar: function (snap) { restaurar(snap); recalcular(); },

    adicionarCirurgia: adicionarCirurgia,
    atualizarCirurgia: atualizarCirurgia,
    removerCirurgia: removerCirurgia,
    atualizarAvaliacao: atualizarAvaliacao,
    salvarAnestesista: salvarAnestesista,
    ajustarEscala: ajustarEscala,
    definirEscalaBase: definirEscalaBase,
    definirModoEscalaBase: definirModoEscalaBase,
    escalaBaseAutomatica: function () { return !!(estado.config && estado.config.escalaBaseAuto); },
    sugerirAnestesista: sugerirParaCirurgia,
    proporRemanejamento: proporRemanejamentoDoDia,
    aplicarRemanejamento: aplicarRemanejamento,
    salvarConfigClinica: salvarConfigClinica,
    clinica: function () { return (estado.config && estado.config.clinica) || {}; },
    criarBoletim: criarBoletim,
    salvarBoletim: salvarBoletim,
    alterarLinhaBoletim: alterarLinhaBoletim,
    finalizarBoletim: finalizarBoletim,
    reabrirBoletim: reabrirBoletim,
    descartarBoletim: descartarBoletim,
    /** Boletins guardados (objetos congelados: só leitura). */
    boletins: function () { return estado.boletins.slice(); },
    boletim: function (id) { return estado.boletins.filter(function (b) { return b.id === txt(id); })[0] || null; },
    boletimDaCirurgia: function (idCirurgia) {
      return estado.boletins.filter(function (b) { return b.idCirurgia === txt(idCirurgia); })[0] || null;
    },
    criarFichaQualidade: criarFichaQualidade,
    salvarFichaQualidade: salvarFichaQualidade,
    alterarEventoQualidade: alterarEventoQualidade,
    registrarSeguimentoQualidade: registrarSeguimentoQualidade,
    revisarFichaQualidade: revisarFichaQualidade,
    concluirFichaQualidade: concluirFichaQualidade,
    reabrirFichaQualidade: reabrirFichaQualidade,
    descartarFichaQualidade: descartarFichaQualidade,
    /** Fichas de qualidade guardadas (objetos congelados: só leitura). */
    fichasQualidade: function () { return estado.fichasQualidade.slice(); },
    fichaQualidade: function (id) {
      return estado.fichasQualidade.filter(function (f) { return f.id === txt(id); })[0] || null;
    },
    fichaDaCirurgia: function (idCirurgia) {
      return estado.fichasQualidade.filter(function (f) { return f.idCirurgia === txt(idCirurgia); })[0] || null;
    },
    salvarRegistroEstrutura: salvarRegistroEstrutura,
    removerRegistroEstrutura: removerRegistroEstrutura,
    estrutura: function () { return estado.estrutura.slice(); },
    registroEstrutura: function (id) {
      return estado.estrutura.filter(function (r) { return r.id === txt(id); })[0] || null;
    },
    estruturaDoAtendimento: function (ficha, cirurgia) {
      return estruturaDoAtendimento(estado.estrutura, ficha, cirurgia);
    },
    salvarConfigQualidade: salvarConfigQualidade,
    configQualidade: function () { return lerConfigQualidade(estado.config && estado.config.qualidade); },
    atendimentosQualidade: atendimentosQualidade,
    painelQualidade: painelQualidade,
    resultadosQualidade: function (filtros) {
      return resultadosPorAtendimento(atendimentosQualidade(filtros),
        { cfg: estado.config && estado.config.qualidade });
    },

    salvarDespesasRepasse: salvarDespesasRepasse,
    registrarPagamentoRepasse: registrarPagamentoRepasse,
    removerPagamentoRepasse: removerPagamentoRepasse,
    repasse: repasse,

    verificarIntegridade: verificarIntegridade,
    reparar: reparar,

    nomesAnestesistas: nomesAnestesistas,
    proximoIdCirurgia: proximoIdCirurgia,
    proximoIdAvaliacao: proximoIdAvaliacao,
    proximoIdBoletim: proximoIdBoletim,
    proximoIdFichaQualidade: proximoIdFichaQualidade,
    proximoIdEstrutura: proximoIdEstrutura,
    proximoIdAnestesista: proximoIdAnestesista,

    horas: horas,
    financeiro: financeiro,
    ledger: ledger,
    indicadores: indicadores,
    comparativo: comparativo,
    dashboard: dashboard,
    financeiroAnual: financeiroAnual,
    escalaDoMes: escalaDoMes,
    pendencias: pendencias
  };

  return store;
}

/**
 * Cria um store já povoado com os dados mestres (ANESTESISTAS + ESCALA_BASE)
 * e com as escalas geradas. É o ponto de partida do sistema.
 */
function criarStoreComSeed(seed, opcoes) {
  opcoes = opcoes || {};
  var estado = estadoVazio();
  estado.anestesistas = JSON.parse(JSON.stringify((seed && seed.ANESTESISTAS) || []));
  estado.escalaBase = JSON.parse(JSON.stringify((seed && seed.ESCALA_BASE) || []));
  if (seed && seed.CONFIG) estado.config = Object.assign(estado.config, seed.CONFIG);
  if (opcoes.escalaBaseAuto !== undefined) estado.config.escalaBaseAuto = !!opcoes.escalaBaseAuto;
  if (seed && seed.CIRURGIAS) estado.cirurgias = JSON.parse(JSON.stringify(seed.CIRURGIAS));
  if (seed && seed.AVALIACOES_PRE) estado.avaliacoes = JSON.parse(JSON.stringify(seed.AVALIACOES_PRE));
  if (seed && seed.LOG) estado.log = JSON.parse(JSON.stringify(seed.LOG));

  var store = criarStore(estado, opcoes);
  store.recalcular();
  return store;
}

/**
 * Operações do store que MUDAM dados — as únicas que o modo servidor aceita
 * como comando (e as que a tela, no modo servidor, envia).
 */
var MUTACOES_STORE = ['adicionarCirurgia', 'atualizarCirurgia', 'removerCirurgia', 'atualizarAvaliacao',
  'salvarAnestesista', 'ajustarEscala', 'definirEscalaBase', 'definirModoEscalaBase', 'aplicarRemanejamento',
  'salvarConfigClinica', 'salvarDespesasRepasse', 'registrarPagamentoRepasse', 'removerPagamentoRepasse',
  'criarBoletim', 'salvarBoletim', 'alterarLinhaBoletim', 'finalizarBoletim', 'reabrirBoletim', 'descartarBoletim',
  'criarFichaQualidade', 'salvarFichaQualidade', 'alterarEventoQualidade', 'registrarSeguimentoQualidade',
  'revisarFichaQualidade', 'concluirFichaQualidade', 'reabrirFichaQualidade', 'descartarFichaQualidade',
  'salvarRegistroEstrutura', 'removerRegistroEstrutura', 'salvarConfigQualidade',
  'reparar'];

/**
 * Comandos que podem ser aplicados mesmo que outra pessoa tenha gravado
 * algo no meio do caminho: mudam campos de um registro já existente,
 * apontado pelo ID (o que criar, remover ou apontar por posição na lista é
 * recusado nesse caso — o ID ou a posição podem ter mudado de dono). Assinar
 * o boletim também: quem assina tem de ter visto o conteúdo que assina.
 */
var MUTACOES_SEGURAS_EM_CONCORRENCIA = ['atualizarCirurgia', 'atualizarAvaliacao', 'ajustarEscala', 'salvarConfigClinica',
  'salvarDespesasRepasse', 'salvarBoletim', 'alterarLinhaBoletim', 'reabrirBoletim',
  'salvarFichaQualidade', 'registrarSeguimentoQualidade', 'revisarFichaQualidade', 'reabrirFichaQualidade',
  'salvarConfigQualidade'];

/**
 * No modo servidor, só o administrador: cadastro (inclusive CHAVE PIX),
 * escala-base, dados da clínica, financeiro do repasse e o reparo geral.
 */
var MUTACOES_SO_ADMIN = ['salvarAnestesista', 'definirEscalaBase', 'definirModoEscalaBase', 'salvarConfigClinica',
  'salvarDespesasRepasse', 'registrarPagamentoRepasse', 'removerPagamentoRepasse',
  // Estrutura e definições clínicas são da coordenação, não do dia a dia.
  'salvarRegistroEstrutura', 'removerRegistroEstrutura', 'salvarConfigQualidade', 'reparar'];

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    estadoVazio: estadoVazio,
    criarStore: criarStore,
    criarStoreComSeed: criarStoreComSeed,
    MUTACOES_STORE: MUTACOES_STORE,
    MUTACOES_SO_ADMIN: MUTACOES_SO_ADMIN,
    MUTACOES_SEGURAS_EM_CONCORRENCIA: MUTACOES_SEGURAS_EM_CONCORRENCIA
  };
}
