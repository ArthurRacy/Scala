/**
 * ============================================================================
 * 90_PLANILHA — Ponte entre o core e o Google Sheets
 * ============================================================================
 * Traduz "aba + cabeçalho" em "objetos com os campos do schema", e vice-versa.
 * Toda leitura casa as colunas PELO RÓTULO do cabeçalho, nunca pela posição:
 * assim, se alguém inserir uma coluna no meio da planilha, o sistema continua
 * lendo certo em vez de embaralhar os dados silenciosamente.
 *
 * Este arquivo só existe no ambiente Google Apps Script. O core (00 a 12) é o
 * mesmo do web app, copiado sem alteração.
 * ============================================================================
 */

/** Planilha ativa. */
function ss_() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

/** Aba por nome; lança erro claro se não existir. */
function aba_(nome) {
  var s = ss_().getSheetByName(nome);
  if (!s) {
    throw new Error('A aba "' + nome + '" não existe nesta planilha. ' +
      'Confira se o nome foi alterado — o sistema depende dos nomes originais.');
  }
  return s;
}

/** Aba por nome, ou null (para abas opcionais). */
function abaOpcional_(nome) {
  return ss_().getSheetByName(nome);
}

/**
 * Mapa { rótulo -> índice de coluna (1-based) } lido do cabeçalho real.
 * É o que torna a leitura resistente a colunas inseridas ou reordenadas.
 */
function mapaColunas_(sheet, linhaCabecalho) {
  linhaCabecalho = linhaCabecalho || 1;
  var ultima = sheet.getLastColumn();
  if (ultima < 1) return {};

  var rotulos = sheet.getRange(linhaCabecalho, 1, 1, ultima).getValues()[0];
  var mapa = {};
  for (var i = 0; i < rotulos.length; i++) {
    var r = String(rotulos[i]).trim();
    if (r !== '') mapa[r] = i + 1;
  }
  return mapa;
}

/**
 * Lê uma aba tabular e devolve [{campo: valor}], usando o SCHEMA para saber
 * quais rótulos procurar e que tipo cada um é.
 *
 * Linhas totalmente vazias são ignoradas — a planilha tem centenas de linhas
 * pré-formatadas em branco, e elas não são registros.
 */
function lerAba_(nomeLogico, nomeAbaOverride) {
  var def = SCHEMA[nomeLogico];
  var nomeAba = nomeAbaOverride || def.aba;
  var sheet = aba_(nomeAba);

  var linhaCab = def.linhaCabecalho || 1;
  var primeira = def.primeiraLinha || (linhaCab + 1);
  var ultima = sheet.getLastRow();
  if (ultima < primeira) return [];

  var mapa = mapaColunas_(sheet, linhaCab);
  var cols = schemaColunas(nomeLogico);
  var largura = sheet.getLastColumn();
  var valores = sheet.getRange(primeira, 1, ultima - primeira + 1, largura).getValues();

  var saida = [];

  for (var i = 0; i < valores.length; i++) {
    var linha = valores[i];
    var reg = { _linha: primeira + i };
    var temAlgo = false;

    for (var j = 0; j < cols.length; j++) {
      var c = cols[j];
      var idx = mapa[c.rotulo];
      if (!idx) { reg[c.campo] = ''; continue; }

      var bruto = linha[idx - 1];
      reg[c.campo] = normalizarValor_(bruto, c.tipo);
      if (reg[c.campo] !== '' && reg[c.campo] !== null) temAlgo = true;
    }

    if (temAlgo) saida.push(reg);
  }

  return saida;
}

/** Converte o valor cru da célula para a representação canônica do core. */
function normalizarValor_(bruto, tipo) {
  if (bruto === '' || bruto === null || bruto === undefined) {
    return (tipo === 'moeda' || tipo === 'numero' || tipo === 'duracao') ? null : '';
  }

  switch (tipo) {
    case 'data':
      return paraData(bruto);
    case 'hora':
      return paraHora(bruto);
    case 'duracao':
      // Na planilha, duração é fração de dia; no core, horas decimais.
      return (typeof bruto === 'number') ? fracaoDiaParaHoras(bruto) : paraNumero(bruto);
    case 'moeda':
    case 'numero':
      return paraNumero(bruto);
    case 'inteiro':
      var n = paraNumero(bruto);
      return n === null ? '' : Math.round(n);
    case 'booleano':
      return paraSimNao(bruto);
    default:
      return txt(bruto);
  }
}

/** Converte o valor canônico de volta para o formato que a planilha espera. */
function paraCelula_(valor, tipo) {
  if (valor === null || valor === undefined || valor === '') return '';

  switch (tipo) {
    case 'data':
      var d = paraData(valor);
      if (!d) return '';
      var p = d.split('-');
      return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
    case 'hora':
      var h = paraHora(valor);
      if (!h) return '';
      // 1899-12-30 é a época que o Sheets usa para valor só-hora.
      return new Date(1899, 11, 30, Number(h.slice(0, 2)), Number(h.slice(3, 5)));
    case 'duracao':
      return horasParaFracaoDia(valor);
    case 'moeda':
    case 'numero':
      return paraNumero(valor);
    case 'inteiro':
      var i = paraNumero(valor);
      return i === null ? '' : Math.round(i);
    case 'booleano':
      return paraSimNao(valor);
    default:
      return txt(valor);
  }
}

/**
 * Escreve uma lista de registros numa aba tabular, numa única chamada de
 * setValues — uma escrita por célula estouraria o tempo de execução do Apps
 * Script em poucas centenas de linhas.
 *
 * `opcoes.limparAntes` apaga o intervalo de dados antes de escrever.
 * `opcoes.apenasCampos` restringe quais colunas são sobrescritas — usado para
 * não pisar em coluna de fórmula ou em campo digitado pelo usuário.
 */
function escreverAba_(nomeLogico, registros, opcoes) {
  opcoes = opcoes || {};
  var def = SCHEMA[nomeLogico];
  var nomeAba = opcoes.aba || def.aba;
  var sheet = aba_(nomeAba);

  var linhaCab = def.linhaCabecalho || 1;
  var primeira = def.primeiraLinha || (linhaCab + 1);
  var mapa = mapaColunas_(sheet, linhaCab);
  var cols = schemaColunas(nomeLogico).filter(function (c) {
    if (!mapa[c.rotulo]) return false;
    if (opcoes.apenasCampos) return opcoes.apenasCampos.indexOf(c.campo) >= 0;
    return true;
  });

  if (cols.length === 0) return 0;

  if (opcoes.limparAntes) {
    var ultimaExistente = sheet.getLastRow();
    if (ultimaExistente >= primeira) {
      cols.forEach(function (c) {
        sheet.getRange(primeira, mapa[c.rotulo], ultimaExistente - primeira + 1, 1).clearContent();
      });
    }
  }

  if (registros.length === 0) return 0;

  // Agrupa colunas contíguas para reduzir o número de chamadas de escrita.
  var indices = cols.map(function (c) { return mapa[c.rotulo]; });
  var min = Math.min.apply(null, indices);
  var max = Math.max.apply(null, indices);

  var bloco = [];
  for (var i = 0; i < registros.length; i++) {
    var linha = [];
    for (var col = min; col <= max; col++) {
      var def2 = null;
      for (var k = 0; k < cols.length; k++) {
        if (mapa[cols[k].rotulo] === col) { def2 = cols[k]; break; }
      }
      // Coluna fora da lista de escrita: mantém o que já está lá.
      linha.push(def2 ? paraCelula_(registros[i][def2.campo], def2.tipo) : null);
    }
    bloco.push(linha);
  }

  var alvo = sheet.getRange(primeira, min, bloco.length, max - min + 1);

  // Colunas não escritas precisam preservar o conteúdo atual.
  var atual = alvo.getValues();
  for (var r = 0; r < bloco.length; r++) {
    for (var c2 = 0; c2 < bloco[r].length; c2++) {
      if (bloco[r][c2] === null) bloco[r][c2] = (atual[r] && atual[r][c2] !== undefined) ? atual[r][c2] : '';
    }
  }

  alvo.setValues(bloco);
  return bloco.length;
}

/** Acrescenta linhas ao fim de uma aba, sem tocar no que já existe. */
function acrescentarNaAba_(nomeLogico, registros, nomeAbaOverride) {
  if (!registros || registros.length === 0) return 0;

  var def = SCHEMA[nomeLogico];
  var sheet = aba_(nomeAbaOverride || def.aba);
  var linhaCab = def.linhaCabecalho || 1;
  var mapa = mapaColunas_(sheet, linhaCab);
  var cols = schemaColunas(nomeLogico).filter(function (c) { return !!mapa[c.rotulo]; });

  var largura = sheet.getLastColumn();
  var bloco = registros.map(function (reg) {
    var linha = new Array(largura).fill('');
    cols.forEach(function (c) { linha[mapa[c.rotulo] - 1] = paraCelula_(reg[c.campo], c.tipo); });
    return linha;
  });

  var proxima = primeiraLinhaVazia_(sheet, nomeLogico);
  sheet.getRange(proxima, 1, bloco.length, largura).setValues(bloco);
  return bloco.length;
}

/**
 * Primeira linha realmente vazia de uma aba de dados.
 * Não usa getLastRow() porque a planilha tem centenas de linhas
 * pré-formatadas: getLastRow() aponta para depois delas, e as novas linhas
 * apareceriam a 400 linhas de distância dos dados.
 */
function primeiraLinhaVazia_(sheet, nomeLogico) {
  var def = SCHEMA[nomeLogico];
  var primeira = def.primeiraLinha || 2;
  var chave = (def.colunas && def.colunas[0]) ? def.colunas[0].rotulo : null;
  var mapa = mapaColunas_(sheet, def.linhaCabecalho || 1);
  var colChave = chave && mapa[chave] ? mapa[chave] : 1;

  var ultima = sheet.getLastRow();
  if (ultima < primeira) return primeira;

  var valores = sheet.getRange(primeira, colChave, ultima - primeira + 1, 1).getValues();
  for (var i = 0; i < valores.length; i++) {
    if (String(valores[i][0]).trim() === '') return primeira + i;
  }
  return ultima + 1;
}

/**
 * Monta o estado do core lendo a planilha inteira.
 * É a função que conecta os dois mundos: depois dela, TODAS as regras de
 * negócio rodam exatamente como rodam nos testes e no web app.
 */
function lerEstadoDaPlanilha_() {
  var estado = estadoVazio();

  estado.anestesistas = lerAba_('ANESTESISTAS');
  estado.escalaBase = lerAba_('ESCALA_BASE');
  estado.cirurgias = lerAba_('CIRURGIAS');
  estado.avaliacoes = lerAba_('AVALIACOES_PRE');

  var logSheet = abaOpcional_(SCHEMA.LOG.aba);
  estado.log = logSheet ? lerAba_('LOG') : [];

  CONFIG.MESES_ESCALA.forEach(function (m) {
    var sheet = abaOpcional_(m.aba);
    estado.escalas[chaveMes(m.ano, m.mes)] = sheet ? lerAba_('ESCALA_MENSAL', m.aba) : [];
  });

  return estado;
}

/** Store já povoado com a planilha e recalculado. */
function storeDaPlanilha_() {
  var store = criarStore(lerEstadoDaPlanilha_(), { usuario: usuarioAtual_() });
  store.recalcular();
  return store;
}

/**
 * Cirurgias que pedem avaliação pré e NÃO têm a linha correspondente na
 * planilha.
 *
 * Por que não usar o store: `store.recalcular()` executa a sincronização da
 * TASK-301 e cria as avaliações faltantes EM MEMÓRIA. Se comparássemos contra
 * o store, a lista de faltantes viria sempre vazia — o próprio recálculo teria
 * "consertado" o que queríamos detectar na planilha. Aqui olhamos o estado
 * cru, exatamente como está nas células.
 */
function avaliacoesFaltandoNaPlanilha_() {
  var cru = lerEstadoDaPlanilha_();
  var porCirurgia = indexarAvaliacoesPorCirurgia(cru.avaliacoes);

  return cru.cirurgias.filter(function (c) {
    if (!ehSim(c.avaliacaoNec)) return false;
    if (!cirurgiaContabilizavel(c)) return false;
    if (vazio(c.id)) return false;
    return (porCirurgia[txt(c.id)] || []).length === 0;
  });
}

/** Quem está mexendo na planilha, para a coluna USUÁRIO do LOG. */
function usuarioAtual_() {
  try {
    var email = Session.getActiveUser().getEmail();
    return email || CONFIG.USUARIO_PADRAO;
  } catch (e) {
    return CONFIG.USUARIO_PADRAO;
  }
}

/** Acrescenta entradas na aba LOG. */
function registrarLog_(entradas) {
  if (!entradas || entradas.length === 0) return 0;
  var sheet = abaOpcional_(SCHEMA.LOG.aba);
  if (!sheet) return 0;
  return acrescentarNaAba_('LOG', entradas);
}

/** Caixa de aviso curta. */
function avisar_(titulo, mensagem) {
  try {
    SpreadsheetApp.getActive().toast(mensagem, titulo, 8);
  } catch (e) {
    Logger.log(titulo + ': ' + mensagem);
  }
}

/** Caixa de diálogo com OK. */
function alertar_(titulo, mensagem) {
  try {
    SpreadsheetApp.getUi().alert(titulo, mensagem, SpreadsheetApp.getUi().ButtonSet.OK);
  } catch (e) {
    Logger.log(titulo + ': ' + mensagem);
  }
}

/** Confirmação Sim/Não; devolve true se o usuário confirmar. */
function confirmar_(titulo, mensagem) {
  try {
    var ui = SpreadsheetApp.getUi();
    return ui.alert(titulo, mensagem, ui.ButtonSet.YES_NO) === ui.Button.YES;
  } catch (e) {
    return false;
  }
}
