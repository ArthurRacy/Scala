/**
 * ============================================================================
 * 05_CIRURGIAS — Campos derivados da aba CIRURGIAS
 * ============================================================================
 * Reimplementa, em JavaScript puro, cada coluna calculada da aba CIRURGIAS.
 * Cada função abaixo carrega, no comentário, a fórmula original que ela
 * substitui — é o contrato de equivalência com a planilha.
 *
 * TASK-202  coluna P  ID_ANESTESISTA (auto)
 * TASK-203  coluna Q  POSIÇÃO DO ANESTESISTA NO RODÍZIO
 *           coluna F  TEMPO ESTIMADO
 *           coluna I  TEMPO REAL
 *           coluna T  STATUS DA AVALIAÇÃO PRÉ-ANESTÉSICA
 *           coluna Z  DIA DA SEMANA (auto)
 *           coluna AA ANESTESISTAS ESCALADOS NO DIA (auto)
 *           coluna AB SUGESTÃO ANESTESISTA - POSIÇÃO 1 (auto)
 *           coluna AC MÊS (auto)
 *           coluna AD ANO (auto)
 *
 * Todas as funções são PURAS: recebem o registro e os índices, devolvem valor.
 * Nenhuma escreve em nada. Isso é o que permite recalcular a base inteira sem
 * risco de efeito colateral.
 * ============================================================================
 */

/**
 * Coluna F — TEMPO ESTIMADO, em horas decimais.
 * =IF(OR($D2="",$E2=""),"",MOD($E2-$D2,1))
 * Sem arredondamento por parcela: quem soma, soma minutos (ver
 * calcMinutosEstimado) e arredonda uma única vez no fim.
 */
function calcTempoEstimado(c) {
  return duracaoHoras(c.inicioPrev, c.fimPrev);
}

/**
 * Coluna I — TEMPO REAL, em horas decimais.
 * =IF(OR($G2="",$H2=""),"",MOD($H2-$G2,1))
 */
function calcTempoReal(c) {
  return duracaoHoras(c.inicioReal, c.fimReal);
}

/** TEMPO ESTIMADO em minutos inteiros — unidade de acumulação. */
function calcMinutosEstimado(c) {
  return duracaoMinutos(c.inicioPrev, c.fimPrev);
}

/** TEMPO REAL em minutos inteiros — unidade de acumulação. */
function calcMinutosReal(c) {
  return duracaoMinutos(c.inicioReal, c.fimReal);
}

/**
 * TASK-401 — duração usada para efeito de pendência.
 * Quando a cirurgia já foi executada mas o horário real não foi fechado,
 * adota-se PROVISORIAMENTE o tempo estimado, e a linha é contada em
 * CIRURGIAS SEM HORÁRIO REAL PREENCHIDO. As horas reais em si NÃO recebem o
 * estimado: as duas colunas nunca se misturam (regra da aba HORAS).
 *
 * Devolve { horas, fonte } com fonte = 'REAL' | 'ESTIMADO' | 'INDISPONIVEL'.
 */
function calcTempoEfetivo(c) {
  var real = calcTempoReal(c);
  if (real !== null) return { horas: real, fonte: 'REAL' };

  var estimado = calcTempoEstimado(c);
  if (estimado !== null) return { horas: estimado, fonte: 'ESTIMADO' };

  return { horas: null, fonte: 'INDISPONIVEL' };
}

/**
 * TASK-401 — a linha entra no contador de pendência?
 * =COUNTIFS(...,$B:$B,"Realizada",CIRURGIAS!$I:$I,"")
 * Isto é: status Realizada E TEMPO REAL em branco.
 */
function ehPendenciaHorario(c) {
  if (!mesmoTexto(c.status, CONFIG.STATUS_EXECUTADO)) return false;
  return calcTempoReal(c) === null;
}

/**
 * TASK-202 — Coluna P: ID_ANESTESISTA (auto)
 * =IF($O2="","",IFERROR(XLOOKUP($O2,ANESTESISTAS!$B:$B,ANESTESISTAS!$A:$A),""))
 * `porNome` = índice de indexarAnestesistasPorNome().
 */
function calcIdAnestesista(c, porNome) {
  if (vazio(c.anestesista)) return '';
  var reg = (porNome || {})[normalizar(c.anestesista)];
  return reg ? txt(reg.id) : '';
}

/**
 * TASK-203 — Coluna Q: POSIÇÃO DO ANESTESISTA NO RODÍZIO
 * =IF(OR($C2="",$O2=""),"",IFERROR(XLOOKUP(TEXT($C2,"YYYY-MM-DD")&"|"&$O2,
 *      ESCALA_CONSOLIDADA!$G:$G, ESCALA_CONSOLIDADA!$C:$C),"fora da escala-base"))
 * `idxEscala` = índice de indexarConsolidada().
 */
function calcPosicaoRodizio(c, idxEscala) {
  if (vazio(c.data) || vazio(c.anestesista)) return '';
  if (!idxEscala) return '';
  return idxEscala.posicaoDe(c.data, c.anestesista);
}

/**
 * Coluna Z — DIA DA SEMANA (auto)
 * =IF($C2="","",CHOOSE(WEEKDAY($C2,2),"SEGUNDA-FEIRA",...,"DOMINGO"))
 */
function calcDiaSemana(c) {
  if (vazio(c.data)) return '';
  return diaDaSemana(c.data);
}

/**
 * Coluna AA — ANESTESISTAS ESCALADOS NO DIA (auto)
 * TEXTJOIN(" | ";VERDADEIRO; XLOOKUP das posições 1..5)
 */
function calcEscaladosNoDia(c, idxEscala) {
  if (vazio(c.data) || !idxEscala) return '';
  return idxEscala.escaladosDoDia(c.data);
}

/**
 * Coluna AB — SUGESTÃO ANESTESISTA - POSIÇÃO 1 (auto)
 * =IF($C2="","",IFERROR(XLOOKUP(TEXT($C2,"YYYY-MM-DD")&"|1",...),"fora da escala-base"))
 */
function calcSugestaoPosicao1(c, idxEscala) {
  if (vazio(c.data) || !idxEscala) return '';
  return idxEscala.nomeNaPosicao(c.data, 1);
}

/** Coluna AC — MÊS (auto): =IF($C2="","",MONTH($C2)) */
function calcMes(c) {
  if (vazio(c.data)) return '';
  return mesDe(c.data);
}

/** Coluna AD — ANO (auto): =IF($C2="","",YEAR($C2)) */
function calcAno(c) {
  if (vazio(c.data)) return '';
  return anoDe(c.data);
}

/**
 * Coluna T — STATUS DA AVALIAÇÃO PRÉ-ANESTÉSICA
 * =IF($S2<>"Sim","N/A",
 *     IF(IFERROR(XLOOKUP($A2,'AVALIAÇÕES PRÉ'!$B:$B,'AVALIAÇÕES PRÉ'!$J:$J),"")="Sim",
 *        "Realizada","Pendente"))
 *
 * `avaliacoesPorCirurgia` = { ID_CIRURGIA: [avaliações] }. A planilha usa
 * XLOOKUP, que pega a PRIMEIRA ocorrência; aqui, para ser mais útil sem mudar
 * o vocabulário de saída, consideramos "Realizada" se QUALQUER avaliação da
 * cirurgia estiver marcada como realizada.
 */
function calcStatusAvaliacao(c, avaliacoesPorCirurgia) {
  if (!ehSim(c.avaliacaoNec)) return 'N/A';

  var lista = (avaliacoesPorCirurgia || {})[txt(c.id)] || [];
  for (var i = 0; i < lista.length; i++) {
    if (ehSim(lista[i].realizada)) return 'Realizada';
  }
  return 'Pendente';
}

/**
 * Recalcula TODOS os campos automáticos de uma cirurgia, no lugar.
 * Devolve o próprio objeto, para permitir encadeamento.
 *
 * `ctx` = { porNome, idxEscala, avaliacoesPorCirurgia }
 *
 * Os campos MANUAIS são apenas normalizados (data para ISO, hora para HH:MM,
 * Sim/Não canônico) — nunca sobrescritos por regra de negócio.
 */
function recalcularCirurgia(c, ctx) {
  ctx = ctx || {};

  /* --- normalização dos campos digitados ------------------------------- */
  c.data = paraData(c.data);
  c.dataPagamento = paraData(c.dataPagamento);
  c.inicioPrev = paraHora(c.inicioPrev);
  c.fimPrev = paraHora(c.fimPrev);
  c.inicioReal = paraHora(c.inicioReal);
  c.fimReal = paraHora(c.fimReal);
  c.status = canonizar('STATUS_CIRURGIA', c.status) || txt(c.status);
  c.convenio = canonizar('CONVENIO', c.convenio) || txt(c.convenio);
  c.avaliacaoNec = paraSimNao(c.avaliacaoNec);
  c.pago = paraSimNao(c.pago);
  c.valor = paraNumero(c.valor);
  c.anestesista = nomeDoCadastro(c.anestesista, ctx.porNome);

  /* --- campos calculados ------------------------------------------------ */
  c.tempoEstimado = calcTempoEstimado(c);
  c.tempoReal = calcTempoReal(c);
  c.idAnestesista = calcIdAnestesista(c, ctx.porNome);
  c.posicao = calcPosicaoRodizio(c, ctx.idxEscala);
  c.statusAval = calcStatusAvaliacao(c, ctx.avaliacoesPorCirurgia);
  c.dia = calcDiaSemana(c);
  c.escalados = calcEscaladosNoDia(c, ctx.idxEscala);
  c.sugestaoPos1 = calcSugestaoPosicao1(c, ctx.idxEscala);
  c.mes = calcMes(c);
  c.ano = calcAno(c);

  return c;
}

/**
 * Recalcula uma lista inteira. Devolve a mesma lista (mutada no lugar), que é
 * o que a interface espera para não perder referências.
 */
function recalcularCirurgias(lista, ctx) {
  (lista || []).forEach(function (c) { recalcularCirurgia(c, ctx); });
  return lista;
}

/**
 * Grafia oficial do nome, a do cadastro. A validação aceita "fabricio
 * tavares" (sem acento, minúsculo), mas as chaves DATA+ANESTESISTA usam o
 * texto exato — sem esta normalização a cirurgia caía "fora da escala-base"
 * mesmo com o anestesista escalado no dia.
 */
function nomeDoCadastro(nome, porNome) {
  var n = txt(nome);
  if (!n || !porNome) return n;
  var reg = porNome[normalizar(n)];
  return reg ? txt(reg.nome) : n;
}

/* ------------------------------------------------------- consultas úteis -- */

/**
 * A cirurgia entra nos cálculos de horas/receita?
 * Espelha o critério "<>Cancelada" dos SUMIFS da planilha.
 */
function cirurgiaContabilizavel(c) {
  return !mesmoTexto(c.status, CONFIG.STATUS_EXCLUIDO);
}

/** A cirurgia foi executada? (critério "Realizada" dos COUNTIFS) */
function cirurgiaExecutada(c) {
  return mesmoTexto(c.status, CONFIG.STATUS_EXECUTADO);
}

/** Filtra por mês/ano de competência (colunas AC/AD). */
function filtrarPorCompetencia(lista, mes, ano) {
  return (lista || []).filter(function (c) {
    return Number(c.mes) === Number(mes) && Number(c.ano) === Number(ano);
  });
}

/**
 * Detecta conflito de agenda: mesmo anestesista, mesma data, horários
 * previstos que se sobrepõem. Não bloqueia nada — é aviso operacional.
 * Devolve [{ a, b, motivo }].
 */
function detectarConflitos(lista) {
  var porChave = {};
  var conflitos = [];

  (lista || []).forEach(function (c) {
    if (!cirurgiaContabilizavel(c)) return;
    if (vazio(c.data) || vazio(c.anestesista)) return;
    var k = c.data + '|' + normalizar(c.anestesista);
    (porChave[k] = porChave[k] || []).push(c);
  });

  Object.keys(porChave).forEach(function (k) {
    var grupo = porChave[k];
    for (var i = 0; i < grupo.length; i++) {
      for (var j = i + 1; j < grupo.length; j++) {
        if (horariosSobrepostos(grupo[i], grupo[j])) {
          conflitos.push({
            a: grupo[i], b: grupo[j],
            motivo: txt(grupo[i].anestesista) + ' tem duas cirurgias sobrepostas em ' + dataBR(grupo[i].data) + '.'
          });
        }
      }
    }
  });

  return conflitos;
}

/* ==================================================================== */
/*                     ATRIBUIÇÃO AUTOMÁTICA                            */
/* ==================================================================== */

/**
 * MENOR POSIÇÃO LIVRE — quem pega a cirurgia que está sendo marcada.
 *
 * Percorre as posições 1..5 do dia NA ORDEM e devolve o primeiro escalado que
 * não tenha outra cirurgia sobreposta. Encostar não conta como sobrepor: uma
 * de 07-13 e outra de 13-19 ficam com a MESMA pessoa de propósito — é assim
 * que o dia dela fecha antes de sobrar para o próximo.
 *
 * Cirurgia sem horário ainda preenchido cai na posição 1: nada pode conflitar
 * com um intervalo que não existe.
 *
 * `opcoes.ignorarId` não conta a própria cirurgia (caso de edição).
 * `opcoes.excluir`   pula nomes (usado quando alguém faltou).
 *
 * Devolve { nome, posicao, motivo }. Sem ninguém livre, `nome` vem vazio e o
 * `motivo` explica — nunca devolve alguém com conflito só para não vir vazio.
 */
function sugerirAnestesista(cirurgia, idxEscala, cirurgias, opcoes) {
  opcoes = opcoes || {};
  var resp = { nome: '', posicao: '', motivo: '' };
  if (!cirurgia || vazio(cirurgia.data) || !idxEscala) return resp;

  var dia = paraData(cirurgia.data);
  var ignorar = txt(opcoes.ignorarId);
  var excluir = (opcoes.excluir || []).filter(function (n) { return !vazio(n); });

  var doDia = (cirurgias || []).filter(function (c) {
    return paraData(c.data) === dia &&
      cirurgiaContabilizavel(c) &&
      (vazio(ignorar) || txt(c.id) !== ignorar);
  });

  var temHorario = !vazio(cirurgia.inicioPrev) && !vazio(cirurgia.fimPrev);
  var ocupados = [];

  for (var i = 0; i < CONFIG.POSICOES.length; i++) {
    var pos = CONFIG.POSICOES[i];
    var nome = idxEscala.nomeNaPosicao(cirurgia.data, pos);

    if (vazio(nome) || nome === CONFIG.FORA_DA_ESCALA) continue;
    if (excluir.some(function (n) { return mesmoTexto(n, nome); })) continue;

    var conflita = temHorario && doDia.some(function (c) {
      return mesmoTexto(c.anestesista, nome) && horariosSobrepostos(c, cirurgia);
    });

    if (!conflita) {
      return {
        nome: nome,
        posicao: pos,
        motivo: 'Posição ' + pos + ' — primeira livre no horário.'
      };
    }
    ocupados.push(pos + ' ' + nome);
  }

  resp.motivo = ocupados.length
    ? 'Os escalados do dia já têm cirurgia nesse horário (' + ocupados.join(', ') + ').'
    : 'Não há escala montada para ' + dataBR(cirurgia.data) + '.';
  return resp;
}

/**
 * Propõe para quem vão as cirurgias de alguém que faltou num dia.
 *
 * NÃO altera nada: devolve só a proposta, porque trocar o anestesista troca
 * também quem recebe pela anestesia — isso é decisão de gente, não de código.
 *
 * As cirurgias são remanejadas na ordem do horário, e cada uma já entra como
 * ocupação do novo dono antes de decidir a seguinte: sem isso, duas cirurgias
 * do mesmo horário cairiam as duas na posição 1.
 *
 * Devolve { data, ausente, movimentos:[...], semDestino:[...] }.
 */
function proporRemanejamento(data, nomeAusente, cirurgias, idxEscala) {
  var dia = paraData(data);
  var ausente = txt(nomeAusente);
  var out = { data: dia, ausente: ausente, movimentos: [], semDestino: [] };
  if (!dia || vazio(ausente)) return out;

  var doDia = (cirurgias || []).filter(function (c) {
    return paraData(c.data) === dia && cirurgiaContabilizavel(c);
  });

  var dela = doDia.filter(function (c) { return mesmoTexto(c.anestesista, ausente); });
  dela.sort(function (a, b) {
    var ma = horaParaMinutos(a.inicioPrev), mb = horaParaMinutos(b.inicioPrev);
    if (ma === null) return 1;
    if (mb === null) return -1;
    return ma - mb;
  });

  // Ocupação viva do dia: começa com as cirurgias dos outros e vai recebendo
  // as que forem sendo remanejadas.
  var ocupacao = doDia.filter(function (c) { return !mesmoTexto(c.anestesista, ausente); });

  dela.forEach(function (c) {
    var s = sugerirAnestesista(c, idxEscala, ocupacao, { ignorarId: c.id, excluir: [ausente] });

    if (vazio(s.nome)) {
      out.semDestino.push({ id: txt(c.id), paciente: txt(c.paciente), inicio: txt(c.inicioPrev),
                            fim: txt(c.fimPrev), motivo: s.motivo });
      return;
    }

    out.movimentos.push({
      id: txt(c.id),
      paciente: txt(c.paciente),
      inicio: txt(c.inicioPrev),
      fim: txt(c.fimPrev),
      sala: txt(c.sala),
      de: ausente,
      para: s.nome,
      posicao: s.posicao
    });

    ocupacao = ocupacao.concat([{
      id: txt(c.id), data: c.data, anestesista: s.nome, status: c.status,
      inicioPrev: c.inicioPrev, fimPrev: c.fimPrev
    }]);
  });

  return out;
}

/**
 * Dois intervalos previstos se cruzam? Encostar não conta como cruzar.
 * Início igual ao término é duração ZERO (como MOD(fim-início;1) na
 * planilha), não 24 horas — antes, uma cirurgia 07:00–07:00 "conflitava"
 * com o dia inteiro e ocupava a coluna toda no quadro.
 */
function horariosSobrepostos(c1, c2) {
  var a1 = horaParaMinutos(c1.inicioPrev), a2 = horaParaMinutos(c1.fimPrev);
  var b1 = horaParaMinutos(c2.inicioPrev), b2 = horaParaMinutos(c2.fimPrev);
  if (a1 === null || a2 === null || b1 === null || b2 === null) return false;
  if (a1 === a2 || b1 === b2) return false;
  if (a2 < a1) a2 += 1440;    // virada de meia-noite
  if (b2 < b1) b2 += 1440;
  return a1 < b2 && b1 < a2;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    calcTempoEstimado: calcTempoEstimado,
    calcTempoReal: calcTempoReal,
    calcMinutosEstimado: calcMinutosEstimado,
    calcMinutosReal: calcMinutosReal,
    calcTempoEfetivo: calcTempoEfetivo,
    ehPendenciaHorario: ehPendenciaHorario,
    calcIdAnestesista: calcIdAnestesista,
    calcPosicaoRodizio: calcPosicaoRodizio,
    calcDiaSemana: calcDiaSemana,
    calcEscaladosNoDia: calcEscaladosNoDia,
    calcSugestaoPosicao1: calcSugestaoPosicao1,
    calcMes: calcMes,
    calcAno: calcAno,
    calcStatusAvaliacao: calcStatusAvaliacao,
    recalcularCirurgia: recalcularCirurgia,
    recalcularCirurgias: recalcularCirurgias,
    cirurgiaContabilizavel: cirurgiaContabilizavel,
    cirurgiaExecutada: cirurgiaExecutada,
    filtrarPorCompetencia: filtrarPorCompetencia,
    detectarConflitos: detectarConflitos,
    horariosSobrepostos: horariosSobrepostos,
    nomeDoCadastro: nomeDoCadastro,
    sugerirAnestesista: sugerirAnestesista,
    proporRemanejamento: proporRemanejamento
  };
}
