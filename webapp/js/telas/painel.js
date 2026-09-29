/**
 * ============================================================================
 * TELA — Painel
 * ============================================================================
 * Visão consolidada do mês: KPIs, gráficos e resumo de produção por
 * anestesista.
 * ============================================================================
 */
'use strict';

TELAS.painel = (function () {

  var el = UI.el, icone = UI.icone;
  var kpi = COMP.kpi,
      cabecalhoCartao = COMP.cabecalhoCartao,
      nomeMes = COMP.nomeMes,
      corDoStatus = COMP.corDoStatus;

  /**
   * Escala de referência: a de hoje; se hoje não tem rodízio (domingo, ou antes
   * do início da escala), a do próximo dia que tem. É o primeiro valor do
   * sistema: abrir e ver quem está de plantão, sem lançar nada.
   */
  function escalaDeReferencia(app) {
    var hoje = hojeISO();
    var ano = anoDe(hoje), mes = mesDe(hoje);
    for (var i = 0; i < 3; i++) {
      if (app.store.temMes(ano, mes)) {
        var futuras = app.store.escalaDoMes(ano, mes).filter(function (l) { return paraData(l.data) >= hoje; });
        if (futuras.length) {
          var data = futuras.map(function (l) { return paraData(l.data); }).sort()[0];
          return {
            data: data, ehHoje: data === hoje,
            postos: futuras.filter(function (l) { return paraData(l.data) === data; })
              .sort(function (a, b) { return Number(a.posicao) - Number(b.posicao); })
          };
        }
      }
      mes++; if (mes > 12) { mes = 1; ano++; }
    }
    return null;
  }

  function diaPorExtenso(iso) {
    var d = new Date(iso + 'T12:00:00');
    return d.toLocaleDateString('pt-BR', { weekday: 'long' }) + ', ' + UI.data(iso);
  }

  function cartaoEscalaHoje(app) {
    var ref = escalaDeReferencia(app);
    if (!ref) return null;

    var semCirurgia = app.store.estado.cirurgias.length === 0;
    var corpo = [
      el('div', { class: 'escala-postos' }, ref.postos.map(function (p) {
        return el('div', { class: 'posto' }, [
          el('div', { class: 'posto-num', title: 'Posição ' + p.posicao }, p.posicao),
          el('div', { class: 'posto-corpo' }, [
            el('div', { class: 'posto-nome' }, UI.ou(p.efetivo, 'vago')),
            ehSim(p.ajuste) ? el('div', { class: 'posto-meta' }, 'substituição registrada') : null
          ])
        ]);
      }))
    ];
    if (semCirurgia) {
      corpo.push(el('div', { class: 'escala-hoje-aviso' }, [
        el('span', null, 'Nenhuma cirurgia lançada ainda. Ao lançar a primeira, ela aparece no quadro deste dia.'),
        el('span', { class: 'espaco' }),
        el('button', { class: 'btn btn-pq', onclick: function () { TELAS.cirurgias.form(app, null); } },
          [icone('mais'), 'Nova cirurgia'])
      ]));
    }

    return el('div', { class: 'cartao escala-hoje' }, [
      cabecalhoCartao(
        ref.ehHoje ? 'Escala de hoje' : 'Próxima escala',
        diaPorExtenso(ref.data) + (ref.ehHoje ? '' : ' · hoje não há rodízio'),
        [el('button', {
          class: 'btn btn-pq btn-primario',
          onclick: function () { app.filtros.quadro.data = ref.data; app.ir('quadro'); }
        }, 'Abrir quadro do dia')]
      )
    ].concat(corpo));
  }

  function painel(app) {
    var store = app.store;
    var d = store.dashboard(app.mes, app.ano);
    var k = d.kpis;
    var pend = store.pendencias({ mes: app.mes, ano: app.ano });
    var integridade = app.integridade();

    var raiz = el('div', { class: 'pilha' });

    /* ---- Faixa de alerta, só quando há o que resolver ---------------- */
    if (integridade.erros.length || pend.length) {
      var itens = [];
      if (integridade.erros.length) {
        itens.push(el('li', null, [
          el('strong', null, integridade.erros.length + ' ' +
            (integridade.erros.length === 1 ? 'inconsistência' : 'inconsistências')),
          ' de cadastro — ',
          el('a', { href: '#', onclick: function (e) { e.preventDefault(); app.ir('integridade'); } }, 'ver detalhes')
        ]));
      }
      if (pend.length) {
        itens.push(el('li', null, [
          el('strong', null, pend.length + ' ' +
            (pend.length === 1 ? 'cirurgia realizada' : 'cirurgias realizadas')),
          ' sem horário real preenchido — ',
          el('a', { href: '#', onclick: function (e) { e.preventDefault(); app.ir('horas'); } }, 'fechar horas')
        ]));
      }

      raiz.appendChild(el('div', { class: 'aviso aviso-atencao', style: 'margin:0' }, [
        icone('alerta'),
        el('div', { class: 'aviso-corpo' }, [
          el('strong', null, 'Há pendências no mês selecionado'),
          el('ul', null, itens)
        ])
      ]));
    }

    /* ---- Escala de hoje: o primeiro valor, sem lançar nada ------------ */
    var escalaHoje = cartaoEscalaHoje(app);
    if (escalaHoje) raiz.appendChild(escalaHoje);

    /* ---- KPIs operacionais ------------------------------------------- */
    raiz.appendChild(el('div', { class: 'grade grade-4' }, [
      kpi({
        rotulo: 'Cirurgias realizadas', valor: UI.inteiro(k.cirurgiasRealizadas),
        nota: k.cirurgiasTotal + ' lançadas no mês', tom: 'acento'
      }),
      kpi({
        rotulo: 'Horas de anestesia', valor: UI.horasZero(k.horasTotais),
        nota: k.semHorarioReal
          ? '+' + UI.horasZero(k.horasPendentes) + ' a confirmar'
          : 'todas as horas fechadas',
        tom: k.semHorarioReal ? 'alerta' : null
      }),
      kpi({
        rotulo: 'Avaliações pré', valor: UI.inteiro(k.numAvaliacoes),
        nota: k.avaliacoesPendentes ? k.avaliacoesPendentes + ' ainda pendentes' : 'nenhuma pendente'
      }),
      kpi({
        rotulo: 'Cancelamentos', valor: UI.inteiro(k.cirurgiasCanceladas),
        nota: UI.pct(k.taxaCancelamento) + ' dos desfechos',
        tom: k.taxaCancelamento > 15 ? 'alerta' : null
      })
    ]));

    /* ---- KPIs financeiros -------------------------------------------- */
    raiz.appendChild(el('div', { class: 'grade grade-4' }, [
      kpi({ rotulo: 'Faturado no mês', valor: UI.moedaZero(k.totalFaturado), valorPq: true,
            nota: 'anestesias + avaliações' }),
      kpi({ rotulo: 'Recebido', valor: UI.moedaZero(k.totalRecebido), valorPq: true,
            nota: UI.pct(k.taxaRecebimento) + ' do faturado', tom: 'ok' }),
      kpi({ rotulo: 'A receber', valor: UI.moedaZero(k.totalPendente), valorPq: true,
            nota: 'ainda não pago', tom: k.totalPendente > 0 ? 'alerta' : null }),
      kpi({ rotulo: 'Sem nota fiscal', valor: UI.inteiro(k.semNotaFiscal), valorPq: true,
            nota: 'procedimentos pagos sem NF',
            tom: k.semNotaFiscal > 0 ? 'perigo' : null })
    ]));

    /* ---- Composição do faturamento ----------------------------------- */
    raiz.appendChild(el('div', { class: 'cartao' }, [
      cabecalhoCartao('Composição do faturamento', nomeMes(app.mes) + ' de ' + app.ano),
      el('div', { class: 'cartao-corpo' }, [
        GFX.empilhada([
          { rotulo: 'Recebido', valor: k.totalRecebido, cor: 'var(--s5)' },
          { rotulo: 'A receber', valor: k.totalPendente, cor: 'var(--s3)' }
        ], { formatar: UI.moedaZero, vazio: 'Nenhum valor lançado neste mês.' })
      ])
    ]));

    /* ---- Gráficos ---------------------------------------------------- */
    raiz.appendChild(el('div', { class: 'grade grade-2' }, [
      el('div', { class: 'cartao' }, [
        cabecalhoCartao('Cirurgias por tipo', 'do mês, exceto canceladas · tipos da tabela TUSS'),
        el('div', { class: 'cartao-corpo' },
          GFX.barrasH(d.porTipo, {
            ocultarZero: true, cor: 'var(--s1)',
            formatar: function (v) { return UI.inteiro(v); },
            vazio: 'Nenhuma cirurgia lançada neste mês.',
            descricao: 'Cirurgias do mês por tipo de procedimento'
          }))
      ]),
      el('div', { class: 'cartao' }, [
        cabecalhoCartao('Situação das cirurgias', 'distribuição por status'),
        el('div', { class: 'cartao-corpo' },
          GFX.rosca(d.porStatus.map(function (s) {
            return { rotulo: s.rotulo, valor: s.valor, cor: corDoStatus(s.rotulo) };
          }), {
            centroRotulo: 'lançadas', vazio: 'Nada lançado neste mês.',
            descricao: 'Distribuição das cirurgias por status'
          }))
      ])
    ]));

    raiz.appendChild(el('div', { class: 'grade grade-2' }, [
      el('div', { class: 'cartao' }, [
        cabecalhoCartao('Cirurgias por mês', 'ano de ' + app.ano),
        el('div', { class: 'cartao-corpo' },
          GFX.barras(d.porMes, {
            altura: 220, cor: 'var(--s1)',
            formatar: function (v) { return UI.inteiro(v); },
            vazio: 'Nenhuma cirurgia realizada em ' + app.ano + '.',
            descricao: 'Cirurgias realizadas por mês'
          }))
      ]),
      el('div', { class: 'cartao' }, [
        cabecalhoCartao('Faturado x recebido', 'por mês, em reais'),
        el('div', { class: 'cartao-corpo' },
          GFX.agrupadas(d.receitaPorMes, {
            altura: 220,
            series: [
              { campo: 'faturado', rotulo: 'Faturado', cor: 'var(--s2)' },
              { campo: 'recebido', rotulo: 'Recebido', cor: 'var(--s5)' }
            ],
            formatar: UI.moedaZero,
            vazio: 'Nenhum valor lançado em ' + app.ano + '.',
            descricao: 'Comparativo entre faturado e recebido por mês'
          }))
      ])
    ]));

    return raiz;
  }

  return {
    render: painel
  };
})();
