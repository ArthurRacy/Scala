/**
 * ============================================================================
 * 92_GATILHOS — Menu, gatilho de edição e ações manuais
 * ============================================================================
 * TASK-301 [MELHORIA 2] mora aqui: `aoEditar` observa a coluna
 * AVALIAÇÃO PRÉ NECESSÁRIA? e, quando ela vira "Sim", cria a linha
 * correspondente na aba AVALIAÇÕES PRÉ — já vinculada e espelhada.
 *
 * Cuidados que fazem este gatilho não atrapalhar quem está digitando:
 *   - só reage à aba e à coluna que interessam (sai em microssegundos no resto);
 *   - é idempotente: se a linha já existe, não cria outra;
 *   - usa trava para que duas edições simultâneas não gerem duas linhas;
 *   - nunca apaga linha: desmarcar "Sim" apenas deixa a avaliação sinalizada;
 *   - erro no gatilho nunca bloqueia a digitação — vira aviso no LOG.
 * ============================================================================
 */

/** Menu da planilha. */
function onOpen() {
  try {
    SpreadsheetApp.getUi()
      .createMenu('⚕ Anestesia')
      .addItem('Instalar / atualizar sistema', 'instalarSistema')
      .addSeparator()
      .addItem('Recalcular escala e consolidada', 'recalcularEscala')
      .addItem('Criar avaliações pendentes', 'criarAvaliacoesPendentes')
      .addSeparator()
      .addItem('Verificar integridade', 'verificarIntegridadePlanilha')
      .addItem('Listar pendências de horário', 'listarPendenciasDeHorario')
      .addSeparator()
      .addItem('Desligar gatilho automático', 'desinstalarGatilhos')
      .addToUi();
  } catch (e) {
    // Em execução sem interface (gatilho de tempo) não há UI; segue em frente.
  }
}

/* ======================================================================== */
/*                     TASK-301 — GATILHO DE EDIÇÃO                         */
/* ======================================================================== */

/**
 * Chamado a cada edição de célula.
 * `e` traz { range, value, oldValue, source }.
 */
function aoEditar(e) {
  if (!e || !e.range) return;

  try {
    var sheet = e.range.getSheet();
    var nomeAba = sheet.getName();

    // Só duas abas interessam; qualquer outra edição sai daqui imediatamente.
    if (nomeAba === SCHEMA.CIRURGIAS.aba) {
      tratarEdicaoCirurgia_(e, sheet);
    } else if (nomeAba === SCHEMA.ANESTESISTAS.aba) {
      tratarEdicaoCadastro_(e, sheet);
    }
  } catch (erro) {
    // Um gatilho que lança exceção deixa a planilha com aviso vermelho e
    // assusta o usuário. Registramos e seguimos.
    try {
      registrarLog_([novaEntradaLog({
        usuario: usuarioAtual_(),
        aba: 'SISTEMA',
        idCirurgia: '',
        campo: 'ERRO NO GATILHO',
        de: '',
        para: String(erro && erro.message ? erro.message : erro)
      })]);
    } catch (e2) { /* nem o log deve derrubar a digitação */ }
  }
}

/** Reage a edições na aba CIRURGIAS. */
function tratarEdicaoCirurgia_(e, sheet) {
  var mapa = mapaColunas_(sheet, 1);
  var col = e.range.getColumn();
  var linha = e.range.getRow();

  if (linha < SCHEMA.CIRURGIAS.primeiraLinha) return;

  var colAval = mapa['AVALIAÇÃO PRÉ NECESSÁRIA?'];
  var colId = mapa['ID_CIRURGIA'];

  /* ---- gerar ID quando a linha começa a ser preenchida ---------------- */
  if (colId && col !== colId) {
    var idAtual = txt(sheet.getRange(linha, colId).getValue());
    if (idAtual === '' && !linhaVazia_(sheet, linha, mapa)) {
      var novoId = gerarProximoIdCirurgia_(sheet, mapa);
      sheet.getRange(linha, colId).setValue(novoId);
      registrarLog_([logCriacao('CIRURGIAS', { id: novoId }, {
        usuario: usuarioAtual_(), idCirurgia: novoId, campo: 'ID GERADO AUTOMATICAMENTE'
      })]);
    }
  }

  /* ---- TASK-301: criar a linha da avaliação --------------------------- */
  if (colAval && col === colAval) {
    var valor = paraSimNao(e.value !== undefined ? e.value : sheet.getRange(linha, colAval).getValue());
    if (ehSim(valor)) {
      criarAvaliacaoDaLinha_(sheet, linha, mapa);
    } else {
      // Desmarcou: NÃO apagamos a avaliação. Só avisamos, se houver uma.
      var id = colId ? txt(sheet.getRange(linha, colId).getValue()) : '';
      if (id && contarAvaliacoesDe_(id) > 0) {
        avisar_('Avaliação mantida',
          'A cirurgia ' + id + ' não requer mais avaliação pré, mas a linha já existente ' +
          'foi preservada na aba ' + SCHEMA.AVALIACOES_PRE.aba + '. ' +
          'Apague-a manualmente se for o caso.');
      }
    }
  }

  /* ---- LOG dos campos críticos ---------------------------------------- */
  registrarEdicaoNoLog_(e, sheet, mapa, 'CIRURGIAS');
}

/** Reage a edições na aba ANESTESISTAS. */
function tratarEdicaoCadastro_(e, sheet) {
  var mapa = mapaColunas_(sheet, 1);

  // Cadastro novo muda o intervalo nomeado das listas suspensas.
  if (e.range.getColumn() === mapa['NOME']) {
    try { criarFaixaDeNomes_(); } catch (err) { /* não bloqueia a digitação */ }
  }

  registrarEdicaoNoLog_(e, sheet, mapa, 'ANESTESISTAS');
}

/**
 * Registra a edição na aba LOG, se o campo for crítico.
 * Reaproveita CAMPOS_CRITICOS do core: a lista é a mesma nos dois ambientes.
 */
function registrarEdicaoNoLog_(e, sheet, mapa, nomeLogico) {
  var criticos = CAMPOS_CRITICOS[nomeLogico];
  if (!criticos) return;

  var col = e.range.getColumn();
  var linha = e.range.getRow();

  // Descobre qual campo do schema corresponde à coluna editada.
  var cols = schemaColunas(nomeLogico);
  var campo = null, rotulo = null;
  for (var i = 0; i < cols.length; i++) {
    if (mapa[cols[i].rotulo] === col) { campo = cols[i].campo; rotulo = cols[i].rotulo; break; }
  }
  if (!campo || !criticos[campo]) return;

  var antes = (e.oldValue === undefined || e.oldValue === null) ? '' : e.oldValue;
  var depois = (e.value === undefined || e.value === null)
    ? sheet.getRange(linha, col).getValue() : e.value;

  if (valorParaLog(antes) === valorParaLog(depois)) return;

  var colId = mapa[nomeLogico === 'CIRURGIAS' ? 'ID_CIRURGIA' : 'ID_ANESTESISTA'];
  var id = colId ? txt(sheet.getRange(linha, colId).getValue()) : '';

  registrarLog_([novaEntradaLog({
    usuario: usuarioAtual_(),
    aba: sheet.getName(),
    idCirurgia: id,
    campo: criticos[campo],
    de: antes,
    para: depois
  })]);
}

/**
 * Cria a linha de avaliação de UMA cirurgia, com trava e idempotência.
 * Devolve o ID criado, ou '' se não havia o que criar.
 */
function criarAvaliacaoDaLinha_(sheetCir, linha, mapa) {
  var colId = mapa['ID_CIRURGIA'];
  if (!colId) return '';

  var id = txt(sheetCir.getRange(linha, colId).getValue());
  if (id === '') {
    // Sem ID não há como vincular; gera agora.
    id = gerarProximoIdCirurgia_(sheetCir, mapa);
    sheetCir.getRange(linha, colId).setValue(id);
  }

  // Cancelada não gera avaliação.
  var colStatus = mapa['STATUS'];
  if (colStatus) {
    var status = txt(sheetCir.getRange(linha, colStatus).getValue());
    if (mesmoTexto(status, CONFIG.STATUS_EXCLUIDO)) return '';
  }

  var trava = LockService.getDocumentLock();
  if (!trava.tryLock(15000)) {
    avisar_('Sistema ocupado', 'Não consegui criar a avaliação agora. ' +
      'Use o menu ⚕ Anestesia > Criar avaliações pendentes.');
    return '';
  }

  try {
    // Idempotência: confere DENTRO da trava.
    if (contarAvaliacoesDe_(id) > 0) return '';

    var sheetAv = aba_(SCHEMA.AVALIACOES_PRE.aba);
    var mAv = mapaColunas_(sheetAv, 1);
    var destino = primeiraLinhaVazia_(sheetAv, 'AVALIACOES_PRE');

    var idAval = gerarProximoIdAvaliacao_(sheetAv, mAv);

    // Só os campos digitáveis são escritos; as colunas (auto) já têm fórmula.
    escreverCelula_(sheetAv, destino, mAv['ID_AVALIAÇÃO'], idAval);
    escreverCelula_(sheetAv, destino, mAv['ID_CIRURGIA'], id);
    escreverCelula_(sheetAv, destino, mAv['REALIZADA? (Sim/Não)'], 'Não');
    escreverCelula_(sheetAv, destino, mAv['TCLE ASSINADO? (Sim/Não)'], 'Não');
    escreverCelula_(sheetAv, destino, mAv['PAGO? (Sim/Não)'], 'Não');

    // Sugere quem operou como quem avalia — é o caso mais comum.
    var colAnest = mapa['ANESTESISTA'];
    if (colAnest && mAv['ANESTESISTA DA AVALIAÇÃO']) {
      var anest = txt(sheetCir.getRange(linha, colAnest).getValue());
      if (anest) escreverCelula_(sheetAv, destino, mAv['ANESTESISTA DA AVALIAÇÃO'], anest);
    }

    registrarLog_([novaEntradaLog({
      usuario: usuarioAtual_(),
      aba: SCHEMA.AVALIACOES_PRE.aba,
      idCirurgia: id,
      campo: 'AVALIAÇÃO CRIADA AUTOMATICAMENTE',
      de: '',
      para: idAval
    })]);

    avisar_('Avaliação criada',
      idAval + ' vinculada à cirurgia ' + id + '. Complete quem avaliou, a data e o valor.');

    return idAval;
  } finally {
    trava.releaseLock();
  }
}

/** Escreve numa célula se a coluna existir. */
function escreverCelula_(sheet, linha, coluna, valor) {
  if (!coluna) return false;
  sheet.getRange(linha, coluna).setValue(valor);
  return true;
}

/** Quantas avaliações apontam para esta cirurgia. */
function contarAvaliacoesDe_(idCirurgia) {
  var sheet = aba_(SCHEMA.AVALIACOES_PRE.aba);
  var mapa = mapaColunas_(sheet, 1);
  var col = mapa['ID_CIRURGIA'];
  if (!col) return 0;

  var ultima = sheet.getLastRow();
  if (ultima < 2) return 0;

  var valores = sheet.getRange(2, col, ultima - 1, 1).getValues();
  var n = 0;
  for (var i = 0; i < valores.length; i++) {
    if (txt(valores[i][0]) === txt(idCirurgia)) n++;
  }
  return n;
}

/** Próximo ID_CIRURGIA, olhando o que já existe na aba. */
function gerarProximoIdCirurgia_(sheet, mapa) {
  var col = mapa['ID_CIRURGIA'];
  var ultima = sheet.getLastRow();
  var existentes = [];

  if (col && ultima >= 2) {
    sheet.getRange(2, col, ultima - 1, 1).getValues().forEach(function (r) {
      if (txt(r[0])) existentes.push(txt(r[0]));
    });
  }
  return proximoId(CONFIG.PREFIXO_CIRURGIA, existentes);
}

/** Próximo ID_AVALIAÇÃO. */
function gerarProximoIdAvaliacao_(sheet, mapa) {
  var col = mapa['ID_AVALIAÇÃO'];
  var ultima = sheet.getLastRow();
  var existentes = [];

  if (col && ultima >= 2) {
    sheet.getRange(2, col, ultima - 1, 1).getValues().forEach(function (r) {
      if (txt(r[0])) existentes.push(txt(r[0]));
    });
  }
  return proximoId(CONFIG.PREFIXO_AVALIACAO, existentes);
}

/** A linha está totalmente vazia nos campos digitáveis? */
function linhaVazia_(sheet, linha, mapa) {
  var checar = ['DATA DA CIRURGIA', 'NOME DO PACIENTE', 'PROCEDIMENTO/CIRURGIA', 'ANESTESISTA'];
  for (var i = 0; i < checar.length; i++) {
    var col = mapa[checar[i]];
    if (col && txt(sheet.getRange(linha, col).getValue()) !== '') return false;
  }
  return true;
}

/* ======================================================================== */
/*                          AÇÕES DO MENU                                   */
/* ======================================================================== */

/**
 * Recalcula as três escalas mensais e a ESCALA_CONSOLIDADA a partir da
 * ESCALA_BASE, preservando os ajustes manuais já registrados.
 * Usa exatamente o mesmo motor de rodízio dos testes e do web app.
 */
function recalcularEscala() {
  var store = storeDaPlanilha_();

  var relBase = validarEscalaBase(store.estado.escalaBase, store.estado.anestesistas);
  if (!relBase.ok) {
    alertar_('A ESCALA_BASE tem problemas',
      'Corrija antes de recalcular:\n\n- ' +
      relBase.erros.map(function (e) { return e.msg; }).join('\n- '));
    return;
  }

  var totalLinhas = 0, ajustes = 0;

  CONFIG.MESES_ESCALA.forEach(function (m) {
    var linhas = store.escalaDoMes(m.ano, m.mes);
    if (!abaOpcional_(m.aba)) return;

    // As colunas de ajuste são do usuário; o resto é calculado.
    escreverAba_('ESCALA_MENSAL', linhas, {
      aba: m.aba,
      limparAntes: true,
      apenasCampos: ['data', 'dia', 'posicao', 'calculado', 'idCalculado', 'efetivo']
    });

    totalLinhas += linhas.length;
    ajustes += linhas.filter(function (l) { return ehSim(l.ajuste); }).length;
  });

  if (abaOpcional_(SCHEMA.ESCALA_CONSOLIDADA.aba)) {
    escreverAba_('ESCALA_CONSOLIDADA', store.estado.consolidada, { limparAntes: true });
  }

  alertar_('Escala recalculada',
    totalLinhas + ' linhas nas três escalas mensais e ' +
    store.estado.consolidada.length + ' linhas na ESCALA_CONSOLIDADA.\n\n' +
    ajustes + ' ajuste(s) manual(is) preservado(s).\n\n' +
    'Regra do rodízio: cada dia da semana tem 5 anestesistas na ESCALA_BASE, e o elenco ' +
    'gira uma posição por semana, fechando o ciclo em ' + CONFIG.POSICOES.length + ' semanas.');
}

/**
 * Varre a aba CIRURGIAS e cria as avaliações que estiverem faltando.
 * É a rede de segurança da TASK-301: cobre linhas importadas em lote, colagem
 * de várias linhas de uma vez, ou período em que o gatilho estava desligado.
 */
function criarAvaliacoesPendentes() {
  // Olha o estado CRU da planilha: o recálculo do store criaria as avaliações
  // em memória e esconderia justamente o que precisamos detectar.
  var faltando = avaliacoesFaltandoNaPlanilha_();

  if (faltando.length === 0) {
    alertar_('Nada pendente',
      'Toda cirurgia marcada com AVALIAÇÃO PRÉ NECESSÁRIA? = "Sim" já tem a linha correspondente.');
    return;
  }

  if (!confirmar_('Criar ' + faltando.length + ' avaliação(ões)?',
      faltando.length + ' cirurgia(s) pedem avaliação pré e não têm linha vinculada.\n\n' +
      'As linhas serão criadas na aba ' + SCHEMA.AVALIACOES_PRE.aba +
      ', já vinculadas pelo ID_CIRURGIA.')) {
    return;
  }

  var sheetAv = aba_(SCHEMA.AVALIACOES_PRE.aba);
  var mAv = mapaColunas_(sheetAv, 1);
  var idsExistentes = lerAba_('AVALIACOES_PRE').map(function (a) { return txt(a.id); });

  var novas = faltando.map(function (c) {
    var idAval = proximoId(CONFIG.PREFIXO_AVALIACAO, idsExistentes);
    idsExistentes.push(idAval);
    return {
      id: idAval,
      idCirurgia: txt(c.id),
      anestesista: txt(c.anestesista),
      realizada: 'Não',
      tcle: 'Não',
      pago: 'Não'
    };
  });

  var destino = primeiraLinhaVazia_(sheetAv, 'AVALIACOES_PRE');
  var campos = ['id', 'idCirurgia', 'anestesista', 'realizada', 'tcle', 'pago'];
  var rotulos = {
    id: 'ID_AVALIAÇÃO', idCirurgia: 'ID_CIRURGIA',
    anestesista: 'ANESTESISTA DA AVALIAÇÃO', realizada: 'REALIZADA? (Sim/Não)',
    tcle: 'TCLE ASSINADO? (Sim/Não)', pago: 'PAGO? (Sim/Não)'
  };

  novas.forEach(function (reg, i) {
    campos.forEach(function (campo) {
      escreverCelula_(sheetAv, destino + i, mAv[rotulos[campo]], reg[campo]);
    });
  });

  registrarLog_(novas.map(function (reg) {
    return novaEntradaLog({
      usuario: usuarioAtual_(),
      aba: SCHEMA.AVALIACOES_PRE.aba,
      idCirurgia: reg.idCirurgia,
      campo: 'AVALIAÇÃO CRIADA AUTOMATICAMENTE',
      de: '', para: reg.id
    });
  }));

  alertar_('Avaliações criadas',
    novas.length + ' linha(s) criada(s) a partir da linha ' + destino + '.\n\n' +
    'Complete ANESTESISTA DA AVALIAÇÃO, DATA e VALOR em cada uma.');
}

/** Roda a verificação de integridade do core e mostra o resultado. */
function verificarIntegridadePlanilha() {
  var store = storeDaPlanilha_();
  var r = store.verificarIntegridade();

  /**
   * Acrescenta o que só se vê na planilha crua.
   * O store, ao recalcular, já cria em memória as avaliações faltantes — então
   * a checagem do core nunca acusaria linha ausente NA PLANILHA. Esta é a
   * diferença entre "o modelo está coerente" e "as células estão coerentes".
   */
  var faltando = avaliacoesFaltandoNaPlanilha_();
  faltando.forEach(function (c) {
    r.problemas.push({
      nivel: 'ERRO', area: SCHEMA.AVALIACOES_PRE.aba, id: txt(c.id),
      msg: 'A cirurgia ' + txt(c.id) + ' exige avaliação pré e não tem linha na planilha. ' +
        'Use o menu ⚕ Anestesia > Criar avaliações pendentes.'
    });
    r.erros.push(r.problemas[r.problemas.length - 1]);
  });
  if (faltando.length) r.ok = false;

  if (r.problemas.length === 0) {
    alertar_('Tudo consistente',
      'Cadastro, escala, cirurgias, avaliações e horas estão coerentes entre si.\n\n' +
      store.estado.cirurgias.length + ' cirurgia(s) e ' +
      lerAba_('AVALIACOES_PRE').length + ' avaliação(ões) conferidas.');
    return;
  }

  function resumir(lista, limite) {
    return lista.slice(0, limite).map(function (p) {
      return '[' + p.area + '] ' + p.msg;
    }).join('\n');
  }

  var texto = '';
  if (r.erros.length) {
    texto += r.erros.length + ' ERRO(S) — precisam de correção:\n' + resumir(r.erros, 12) + '\n\n';
  }
  if (r.avisos.length) {
    texto += r.avisos.length + ' AVISO(S) — pendências operacionais:\n' + resumir(r.avisos, 12);
  }
  if (r.problemas.length > 24) texto += '\n\n(Mostrando os primeiros itens de cada tipo.)';

  alertar_(r.ok ? 'Sem erros, mas há avisos' : 'Há erros de integridade', texto);
}

/**
 * TASK-401 — lista as cirurgias realizadas sem horário real preenchido,
 * dizendo qual campo falta e quanto tempo estimado está sendo adotado.
 */
function listarPendenciasDeHorario() {
  var store = storeDaPlanilha_();
  var pend = store.pendencias();

  if (pend.length === 0) {
    alertar_('Nenhuma pendência',
      'Toda cirurgia com status "' + CONFIG.STATUS_EXECUTADO +
      '" tem HORA INÍCIO REAL e HORA TÉRMINO REAL preenchidas.');
    return;
  }

  var linhas = pend.slice(0, 20).map(function (p) {
    return '• ' + p.id + ' — ' + dataBR(p.data) + ' — ' + p.anestesista +
      '\n  ' + p.paciente + (p.horasEstimadasAdotadas !== null
        ? '\n  adotado provisoriamente: ' + horasTexto(p.horasEstimadasAdotadas)
        : '\n  sem tempo estimado para adotar');
  });

  alertar_(pend.length + ' cirurgia(s) sem horário real',
    'Estas linhas contam em CIRURGIAS SEM HORÁRIO REAL PREENCHIDO. ' +
    'O tempo estimado é usado provisoriamente para o cálculo de pendência, mas NÃO ' +
    'entra nas horas reais.\n\n' + linhas.join('\n\n') +
    (pend.length > 20 ? '\n\n(Mostrando as 20 primeiras de ' + pend.length + '.)' : ''));
}
