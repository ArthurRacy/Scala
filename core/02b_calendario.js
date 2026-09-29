/**
 * ============================================================================
 * 02B_CALENDARIO — Meses do sistema: os da planilha e o horizonte móvel
 * ============================================================================
 * A planilha em uso tem três abas de escala (OUT, NOV e DEZ/2026). Se o
 * sistema parasse aí, em janeiro de 2027 ninguém mais seria escalado. Por
 * isso existem DOIS horizontes:
 *
 *   horizontePlanilha()  os 3 meses com aba própria — é o que o Apps Script
 *                        usa, porque ele lê e escreve exatamente essas abas.
 *   horizonteMovel()     de out/2026 até o mês atual + CONFIG.MESES_A_FRENTE,
 *                        estendido até a última cirurgia marcada. Avança
 *                        sozinho com o calendário — é o do web app/servidor.
 *
 * O rodízio não depende do horizonte: `giroDaData` conta semanas desde a
 * âncora para qualquer data, então janeiro/2027 continua a sequência de
 * dezembro sem salto.
 *
 * Cada mês é descrito por infoMes(): o mesmo formato das entradas de
 * CONFIG.MESES_ESCALA (sigla, rótulo "OUT/26", nome, aba "ESCALA OUTUBRO
 * 2026") mais `ano` e `chave` ('2026-10'), que é como as escalas mensais são
 * guardadas no estado.
 * ============================================================================
 */

var SIGLAS_MES = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];

/** 'YYYY-MM' — chave de um mês no estado (estado.escalas['2026-10']). */
function chaveMes(ano, mes) {
  return Number(ano) + '-' + pad2(mes);
}

/** Descrição completa de um mês, no mesmo formato de CONFIG.MESES_ESCALA. */
function infoMes(ano, mes) {
  ano = Number(ano);
  mes = Number(mes);
  if (!ano || !(mes >= 1 && mes <= 12)) return null;
  var nome = MESES_NOME[mes - 1];
  return {
    ano: ano,
    mes: mes,
    chave: chaveMes(ano, mes),
    sigla: SIGLAS_MES[mes - 1],
    rotulo: SIGLAS_MES[mes - 1] + '/' + String(ano).slice(-2),
    nome: nome,
    aba: 'ESCALA ' + nome.toUpperCase() + ' ' + ano
  };
}

/** Mês de uma data ISO ou de uma chave 'YYYY-MM', como {ano, mes}. */
function mesDaData(v) {
  var s = txt(v);
  var m = /^(\d{4})-(\d{1,2})/.exec(s);
  return m ? { ano: Number(m[1]), mes: Number(m[2]) } : null;
}

/** Soma n meses a (ano, mes). */
function somarMeses(ano, mes, n) {
  var total = Number(ano) * 12 + (Number(mes) - 1) + Number(n);
  return { ano: Math.floor(total / 12), mes: (total % 12) + 1 };
}

/** Negativo se `a` vem antes de `b`, zero se é o mesmo mês. */
function compararMeses(a, b) {
  return (Number(a.ano) * 12 + Number(a.mes)) - (Number(b.ano) * 12 + Number(b.mes));
}

/**
 * Data de hoje em ISO. CONFIG.HOJE fixa a data (teste ou demonstração);
 * em produção fica nulo e vale o relógio da máquina.
 */
function hojeISO() {
  return paraData(CONFIG.HOJE || new Date());
}

/** Os meses com aba própria na planilha (CONFIG.MESES_ESCALA). */
function horizontePlanilha() {
  return CONFIG.MESES_ESCALA.map(function (m) {
    return infoMes(m.ano || CONFIG.ANO_REFERENCIA, m.mes);
  });
}

/**
 * Horizonte que acompanha o calendário.
 *   opcoes.hoje           data de referência (padrão: hojeISO())
 *   opcoes.ultimoComDado  data da cirurgia mais distante já marcada
 *   opcoes.ateMes         mês até onde alguém navegou no calendário
 *
 * Começa no mês da âncora do rodízio e vai até o maior entre: o último mês
 * da planilha, hoje + CONFIG.MESES_A_FRENTE, e o mês da última cirurgia —
 * este último limitado a hoje + CONFIG.LIMITE_MESES_FUTURO, para um erro de
 * digitação ("2062") não gerar escala de décadas.
 */
function horizonteMovel(opcoes) {
  opcoes = opcoes || {};
  var hoje = paraData(opcoes.hoje) || hojeISO();
  var mesHoje = mesDaData(hoje);

  var inicio = mesDaData(CONFIG.ANCORA_RODIZIO);
  var planilha = horizontePlanilha();
  var fim = planilha.length ? planilha[planilha.length - 1] : inicio;

  var aFrente = somarMeses(mesHoje.ano, mesHoje.mes, CONFIG.MESES_A_FRENTE);
  if (compararMeses(aFrente, fim) > 0) fim = aFrente;

  var limite = somarMeses(mesHoje.ano, mesHoje.mes, CONFIG.LIMITE_MESES_FUTURO);
  [mesDaData(opcoes.ultimoComDado), opcoes.ateMes || null].forEach(function (u) {
    if (u && compararMeses(u, fim) > 0 && compararMeses(u, limite) <= 0) fim = u;
  });

  var saida = [];
  for (var m = inicio; compararMeses(m, fim) <= 0; m = somarMeses(m.ano, m.mes, 1)) {
    saida.push(infoMes(m.ano, m.mes));
  }
  return saida;
}

/**
 * Faixa de meses que o calendário deixa escolher: do início do rodízio até
 * hoje + CONFIG.LIMITE_MESES_FUTURO. Devolve { de: {ano,mes}, ate: {ano,mes} }.
 */
function faixaNavegavel(hoje) {
  var m = mesDaData(paraData(hoje) || hojeISO());
  return { de: mesDaData(CONFIG.ANCORA_RODIZIO), ate: somarMeses(m.ano, m.mes, CONFIG.LIMITE_MESES_FUTURO) };
}

/** O mês (ano, mes) dentro de um horizonte, ou null. */
function buscarMes(horizonte, ano, mes) {
  for (var i = 0; i < (horizonte || []).length; i++) {
    if (horizonte[i].ano === Number(ano) && horizonte[i].mes === Number(mes)) return horizonte[i];
  }
  return null;
}

/** Meses de um ano dentro do horizonte, em ordem. */
function mesesDoAno(horizonte, ano) {
  return (horizonte || []).filter(function (m) { return m.ano === Number(ano); });
}

/** Anos cobertos pelo horizonte, em ordem. */
function anosDoHorizonte(horizonte) {
  var anos = [];
  (horizonte || []).forEach(function (m) { if (anos.indexOf(m.ano) < 0) anos.push(m.ano); });
  return anos;
}

/** O mês já terminou (é anterior ao mês de `hoje`)? */
function mesEncerrado(info, hoje) {
  var atual = mesDaData(paraData(hoje) || hojeISO());
  return compararMeses(info, atual) < 0;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    SIGLAS_MES: SIGLAS_MES,
    chaveMes: chaveMes,
    infoMes: infoMes,
    mesDaData: mesDaData,
    somarMeses: somarMeses,
    compararMeses: compararMeses,
    hojeISO: hojeISO,
    horizontePlanilha: horizontePlanilha,
    horizonteMovel: horizonteMovel,
    faixaNavegavel: faixaNavegavel,
    buscarMes: buscarMes,
    mesesDoAno: mesesDoAno,
    anosDoHorizonte: anosDoHorizonte,
    mesEncerrado: mesEncerrado
  };
}
