/**
 * ============================================================================
 * 91_INSTALAR — Preparação da planilha (rodar uma vez, e a cada mudança)
 * ============================================================================
 * O que `instalarSistema()` faz, em ordem:
 *
 *   TASK-201  Lista suspensa em CIRURGIAS!ANESTESISTA, restrita ao cadastro.
 *   TASK-303  Lista suspensa em AVALIAÇÕES PRÉ!ANESTESISTA DA AVALIAÇÃO.
 *             (as duas NÃO existiam na planilha original — eram digitação livre)
 *   TASK-202  Confere/reescreve a fórmula de ID_ANESTESISTA (auto).
 *   TASK-203  Confere/reescreve a fórmula de POSIÇÃO DO ANESTESISTA NO RODÍZIO.
 *             Reescreve também as demais colunas "(auto)".
 *   Corrige   Os dois erros de fórmula da aba INDICADORES (B14 e B18).
 *   Instala   O gatilho onEdit, que faz a TASK-301 funcionar.
 *
 * Tudo é idempotente: rodar de novo não duplica nada.
 *
 * A instalação NÃO apaga dado nenhum. Ela só mexe em validações, em fórmulas
 * de colunas calculadas e em intervalos nomeados.
 * ============================================================================
 */

/** Intervalo nomeado com os nomes dos anestesistas, base das listas suspensas. */
var FAIXA_NOMES = 'NOMES_ANESTESISTAS';

/**
 * Instalação completa. É o item principal do menu.
 */
function instalarSistema() {
  var relatorio = [];

  try {
    relatorio.push(criarFaixaDeNomes_());
    relatorio.push(aplicarValidacoes_());
    relatorio.push(escreverFormulasCirurgias_());
    relatorio.push(escreverFormulasAvaliacoes_());
    relatorio.push(corrigirFormulasIndicadores_());
    relatorio.push(alinharDecisoesDoGrupo_());
    relatorio.push(instalarGatilhoOnEdit_());

    alertar_('Instalação concluída', relatorio.join('\n\n'));
  } catch (e) {
    alertar_('A instalação falhou',
      'Erro: ' + (e && e.message ? e.message : e) + '\n\n' +
      'Nada foi perdido — as alterações de validação e fórmula são reversíveis. ' +
      'Confira se todos os nomes de aba estão iguais aos originais.');
    throw e;
  }
}

/* ======================================================================== */
/*                       INTERVALO NOMEADO DE NOMES                         */
/* ======================================================================== */

/**
 * Cria/atualiza o intervalo nomeado NOMES_ANESTESISTAS apontando para
 * ANESTESISTAS!B2:B<última>. As listas suspensas passam a ler daqui, então
 * incluir um anestesista novo no cadastro já o torna selecionável — sem
 * precisar reinstalar nada.
 */
function criarFaixaDeNomes_() {
  var sheet = aba_(SCHEMA.ANESTESISTAS.aba);
  var mapa = mapaColunas_(sheet, 1);
  var colNome = mapa['NOME'];
  if (!colNome) throw new Error('A aba ANESTESISTAS não tem a coluna NOME.');

  var ultima = Math.max(sheet.getLastRow(), 2);
  var faixa = sheet.getRange(2, colNome, ultima - 1, 1);

  var planilha = ss_();
  var existentes = planilha.getNamedRanges();
  for (var i = 0; i < existentes.length; i++) {
    if (existentes[i].getName() === FAIXA_NOMES) existentes[i].remove();
  }
  planilha.setNamedRange(FAIXA_NOMES, faixa);

  return 'Intervalo nomeado ' + FAIXA_NOMES + ' criado em ' +
    SCHEMA.ANESTESISTAS.aba + '!' + faixa.getA1Notation() + '.';
}

/* ======================================================================== */
/*                            VALIDAÇÕES                                    */
/* ======================================================================== */

/**
 * TASK-201 e TASK-303 — listas suspensas.
 * Reaplica também as validações que já existiam, para garantir que os textos
 * dos domínios continuem exatamente os mesmos do core.
 */
function aplicarValidacoes_() {
  var feitos = [];
  var faixaNomes = ss_().getRangeByName(FAIXA_NOMES);
  if (!faixaNomes) throw new Error('Intervalo ' + FAIXA_NOMES + ' não encontrado.');

  var regraNomes = SpreadsheetApp.newDataValidation()
    .requireValueInRange(faixaNomes, true)
    .setAllowInvalid(false)
    .setHelpText('Escolha um dos anestesistas cadastrados na aba ANESTESISTAS.')
    .build();

  /* ---- TASK-201: CIRURGIAS!ANESTESISTA --------------------------------- */
  var cir = aba_(SCHEMA.CIRURGIAS.aba);
  var mCir = mapaColunas_(cir, 1);
  var ultimaCir = Math.max(cir.getMaxRows(), 2);

  aplicarEm_(cir, mCir['ANESTESISTA'], 2, ultimaCir, regraNomes);
  feitos.push('CIRURGIAS!ANESTESISTA agora é lista suspensa dos ' +
    contarAnestesistas_() + ' anestesistas cadastrados (TASK-201).');

  aplicarEm_(cir, mCir['STATUS'], 2, ultimaCir, listaFixa_(DOMINIOS.STATUS_CIRURGIA,
    'Status da cirurgia.'));
  aplicarEm_(cir, mCir['CONVÊNIO'], 2, ultimaCir, listaFixa_(DOMINIOS.CONVENIO, 'Convênio do paciente.'));
  aplicarEm_(cir, mCir['AVALIAÇÃO PRÉ NECESSÁRIA?'], 2, ultimaCir,
    listaFixa_(DOMINIOS.SIM_NAO, 'Marcar "Sim" cria a linha da avaliação automaticamente.'));
  aplicarEm_(cir, mCir['PAGO?'], 2, ultimaCir, listaFixa_(DOMINIOS.SIM_NAO, ''));

  /* ---- TASK-303: AVALIAÇÕES PRÉ!ANESTESISTA DA AVALIAÇÃO --------------- */
  var av = aba_(SCHEMA.AVALIACOES_PRE.aba);
  var mAv = mapaColunas_(av, 1);
  var ultimaAv = Math.max(av.getMaxRows(), 2);

  aplicarEm_(av, mAv['ANESTESISTA DA AVALIAÇÃO'], 2, ultimaAv, regraNomes);
  feitos.push('AVALIAÇÕES PRÉ!ANESTESISTA DA AVALIAÇÃO agora é lista suspensa (TASK-303).');

  aplicarEm_(av, mAv['REALIZADA? (Sim/Não)'], 2, ultimaAv, listaFixa_(DOMINIOS.SIM_NAO, ''));
  aplicarEm_(av, mAv['TCLE ASSINADO? (Sim/Não)'], 2, ultimaAv, listaFixa_(DOMINIOS.SIM_NAO, ''));
  aplicarEm_(av, mAv['PAGO? (Sim/Não)'], 2, ultimaAv, listaFixa_(DOMINIOS.SIM_NAO, ''));

  /* ---- ANESTESISTAS!ATIVO e escalas mensais ---------------------------- */
  var an = aba_(SCHEMA.ANESTESISTAS.aba);
  var mAn = mapaColunas_(an, 1);
  aplicarEm_(an, mAn['ATIVO (Sim/Não)'], 2, Math.max(an.getMaxRows(), 2),
    listaFixa_(DOMINIOS.SIM_NAO, ''));

  CONFIG.MESES_ESCALA.forEach(function (m) {
    var s = abaOpcional_(m.aba);
    if (!s) return;
    var mm = mapaColunas_(s, 1);
    var u = Math.max(s.getMaxRows(), 2);
    aplicarEm_(s, mm['AJUSTE MANUAL? (Sim/Não)'], 2, u, listaFixa_(DOMINIOS.SIM_NAO, ''));
    aplicarEm_(s, mm['ANESTESISTA SUBSTITUTO (se ajuste)'], 2, u, regraNomes);
  });
  feitos.push('Coluna de substituto das três escalas mensais também virou lista suspensa.');

  return 'VALIDAÇÕES\n- ' + feitos.join('\n- ');
}

/** Regra de lista fixa. */
function listaFixa_(valores, ajuda) {
  return SpreadsheetApp.newDataValidation()
    .requireValueInList(valores, true)
    .setAllowInvalid(false)
    .setHelpText(ajuda || ('Valores aceitos: ' + valores.join(', ')))
    .build();
}

/** Aplica a regra numa coluna, se ela existir. */
function aplicarEm_(sheet, coluna, primeiraLinha, ultimaLinha, regra) {
  if (!coluna) return false;
  if (ultimaLinha < primeiraLinha) return false;
  sheet.getRange(primeiraLinha, coluna, ultimaLinha - primeiraLinha + 1, 1).setDataValidation(regra);
  return true;
}

function contarAnestesistas_() {
  return lerAba_('ANESTESISTAS').length;
}

/* ======================================================================== */
/*                       FÓRMULAS DAS COLUNAS AUTO                          */
/* ======================================================================== */

/**
 * TASK-202 e TASK-203, mais as demais colunas "(auto)" de CIRURGIAS.
 * As fórmulas são idênticas às que a planilha já traz; reescrevê-las garante
 * que uma linha nova (ou uma linha onde alguém colou valor por cima) volte a
 * calcular.
 */
function escreverFormulasCirurgias_() {
  var sheet = aba_(SCHEMA.CIRURGIAS.aba);
  var mapa = mapaColunas_(sheet, 1);
  var ultima = Math.max(sheet.getMaxRows(), 2);
  var n = ultima - 1;
  if (n < 1) return 'CIRURGIAS: nenhuma linha para preparar.';

  var abaAval = "'" + SCHEMA.AVALIACOES_PRE.aba + "'";
  var abaCons = SCHEMA.ESCALA_CONSOLIDADA.aba;
  var abaAnest = SCHEMA.ANESTESISTAS.aba;

  /** Gera a fórmula de uma linha, dado o modelo com {L} no lugar da linha. */
  function preencher(rotulo, modelo) {
    var col = mapa[rotulo];
    if (!col) return null;

    var formulas = [];
    for (var linha = 2; linha <= ultima; linha++) {
      formulas.push([modelo.replace(/\{L\}/g, String(linha))]);
    }
    sheet.getRange(2, col, formulas.length, 1).setFormulas(formulas);
    return rotulo;
  }

  var feitos = [];

  // TEMPO ESTIMADO / TEMPO REAL
  feitos.push(preencher('TEMPO ESTIMADO',
    '=IF(OR($D{L}="",$E{L}=""),"",MOD($E{L}-$D{L},1))'));
  feitos.push(preencher('TEMPO REAL',
    '=IF(OR($G{L}="",$H{L}=""),"",MOD($H{L}-$G{L},1))'));

  // TASK-202 — ID_ANESTESISTA (auto)
  feitos.push(preencher('ID_ANESTESISTA (auto)',
    '=IF($O{L}="","",IFERROR(XLOOKUP($O{L},' + abaAnest + '!$B:$B,' + abaAnest + '!$A:$A),""))'));

  // TASK-203 — POSIÇÃO DO ANESTESISTA NO RODÍZIO
  feitos.push(preencher('POSIÇÃO DO ANESTESISTA NO RODÍZIO',
    '=IF(OR($C{L}="",$O{L}=""),"",IFERROR(XLOOKUP(TEXT($C{L},"YYYY-MM-DD")&"|"&$O{L},' +
    abaCons + '!$G:$G,' + abaCons + '!$C:$C),"' + CONFIG.FORA_DA_ESCALA + '"))'));

  // STATUS DA AVALIAÇÃO PRÉ-ANESTÉSICA
  feitos.push(preencher('STATUS DA AVALIAÇÃO PRÉ-ANESTÉSICA',
    '=IF($S{L}<>"Sim","N/A",IF(IFERROR(XLOOKUP($A{L},' + abaAval + '!$B:$B,' +
    abaAval + '!$J:$J),"")="Sim","Realizada","Pendente"))'));

  // DIA DA SEMANA (auto)
  feitos.push(preencher('DIA DA SEMANA (auto)',
    '=IF($C{L}="","",CHOOSE(WEEKDAY($C{L},2),"SEGUNDA-FEIRA","TERÇA-FEIRA","QUARTA-FEIRA",' +
    '"QUINTA-FEIRA","SEXTA-FEIRA","SÁBADO","DOMINGO"))'));

  // ANESTESISTAS ESCALADOS NO DIA (auto)
  var partes = [];
  for (var p = 1; p <= CONFIG.POSICOES.length; p++) {
    partes.push('IFERROR(XLOOKUP(TEXT($C{L},"YYYY-MM-DD")&"|"&' + p + ',' +
      abaCons + '!$F:$F,' + abaCons + '!$D:$D),"")');
  }
  feitos.push(preencher('ANESTESISTAS ESCALADOS NO DIA (auto)',
    '=IF($C{L}="","",TEXTJOIN(" | ",TRUE,' + partes.join(',') + '))'));

  // SUGESTÃO ANESTESISTA - POSIÇÃO 1 (auto)
  feitos.push(preencher('SUGESTÃO ANESTESISTA - POSIÇÃO 1 (auto)',
    '=IF($C{L}="","",IFERROR(XLOOKUP(TEXT($C{L},"YYYY-MM-DD")&"|1",' +
    abaCons + '!$F:$F,' + abaCons + '!$D:$D),"' + CONFIG.FORA_DA_ESCALA + '"))'));

  // MÊS / ANO (auto)
  feitos.push(preencher('MÊS (auto)', '=IF($C{L}="","",MONTH($C{L}))'));
  feitos.push(preencher('ANO (auto)', '=IF($C{L}="","",YEAR($C{L}))'));

  var ok = feitos.filter(function (f) { return f; });
  return 'CIRURGIAS\n- ' + ok.length + ' colunas calculadas reescritas em ' + n +
    ' linhas (TASK-202 e TASK-203 incluídas).';
}

/** TASK-302 — as quatro colunas espelhadas de AVALIAÇÕES PRÉ. */
function escreverFormulasAvaliacoes_() {
  var sheet = aba_(SCHEMA.AVALIACOES_PRE.aba);
  var mapa = mapaColunas_(sheet, 1);
  var ultima = Math.max(sheet.getMaxRows(), 2);
  if (ultima < 2) return 'AVALIAÇÕES PRÉ: nenhuma linha para preparar.';

  var abaCir = SCHEMA.CIRURGIAS.aba;

  function preencher(rotulo, modelo) {
    var col = mapa[rotulo];
    if (!col) return null;
    var formulas = [];
    for (var linha = 2; linha <= ultima; linha++) {
      formulas.push([modelo.replace(/\{L\}/g, String(linha))]);
    }
    sheet.getRange(2, col, formulas.length, 1).setFormulas(formulas);
    return rotulo;
  }

  var feitos = [];
  feitos.push(preencher('PACIENTE (auto)',
    '=IF($B{L}="","",IFERROR(XLOOKUP($B{L},' + abaCir + '!$A:$A,' + abaCir + '!$J:$J),""))'));
  feitos.push(preencher('DATA DA CIRURGIA (auto)',
    '=IF($B{L}="","",IFERROR(XLOOKUP($B{L},' + abaCir + '!$A:$A,' + abaCir + '!$C:$C),""))'));
  feitos.push(preencher('NOME DA CIRURGIA (auto)',
    '=IF($B{L}="","",IFERROR(XLOOKUP($B{L},' + abaCir + '!$A:$A,' + abaCir + '!$M:$M),""))'));
  feitos.push(preencher('ANESTESISTA DA CIRURGIA (auto)',
    '=IF($B{L}="","",IFERROR(XLOOKUP($B{L},' + abaCir + '!$A:$A,' + abaCir + '!$O:$O),""))'));
  feitos.push(preencher('MÊS (auto)',
    '=IF($H{L}<>"",MONTH($H{L}),IF($D{L}<>"",MONTH($D{L}),""))'));
  feitos.push(preencher('ANO (auto)',
    '=IF($H{L}<>"",YEAR($H{L}),IF($D{L}<>"",YEAR($D{L}),""))'));

  var ok = feitos.filter(function (f) { return f; });
  return 'AVALIAÇÕES PRÉ\n- ' + ok.length + ' colunas espelhadas reescritas (TASK-302).';
}

/* ======================================================================== */
/*                  CORREÇÃO DOS ERROS DE FÓRMULA                           */
/* ======================================================================== */

/**
 * A aba INDICADORES tem duas células apontando para a linha errada. O bloco
 * parece ter sido deslocado em alguma edição e essas duas referências não
 * acompanharam:
 *
 *   B14  VALOR PENDENTE EM ANESTESIAS   estava  =B11-B12
 *        B11 é "NÚMERO DE AVALIAÇÕES" (uma contagem) e B12 é o VALOR TOTAL.
 *        Subtrair dinheiro de quantidade não produz número com significado.
 *        Correto: VALOR TOTAL (B12) - VALOR RECEBIDO (B13).
 *
 *   B18  TOTAL RECEBIDO                 estava  =B12+B16
 *        B12 é o TOTAL de anestesias, não o RECEBIDO — o valor exibido ficava
 *        inflado pelo que ainda não entrou em caixa.
 *        Correto: RECEBIDO ANEST. (B13) + RECEBIDO AVAL. (B16).
 *
 * A tabela comparativa (linhas 24+) já estava correta, e confirma qual era a
 * intenção original.
 */
function corrigirFormulasIndicadores_() {
  var sheet = abaOpcional_(SCHEMA.INDICADORES.aba);
  if (!sheet) return 'INDICADORES: aba não encontrada, nada a corrigir.';

  var mudancas = [];

  var b14 = sheet.getRange('B14');
  var f14 = b14.getFormula();
  if (f14 && f14.replace(/\s/g, '') !== '=B12-B13') {
    b14.setFormula('=B12-B13');
    mudancas.push('B14 (VALOR PENDENTE EM ANESTESIAS): ' + f14 + '  ->  =B12-B13');
  }

  var b18 = sheet.getRange('B18');
  var f18 = b18.getFormula();
  if (f18 && f18.replace(/\s/g, '') !== '=B13+B16') {
    b18.setFormula('=B13+B16');
    mudancas.push('B18 (TOTAL RECEBIDO): ' + f18 + '  ->  =B13+B16');
  }

  if (mudancas.length === 0) return 'INDICADORES\n- As fórmulas já estavam corretas.';

  return 'INDICADORES — 2 erros de fórmula corrigidos\n- ' + mudancas.join('\n- ') +
    '\n(Os números destas duas células estavam sem significado financeiro.)';
}

/* ======================================================================== */
/*                   DECISÕES DO GRUPO (set/2026)                           */
/* ======================================================================== */

/**
 * Leva para a planilha o que o grupo decidiu no sistema web, SEM apagar
 * nada — só acrescenta um cabeçalho e oculta (o Sheets reexibe pelo menu):
 *
 *   - ANESTESISTAS ganha a coluna CHAVE PIX (o core já a lê e escreve
 *     quando o cabeçalho existe);
 *   - INDICADORES: o grupo divide o resultado igualmente, então os valores
 *     em dinheiro POR ANESTESISTA saem de vista — linhas 12 a 18 do bloco
 *     individual e colunas E a H do comparativo. As contagens e as horas
 *     continuam visíveis.
 */
function alinharDecisoesDoGrupo_() {
  var feitos = [];

  var an = abaOpcional_(SCHEMA.ANESTESISTAS.aba);
  if (an) {
    var mapa = mapaColunas_(an, 1);
    // Colunas novas do cadastro (CHAVE PIX, CRM): criadas no fim, uma vez só.
    schemaColunas('ANESTESISTAS').filter(function (c) { return c.extra; }).forEach(function (c) {
      if (mapa[c.rotulo]) return;
      var col = an.getLastColumn() + 1;
      an.getRange(1, col).setValue(c.rotulo);
      mapa[c.rotulo] = col;
      feitos.push('ANESTESISTAS: coluna ' + c.rotulo + ' criada (coluna ' + col + ').');
    });
  }

  var ind = abaOpcional_(SCHEMA.INDICADORES.aba);
  if (ind) {
    var linhasValor = SCHEMA.INDICADORES.indicadores.filter(function (i) {
      return /^VALOR |^TOTAL RECEBIDO$/.test(i.rotulo);
    }).map(function (i) { return i.linha; });
    if (linhasValor.length) {
      var ini = Math.min.apply(null, linhasValor), fim = Math.max.apply(null, linhasValor);
      ind.hideRows(ini, fim - ini + 1);
      feitos.push('INDICADORES: linhas ' + ini + ' a ' + fim + ' (valores por anestesista) ocultas.');
    }
    var colsValor = SCHEMA.INDICADORES.comparativo.colunas.filter(function (c) { return c.tipo === 'moeda'; })
      .map(function (c) { return c.col.charCodeAt(0) - 64; });
    if (colsValor.length) {
      var ci = Math.min.apply(null, colsValor), cf = Math.max.apply(null, colsValor);
      ind.hideColumns(ci, cf - ci + 1);
      feitos.push('INDICADORES: colunas de valor do comparativo ocultas (Nº de cirurgias, horas e avaliações continuam).');
    }
  }

  return feitos.length ? 'DECISÕES DO GRUPO\n- ' + feitos.join('\n- ') : 'DECISÕES DO GRUPO\n- Nada a alinhar.';
}

/* ======================================================================== */
/*                              GATILHO                                     */
/* ======================================================================== */

/**
 * Instala o gatilho onEdit se ainda não houver.
 * É instalável (e não simples) porque a TASK-301 escreve em outra aba, o que
 * o gatilho simples não tem permissão para fazer de forma confiável.
 */
function instalarGatilhoOnEdit_() {
  var alvo = 'aoEditar';
  var existentes = ScriptApp.getProjectTriggers();

  for (var i = 0; i < existentes.length; i++) {
    if (existentes[i].getHandlerFunction() === alvo) {
      return 'GATILHO\n- onEdit já estava instalado (TASK-301 ativa).';
    }
  }

  ScriptApp.newTrigger(alvo)
    .forSpreadsheet(ss_())
    .onEdit()
    .create();

  return 'GATILHO\n- onEdit instalado: marcar "Sim" em AVALIAÇÃO PRÉ NECESSÁRIA? ' +
    'passa a criar a linha da avaliação automaticamente (TASK-301).';
}

/** Remove o gatilho — útil para depurar sem efeito colateral. */
function desinstalarGatilhos() {
  var removidos = 0;
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'aoEditar') { ScriptApp.deleteTrigger(t); removidos++; }
  });
  alertar_('Gatilhos removidos', removidos + ' gatilho(s) removido(s). ' +
    'A criação automática de avaliação está desligada até você reinstalar.');
}
