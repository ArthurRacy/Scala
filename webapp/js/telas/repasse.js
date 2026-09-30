/**
 * ============================================================================
 * TELA — Repasse
 * ============================================================================
 * Divisão igual do resultado do mês entre os anestesistas ativos, com a
 * chave PIX de cada um e o registro do que já foi repassado. A conta mora no
 * core (09b_repasse.js); esta tela só mostra e registra.
 * ============================================================================
 */
'use strict';

TELAS.repasse = (function () {

  var el = UI.el, icone = UI.icone;
  var kpi = COMP.kpi, cab = COMP.cabecalhoCartao, botaoSeg = COMP.botaoSeg, nomeMes = COMP.nomeMes;

  function repasse(app) {
    var store = app.store;
    var f = app.filtros.repasse;
    var r = store.repasse(app.ano, app.mes, { base: f.base });
    var raiz = el('div', { class: 'pilha' });

    /* ---- Como funciona ------------------------------------------------ */
    raiz.appendChild(el('div', { class: 'aviso aviso-info', style: 'margin:0' }, [
      icone('dinheiro'),
      el('div', { class: 'aviso-corpo' }, [
        el('strong', null, 'Divisão igual entre os ' + r.participantes + ' anestesistas ativos'),
        el('div', { class: 't-pq' }, f.base === 'competencia'
          ? 'Base: o que já foi recebido da produção de ' + nomeMes(app.mes) + ' (data da cirurgia), menos as despesas.'
          : 'Base: o dinheiro que entrou em ' + nomeMes(app.mes) + ' (data do pagamento), menos as despesas. ' +
            'Os centavos que sobram da divisão vão, um a um, para os primeiros da lista — a soma fecha exata.')
      ])
    ]));

    /* ---- Números do mês ----------------------------------------------- */
    var cotaTipica = r.linhas.length ? r.linhas[r.linhas.length - 1].cota : 0;
    raiz.appendChild(el('div', { class: 'grade grade-4' }, [
      kpi({ rotulo: 'Entrou no mês', valor: UI.moedaZero(r.bruto), valorPq: true,
            nota: r.entradas.length + ' lançamento(s) pago(s)' }),
      kpi({ rotulo: 'Despesas', valor: UI.moedaZero(r.despesas), valorPq: true,
            nota: r.obs || 'informe abaixo, se houver' }),
      kpi({ rotulo: 'Líquido a dividir', valor: UI.moedaZero(r.liquido), valorPq: true, tom: 'acento' }),
      kpi({ rotulo: 'Cota de cada um', valor: UI.moedaZero(cotaTipica), valorPq: true,
            nota: r.participantes + ' ativo(s)', tom: 'ok' })
    ]));

    /* ---- Quitado: só quando há o que repartir e todos receberam a cota ---- */
    if (repasseQuitado(r)) {
      raiz.appendChild(el('div', { class: 'aviso aviso-ok', style: 'margin:0' }, [
        UI.visto(false),
        el('div', { class: 'aviso-corpo' }, [
          el('strong', null, 'Repasse de ' + nomeMes(app.mes) + ' quitado'),
          el('div', { class: 't-pq' }, 'Os ' + r.linhas.length + ' anestesistas ativos já receberam a cota de ' +
            UI.moedaZero(cotaTipica) + '.')
        ])
      ]));
    }

    if (r.semDataPagamento) {
      raiz.appendChild(el('div', { class: 'aviso aviso-atencao', style: 'margin:0' }, [
        icone('alerta'),
        el('div', { class: 'aviso-corpo' }, [
          el('strong', null, r.semDataPagamento + ' lançamento(s) pago(s) sem DATA DO PAGAMENTO'),
          el('div', { class: 't-pq' }, 'Entraram pelo mês da cirurgia/avaliação. Preencha a data para o repasse cair no mês certo.')
        ])
      ]));
    }

    /* ---- Base e despesas ---------------------------------------------- */
    var campoDespesa = el('input', { class: 'entrada', type: 'number', min: '0', step: '0.01', id: 'repasse-despesas',
      value: r.despesas ? String(r.despesas) : '', placeholder: '0,00', style: 'max-width:140px', inputmode: 'decimal' });
    var campoObs = el('input', { class: 'entrada', type: 'text', id: 'repasse-obs', value: r.obs,
      placeholder: 'Do que são (aluguel, contador…)', 'aria-label': 'Do que são as despesas',
      style: 'flex:1;min-width:180px' });

    raiz.appendChild(el('div', { class: 'cartao' }, [
      cab('Base e despesas de ' + nomeMes(app.mes) + ' de ' + app.ano, 'as despesas saem antes da divisão'),
      el('div', { class: 'cartao-corpo' }, el('div', { class: 'linha', style: 'flex-wrap:wrap;gap:var(--e3)' }, [
        el('div', { class: 'segmentado' }, [
          botaoSeg('Dinheiro que entrou', f.base !== 'competencia', function () { f.base = 'caixa'; app.redesenhar(); }),
          botaoSeg('Produção do mês', f.base === 'competencia', function () { f.base = 'competencia'; app.redesenhar(); })
        ]),
        el('label', { for: 'repasse-despesas', class: 't-pq t-medio' }, 'Despesas (R$)'),
        campoDespesa, campoObs,
        el('button', {
          class: 'btn btn-primario btn-pq',
          onclick: function () {
            var res = store.salvarDespesasRepasse(app.ano, app.mes, campoDespesa.value, campoObs.value);
            if (!res.ok) { UI.erro('Não foi possível salvar', res.erros[0].msg); return; }
            app.salvarEredesenhar();
            UI.ok('Despesas do mês salvas');
          }
        }, [icone('check'), 'Salvar'])
      ]))
    ]));

    /* ---- Tabela ------------------------------------------------------- */
    raiz.appendChild(el('div', { class: 'cartao' }, [
      cab('Repasse por anestesista', nomeMes(app.mes) + ' de ' + app.ano, [
        el('button', { class: 'btn btn-pq', onclick: function () { baixarCSV(app, r); } }, [icone('baixar'), 'CSV'])
      ]),
      el('div', { class: 'cartao-corpo rente' }, UI.tabela({
        colunas: [
          { rotulo: 'Anestesista' }, { rotulo: 'Chave PIX' },
          { rotulo: 'Cota', num: true }, { rotulo: 'Já repassado', num: true }, { rotulo: 'Falta', num: true },
          { rotulo: '', classe: 'acoes' }
        ],
        linhas: r.linhas.map(function (l) {
          return [
            el('span', { class: 'celula-principal' }, l.nome),
            vazio(l.pix)
              ? el('span', { class: 't-alerta t-pq', title: 'Cadastre em Anestesistas' }, 'sem chave PIX')
              : el('div', { class: 'linha', style: 'gap:4px;flex-wrap:nowrap' }, [
                  el('span', { class: 'mono t-pq' }, l.pix),
                  el('button', {
                    class: 'btn btn-plano btn-icone btn-pq', title: 'Copiar chave PIX', 'aria-label': 'Copiar chave PIX de ' + l.nome,
                    onclick: function () { copiar(l.pix); }
                  }, icone('nota'))
                ]),
            el('strong', null, UI.moedaZero(l.cota)),
            l.repassado ? el('span', { class: 't-ok' }, UI.moedaZero(l.repassado)) : el('span', { class: 't-suave' }, '—'),
            Math.abs(l.diferenca) < 0.005
              ? el('span', { class: 'selo selo-ok sem-ponto' }, 'quitado')
              : el('span', { class: l.diferenca > 0 ? 't-alerta t-forte' : 't-perigo' }, UI.moedaZero(l.diferenca)),
            el('button', {
              class: 'btn btn-pq', onclick: function () { formRegistro(app, r, l); }
            }, [icone('check'), l.pagamentos.length ? 'Repasses (' + l.pagamentos.length + ')' : 'Registrar'])
          ];
        }),
        rodape: (function () {
          var cota = 0, rep = 0;
          r.linhas.forEach(function (l) { cota += Math.round(l.cota * 100); rep += Math.round(l.repassado * 100); });
          return ['Total (' + r.linhas.length + ')', '', UI.moedaZero(cota / 100), UI.moedaZero(rep / 100),
            UI.moedaZero((cota - rep) / 100), ''];
        })(),
        vazio: { icone: 'pessoas', titulo: 'Nenhum anestesista ativo', texto: 'Cadastre a equipe em Anestesistas.' }
      }))
    ]));

    return raiz;
  }

  /** Há valor a dividir e ninguém tem diferença a receber. */
  function repasseQuitado(r) {
    return r.liquido > 0 && r.linhas.length > 0 && r.linhas.every(function (l) { return Math.abs(l.diferenca) < 0.005; });
  }

  /** Copia a chave PIX (a API só funciona dentro do clique). */
  function copiar(texto) {
    try {
      navigator.clipboard.writeText(texto).then(function () { UI.ok('Chave PIX copiada', texto); },
        function () { UI.info('Selecione e copie', texto); });
    } catch (e) { UI.info('Selecione e copie', texto); }
  }

  function formRegistro(app, r, l) {
    var fValor = UI.campo({ rotulo: 'Valor repassado (R$)', nome: 'valor', tipo: 'number', passo: '0.01', min: '0',
      valor: l.diferenca > 0 ? l.diferenca.toFixed(2) : '', modo: 'decimal' });
    var fData = UI.campo({ rotulo: 'Data do repasse', nome: 'data', tipo: 'date', valor: hojeISO() });
    var form = UI.formulario([fValor, fData]);

    /* Valor maior do que falta: um zero a mais vira R$ 12.334 em vez de R$ 123,34.
       O primeiro clique só avisa; repetir o mesmo valor confirma. */
    var avisoAcima = el('div', { class: 'mt-3' });
    var confirmadoAcima = null;

    var historico = l.pagamentos.length ? el('div', { class: 'anexos mt-3' }, l.pagamentos.map(function (p) {
      var indice = registroDoMes(app, r).pagamentos.indexOf(p);
      return el('div', { class: 'anexo' }, [
        el('div', { class: 'anexo-corpo' }, [
          el('div', { class: 'anexo-nome' }, UI.moedaZero(p.valor) + ' em ' + UI.data(p.data)),
          el('div', { class: 't-mpq t-suave' }, 'registrado por ' + (p.registradoPor || '—') + ' em ' + (p.registradoEm || '—'))
        ]),
        el('button', {
          class: 'btn btn-plano btn-pq', onclick: function () {
            var res = app.store.removerPagamentoRepasse(app.ano, app.mes, indice);
            if (!res.ok) { UI.erro('Não foi possível desfazer', res.erros[0].msg); return; }
            UI.fecharModal(); app.salvarEredesenhar(); UI.ok('Registro desfeito', 'Anotado no LOG.');
          }
        }, 'Desfazer')
      ]);
    })) : null;

    UI.abrirModal({
      titulo: 'Repasse para ' + l.nome,
      sub: nomeMes(app.mes) + ' de ' + app.ano + ' · cota ' + UI.moedaZero(l.cota) +
        (vazio(l.pix) ? ' · sem chave PIX cadastrada' : ' · PIX ' + l.pix),
      tamanho: 'estreito',
      corpo: [el('div', { class: 'campo-grupo' }, [fValor.no, fData.no]), avisoAcima, historico],
      acoes: [
        el('div', { class: 'espaco' }),
        el('button', { class: 'btn', onclick: function () { UI.fecharModal(); } }, 'Fechar'),
        el('button', {
          class: 'btn btn-primario', onclick: function (ev) {
            var d = form.dados();
            var digitado = paraNumero(d.valor);
            var falta = Math.max(0, l.diferenca);
            if (digitado !== null && digitado > falta + 0.005 && confirmadoAcima !== digitado) {
              confirmadoAcima = digitado;
              UI.preencher(avisoAcima, el('div', { class: 'aviso aviso-atencao' }, [icone('alerta'),
                el('div', { class: 'aviso-corpo' }, [
                  el('strong', null, UI.moedaZero(digitado) + ' é mais do que falta (' + UI.moedaZero(falta) + ')'),
                  el('div', { class: 't-pq' }, 'Confira se não sobrou um zero ou a vírgula está no lugar. Se o valor está certo, ' +
                    'clique de novo em Registrar mesmo assim — dá para desfazer depois, e fica no LOG.')
                ])]));
              UI.preencher(ev.currentTarget, [icone('check'), 'Registrar mesmo assim']);
              return;
            }
            var res = app.store.registrarPagamentoRepasse(app.ano, app.mes, l.id, d.valor, d.data);
            if (!res.ok) { form.mostrarErros(res.erros); return; }
            UI.fecharModal(); app.salvarEredesenhar();
            // O último repasse do mês encerra o ciclo: aí sim, marco. Os outros são só registro.
            var depois = app.store.repasse(app.ano, app.mes, { base: app.filtros.repasse.base });
            if (repasseQuitado(depois)) {
              UI.marco('Repasse de ' + nomeMes(app.mes) + ' quitado',
                'Os ' + depois.linhas.length + ' anestesistas já receberam a cota.');
            } else {
              UI.ok('Repasse registrado', UI.moedaZero(d.valor) + ' para ' + l.nome + '.');
            }
          }
        }, [icone('check'), 'Registrar repasse'])
      ]
    });
  }

  function registroDoMes(app, r) {
    return registroDeRepasse(app.store.estado.repasses, r.mes);
  }

  function baixarCSV(app, r) {
    var m = [['ANESTESISTA', 'CHAVE PIX', 'COTA', 'JÁ REPASSADO', 'FALTA']];
    r.linhas.forEach(function (l) {
      m.push([l.nome, l.pix, DADOS.paraCelula(l.cota, 'moeda'), DADOS.paraCelula(l.repassado, 'moeda'),
        DADOS.paraCelula(l.diferenca, 'moeda')]);
    });
    DADOS.baixarCSV('REPASSE_' + r.mes, m);
  }

  return { render: repasse };
})();
