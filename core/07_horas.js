/**
 * ============================================================================
 * 07_HORAS — Balanço de horas por anestesista/mês  (TASK-401 / MELHORIA 3)
 * ============================================================================
 * Reproduz a aba HORAS:
 *
 *   OUT/26 - REAIS      =SUMIFS(TEMPO REAL;  ANESTESISTA;nome; MÊS;10; ANO;2026; STATUS;"<>Cancelada")
 *   OUT/26 - ESTIMADAS  =SUMIFS(TEMPO ESTIM.;ANESTESISTA;nome; MÊS;10; ANO;2026; STATUS;"<>Cancelada")
 *   TOTAL REAIS         =SOMA(OUT+NOV+DEZ)   -- só reais
 *   TOTAL ESTIMADAS     =SOMA(OUT+NOV+DEZ)   -- só estimadas
 *   CIRURGIAS SEM HORÁRIO REAL PREENCHIDO
 *                       =COUNTIFS(ANESTESISTA;nome; STATUS;"Realizada"; TEMPO REAL;"")
 *
 * REGRA DE OURO DA ABA (está escrita na linha 2 da planilha):
 * "Os dois nunca são somados juntos (colunas separadas)."
 * Horas reais e horas estimadas moram em colunas distintas e JAMAIS entram na
 * mesma soma. O fallback da MELHORIA 3 respeita isso: quando falta o horário
 * real de uma cirurgia já realizada, o tempo estimado é adotado apenas na
 * coluna de PENDÊNCIA (horasPendentes), nunca dentro de TOTAL REAIS.
 *
 * Por isso o resultado traz quatro números por mês, e não dois:
 *   real          horas com horário real fechado        (= a planilha)
 *   estimada      horas previstas                       (= a planilha)
 *   pendente      estimado das realizadas sem hora real (novo, MELHORIA 3)
 *   projetada     real + pendente                       (novo, para gestão)
 * `real` e `estimada` continuam idênticos à planilha; os dois novos são
 * informação adicional, em campos próprios.
 * ============================================================================
 */

/**
 * Calcula o balanço de horas de um anestesista num mês.
 * Devolve { real, estimada, pendente, projetada, semHorarioReal, cirurgias }.
 */
function horasDoAnestesistaNoMes(cirurgias, nome, mes, ano) {
  // Acumulação em MINUTOS inteiros: exata, sem erro de ponto flutuante.
  var real = 0, estimada = 0, pendente = 0;
  var semHorarioReal = 0, contadas = 0;

  (cirurgias || []).forEach(function (c) {
    if (!mesmoTexto(c.anestesista, nome)) return;
    if (Number(c.mes) !== Number(mes) || Number(c.ano) !== Number(ano)) return;
    if (!cirurgiaContabilizavel(c)) return;          // "<>Cancelada"

    contadas++;

    var mReal = calcMinutosReal(c);
    var mEstim = calcMinutosEstimado(c);

    if (mReal !== null) real += mReal;
    if (mEstim !== null) estimada += mEstim;

    // TASK-401: realizada sem TEMPO REAL -> pendência + fallback no estimado.
    if (ehPendenciaHorario(c)) {
      semHorarioReal++;
      if (mEstim !== null) pendente += mEstim;
    }
  });

  return {
    real: minutosParaHoras(real),
    estimada: minutosParaHoras(estimada),
    pendente: minutosParaHoras(pendente),
    projetada: minutosParaHoras(real + pendente),
    // Minutos também expostos, para quem precisa somar sem perder precisão.
    minutosReal: real,
    minutosEstimada: estimada,
    minutosPendente: pendente,
    semHorarioReal: semHorarioReal,
    cirurgias: contadas
  };
}

/**
 * Monta a aba HORAS inteira: uma linha por anestesista, colunas por mês.
 * `meses` = lista de infoMes (padrão: os meses da planilha).
 * Cada mês vira três campos por chave ('real_2026-10', 'estim_…', 'pend_…')
 * e, para a aba HORAS da planilha, também pelo número do mês ('real_10'),
 * que é o `campo` do SCHEMA.HORAS — só tem sentido quando os meses são de
 * um ano só, como na planilha.
 */
function calcularHoras(anestesistas, cirurgias, meses) {
  meses = meses || horizontePlanilha();

  return (anestesistas || []).map(function (a) {
    var linha = {
      id: txt(a.id),
      nome: txt(a.nome),
      semHorarioReal: 0,
      detalhe: {}
    };

    // Totais acumulados em minutos inteiros e convertidos uma única vez.
    var minReais = 0, minEstimadas = 0, minPendentes = 0;

    meses.forEach(function (m) {
      var h = horasDoAnestesistaNoMes(cirurgias, a.nome, m.mes, m.ano);

      linha['real_' + m.chave] = h.real;
      linha['estim_' + m.chave] = h.estimada;
      linha['pend_' + m.chave] = h.pendente;
      linha['real_' + m.mes] = h.real;
      linha['estim_' + m.mes] = h.estimada;
      linha['pend_' + m.mes] = h.pendente;

      // TOTAL REAIS soma só reais; TOTAL ESTIMADAS soma só estimadas.
      minReais += h.minutosReal;
      minEstimadas += h.minutosEstimada;
      minPendentes += h.minutosPendente;
      linha.semHorarioReal += h.semHorarioReal;

      linha.detalhe[m.chave] = h;
    });

    linha.totalReais = minutosParaHoras(minReais);
    linha.totalEstimadas = minutosParaHoras(minEstimadas);
    linha.totalPendentes = minutosParaHoras(minPendentes);
    // Visão de gestão: o que já está fechado + o que falta fechar.
    linha.totalProjetado = minutosParaHoras(minReais + minPendentes);
    linha.minutosReais = minReais;
    linha.minutosEstimadas = minEstimadas;

    return linha;
  });
}

/**
 * Lista nominal das cirurgias que estão travando o fechamento de horas.
 * É o "de onde vem esse número" do contador CIRURGIAS SEM HORÁRIO REAL
 * PREENCHIDO — sem isso o usuário vê o contador e não sabe o que corrigir.
 */
function pendenciasDeHorario(cirurgias, filtro) {
  filtro = filtro || {};

  return (cirurgias || []).filter(function (c) {
    if (!ehPendenciaHorario(c)) return false;
    if (filtro.mes && Number(c.mes) !== Number(filtro.mes)) return false;
    if (filtro.ano && Number(c.ano) !== Number(filtro.ano)) return false;
    if (filtro.anestesista && !mesmoTexto(c.anestesista, filtro.anestesista)) return false;
    return true;
  }).map(function (c) {
    var estim = calcTempoEstimado(c);
    return {
      id: txt(c.id),
      data: c.data,
      anestesista: txt(c.anestesista),
      paciente: txt(c.paciente),
      procedimento: txt(c.procedimento),
      faltaInicio: vazio(c.inicioReal),
      faltaFim: vazio(c.fimReal),
      horasEstimadasAdotadas: estim,
      mensagem: 'Cirurgia ' + txt(c.id) + ' (' + dataBR(c.data) + ') está Realizada sem ' +
        (vazio(c.inicioReal) && vazio(c.fimReal) ? 'horário real' :
          (vazio(c.inicioReal) ? 'HORA INÍCIO REAL' : 'HORA TÉRMINO REAL')) +
        '. Adotado provisoriamente o tempo estimado' +
        (estim !== null ? ' (' + horasTexto(estim) + ')' : ' — que também está em branco') + '.'
    };
  });
}

/**
 * Colunas da tabela de horas para uma lista de meses, no padrão da aba
 * HORAS ("OUT/26 - REAIS" … "TOTAL ESTIMADAS"). Com os meses da planilha,
 * os rótulos são exatamente os do SCHEMA.HORAS; com outros meses, seguem o
 * mesmo padrão ("JAN/27 - REAIS").
 */
function colunasHoras(meses) {
  meses = meses || horizontePlanilha();
  var cols = [
    { rotulo: 'ID_ANESTESISTA', campo: 'id', tipo: 'texto' },
    { rotulo: 'NOME', campo: 'nome', tipo: 'texto' }
  ];
  meses.forEach(function (m) { cols.push({ rotulo: m.rotulo + ' - REAIS', campo: 'real_' + m.chave, tipo: 'duracao' }); });
  cols.push({ rotulo: 'TOTAL REAIS', campo: 'totalReais', tipo: 'duracao' });
  meses.forEach(function (m) { cols.push({ rotulo: m.rotulo + ' - ESTIMADAS', campo: 'estim_' + m.chave, tipo: 'duracao' }); });
  cols.push({ rotulo: 'TOTAL ESTIMADAS', campo: 'totalEstimadas', tipo: 'duracao' });
  cols.push({ rotulo: 'CIRURGIAS SEM HORÁRIO REAL PREENCHIDO', campo: 'semHorarioReal', tipo: 'inteiro' });
  return cols;
}

/** Totais gerais da aba HORAS (linha de rodapé), somados em minutos. */
function totaisHoras(linhasHoras) {
  var minReais = 0, minEstimadas = 0, minPendentes = 0, semHorarioReal = 0;

  (linhasHoras || []).forEach(function (l) {
    minReais += horasParaMinutos(l.totalReais) || 0;
    minEstimadas += horasParaMinutos(l.totalEstimadas) || 0;
    minPendentes += horasParaMinutos(l.totalPendentes) || 0;
    semHorarioReal += Number(l.semHorarioReal) || 0;
  });

  return {
    totalReais: minutosParaHoras(minReais),
    totalEstimadas: minutosParaHoras(minEstimadas),
    totalPendentes: minutosParaHoras(minPendentes),
    totalProjetado: minutosParaHoras(minReais + minPendentes),
    semHorarioReal: semHorarioReal
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    horasDoAnestesistaNoMes: horasDoAnestesistaNoMes,
    calcularHoras: calcularHoras,
    colunasHoras: colunasHoras,
    pendenciasDeHorario: pendenciasDeHorario,
    totaisHoras: totaisHoras
  };
}
