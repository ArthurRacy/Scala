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
 *
 * QUEM DIVIDE (auditoria de 02/10/2026): o grupo do mês fica GUARDADO no registro
 * (`participantes: [{ id, nome }]`) na primeira gravação do mês (despesas ou
 * repasse). Antes, dividia-se pelos ativos DE HOJE: desativar alguém reescrevia a
 * cota de todos os meses passados e fazia o repasse já pago a essa pessoa sumir
 * da tela. Mês ainda sem gravação segue o cadastro de hoje (ainda não é dinheiro
 * mexido); registro antigo, sem grupo guardado, também. Pagamento a quem não é do
 * grupo do mês aparece numa linha à parte (`foraDoGrupo`) e entra no total.
 * ============================================================================
 */

/** Registro do mês em estado.repasses (ou um vazio, sem gravar). */
function registroDeRepasse(repasses, chave) {
  for (var i = 0; i < (repasses || []).length; i++) {
    if (repasses[i].mes === chave) return repasses[i];
  }
  return { mes: chave, despesas: null, obs: '', pagamentos: [] };
}

/** Quem divide o resultado hoje: os ativos com nome, na ordem do cadastro. [{ id, nome }]. */
function participantesAtivosDoRepasse(anestesistas) {
  return (anestesistas || []).filter(function (a) { return ehSim(a.ativo) && !vazio(a.nome); })
    .map(function (a) { return { id: txt(a.id), nome: txt(a.nome) }; });
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
 *           participantesGuardados,
 *           linhas:[{ id, nome, pix, cota, repassado, diferenca, pagamentos, foraDoGrupo }],
 *           totalRepassado, semDataPagamento }.
 * `participantes` é a QUANTIDADE do grupo que divide; `linhas` pode ter mais (os
 * pagos fora do grupo), e `totalRepassado` soma sempre todos os pagamentos.
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

  var guardados = Array.isArray(reg.participantes);
  var grupo = guardados ? reg.participantes : participantesAtivosDoRepasse(anestesistas);
  var cadastro = {};
  (anestesistas || []).forEach(function (a) { cadastro[txt(a.id)] = a; });
  var n = grupo.length;
  var cotaCent = n ? Math.floor(liquidoCent / n) : 0;
  var sobra = n ? liquidoCent - cotaCent * n : 0;

  function pagamentosDe(id) {
    return (reg.pagamentos || []).filter(function (p) { return txt(p.idAnestesista) === id; });
  }
  function somaCent(pags) {
    var c = 0;
    pags.forEach(function (p) { c += Math.round((paraNumero(p.valor) || 0) * 100); });
    return c;
  }

  var noGrupo = {};
  var linhas = grupo.map(function (g, i) {
    var id = txt(g.id);
    noGrupo[id] = true;
    var cad = cadastro[id];
    var cota = cotaCent + (i < sobra ? 1 : 0);
    var pags = pagamentosDe(id);
    var repassado = somaCent(pags);
    return {
      id: id, nome: txt(cad ? cad.nome : g.nome), pix: txt(cad && cad.pix),
      cota: cota / 100, repassado: repassado / 100, diferenca: (cota - repassado) / 100,
      pagamentos: pags, foraDoGrupo: false
    };
  });

  // Quem recebeu mas não é do grupo do mês (entrou depois, ou o registro é antigo e a
  // pessoa já saiu): linha à parte, para o repasse pago nunca sumir da tela.
  var jaVistos = {};
  (reg.pagamentos || []).forEach(function (p) {
    var id = txt(p.idAnestesista);
    if (!id || noGrupo[id] || jaVistos[id]) return;
    jaVistos[id] = true;
    var cad = cadastro[id];
    var pags = pagamentosDe(id);
    var repassado = somaCent(pags);
    linhas.push({
      id: id, nome: txt(cad ? cad.nome : p.nome), pix: txt(cad ? cad.pix : p.pix),
      cota: 0, repassado: repassado / 100, diferenca: -repassado / 100,
      pagamentos: pags, foraDoGrupo: true
    });
  });

  return {
    mes: chave, base: base, entradas: entradas,
    bruto: brutoCent / 100, despesas: arredondar2(despesas), liquido: liquidoCent / 100,
    participantes: n, participantesGuardados: guardados, obs: txt(reg.obs),
    linhas: linhas, totalRepassado: somaCent(reg.pagamentos || []) / 100,
    semDataPagamento: entradas.filter(function (e) { return e.semData; }).length
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    registroDeRepasse: registroDeRepasse,
    participantesAtivosDoRepasse: participantesAtivosDoRepasse,
    entradasDoMes: entradasDoMes,
    calcularRepasse: calcularRepasse
  };
}
