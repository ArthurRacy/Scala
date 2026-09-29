/**
 * ============================================================================
 * 10_DASHBOARD — KPIs gerenciais e séries de gráfico  (TASK-403)
 * ============================================================================
 * Reproduz a aba DASHBOARD:
 *
 *   B6  Cirurgias realizadas                  COUNTIFS(MÊS;ANO; STATUS;"Realizada")
 *   B7  Cirurgias canceladas                  COUNTIFS(MÊS;ANO; STATUS;"Cancelada")
 *   B8  Horas totais de anestesia             SUMIFS(TEMPO REAL; MÊS;ANO; "<>Cancelada")
 *   B9  Número de avaliações pré-anestésicas  COUNTIFS(MÊS;ANO; REALIZADA?;"Sim")
 *   B10 Receita de anestesias                 SUMIFS(VALOR; MÊS;ANO; "<>Cancelada")
 *   B11 Receita de avaliações                 SUMIFS(VALOR; MÊS;ANO)
 *   B12 Total recebido                        as duas origens com PAGO?="Sim"
 *   B13 Total pendente                        (B10+B11)-B12
 *   B14 Procedimentos sem nota fiscal         pagos sem NF, nas duas origens
 *
 * Séries de gráfico:
 *   linhas 18–32  cirurgias por anestesista (vem do comparativo de INDICADORES)
 *   linhas 36–38  cirurgias realizadas por mês (OUT/NOV/DEZ)
 *
 * "Receita" nas linhas 10/11 significa FATURADO (tudo que não foi cancelado),
 * e não caixa — é assim na planilha, e por isso B13 = faturado - recebido
 * fecha. Mantido igual, com os nomes dos campos deixando a diferença explícita
 * (`receitaAnestesias` = faturado, `totalRecebido` = caixa).
 * ============================================================================
 */

/** KPIs do mês/ano selecionado. */
function calcularDashboard(cirurgias, avaliacoes, mes, ano) {
  var realizadas = 0, canceladas = 0, agendadas = 0, remarcadas = 0, confirmadas = 0;
  // Horas em minutos inteiros durante a acumulação.
  var minTotais = 0, minPendentes = 0, semHorarioReal = 0;
  var receitaAnestesias = 0, recebidoAnestesias = 0;
  var semNotaFiscal = 0;

  (cirurgias || []).forEach(function (c) {
    if (Number(c.mes) !== Number(mes) || Number(c.ano) !== Number(ano)) return;

    if (mesmoTexto(c.status, 'Realizada')) realizadas++;
    else if (mesmoTexto(c.status, 'Cancelada')) canceladas++;
    else if (mesmoTexto(c.status, 'Agendada')) agendadas++;
    else if (mesmoTexto(c.status, 'Confirmada')) confirmadas++;
    else if (mesmoTexto(c.status, 'Remarcada')) remarcadas++;

    if (cirurgiaContabilizavel(c)) {
      var mReal = calcMinutosReal(c);
      if (mReal !== null) minTotais += mReal;

      if (ehPendenciaHorario(c)) {
        semHorarioReal++;
        var mEstim = calcMinutosEstimado(c);
        if (mEstim !== null) minPendentes += mEstim;
      }

      var valor = paraNumero(c.valor);
      if (valor !== null) {
        receitaAnestesias += valor;
        if (ehSim(c.pago)) recebidoAnestesias += valor;
      }
    }

    if (ehSim(c.pago) && vazio(c.nf)) semNotaFiscal++;
  });

  var numAvaliacoes = 0, avaliacoesPendentes = 0;
  var receitaAvaliacoes = 0, recebidoAvaliacoes = 0;
  var canceladasIdx = indexarCanceladas(cirurgias);

  (avaliacoes || []).forEach(function (a) {
    if (Number(a.mes) !== Number(mes) || Number(a.ano) !== Number(ano)) return;
    // Avaliação não feita de cirurgia cancelada não é pendência nem receita.
    if (!avaliacaoFaturavel(a, canceladasIdx)) return;

    if (avaliacaoRealizada(a)) numAvaliacoes++; else avaliacoesPendentes++;

    var valor = paraNumero(a.valor);
    if (valor !== null) {
      receitaAvaliacoes += valor;
      if (ehSim(a.pago)) recebidoAvaliacoes += valor;
    }

    if (ehSim(a.pago) && vazio(a.nf)) semNotaFiscal++;
  });

  var totalRecebido = recebidoAnestesias + recebidoAvaliacoes;
  var totalFaturado = receitaAnestesias + receitaAvaliacoes;

  return {
    mes: Number(mes),
    ano: Number(ano),

    cirurgiasRealizadas: realizadas,
    cirurgiasCanceladas: canceladas,
    cirurgiasAgendadas: agendadas,
    cirurgiasConfirmadas: confirmadas,
    cirurgiasRemarcadas: remarcadas,
    cirurgiasTotal: realizadas + canceladas + agendadas + confirmadas + remarcadas,

    horasTotais: minutosParaHoras(minTotais),
    horasPendentes: minutosParaHoras(minPendentes),
    horasProjetadas: minutosParaHoras(minTotais + minPendentes),
    minutosTotais: minTotais,
    semHorarioReal: semHorarioReal,

    numAvaliacoes: numAvaliacoes,
    avaliacoesPendentes: avaliacoesPendentes,

    receitaAnestesias: arredondar2(receitaAnestesias),
    receitaAvaliacoes: arredondar2(receitaAvaliacoes),
    totalRecebido: arredondar2(totalRecebido),
    totalPendente: arredondar2(totalFaturado - totalRecebido),
    totalFaturado: arredondar2(totalFaturado),

    semNotaFiscal: semNotaFiscal,

    // Taxas úteis para leitura rápida (0 quando não há base).
    taxaCancelamento: (realizadas + canceladas) ? arredondar2(canceladas * 100 / (realizadas + canceladas)) : 0,
    taxaRecebimento: totalFaturado ? arredondar2(totalRecebido * 100 / totalFaturado) : 0,
    mediaHorasPorCirurgia: realizadas ? arredondar2(minutosParaHoras(minTotais) / realizadas) : 0
  };
}

/**
 * Série "cirurgias por anestesista" (linhas 18–32 da planilha).
 * Ordem: a mesma do cadastro, para casar com a aba.
 */
function serieCirurgiasPorAnestesista(anestesistas, cirurgias, mes, ano) {
  return (anestesistas || []).map(function (a) {
    var n = 0;
    (cirurgias || []).forEach(function (c) {
      if (!mesmoTexto(c.anestesista, a.nome)) return;
      if (Number(c.mes) !== Number(mes) || Number(c.ano) !== Number(ano)) return;
      if (cirurgiaExecutada(c)) n++;
    });
    return { rotulo: txt(a.nome), id: txt(a.id), valor: n };
  });
}

/**
 * Série "cirurgias por tipo" (mamoplastia, rinoplastia…), do maior para o
 * menor. Conta as cirurgias do mês que não foram canceladas — agendadas e
 * confirmadas entram, para o gráfico já servir ao planejamento do mês.
 * O tipo vem de classificarTipoCirurgia(); "Outros" fica sempre por último.
 */
function serieCirurgiasPorTipo(cirurgias, mes, ano) {
  var mapa = {};
  (cirurgias || []).forEach(function (c) {
    if (Number(c.mes) !== Number(mes) || Number(c.ano) !== Number(ano)) return;
    if (!cirurgiaContabilizavel(c)) return;
    var t = classificarTipoCirurgia(c.procedimento);
    mapa[t] = (mapa[t] || 0) + 1;
  });
  return Object.keys(mapa).map(function (k) {
    return { rotulo: k, valor: mapa[k] };
  }).sort(function (a, b) {
    if (a.rotulo === TIPO_CIRURGIA_OUTROS) return 1;
    if (b.rotulo === TIPO_CIRURGIA_OUTROS) return -1;
    return b.valor - a.valor || (a.rotulo < b.rotulo ? -1 : 1);
  });
}

/**
 * Meses de uma série anual: os pedidos, ou os meses da planilha no `ano`.
 */
function mesesDaSerie(ano, meses) {
  if (meses) return meses;
  ano = ano || CONFIG.ANO_REFERENCIA;
  return CONFIG.MESES_ESCALA.map(function (m) { return infoMes(ano, m.mes); });
}

/** Série "cirurgias realizadas por mês" (linhas 36–38 da planilha). */
function serieCirurgiasPorMes(cirurgias, ano, meses) {
  return mesesDaSerie(ano, meses).map(function (m) {
    var n = 0;
    (cirurgias || []).forEach(function (c) {
      if (Number(c.mes) !== Number(m.mes) || Number(c.ano) !== Number(m.ano)) return;
      if (cirurgiaExecutada(c)) n++;
    });
    return { rotulo: m.nome, sigla: m.sigla, mes: m.mes, ano: m.ano, valor: n };
  });
}

/** Série de receita por mês: faturado x recebido, para gráfico de barras. */
function serieReceitaPorMes(cirurgias, avaliacoes, ano, meses) {
  return mesesDaSerie(ano, meses).map(function (m) {
    var d = calcularDashboard(cirurgias, avaliacoes, m.mes, m.ano);
    return {
      rotulo: m.nome, sigla: m.sigla, mes: m.mes, ano: m.ano,
      faturado: d.totalFaturado, recebido: d.totalRecebido, pendente: d.totalPendente
    };
  });
}

/** Distribuição por status, para gráfico de rosca. */
function serieStatus(cirurgias, mes, ano) {
  return DOMINIOS.STATUS_CIRURGIA.map(function (s) {
    var n = 0;
    (cirurgias || []).forEach(function (c) {
      if (Number(c.mes) !== Number(mes) || Number(c.ano) !== Number(ano)) return;
      if (mesmoTexto(c.status, s)) n++;
    });
    return { rotulo: s, valor: n };
  });
}

/** Distribuição por convênio, do maior para o menor. */
function serieConvenio(cirurgias, mes, ano) {
  var mapa = {};
  (cirurgias || []).forEach(function (c) {
    if (Number(c.mes) !== Number(mes) || Number(c.ano) !== Number(ano)) return;
    if (!cirurgiaContabilizavel(c)) return;
    var k = txt(c.convenio) || '(não informado)';
    mapa[k] = (mapa[k] || 0) + 1;
  });
  return Object.keys(mapa).map(function (k) {
    return { rotulo: k, valor: mapa[k] };
  }).sort(function (a, b) { return b.valor - a.valor; });
}

/**
 * Pacote completo do dashboard: KPIs + todas as séries.
 * É o que a interface consome numa chamada só.
 */
function montarDashboard(anestesistas, cirurgias, avaliacoes, mes, ano, meses) {
  ano = ano || CONFIG.ANO_REFERENCIA;
  return {
    kpis: calcularDashboard(cirurgias, avaliacoes, mes, ano),
    porAnestesista: serieCirurgiasPorAnestesista(anestesistas, cirurgias, mes, ano),
    porTipo: serieCirurgiasPorTipo(cirurgias, mes, ano),
    porMes: serieCirurgiasPorMes(cirurgias, ano, meses),
    receitaPorMes: serieReceitaPorMes(cirurgias, avaliacoes, ano, meses),
    porStatus: serieStatus(cirurgias, mes, ano),
    porConvenio: serieConvenio(cirurgias, mes, ano)
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    calcularDashboard: calcularDashboard,
    serieCirurgiasPorAnestesista: serieCirurgiasPorAnestesista,
    serieCirurgiasPorTipo: serieCirurgiasPorTipo,
    serieCirurgiasPorMes: serieCirurgiasPorMes,
    serieReceitaPorMes: serieReceitaPorMes,
    serieStatus: serieStatus,
    serieConvenio: serieConvenio,
    montarDashboard: montarDashboard
  };
}
