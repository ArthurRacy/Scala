/**
 * ============================================================================
 * 09_INDICADORES — Consolidação por anestesista + comparativo  (TASK-403)
 * ============================================================================
 * Reproduz a aba INDICADORES nas duas metades: o bloco do anestesista
 * selecionado (linhas 8–20) e o comparativo de todos (linhas 24–38).
 *
 * ----------------------------------------------------------------------------
 * ATENÇÃO — DOIS ERROS DE FÓRMULA NA PLANILHA ORIGINAL
 * ----------------------------------------------------------------------------
 * Ao conferir o arquivo em uso, duas células do bloco de indicadores apontam
 * para a linha errada (o bloco parece ter sido deslocado uma linha em alguma
 * edição, e essas duas referências não acompanharam):
 *
 *   B14  VALOR PENDENTE EM ANESTESIAS   está  =B11-B12
 *        B11 é "NÚMERO DE AVALIAÇÕES" e B12 é "VALOR TOTAL EM ANESTESIAS".
 *        A conta certa é  VALOR TOTAL (B12) - VALOR RECEBIDO (B13).
 *
 *   B18  TOTAL RECEBIDO                 está  =B12+B16
 *        B12 é o valor TOTAL de anestesias, não o recebido.
 *        A conta certa é  RECEBIDO ANEST. (B13) + RECEBIDO AVAL. (B16).
 *
 * Como isso mistura contagem com dinheiro, o número exibido hoje na planilha
 * não tem significado financeiro. Este módulo implementa a conta CORRETA.
 * O comparativo (coluna G = E-F, coluna H = F + recebido de avaliações) já
 * estava certo na planilha, e serve de confirmação da intenção original.
 *
 * `tools/corrigir_planilha.py` aplica a mesma correção no arquivo .xlsx, para
 * quem quiser continuar usando a planilha em paralelo. Detalhes completos em
 * docs/REGRAS_DE_NEGOCIO.md — este módulo só implementa a conta certa, sem
 * carregar a fórmula antiga em nenhum lugar.
 * ----------------------------------------------------------------------------
 */

/**
 * Bloco de indicadores de UM anestesista num mês/ano.
 * Espelha as linhas 8–20 da aba INDICADORES.
 */
function indicadoresDoAnestesista(cirurgias, avaliacoes, nome, mes, ano) {
  var numCirurgias = 0;
  // Horas acumuladas em minutos inteiros (exato), convertidas só no retorno.
  var minReais = 0, minEstimadas = 0, minPendentes = 0, semHorarioReal = 0;
  var totalAnest = 0, recebidoAnest = 0;
  var qtdNotas = 0, qtdSemNota = 0;

  (cirurgias || []).forEach(function (c) {
    if (!mesmoTexto(c.anestesista, nome)) return;
    if (Number(c.mes) !== Number(mes) || Number(c.ano) !== Number(ano)) return;

    // NÚMERO DE CIRURGIAS conta só "Realizada" (COUNTIFS da planilha).
    if (cirurgiaExecutada(c)) numCirurgias++;

    // Já os valores e horas usam "<>Cancelada".
    if (cirurgiaContabilizavel(c)) {
      var mReal = calcMinutosReal(c);
      var mEstim = calcMinutosEstimado(c);
      if (mReal !== null) minReais += mReal;
      if (mEstim !== null) minEstimadas += mEstim;

      if (ehPendenciaHorario(c)) {
        semHorarioReal++;
        if (mEstim !== null) minPendentes += mEstim;
      }

      var valor = paraNumero(c.valor);
      if (valor !== null) {
        totalAnest += valor;
        if (ehSim(c.pago)) recebidoAnest += valor;
      }
    }

    // Notas fiscais: a planilha não filtra por status aqui.
    if (!vazio(c.nf)) qtdNotas++;
    if (ehSim(c.pago) && vazio(c.nf)) qtdSemNota++;
  });

  var numAvaliacoes = 0, totalAval = 0, recebidoAval = 0;
  var canceladas = indexarCanceladas(cirurgias);

  (avaliacoes || []).forEach(function (a) {
    if (!mesmoTexto(a.anestesista, nome)) return;
    if (Number(a.mes) !== Number(mes) || Number(a.ano) !== Number(ano)) return;

    // NÚMERO DE AVALIAÇÕES conta só as realizadas.
    if (avaliacaoRealizada(a)) numAvaliacoes++;
    if (!avaliacaoFaturavel(a, canceladas)) return;

    var valor = paraNumero(a.valor);
    if (valor !== null) {
      totalAval += valor;
      if (ehSim(a.pago)) recebidoAval += valor;
    }

    if (!vazio(a.nf)) qtdNotas++;
    if (ehSim(a.pago) && vazio(a.nf)) qtdSemNota++;
  });

  var pendenteAnest = totalAnest - recebidoAnest;
  var pendenteAval = totalAval - recebidoAval;

  return {
    anestesista: txt(nome),
    mes: Number(mes),
    ano: Number(ano),

    numCirurgias: numCirurgias,
    horasReais: minutosParaHoras(minReais),
    horasEstimadas: minutosParaHoras(minEstimadas),
    horasPendentes: minutosParaHoras(minPendentes),
    horasProjetadas: minutosParaHoras(minReais + minPendentes),
    minutosReais: minReais,
    minutosEstimadas: minEstimadas,
    semHorarioReal: semHorarioReal,
    numAvaliacoes: numAvaliacoes,

    totalAnest: arredondar2(totalAnest),
    recebidoAnest: arredondar2(recebidoAnest),
    pendenteAnest: arredondar2(pendenteAnest),

    totalAval: arredondar2(totalAval),
    recebidoAval: arredondar2(recebidoAval),
    pendenteAval: arredondar2(pendenteAval),

    // Conta correta: recebido de anestesias + recebido de avaliações.
    totalRecebido: arredondar2(recebidoAnest + recebidoAval),
    totalPendente: arredondar2(pendenteAnest + pendenteAval),

    qtdNotas: qtdNotas,
    qtdSemNota: qtdSemNota
  };
}

/**
 * Comparativo de todos os anestesistas no mês/ano (linhas 24–38).
 * Mesmas 8 colunas da planilha, na mesma ordem.
 */
function compararAnestesistas(anestesistas, cirurgias, avaliacoes, mes, ano) {
  return (anestesistas || []).map(function (a) {
    var i = indicadoresDoAnestesista(cirurgias, avaliacoes, a.nome, mes, ano);
    return {
      id: txt(a.id),
      anestesista: txt(a.nome),
      numCirurgias: i.numCirurgias,
      horasReais: i.horasReais,
      horasEstimadas: i.horasEstimadas,
      horasPendentes: i.horasPendentes,
      semHorarioReal: i.semHorarioReal,
      numAvaliacoes: i.numAvaliacoes,
      totalAnest: i.totalAnest,
      recebidoAnest: i.recebidoAnest,
      pendenteAnest: i.pendenteAnest,
      totalRecebido: i.totalRecebido
    };
  });
}

/** Totais do comparativo (linha de rodapé da tabela). */
function totaisComparativo(linhas) {
  var t = {
    numCirurgias: 0, horasReais: 0, horasEstimadas: 0, horasPendentes: 0, semHorarioReal: 0,
    numAvaliacoes: 0, totalAnest: 0, recebidoAnest: 0, pendenteAnest: 0, totalRecebido: 0
  };

  // Horas somadas em minutos para não acumular erro; o resto soma direto.
  var minReais = 0, minEstimadas = 0, minPendentes = 0;

  (linhas || []).forEach(function (l) {
    Object.keys(t).forEach(function (k) {
      if (k === 'horasReais' || k === 'horasEstimadas' || k === 'horasPendentes') return;
      t[k] += Number(l[k]) || 0;
    });
    minReais += horasParaMinutos(l.horasReais) || 0;
    minEstimadas += horasParaMinutos(l.horasEstimadas) || 0;
    minPendentes += horasParaMinutos(l.horasPendentes) || 0;
  });

  t.horasReais = minutosParaHoras(minReais);
  t.horasEstimadas = minutosParaHoras(minEstimadas);
  t.horasPendentes = minutosParaHoras(minPendentes);
  ['totalAnest', 'recebidoAnest', 'pendenteAnest', 'totalRecebido'].forEach(function (k) {
    t[k] = arredondar2(t[k]);
  });

  return t;
}

/**
 * Ranking por um critério, do maior para o menor.
 * Usado no dashboard para "quem mais operou / quem mais faturou".
 */
function ranquear(linhasComparativo, criterio) {
  criterio = criterio || 'numCirurgias';
  return (linhasComparativo || []).slice().sort(function (a, b) {
    return (Number(b[criterio]) || 0) - (Number(a[criterio]) || 0);
  });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    indicadoresDoAnestesista: indicadoresDoAnestesista,
    compararAnestesistas: compararAnestesistas,
    totaisComparativo: totaisComparativo,
    ranquear: ranquear
  };
}
