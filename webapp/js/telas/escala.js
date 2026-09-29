/**
 * ============================================================================
 * TELA — Escala
 * ============================================================================
 * Escala do mês, escala-base do rodízio e a consolidada, com o registro de
 * substituições (ajuste manual).
 * ============================================================================
 */
'use strict';

TELAS.escala = (function () {

  var el = UI.el, icone = UI.icone;
  var kpi = COMP.kpi,
      cab = COMP.cabecalhoCartao,
      seletor = COMP.seletor,
      botaoSeg = COMP.botaoSeg,
      nomeMes = COMP.nomeMes,
      abaBtn = COMP.abaBtn;

  function escala(app) {
    var store = app.store;
    var f = app.filtros.escala;
    var linhas = store.escalaDoMes(app.ano, app.mes);

    var raiz = el('div', { class: 'pilha' });

    /* ---- Abas internas ------------------------------------------------ */
    raiz.appendChild(el('div', { class: 'abas' }, [
      abaBtn('Escala do mês', f.aba !== 'base' && f.aba !== 'consolidada',
        function () { f.aba = 'mes'; app.redesenhar(); }),
      abaBtn('Escala-base (rodízio)', f.aba === 'base',
        function () { f.aba = 'base'; app.redesenhar(); }),
      abaBtn('Consolidada', f.aba === 'consolidada',
        function () { f.aba = 'consolidada'; app.redesenhar(); })
    ]));

    if (f.aba === 'base') { raiz.appendChild(escalaBase(app)); return raiz; }
    if (f.aba === 'consolidada') { raiz.appendChild(escalaConsolidada(app)); return raiz; }

    /* ---- Escala do mês ------------------------------------------------ */
    var ajustadas = linhas.filter(function (l) { return ehSim(l.ajuste); });

    raiz.appendChild(el('div', { class: 'grade grade-4' }, [
      kpi({ rotulo: 'Dias com escala', valor: UI.inteiro(linhas.length / CONFIG.POSICOES.length),
            nota: 'segunda a sábado' }),
      kpi({ rotulo: 'Postos no mês', valor: UI.inteiro(linhas.length),
            nota: CONFIG.POSICOES.length + ' posições por dia' }),
      kpi({ rotulo: 'Ajustes manuais', valor: UI.inteiro(ajustadas.length),
            nota: ajustadas.length ? 'substituições registradas' : 'nenhuma substituição',
            tom: ajustadas.length ? 'alerta' : null }),
      kpi({ rotulo: 'Ciclo do rodízio', valor: CONFIG.POSICOES.length + ' semanas',
            nota: 'gira ' + CONFIG.PASSO_SEMANAL + ' posição por semana' })
    ]));

    raiz.appendChild(el('div', { class: 'aviso aviso-info', style: 'margin:0' }, [
      icone('troca'),
      el('div', { class: 'aviso-corpo' }, [
        el('strong', null, 'Como o rodízio é calculado'),
        el('div', { class: 't-pq' },
          'Cada dia da semana tem um elenco de 5 anestesistas na ESCALA-BASE. A cada semana o elenco gira uma posição, ' +
          'fechando o ciclo em ' + CONFIG.POSICOES.length + ' semanas. O ajuste manual troca apenas o anestesista efetivo daquele posto — ' +
          'o valor calculado fica preservado no histórico.')
      ])
    ]));

    /* ---- Filtro por anestesista --------------------------------------- */
    raiz.appendChild(el('div', { class: 'cartao' },
      el('div', { class: 'cartao-corpo compacto' },
        el('div', { class: 'linha' }, [
          seletor({
            valor: f.anestesista || '', largura: '220px',
            opcoes: [{ valor: '', rotulo: 'Todos os anestesistas' }].concat(
              store.nomesAnestesistas().map(function (n) { return { valor: n, rotulo: n }; })),
            aoMudar: function (v) { f.anestesista = v; app.redesenhar(); }
          }),
          el('div', { class: 'segmentado' }, [
            botaoSeg('Todos os dias', !f.soAjustes, function () { f.soAjustes = false; app.redesenhar(); }),
            botaoSeg('Só com ajuste', !!f.soAjustes, function () { f.soAjustes = true; app.redesenhar(); })
          ]),
          el('div', { class: 'espaco' }),
          el('button', {
            class: 'btn btn-pq',
            onclick: function () {
              DADOS.baixarCSV(infoMes(app.ano, app.mes).aba.replace(/ /g, '_'),
                DADOS.matrizDaAba('ESCALA_MENSAL', linhas));
              UI.ok('CSV gerado');
            }
          }, [icone('baixar'), 'CSV'])
        ]))));

    /* ---- Dias ---------------------------------------------------------- */
    var porData = {};
    linhas.forEach(function (l) { (porData[l.data] = porData[l.data] || []).push(l); });
    var datas = Object.keys(porData).sort();

    var grade = el('div', { class: 'escala-grade' });
    var mostrados = 0;

    datas.forEach(function (data) {
      var postos = porData[data].slice().sort(function (a, b) { return a.posicao - b.posicao; });

      if (f.anestesista) {
        var achou = postos.some(function (p) {
          return mesmoTexto(p.efetivo, f.anestesista) || mesmoTexto(p.calculado, f.anestesista);
        });
        if (!achou) return;
      }
      if (f.soAjustes && !postos.some(function (p) { return ehSim(p.ajuste); })) return;

      mostrados++;
      var temAjuste = postos.some(function (p) { return ehSim(p.ajuste); });

      grade.appendChild(el('div', { class: 'escala-dia' + (temAjuste ? ' ajustado' : '') }, [
        el('div', { class: 'escala-cab' }, [
          el('span', { class: 'escala-data' }, UI.data(data)),
          el('span', { class: 'escala-dia-sem' }, UI.diaSemana(diaDaSemana(data))),
          el('span', { class: 'escala-giro', title: 'Deslocamento do rodízio nesta data' },
            'giro ' + giroDaData(data))
        ]),
        el('div', { class: 'escala-postos' }, postos.map(function (p) {
          return postoNo(app, p, f.anestesista);
        }))
      ]));
    });

    if (mostrados === 0) {
      raiz.appendChild(el('div', { class: 'cartao' },
        UI.vazioEstado({
          icone: 'calendario',
          titulo: 'Nenhum dia com esses filtros',
          texto: f.anestesista
            ? txt(f.anestesista) + ' não aparece na escala de ' + nomeMes(app.mes) + ' com os filtros atuais.'
            : 'Ajuste os filtros acima.'
        })));
    } else {
      raiz.appendChild(grade);
    }

    return raiz;
  }

  /** Um posto (posição 1..5) de um dia. */
  function postoNo(app, p, destacar) {
    var substituido = ehSim(p.ajuste) && !vazio(p.substituto);
    var realce = destacar && (mesmoTexto(p.efetivo, destacar) || mesmoTexto(p.calculado, destacar));

    return el('div', {
      class: 'posto' + (substituido ? ' substituido' : '') + (realce ? ' realce' : '')
    }, [
      el('div', { class: 'posto-num', title: 'Posição ' + p.posicao }, p.posicao),
      el('div', { class: 'posto-corpo' }, [
        el('div', { class: 'posto-nome' }, UI.ou(p.efetivo, 'vago')),
        substituido
          ? el('div', { class: 'posto-meta', title: 'Calculado: ' + p.calculado + (p.motivo ? ' — ' + p.motivo : '') }, [
              el('s', null, p.calculado), ' → substituído',
              p.motivo ? ' · ' + p.motivo : ''
            ])
          : el('div', { class: 'posto-meta' }, UI.ou(p.idCalculado, ''))
      ]),
      el('button', {
        class: 'btn btn-plano btn-icone btn-pq posto-btn',
        title: substituido ? 'Alterar ou desfazer o ajuste' : 'Registrar substituição',
        'aria-label': substituido ? 'Alterar ou desfazer o ajuste' : 'Registrar substituição',
        onclick: function () { formAjuste(app, p); }
      }, icone(substituido ? 'lapis' : 'troca'))
    ]);
  }

  /** Formulário de ajuste manual da escala. */
  function formAjuste(app, p) {
    var store = app.store;
    var ativo = ehSim(p.ajuste) && !vazio(p.substituto);

    var fSub = UI.campo({
      rotulo: 'Anestesista substituto', nome: 'substituto', tipo: 'select',
      opcoes: store.nomesAnestesistas(), valor: p.substituto || '',
      dica: 'Quem realmente assume este posto.'
    });
    var fMotivo = UI.campo({
      rotulo: 'Motivo do ajuste', nome: 'motivo', valor: p.motivo || '',
      exemplo: 'Congresso, férias, permuta…', largo: true
    });

    var form = UI.formulario([fSub, fMotivo]);

    function aplicar() {
      var d = form.dados();
      var r = store.ajustarEscala(p.data, p.posicao, { substituto: d.substituto, motivo: d.motivo });
      if (!r.ok) {
        var soltos = form.mostrarErros(r.erros);
        if (soltos.length) UI.erro('Não foi possível registrar', soltos.join(' '));
        return;
      }
      UI.fecharModal();
      UI.ok('Substituição registrada', d.substituto + ' assume a posição ' + p.posicao + ' em ' + UI.data(p.data) + '.');
      app.salvarEredesenhar();
    }

    function desfazer() {
      var r = store.ajustarEscala(p.data, p.posicao, { ajuste: false });
      if (!r.ok) { UI.erro('Não foi possível desfazer', (r.erros[0] || {}).msg); return; }
      UI.fecharModal();
      UI.ok('Ajuste desfeito', 'A posição volta para ' + p.calculado + '.');
      app.salvarEredesenhar();
    }

    UI.abrirModal({
      titulo: 'Posição ' + p.posicao + ' · ' + UI.data(p.data),
      sub: UI.diaSemana(p.dia) + ' · giro ' + giroDaData(p.data) + ' do rodízio',
      tamanho: 'estreito',
      corpo: [
        el('div', { class: 'aviso aviso-info' }, [
          icone('info'),
          el('div', { class: 'aviso-corpo' }, [
            el('strong', null, 'Pelo rodízio: ' + UI.ou(p.calculado)),
            el('div', { class: 't-pq' },
              'Este valor nunca é apagado. O ajuste manual só define quem de fato assume o posto, ' +
              'mantendo o histórico do que o rodízio havia calculado.')
          ])
        ]),
        fSub.no,
        el('div', { class: 'mt-3' }, fMotivo.no)
      ],
      acoes: [
        ativo ? el('button', { class: 'btn btn-perigo', onclick: desfazer },
          [icone('x'), 'Desfazer ajuste']) : null,
        el('div', { class: 'espaco' }),
        el('button', { class: 'btn', onclick: function () { UI.fecharModal(); } }, 'Cancelar'),
        el('button', { class: 'btn btn-primario', onclick: aplicar },
          [icone('check'), ativo ? 'Atualizar' : 'Registrar substituição'])
      ]
    });
  }

  function escalaBase(app) {
    var store = app.store;
    var idx = indexarEscalaBase(store.estado.escalaBase);
    var rel = validarEscalaBase(store.estado.escalaBase, store.estado.anestesistas);

    var raiz = el('div', { class: 'pilha' });

    if (!rel.ok) {
      raiz.appendChild(el('div', { class: 'aviso aviso-erro', style: 'margin:0' }, [
        icone('alerta'),
        el('div', { class: 'aviso-corpo' }, [
          el('strong', null, 'A escala-base tem problemas'),
          el('ul', null, rel.erros.slice(0, 8).map(function (e) { return el('li', null, e.msg); }))
        ])
      ]));
    }

    var auto = store.escalaBaseAutomatica();

    raiz.appendChild(el('div', { class: 'cartao' }, [
      cab('Como a escala-base é montada',
          auto ? 'o sistema monta sozinho, do cadastro' : 'preenchida à mão, posto a posto'),
      el('div', { class: 'cartao-corpo' }, [
        el('div', { class: 'segmentado', style: 'margin-bottom:var(--e3)' }, [
          botaoSeg('Automática (alfabética)', auto, function () { trocarModoBase(app, true); }),
          botaoSeg('Manual', !auto, function () { trocarModoBase(app, false); })
        ]),
        el('div', { class: 't-pq t-medio' }, auto
          ? 'Os anestesistas ativos entram em ordem alfabética, 5 por dia, em blocos: segunda = 1º ao 5º, ' +
            'terça = 6º ao 10º, quarta = 11º ao 15º, e a fila recomeça na quinta. Com os 15 do grupo, cada um ' +
            'cai em 2 dias por semana. Cadastrar, desativar ou renomear alguém refaz esta tabela sozinho — ' +
            'por isso ela não é editável posto a posto neste modo.'
          : 'São 6 dias × 5 posições = 30 postos. A posição aqui é a POSIÇÃO INICIAL: na primeira ocorrência de ' +
            'cada dia da semana a ordem é exatamente esta, e a cada semana ela gira uma casa. Mudar algo aqui ' +
            'recalcula os três meses, preservando os ajustes manuais já registrados.')
      ])
    ]));

    DOMINIOS.DIA_SEMANA_ESCALA.forEach(function (dia) {
      var bloco = idx[dia] || {};

      raiz.appendChild(el('div', { class: 'cartao' }, [
        cab(UI.diaSemana(dia), CONFIG.POSICOES.length + ' posições'),
        el('div', { class: 'cartao-corpo rente' },
          el('div', { class: 'escala-postos' }, CONFIG.POSICOES.map(function (pos) {
            var item = bloco[pos] || { nome: '', id: '' };
            return el('div', { class: 'posto' }, [
              el('div', { class: 'posto-num' }, pos),
              el('div', { class: 'posto-corpo' }, [
                el('div', { class: 'posto-nome' + (vazio(item.nome) ? ' t-perigo' : '') },
                  UI.ou(item.nome, 'não definido')),
                el('div', { class: 'posto-meta mono' }, UI.ou(item.id, ''))
              ]),
              auto ? null : el('button', {
                class: 'btn btn-plano btn-icone btn-pq posto-btn',
                title: 'Trocar quem ocupa esta posição inicial',
                'aria-label': 'Trocar quem ocupa esta posição inicial',
                onclick: function () { formEscalaBase(app, dia, pos, item); }
              }, icone('lapis'))
            ]);
          })))
      ]));
    });

    return raiz;
  }

  /**
   * Liga/desliga a escala-base automática.
   * Ligar reescreve os 30 postos, o que muda quem trabalha em cada dia — isso
   * pede confirmação explícita, não é um clique de ida e volta.
   */
  function trocarModoBase(app, auto) {
    var store = app.store;
    if (store.escalaBaseAutomatica() === auto) return;

    function aplicar() {
      var r = store.definirModoEscalaBase(auto);
      if (!r.ok) { UI.erro('Não foi possível trocar o modo', (r.erros[0] || {}).msg); return; }
      app.salvarEredesenhar();
      UI.ok(auto ? 'Escala-base automática ligada' : 'Escala-base manual',
        auto ? 'Os 30 postos foram remontados em ordem alfabética.'
             : 'A última escala gerada foi mantida e agora pode ser editada à mão.');
    }

    if (!auto) { aplicar(); return; }

    UI.confirmar({
      titulo: 'Montar a escala-base sozinha?',
      rotulo: 'Montar automaticamente',
      aviso: 'Os 30 postos serão reescritos em ordem alfabética. Isso muda quem trabalha em cada dia da semana.',
      texto: 'Os ajustes manuais já registrados nas escalas mensais continuam valendo — só a base muda. ' +
             'Dá para voltar para o modo manual a qualquer momento.'
    }, aplicar);
  }

  function formEscalaBase(app, dia, pos, item) {
    var store = app.store;

    var fNome = UI.campo({
      rotulo: 'Anestesista', nome: 'nome', tipo: 'select',
      opcoes: store.nomesAnestesistas(), valor: item.nome || '',
      dica: 'Quem ocupa a posição ' + pos + ' na primeira ' + UI.diaSemana(dia).toLowerCase() + ' do ciclo.'
    });

    var form = UI.formulario([fNome]);

    function salvar() {
      var nome = form.dados().nome;
      if (vazio(nome)) { fNome.erro('Escolha um anestesista.'); return; }

      var novas = JSON.parse(JSON.stringify(store.estado.escalaBase));
      var diaCorrente = '', achou = false;

      novas.forEach(function (l) {
        var d = txt(l.dia) || diaCorrente;
        if (d) diaCorrente = d;
        if (d === dia && Number(l.posicao) === Number(pos)) {
          l.nome = nome;
          var reg = store.indices.porNome[normalizar(nome)];
          l.id = reg ? reg.id : '';
          achou = true;
        }
      });

      if (!achou) {
        var reg2 = store.indices.porNome[normalizar(nome)];
        novas.push({ dia: dia, posicao: pos, nome: nome, id: reg2 ? reg2.id : '' });
      }

      var r = store.definirEscalaBase(novas);
      if (!r.ok) {
        UI.erro('A escala-base ficaria inconsistente',
          r.erros.map(function (e) { return e.msg; }).join(' '));
        return;
      }

      UI.fecharModal();
      UI.ok('Escala-base atualizada', 'Os três meses de escala foram recalculados.');
      app.salvarEredesenhar();
    }

    UI.abrirModal({
      titulo: UI.diaSemana(dia) + ' · posição ' + pos,
      sub: 'Escala-base do rodízio',
      tamanho: 'estreito',
      corpo: [
        el('div', { class: 'aviso aviso-atencao' }, [
          icone('alerta'),
          el('div', { class: 'aviso-corpo' }, [
            el('strong', null, 'Isto recalcula a escala dos três meses'),
            el('div', { class: 't-pq' },
              'Os ajustes manuais já registrados são preservados. As cirurgias já lançadas não mudam, ' +
              'mas a coluna de posição no rodízio delas passa a refletir a nova escala.')
          ])
        ]),
        fNome.no
      ],
      acoes: [
        el('div', { class: 'espaco' }),
        el('button', { class: 'btn', onclick: function () { UI.fecharModal(); } }, 'Cancelar'),
        el('button', { class: 'btn btn-primario', onclick: salvar }, [icone('check'), 'Salvar'])
      ]
    });
  }

  function escalaConsolidada(app) {
    var cons = app.store.estado.consolidada;
    var f = app.filtros.escala;

    var lista = cons.filter(function (l) {
      if (!f.todosOsMeses && (Number(mesDe(l.data)) !== Number(app.mes) || Number(anoDe(l.data)) !== Number(app.ano))) return false;
      if (f.texto) {
        var alvo = normalizar([l.data, l.dia, l.efetivo, l.id, l.chavePosicao, l.chaveNome].join(' '));
        if (alvo.indexOf(normalizar(f.texto)) < 0) return false;
      }
      return true;
    });

    return el('div', { class: 'pilha' }, [
      el('div', { class: 'aviso aviso-info', style: 'margin:0' }, [
        icone('cadeado'),
        el('div', { class: 'aviso-corpo' }, [
          el('strong', null, 'Aba de apoio — inteiramente calculada'),
          el('div', { class: 't-pq' },
            'Une as três escalas mensais e monta as duas chaves compostas que a aba CIRURGIAS usa para achar ' +
            'a posição de um anestesista numa data. Nada aqui é digitado.')
        ])
      ]),

      el('div', { class: 'cartao' }, [
        cab('ESCALA_CONSOLIDADA', lista.length + ' de ' + cons.length + ' linhas', [
          el('div', { class: 'busca', style: 'width:220px' }, [
            icone('busca'),
            el('input', {
              class: 'entrada', type: 'search', value: f.texto || '', placeholder: 'Filtrar…',
              oninput: function (ev) { f.texto = ev.target.value; app.redesenhar(); }
            })
          ]),
          el('div', { class: 'segmentado' }, [
            botaoSeg('Mês', !f.todosOsMeses, function () { f.todosOsMeses = false; app.redesenhar(); }),
            botaoSeg('Tudo', !!f.todosOsMeses, function () { f.todosOsMeses = true; app.redesenhar(); })
          ]),
          el('button', {
            class: 'btn btn-pq',
            onclick: function () {
              DADOS.baixarCSV('ESCALA_CONSOLIDADA', DADOS.matrizDaAba('ESCALA_CONSOLIDADA', lista));
              UI.ok('CSV gerado');
            }
          }, [icone('baixar'), 'CSV'])
        ]),
        el('div', { class: 'cartao-corpo rente' }, UI.tabela({
          colunas: [
            { rotulo: 'Data' }, { rotulo: 'Dia da semana' }, { rotulo: 'Posição', num: true },
            { rotulo: 'Anestesista efetivo' }, { rotulo: 'ID' },
            { rotulo: 'Chave data+posição' }, { rotulo: 'Chave data+anestesista' }
          ],
          linhas: lista.slice(0, 500).map(function (l) {
            return [
              UI.data(l.data), UI.diaSemana(l.dia),
              el('span', { class: 'selo selo-pos' }, l.posicao),
              el('span', { class: 'celula-principal' }, UI.ou(l.efetivo)),
              el('span', { class: 'mono t-suave' }, UI.ou(l.id)),
              el('span', { class: 'mono t-mpq t-suave' }, l.chavePosicao),
              el('span', { class: 'mono t-mpq t-suave' }, l.chaveNome)
            ];
          }),
          vazio: { icone: 'calendario', titulo: 'Nenhuma linha', texto: 'Ajuste o filtro.' }
        })),
        lista.length > 500 ? el('div', { class: 'cartao-pe' },
          'Mostrando as primeiras 500 de ' + lista.length + ' linhas. Use o CSV para ver tudo.') : null
      ])
    ]);
  }

  return {
    render: escala,
    formAjuste: formAjuste
  };
})();
