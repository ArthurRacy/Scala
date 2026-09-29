/**
 * ============================================================================
 * 09B_REPASSE — Divisão igual do resultado do mês entre os anestesistas
 * ============================================================================
 * Decisão do grupo: o resultado é dividido IGUALMENTE — por isso os valores
 * por anestesista saíram dos indicadores. Aqui se calcula quanto cada um
 * recebe e se registra o que já foi repassado (para qual chave PIX).
 *
 * BASE DO MÊS (padrão: 'caixa') — o dinheiro que ENTROU no mês:
 *   anestesias e avaliações com PAGO? = Sim e DATA DO PAGAMENTO no mês.
 *   Pago sem data de pagamento conta no mês da cirurgia/avaliação e aparece
 *   em `semDataPagamento`, para alguém completar.
 * Alternativa 'competencia': o recebido da produção do mês (igual à aba
 * FINANCEIRO), para quem prefere repassar pela data da cirurgia.
 *
 *   líquido = base - despesas do mês (informadas na tela)
 *   cota    = líquido / anestesistas ativos, em centavos; os centavos que
 *             sobram da divisão vão, um a um, para os primeiros da lista —
 *             a soma das cotas fecha EXATAMENTE com o líquido.
 *
 * O que já foi pago fica registrado com valor e data e nunca é recalculado:
 * se entrar mais dinheiro depois, aparece como diferença a repassar.
 * Dado próprio do sistema (estado.repasses) — não é aba da planilha.
 * ============================================================================
 */

/** Registro do mês em estado.repasses (ou um vazio, sem gravar). */
function registroDeRepasse(repasses, chave) {
  for (var i = 0; i < (repasses || []).length; i++) {
    if (repasses[i].mes === chave) return repasses[i];
  }
  return { mes: chave, despesas: null, obs: '', pagamentos: [] };
}

/** Lançamentos pagos que entram na base do mês, com a origem de cada um. */
function entradasDoMes(cirurgias, avaliacoes, ano, mes, base) {
  var chave = chaveMes(ano, mes);
  var canceladas = indexarCanceladas(cirurgias);
  var entradas = [];

  function considerar(tipo, id, valor, pago, dataPagamento, competencia) {
    if (!ehSim(pago)) return;
    var v = paraNumero(valor);
    if (v === null || v === 0) return;
    var dp = paraData(dataPagamento);
    var mesRef = base === 'competencia' ? competencia : (dp ? dp.slice(0, 7) : competencia);
    if (mesRef !== chave) return;
    entradas.push({ tipo: tipo, id: id, valor: v, dataPagamento: dp, semData: !dp });
  }

  (cirurgias || []).forEach(function (c) {
    if (!cirurgiaContabilizavel(c)) return;
    considerar('Anestesia', txt(c.id), c.valor, c.pago, c.dataPagamento, chaveCompetencia(c.mes, c.ano));
  });
  (avaliacoes || []).forEach(function (a) {
    if (!avaliacaoFaturavel(a, canceladas)) return;
    considerar('Avaliação pré', txt(a.id), a.valor, a.pago, a.dataPagamento, chaveCompetencia(a.mes, a.ano));
  });

  return entradas;
}

/**
 * Repasse de um mês.
 *   opcoes.base  'caixa' (padrão) | 'competencia'
 * Devolve { mes, base, entradas, bruto, despesas, liquido, participantes,
 *           linhas:[{ id, nome, pix, cota, repassado, diferenca, pagamentos }],
 *           totalRepassado, semDataPagamento }.
 */
function calcularRepasse(cirurgias, avaliacoes, anestesistas, repasses, ano, mes, opcoes) {
  opcoes = opcoes || {};
  var base = opcoes.base === 'competencia' ? 'competencia' : 'caixa';
  var chave = chaveMes(ano, mes);
  var reg = registroDeRepasse(repasses, chave);

  var entradas = entradasDoMes(cirurgias, avaliacoes, ano, mes, base);
  var brutoCent = 0;
  entradas.forEach(function (e) { brutoCent += Math.round(e.valor * 100); });

  var despesas = paraNumero(reg.despesas) || 0;
  var liquidoCent = Math.max(0, brutoCent - Math.round(despesas * 100));

  var ativos = (anestesistas || []).filter(function (a) { return ehSim(a.ativo) && !vazio(a.nome); });
  var n = ativos.length;
  var cotaCent = n ? Math.floor(liquidoCent / n) : 0;
  var sobra = n ? liquidoCent - cotaCent * n : 0;

  var totalRepassadoCent = 0;
  var linhas = ativos.map(function (a, i) {
    var cota = cotaCent + (i < sobra ? 1 : 0);
    var pags = (reg.pagamentos || []).filter(function (p) { return txt(p.idAnestesista) === txt(a.id); });
    var repassado = 0;
    pags.forEach(function (p) { repassado += Math.round((paraNumero(p.valor) || 0) * 100); });
    totalRepassadoCent += repassado;
    return {
      id: txt(a.id), nome: txt(a.nome), pix: txt(a.pix),
      cota: cota / 100, repassado: repassado / 100, diferenca: (cota - repassado) / 100,
      pagamentos: pags
    };
  });

  return {
    mes: chave, base: base, entradas: entradas,
    bruto: brutoCent / 100, despesas: arredondar2(despesas), liquido: liquidoCent / 100,
    participantes: n, obs: txt(reg.obs),
    linhas: linhas, totalRepassado: totalRepassadoCent / 100,
    semDataPagamento: entradas.filter(function (e) { return e.semData; }).length
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    registroDeRepasse: registroDeRepasse,
    entradasDoMes: entradasDoMes,
    calcularRepasse: calcularRepasse
  };
}
