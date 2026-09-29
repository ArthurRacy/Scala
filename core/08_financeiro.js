/**
 * ============================================================================
 * 08_FINANCEIRO — Indicadores mensais + ledger unificado  (TASK-402)
 * ============================================================================
 * Reproduz a aba FINANCEIRO nas duas metades.
 *
 * (a) INDICADORES MENSAIS (linhas 6–15), filtrados por MÊS (B3) e ANO (B4):
 *     VALOR TOTAL DE ANESTESIAS     =SUMIFS(U; MÊS;B3; ANO;B4; STATUS;"<>Cancelada")
 *     VALOR RECEBIDO DE ANESTESIAS  = idem + PAGO?="Sim"
 *     VALOR PENDENTE DE ANESTESIAS  = total - recebido
 *     VALOR TOTAL DE AVALIAÇÕES     =SUMIFS(L; MÊS;B3; ANO;B4)
 *     VALOR RECEBIDO DE AVALIAÇÕES  = idem + PAGO?="Sim"
 *     VALOR PENDENTE DE AVALIAÇÕES  = total - recebido
 *     TOTAL GERAL RECEBIDO/PENDENTE = soma das duas origens
 *
 * (b) LEDGER (linha 20 em diante), unificando as duas origens:
 *     - Anestesias:  exclui linha sem ID, sem VALOR, ou com STATUS "Cancelada".
 *                    DATA do lançamento = DATA DA CIRURGIA.
 *     - Avaliações:  exclui linha sem ID ou sem VALOR.
 *                    DATA do lançamento = DATA DA AVALIAÇÃO.
 *     STATUS DA NOTA = "Emitida" se há número de NF, senão "Sem nota".
 *
 * O critério "sem VALOR não entra no ledger" é da própria planilha
 * (IF(OR(...;$U2="");"";...)) e está mantido: lançamento sem valor não é
 * receita, é cadastro incompleto.
 * ============================================================================
 */

/**
 * Monta o ledger unificado. Sem filtro, devolve tudo (é assim que a planilha
 * funciona: o ledger é a base completa, e o filtro de mês vive nos
 * indicadores). Com `filtro`, restringe por competência.
 *
 * Ordenação: por data, e dentro da data anestesias antes de avaliações —
 * estável e previsível para conferência.
 */
function montarLedger(cirurgias, avaliacoes, filtro) {
  filtro = filtro || {};
  var linhas = [];

  /* --- origem 1: anestesias -------------------------------------------- */
  (cirurgias || []).forEach(function (c) {
    if (vazio(c.id)) return;
    if (!cirurgiaContabilizavel(c)) return;
    var valor = paraNumero(c.valor);
    if (valor === null) return;

    linhas.push({
      data: paraData(c.data),
      tipo: DOMINIOS.TIPO_LANCAMENTO[0],            // 'Anestesia'
      id: txt(c.id),
      paciente: txt(c.paciente),
      anestesista: txt(c.anestesista),
      valor: valor,
      pago: paraSimNao(c.pago),
      dataPagamento: paraData(c.dataPagamento),
      nf: txt(c.nf),
      statusNota: vazio(c.nf) ? DOMINIOS.STATUS_NOTA[0] : DOMINIOS.STATUS_NOTA[1],
      obs: txt(c.obs),
      mes: c.mes,
      ano: c.ano,
      ordem: 0
    });
  });

  /* --- origem 2: avaliações pré ---------------------------------------- */
  var canceladas = indexarCanceladas(cirurgias);
  (avaliacoes || []).forEach(function (a) {
    if (vazio(a.id)) return;
    if (!avaliacaoFaturavel(a, canceladas)) return;
    var valor = paraNumero(a.valor);
    if (valor === null) return;

    linhas.push({
      // Avaliação ainda não feita: data da cirurgia, a mesma usada para a
      // competência (senão o lançamento aparecia sem data, fora de ordem).
      data: paraData(a.data) || paraData(a.dataCirurgia),
      tipo: DOMINIOS.TIPO_LANCAMENTO[1],            // 'Avaliação pré'
      id: txt(a.idCirurgia),                        // a planilha mostra o ID da cirurgia
      idAvaliacao: txt(a.id),
      paciente: txt(a.paciente),
      anestesista: txt(a.anestesista),
      valor: valor,
      pago: paraSimNao(a.pago),
      dataPagamento: paraData(a.dataPagamento),
      nf: txt(a.nf),
      statusNota: vazio(a.nf) ? DOMINIOS.STATUS_NOTA[0] : DOMINIOS.STATUS_NOTA[1],
      obs: txt(a.obs),
      mes: a.mes,
      ano: a.ano,
      ordem: 1
    });
  });

  if (filtro.mes) linhas = linhas.filter(function (l) { return Number(l.mes) === Number(filtro.mes); });
  if (filtro.ano) linhas = linhas.filter(function (l) { return Number(l.ano) === Number(filtro.ano); });
  if (filtro.anestesista) {
    linhas = linhas.filter(function (l) { return mesmoTexto(l.anestesista, filtro.anestesista); });
  }
  if (filtro.apenasPendentes) linhas = linhas.filter(function (l) { return !ehSim(l.pago); });
  if (filtro.apenasSemNota) linhas = linhas.filter(function (l) { return vazio(l.nf); });

  linhas.sort(function (x, y) {
    if (x.data !== y.data) return String(x.data) < String(y.data) ? -1 : 1;
    if (x.ordem !== y.ordem) return x.ordem - y.ordem;
    return String(x.id) < String(y.id) ? -1 : 1;
  });

  return linhas;
}

/**
 * Indicadores mensais da aba FINANCEIRO (bloco B6:B15).
 * Recebe as listas completas e o mês/ano do seletor.
 */
function calcularFinanceiro(cirurgias, avaliacoes, mes, ano) {
  var totalAnestesias = 0, recebidoAnestesias = 0;
  var totalAvaliacoes = 0, recebidoAvaliacoes = 0;
  var qtdAnestesias = 0, qtdAvaliacoes = 0;
  var semNota = 0, comNota = 0;

  (cirurgias || []).forEach(function (c) {
    if (Number(c.mes) !== Number(mes) || Number(c.ano) !== Number(ano)) return;
    if (!cirurgiaContabilizavel(c)) return;

    var valor = paraNumero(c.valor);
    if (valor !== null) {
      totalAnestesias += valor;
      qtdAnestesias++;
      if (ehSim(c.pago)) recebidoAnestesias += valor;
    }
    // "Procedimentos sem nota fiscal" conta PAGOS sem NF (critério da planilha).
    if (ehSim(c.pago)) {
      if (vazio(c.nf)) semNota++; else comNota++;
    }
  });

  var canceladas = indexarCanceladas(cirurgias);
  (avaliacoes || []).forEach(function (a) {
    if (Number(a.mes) !== Number(mes) || Number(a.ano) !== Number(ano)) return;
    if (!avaliacaoFaturavel(a, canceladas)) return;

    var valor = paraNumero(a.valor);
    if (valor !== null) {
      totalAvaliacoes += valor;
      qtdAvaliacoes++;
      if (ehSim(a.pago)) recebidoAvaliacoes += valor;
    }
    if (ehSim(a.pago)) {
      if (vazio(a.nf)) semNota++; else comNota++;
    }
  });

  var pendenteAnestesias = totalAnestesias - recebidoAnestesias;
  var pendenteAvaliacoes = totalAvaliacoes - recebidoAvaliacoes;

  return {
    mes: Number(mes),
    ano: Number(ano),

    totalAnestesias: arredondar2(totalAnestesias),
    recebidoAnestesias: arredondar2(recebidoAnestesias),
    pendenteAnestesias: arredondar2(pendenteAnestesias),

    totalAvaliacoes: arredondar2(totalAvaliacoes),
    recebidoAvaliacoes: arredondar2(recebidoAvaliacoes),
    pendenteAvaliacoes: arredondar2(pendenteAvaliacoes),

    totalRecebido: arredondar2(recebidoAnestesias + recebidoAvaliacoes),
    totalPendente: arredondar2(pendenteAnestesias + pendenteAvaliacoes),
    totalFaturado: arredondar2(totalAnestesias + totalAvaliacoes),

    qtdAnestesias: qtdAnestesias,
    qtdAvaliacoes: qtdAvaliacoes,
    qtdLancamentos: qtdAnestesias + qtdAvaliacoes,
    comNota: comNota,
    semNota: semNota
  };
}

/**
 * Consolidação anual: um resultado por mês + total do ano.
 * `meses` = lista de infoMes (padrão: os meses da planilha, no ano pedido).
 * Alimenta o gráfico de evolução do dashboard.
 */
function consolidarFinanceiroAnual(cirurgias, avaliacoes, ano, listaMeses) {
  ano = ano || CONFIG.ANO_REFERENCIA;
  var lista = listaMeses || CONFIG.MESES_ESCALA.map(function (m) { return infoMes(ano, m.mes); });
  var meses = lista.map(function (m) {
    var r = calcularFinanceiro(cirurgias, avaliacoes, m.mes, m.ano);
    r.sigla = m.sigla;
    r.nome = m.nome;
    return r;
  });

  var total = {
    ano: ano, totalRecebido: 0, totalPendente: 0, totalFaturado: 0, qtdLancamentos: 0
  };
  meses.forEach(function (m) {
    total.totalRecebido += m.totalRecebido;
    total.totalPendente += m.totalPendente;
    total.totalFaturado += m.totalFaturado;
    total.qtdLancamentos += m.qtdLancamentos;
  });
  total.totalRecebido = arredondar2(total.totalRecebido);
  total.totalPendente = arredondar2(total.totalPendente);
  total.totalFaturado = arredondar2(total.totalFaturado);

  return { meses: meses, total: total };
}

/**
 * Separa o ledger em recebidos e pendentes, com subtotais.
 * É o que a TASK-402 pede: "separando receitas pagas de pendentes".
 */
function separarPorPagamento(ledger) {
  var pagos = [], pendentes = [];
  var somaPagos = 0, somaPendentes = 0;

  (ledger || []).forEach(function (l) {
    if (ehSim(l.pago)) { pagos.push(l); somaPagos += Number(l.valor) || 0; }
    else { pendentes.push(l); somaPendentes += Number(l.valor) || 0; }
  });

  return {
    pagos: pagos,
    pendentes: pendentes,
    somaPagos: arredondar2(somaPagos),
    somaPendentes: arredondar2(somaPendentes),
    qtdPagos: pagos.length,
    qtdPendentes: pendentes.length
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    montarLedger: montarLedger,
    calcularFinanceiro: calcularFinanceiro,
    consolidarFinanceiroAnual: consolidarFinanceiroAnual,
    separarPorPagamento: separarPorPagamento
  };
}
