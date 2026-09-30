/**
 * ============================================================================
 * TELA — Financeiro
 * ============================================================================
 * Indicadores mensais do grupo e ledger unificado (anestesias + avaliações).
 * ============================================================================
 */
'use strict';

TELAS.financeiro = (function () {

  var el = UI.el, icone = UI.icone;
  var kpi = COMP.kpi,
      cab = COMP.cabecalhoCartao,
      seletor = COMP.seletor,
      botaoSeg = COMP.botaoSeg,
      nomeMes = COMP.nomeMes,
      def = COMP.def;

  function financeiro(app) {
    var store = app.store;
    var f = app.filtros.financeiro;

    var ind = store.financeiro(app.mes, app.ano);
    var ledgerMes = store.ledger({ mes: app.mes, ano: app.ano });
    var sep = core.separarPorPagamento(ledgerMes);

    var lista = store.ledger({
      mes: f.todosOsMeses ? null : app.mes,
      ano: f.todosOsMeses ? null : app.ano,
      apenasPendentes: f.situacao === 'pendentes' || undefined,
      apenasSemNota: f.situacao === 'semNota' || undefined
    });

    if (f.tipo) lista = lista.filter(function (l) { return l.tipo === f.tipo; });
    if (f.situacao === 'pagos') lista = lista.filter(function (l) { return ehSim(l.pago); });
    if (f.texto) {
      lista = lista.filter(function (l) {
        var alvo = normalizar([l.id, l.paciente, l.anestesista, l.nf, l.obs, l.tipo].join(' '));
        return alvo.indexOf(normalizar(f.texto)) >= 0;
      });
    }

    var raiz = el('div', { class: 'pilha' });

    /* ---- KPIs -------------------------------------------------------- */
    raiz.appendChild(el('div', { class: 'grade grade-4' }, [
      kpi({ rotulo: 'Faturado no mês', valor: UI.moedaZero(ind.totalFaturado), valorPq: true,
            nota: ind.qtdLancamentos + ' lançamento(s)' }),
      kpi({ rotulo: 'Recebido', valor: UI.moedaZero(ind.totalRecebido), valorPq: true,
            nota: sep.qtdPagos + ' pago(s)', tom: 'ok' }),
      kpi({ rotulo: 'A receber', valor: UI.moedaZero(ind.totalPendente), valorPq: true,
            nota: sep.qtdPendentes + ' pendente(s)',
            tom: ind.totalPendente > 0 ? 'alerta' : null }),
      kpi({ rotulo: 'Pagos sem nota', valor: UI.inteiro(ind.semNota), valorPq: true,
            nota: ind.comNota + ' com nota emitida',
            tom: ind.semNota > 0 ? 'perigo' : 'ok' })
    ]));

    /* ---- Indicadores mensais (bloco da planilha) --------------------- */
    raiz.appendChild(el('div', { class: 'grade grade-2' }, [
      el('div', { class: 'cartao' }, [
        cab(SCHEMA.FINANCEIRO.titulo, nomeMes(app.mes) + ' de ' + app.ano),
        el('div', { class: 'cartao-corpo' }, el('div', { class: 'defs' }, [
          def('Valor total de anestesias', UI.moedaZero(ind.totalAnestesias)),
          def('Valor recebido de anestesias', UI.moedaZero(ind.recebidoAnestesias), 'ok'),
          def('Valor pendente de anestesias', UI.moedaZero(ind.pendenteAnestesias), 'pend'),
          def('Valor total de avaliações', UI.moedaZero(ind.totalAvaliacoes)),
          def('Valor recebido de avaliações', UI.moedaZero(ind.recebidoAvaliacoes), 'ok'),
          def('Valor pendente de avaliações', UI.moedaZero(ind.pendenteAvaliacoes), 'pend'),
          def('Total geral recebido', UI.moedaZero(ind.totalRecebido), 'ok', true),
          def('Total geral pendente', UI.moedaZero(ind.totalPendente), 'pend', true)
        ]))
      ]),
      el('div', { class: 'cartao' }, [
        cab('Composição', 'recebido x a receber'),
        el('div', { class: 'cartao-corpo' }, [
          GFX.empilhada([
            { rotulo: 'Recebido', valor: ind.totalRecebido, cor: 'var(--s5)' },
            { rotulo: 'A receber', valor: ind.totalPendente, cor: 'var(--s3)' }
          ], { formatar: UI.moedaZero, vazio: 'Nada lançado neste mês.' }),
          el('div', { class: 'mt-5' },
            GFX.rosca([
              { rotulo: 'Anestesias', valor: ind.totalAnestesias, cor: 'var(--s1)' },
              { rotulo: 'Avaliações pré', valor: ind.totalAvaliacoes, cor: 'var(--s2)' }
            ], {
              centroValor: UI.moedaZero(ind.totalFaturado), centroRotulo: 'faturado', formatar: UI.moedaZero, espessura: 16,
              vazio: 'Nada lançado neste mês.', descricao: 'Faturamento por origem'
            }))
        ])
      ])
    ]));

    /* ---- Evolução anual ---------------------------------------------- */
    var anual = store.financeiroAnual(app.ano);
    raiz.appendChild(el('div', { class: 'cartao' }, [
      cab('Evolução no ano', 'faturado x recebido por mês'),
      el('div', { class: 'cartao-corpo' },
        GFX.agrupadas(anual.meses.map(function (m) {
          return { rotulo: m.nome, faturado: m.totalFaturado, recebido: m.totalRecebido };
        }), {
          altura: 230,
          series: [
            { campo: 'faturado', rotulo: 'Faturado', cor: 'var(--s2)' },
            { campo: 'recebido', rotulo: 'Recebido', cor: 'var(--s5)' }
          ],
          formatar: UI.moedaZero, vazio: 'Nenhum valor lançado em ' + app.ano + '.',
          descricao: 'Faturado e recebido por mês'
        }))
    ]));

    /* ---- Ledger ------------------------------------------------------- */
    var somaLista = 0;
    lista.forEach(function (l) { somaLista += Number(l.valor) || 0; });

    raiz.appendChild(el('div', { class: 'cartao' }, [
      cab('Ledger unificado', 'anestesias e avaliações pré-anestésicas em uma só lista'),
      el('div', { class: 'cartao-corpo compacto', style: 'border-bottom:1px solid var(--borda)' },
        el('div', { class: 'linha' }, [
          el('div', { class: 'busca', style: 'flex:1;min-width:180px;max-width:280px' }, [
            icone('busca'),
            el('input', {
              class: 'entrada', type: 'search', value: f.texto || '', placeholder: 'Paciente, ID, nota…',
              'aria-label': 'Buscar lançamento',
              oninput: function (ev) { f.texto = ev.target.value; app.redesenhar(); }
            })
          ]),
          el('div', { class: 'segmentado' }, [
            botaoSeg('Todos', !f.situacao, function () { f.situacao = ''; app.redesenhar(); }),
            botaoSeg('Recebidos', f.situacao === 'pagos', function () { f.situacao = 'pagos'; app.redesenhar(); }),
            botaoSeg('Pendentes', f.situacao === 'pendentes', function () { f.situacao = 'pendentes'; app.redesenhar(); }),
            botaoSeg('Sem nota', f.situacao === 'semNota', function () { f.situacao = 'semNota'; app.redesenhar(); })
          ]),
          seletor({
            valor: f.tipo || '', largura: '150px',
            opcoes: [{ valor: '', rotulo: 'Todas as origens' }].concat(
              DOMINIOS.TIPO_LANCAMENTO.map(function (t) { return { valor: t, rotulo: t }; })),
            aoMudar: function (v) { f.tipo = v; app.redesenhar(); }
          }),
          el('div', { class: 'segmentado' }, [
            botaoSeg('Mês', !f.todosOsMeses, function () { f.todosOsMeses = false; app.redesenhar(); }),
            botaoSeg('Tudo', !!f.todosOsMeses, function () { f.todosOsMeses = true; app.redesenhar(); })
          ]),
          el('div', { class: 'espaco' }),
          el('span', { class: 't-pq t-suave' }, lista.length + ' lançamento(s) · ' + UI.moedaZero(somaLista)),
          el('button', {
            class: 'btn btn-pq', disabled: lista.length === 0,
            onclick: function () {
              var cols = SCHEMA.FINANCEIRO.ledger.colunas;
              var m = [cols.map(function (c) { return c.rotulo; })];
              lista.forEach(function (l) {
                m.push(cols.map(function (c) { return DADOS.paraCelula(l[c.campo], c.tipo); }));
              });
              DADOS.baixarCSV('FINANCEIRO_ledger', m);
              UI.ok('CSV gerado');
            }
          }, [icone('baixar'), 'CSV'])
        ])),
      el('div', { class: 'cartao-corpo rente' }, UI.tabela({
        colunas: [
          { rotulo: 'Data' }, { rotulo: 'Origem' }, { rotulo: 'ID' },
          { rotulo: 'Paciente' }, { rotulo: 'Anestesista' },
          { rotulo: 'Valor', num: true }, { rotulo: 'Pago' },
          { rotulo: 'Pagamento' }, { rotulo: 'Nota fiscal' }
        ],
        linhas: lista.slice(0, 400).map(function (l) {
          return [
            UI.data(l.data),
            el('span', { class: 'selo ' + (l.tipo === 'Anestesia' ? 'selo-info' : 'selo-confirmada') }, l.tipo),
            el('span', { class: 'mono t-suave' }, UI.ou(l.id)),
            el('span', { class: 'celula-principal' }, UI.ou(l.paciente)),
            UI.ou(l.anestesista),
            el('strong', null, UI.moeda(l.valor)),
            ehSim(l.pago)
              ? el('span', { class: 'selo selo-ok' }, 'Sim')
              : el('span', { class: 'selo selo-pendente' }, 'Não'),
            UI.data(l.dataPagamento),
            vazio(l.nf)
              ? el('span', { class: 'selo selo-pendente' }, l.statusNota)
              : el('span', { class: 'mono' }, l.nf)
          ];
        }),
        rodape: ['Total', '', '', '', '', UI.moedaZero(somaLista), '', '', ''],
        vazio: {
          icone: 'dinheiro',
          titulo: 'Nenhum lançamento',
          texto: 'O ledger só recebe cirurgias e avaliações com VALOR preenchido — lançamento sem valor não é receita.'
        }
      })),
      lista.length > 400 ? el('div', { class: 'cartao-pe' },
        'Mostrando 400 de ' + lista.length + ' lançamentos. Use o CSV para a lista completa.') : null
    ]));

    return raiz;
  }

  return {
    render: financeiro
  };
})();
