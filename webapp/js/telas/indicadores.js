/**
 * ============================================================================
 * TELA — Indicadores
 * ============================================================================
 * Produção do grupo: cirurgias, avaliações e horas por anestesista. Sem
 * valores em dinheiro por pessoa — o grupo divide o resultado igualmente.
 * Também fornece o comparativo (tabela e CSV) que o Painel reaproveita.
 * ============================================================================
 */
'use strict';

TELAS.indicadores = (function () {

  var el = UI.el, icone = UI.icone;
  var kpi = COMP.kpi, cab = COMP.cabecalhoCartao, nomeMes = COMP.nomeMes;

  function indicadores(app) {
    var store = app.store;
    var comp = store.comparativo(app.mes, app.ano);
    var totais = core.totaisComparativo(comp);
    var maxCir = Math.max.apply(null, [1].concat(comp.map(function (l) { return l.numCirurgias; })));

    var raiz = el('div', { class: 'pilha' });

    /* ---- Totais do grupo no mês ---------------------------------------- */
    raiz.appendChild(el('div', { class: 'grade grade-4' }, [
      kpi({ rotulo: 'Cirurgias realizadas', valor: UI.inteiro(totais.numCirurgias), tom: 'acento',
            nota: 'todo o grupo' }),
      kpi({ rotulo: 'Avaliações pré', valor: UI.inteiro(totais.numAvaliacoes), nota: 'realizadas' }),
      kpi({ rotulo: 'Horas estimadas', valor: UI.horasZero(totais.horasEstimadas),
            nota: 'previsto na marcação' }),
      kpi({ rotulo: 'Horas reais', valor: UI.horasZero(totais.horasReais),
            nota: totais.horasPendentes ? '+' + UI.horasZero(totais.horasPendentes) + ' a confirmar' : 'horário real efetivo',
            tom: totais.horasPendentes ? 'alerta' : null })
    ]));

    /* ---- Comparativo -------------------------------------------------- */
    raiz.appendChild(el('div', { class: 'cartao' }, [
      cab('Comparativo — todos os anestesistas', nomeMes(app.mes) + ' de ' + app.ano, [
        el('button', {
          class: 'btn btn-pq',
          onclick: function () { baixarComparativo(app, comp); }
        }, [icone('baixar'), 'CSV'])
      ]),
      el('div', { class: 'cartao-corpo rente' }, UI.tabela({
        colunas: [
          { rotulo: 'Anestesista' },
          { rotulo: 'Nº cirurgias', dica: 'Cirurgias realizadas no mês' },
          { rotulo: 'Nº avaliações pré', num: true },
          { rotulo: 'Horas estimadas', num: true, dica: 'Previsto na marcação da cirurgia' },
          { rotulo: 'Horas reais', num: true, dica: 'Horário real efetivo (início e término reais)' }
        ],
        linhas: comp.map(function (l) {
          return [
            el('span', { class: 'celula-principal' }, l.anestesista),
            GFX.barraCelula(l.numCirurgias, maxCir, UI.inteiro(l.numCirurgias)),
            UI.inteiro(l.numAvaliacoes),
            el('span', { class: 't-medio' }, UI.horasZero(l.horasEstimadas)),
            celulaHorasReais(l)
          ];
        }),
        rodape: ['Total', UI.inteiro(totais.numCirurgias), UI.inteiro(totais.numAvaliacoes),
          UI.horasZero(totais.horasEstimadas), UI.horasZero(totais.horasReais)],
        vazio: { icone: 'grafico', titulo: 'Sem movimento no mês' }
      }))
    ]));

    return raiz;
  }

  /**
   * Colunas do comparativo entre anestesistas, na tela e no CSV. Só produção:
   * os valores em dinheiro saíram porque o grupo divide o resultado igualmente.
   */
  var COLUNAS_COMPARATIVO = [
    { rotulo: 'ANESTESISTA',           campo: 'anestesista',    tipo: 'texto'   },
    { rotulo: 'Nº CIRURGIAS',          campo: 'numCirurgias',   tipo: 'inteiro' },
    { rotulo: 'Nº AVALIAÇÕES PRÉ',     campo: 'numAvaliacoes',  tipo: 'inteiro' },
    { rotulo: 'HORAS ESTIMADAS',       campo: 'horasEstimadas', tipo: 'duracao' },
    { rotulo: 'HORAS REAIS',           campo: 'horasReais',     tipo: 'duracao' }
  ];

  function baixarComparativo(app, comp) {
    var m = [COLUNAS_COMPARATIVO.map(function (c) { return c.rotulo; })];
    comp.forEach(function (l) {
      m.push(COLUNAS_COMPARATIVO.map(function (c) { return DADOS.paraCelula(l[c.campo], c.tipo); }));
    });
    DADOS.baixarCSV('INDICADORES_comparativo_' + app.mes + '_' + app.ano, m);
    UI.ok('CSV gerado');
  }

  /** Horas reais, com o que falta confirmar logo abaixo quando houver. */
  function celulaHorasReais(l) {
    if (!l.horasPendentes) return el('strong', null, UI.horasZero(l.horasReais));
    return el('div', null, [
      el('strong', null, UI.horasZero(l.horasReais)),
      el('div', { class: 'celula-apoio t-alerta', title: l.semHorarioReal + ' cirurgia(s) realizada(s) sem horário real' },
        '+' + UI.horasZero(l.horasPendentes) + ' a confirmar')
    ]);
  }

  return {
    render: indicadores,
    baixarComparativo: baixarComparativo,
    celulaHorasReais: celulaHorasReais
  };
})();
