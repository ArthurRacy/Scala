/**
 * ============================================================================
 * TELA — Cirurgias
 * ============================================================================
 * Base principal — lista, filtros e o formulário que mostra ao vivo o que a
 * planilha calcula por fórmula (posição no rodízio, tempos, avaliação pré).
 * ============================================================================
 */
'use strict';

TELAS.cirurgias = (function () {

  var el = UI.el, icone = UI.icone;
  var secao = COMP.secao, seletor = COMP.seletor, botaoSeg = COMP.botaoSeg;

  /** Tabela mostra no máximo isto; o resto fica a um filtro ou CSV de distância. */
  var LIMITE_LINHAS = 300;

  function cirurgias(app) {
    var store = app.store;
    var f = app.filtros.cirurgias;

    var todas = store.estado.cirurgias.slice();
    var lista = filtrarCirurgias(todas, f, app);

    lista.sort(function (a, b) {
      if (a.data !== b.data) return String(b.data) < String(a.data) ? -1 : 1;
      return String(a.inicioPrev) < String(b.inicioPrev) ? -1 : 1;
    });

    var raiz = el('div', { class: 'pilha' });

    /* ---- Barra de filtros -------------------------------------------- */
    raiz.appendChild(el('div', { class: 'cartao' },
      el('div', { class: 'cartao-corpo compacto' },
        el('div', { class: 'linha' }, [
          el('div', { class: 'busca', style: 'flex:1;min-width:240px;max-width:340px' }, [
            icone('busca'),
            el('input', {
              class: 'entrada', type: 'search', value: f.texto || '',
              placeholder: 'Paciente, procedimento, cirurgião, ID…', 'aria-label': 'Buscar cirurgia',
              oninput: function (ev) { f.texto = ev.target.value; app.redesenhar(); }
            })
          ]),
          seletor({
            valor: f.status || '', largura: '150px',
            opcoes: [{ valor: '', rotulo: 'Todos os status' }].concat(
              DOMINIOS.STATUS_CIRURGIA.map(function (s) { return { valor: s, rotulo: s }; })),
            aoMudar: function (v) { f.status = v; app.redesenhar(); }
          }),
          seletor({
            valor: f.anestesista || '', largura: '190px',
            opcoes: [{ valor: '', rotulo: 'Todos os anestesistas' }].concat(
              store.nomesAnestesistas().map(function (n) { return { valor: n, rotulo: n }; })),
            aoMudar: function (v) { f.anestesista = v; app.redesenhar(); }
          }),
          el('div', { class: 'segmentado' }, [
            botaoSeg('Mês atual', !f.todosOsMeses, function () { f.todosOsMeses = false; app.redesenhar(); }),
            botaoSeg('Todos', !!f.todosOsMeses, function () { f.todosOsMeses = true; app.redesenhar(); })
          ]),
          el('div', { class: 'espaco' }),
          el('span', { class: 't-pq t-suave' },
            lista.length + ' de ' + todas.length + (todas.length === 1 ? ' cirurgia' : ' cirurgias')),
          el('button', {
            class: 'btn btn-pq', disabled: lista.length === 0,
            onclick: function () { baixarCirurgias(app, lista); }
          }, [icone('baixar'), 'CSV'])
        ]))));

    /* ---- Tabela ------------------------------------------------------ */
    raiz.appendChild(el('div', { class: 'cartao' }, [
      el('div', { class: 'cartao-corpo rente' }, UI.tabela({
        colunas: [
          { rotulo: 'ID' }, { rotulo: 'Data' }, { rotulo: 'Horário' },
          { rotulo: 'Paciente' }, { rotulo: 'Procedimento' },
          { rotulo: 'Anestesista' }, { rotulo: 'Pos.', dica: 'Posição no rodízio' },
          { rotulo: 'Status' }, { rotulo: 'Aval. pré' },
          { rotulo: 'Valor', num: true }, { rotulo: 'Pago' }, { rotulo: '', classe: 'acoes' }
        ],
        linhas: lista.slice(0, LIMITE_LINHAS).map(function (c) {
          var linha = [
            el('span', { class: 'mono t-suave' }, c.id),
            el('div', null, [
              el('div', { class: 'celula-principal' }, UI.data(c.data)),
              el('div', { class: 'celula-apoio' }, UI.diaSemana(c.dia))
            ]),
            horarioCelula(c),
            el('div', null, [
              el('div', { class: 'celula-principal' }, UI.ou(c.paciente)),
              c.convenio ? el('div', { class: 'celula-apoio' }, c.convenio) : null
            ]),
            el('div', { class: 'envolve' }, [
              el('div', null, UI.ou(c.procedimento)),
              c.cirurgiao ? el('div', { class: 'celula-apoio' }, c.cirurgiao) : null
            ]),
            el('div', null, [
              el('div', null, UI.ou(c.anestesista)),
              c.idAnestesista ? el('div', { class: 'celula-apoio mono' }, c.idAnestesista) : null
            ]),
            UI.seloPosicao(c.posicao),
            UI.seloStatus(c.status),
            UI.seloAvaliacao(c.statusAval),
            UI.moeda(c.valor),
            ehSim(c.pago)
              ? el('span', { class: 'selo selo-ok' }, 'Sim')
              : el('span', { class: 'selo selo-pendente' }, 'Não'),
            el('div', { class: 'linha', style: 'justify-content:flex-end;flex-wrap:nowrap' }, [
              el('button', {
                class: 'btn btn-plano btn-icone btn-pq' + (store.boletimDaCirurgia(c.id) ? ' com-boletim' : ''),
                title: store.boletimDaCirurgia(c.id) ? 'Abrir o boletim anestésico' : 'Criar o boletim anestésico',
                'aria-label': 'Boletim anestésico',
                onclick: function (ev) { ev.stopPropagation(); TELAS.boletim.abrir(app, c); }
              }, icone('nota')),
              el('button', {
                class: 'btn btn-plano btn-icone btn-pq', title: 'Editar', 'aria-label': 'Editar',
                onclick: function (ev) { ev.stopPropagation(); formCirurgia(app, c); }
              }, icone('lapis')),
              el('button', {
                class: 'btn btn-plano btn-icone btn-pq', title: 'Excluir', 'aria-label': 'Excluir',
                onclick: function (ev) { ev.stopPropagation(); excluirCirurgia(app, c); }
              }, icone('lixo'))
            ])
          ];
          linha.__onclick = function () { formCirurgia(app, c); };
          if (ehPendenciaHorario(c)) linha.__classe = 'destaque-linha';
          return { celulas: linha, __onclick: linha.__onclick, __classe: linha.__classe };
        }),
        vazio: {
          icone: 'bisturi',
          titulo: todas.length ? 'Nenhuma cirurgia com esses filtros' : 'Nenhuma cirurgia lançada',
          texto: todas.length
            ? 'Ajuste a busca ou os filtros acima para encontrar o que procura.'
            : 'Lance a primeira cirurgia. A posição no rodízio, o ID do anestesista e a avaliação pré são preenchidos automaticamente.',
          acao: el('button', {
            class: 'btn btn-primario',
            onclick: function () { formCirurgia(app, null); }
          }, [icone('mais'), 'Nova cirurgia'])
        }
      })),
      lista.length > LIMITE_LINHAS ? el('div', { class: 'cartao-pe' },
        'Mostrando ' + LIMITE_LINHAS + ' de ' + lista.length + ' cirurgias. Refine a busca ou use o CSV para ver tudo.') : null
    ]));

    return raiz;
  }

  /** Aplica busca e filtros sobre a lista de cirurgias. */
  function filtrarCirurgias(todas, f, app) {
    return todas.filter(function (c) {
      if (!f.todosOsMeses) {
        if (Number(c.mes) !== Number(app.mes) || Number(c.ano) !== Number(app.ano)) return false;
      }
      if (f.status && !mesmoTexto(c.status, f.status)) return false;
      if (f.anestesista && !mesmoTexto(c.anestesista, f.anestesista)) return false;

      if (f.texto) {
        var alvo = normalizar([c.id, c.paciente, c.procedimento, c.cirurgiao,
          c.anestesista, c.sala, c.convenio, c.nf, c.obs].join(' '));
        if (alvo.indexOf(normalizar(f.texto)) < 0) return false;
      }
      return true;
    });
  }

  /** Célula de horário: previsto e, quando houver, o real com a duração. */
  function horarioCelula(c) {
    var prev = (paraHora(c.inicioPrev) || '—') + '–' + (paraHora(c.fimPrev) || '—');
    var temReal = !vazio(c.inicioReal) || !vazio(c.fimReal);

    return el('div', null, [
      el('div', { class: 'num' }, prev),
      temReal
        ? el('div', { class: 'celula-apoio num' }, [
            'real ' + (paraHora(c.inicioReal) || '—') + '–' + (paraHora(c.fimReal) || '—'),
            c.tempoReal !== null ? ' · ' + UI.horas(c.tempoReal) : null
          ])
        : (ehPendenciaHorario(c)
            ? el('div', { class: 'celula-apoio t-alerta t-forte' }, 'falta horário real')
            : el('div', { class: 'celula-apoio t-suave' },
                c.tempoEstimado !== null ? 'prev. ' + UI.horas(c.tempoEstimado) : ''))
    ]);
  }

  /**
   * Abre o formulário de cirurgia. `existente` nulo = nova.
   * Os campos calculados aparecem em tempo real conforme o usuário escolhe
   * data e anestesista — é o que torna visível o que a planilha faz por
   * fórmula (TASK-202 e TASK-203).
   */
  /** `padroes` pré-preenche campos de uma cirurgia nova (ex.: o dia do quadro). */
  function formCirurgia(app, existente, padroes) {
    var store = app.store;
    var novo = !existente;
    var c = existente || padroes || {};

    var nomes = store.nomesAnestesistas();

    /* --- campos ------------------------------------------------------- */
    var fData = UI.campo({
      rotulo: 'Data da cirurgia', nome: 'data', tipo: 'date', obrigatorio: true,
      valor: c.data || sugerirData(app), aoMudar: atualizarCalculados
    });
    var fStatus = UI.campo({
      rotulo: 'Status', nome: 'status', tipo: 'select', vazioPermitido: false,
      opcoes: DOMINIOS.STATUS_CIRURGIA, valor: c.status || DOMINIOS.STATUS_CIRURGIA[0],
      aoMudar: atualizarCalculados
    });

    var fIniPrev = UI.campo({ rotulo: 'Início previsto', nome: 'inicioPrev', tipo: 'time', valor: c.inicioPrev || '07:00', aoMudar: atualizarCalculados });
    var fFimPrev = UI.campo({ rotulo: 'Término previsto', nome: 'fimPrev', tipo: 'time', valor: c.fimPrev || '', aoMudar: atualizarCalculados });
    var fTempoPrev = UI.campo({ rotulo: 'Tempo estimado', nome: '_tempoPrev', calculado: true, valor: '' });

    var fIniReal = UI.campo({ rotulo: 'Início real', nome: 'inicioReal', tipo: 'time', valor: c.inicioReal || '', aoMudar: atualizarCalculados });
    var fFimReal = UI.campo({ rotulo: 'Término real', nome: 'fimReal', tipo: 'time', valor: c.fimReal || '', aoMudar: atualizarCalculados });
    var fTempoReal = UI.campo({ rotulo: 'Tempo real', nome: '_tempoReal', calculado: true, valor: '' });

    var fPaciente = UI.campo({ rotulo: 'Nome do paciente', nome: 'paciente', obrigatorio: true, valor: c.paciente || '', largo: true });
    var fConvenio = UI.campo({ rotulo: 'Convênio', nome: 'convenio', tipo: 'select', opcoes: DOMINIOS.CONVENIO, valor: c.convenio || '' });
    var fTelefone = UI.campo({ rotulo: 'Telefone do paciente', nome: 'telefone', valor: c.telefone || '', exemplo: '(00) 00000-0000' });

    /* Procedimento: texto livre, com a lista TUSS como sugestão. O tipo que
       alimenta o gráfico "Cirurgias por tipo" aparece ao lado enquanto digita. */
    var idLista = 'lista-tuss-' + Math.random().toString(36).slice(2, 8);
    var listaProc = el('datalist', { id: idLista }, core.sugestoesProcedimento().map(function (s) {
      return el('option', { value: s.valor }, s.tipo);
    }));
    var fProc = UI.campo({
      rotulo: 'Procedimento / cirurgia', nome: 'procedimento', valor: c.procedimento || '', largo: true,
      lista: idLista, exemplo: 'Comece a digitar: mamoplastia, rinoplastia, lipo…',
      dica: 'Escolha da lista (tabela TUSS) ou escreva livremente.',
      aoDigitar: function () { atualizarTipo(); }
    });
    var fTipo = UI.campo({ rotulo: 'Tipo de cirurgia', nome: '_tipo', calculado: true, valor: '' });
    function atualizarTipo() { fTipo.definir(core.classificarTipoCirurgia(fProc.valor())); }
    atualizarTipo();
    var fCirurgiao = UI.campo({ rotulo: 'Cirurgião', nome: 'cirurgiao', valor: c.cirurgiao || '' });
    var fSala = UI.campo({ rotulo: 'Local / sala', nome: 'sala', valor: c.sala || '' });

    /**
     * Enquanto ninguém escolher à mão, o anestesista acompanha sozinho a data
     * e o horário: é sempre a menor posição livre do dia. Assim que alguém
     * escolhe no campo, o sistema para de mandar — e volta a mandar se o campo
     * for esvaziado.
     */
    var anestAutomatico = novo && vazio(c.anestesista);
    var sugestao = null;

    var fAnest = UI.campo({
      rotulo: 'Anestesista', nome: 'anestesista', tipo: 'select',
      opcoes: nomes, valor: c.anestesista || '',
      dica: 'Deixe em branco para o sistema escalar sozinho.',
      aoMudar: function () {
        anestAutomatico = vazio(fAnest.valor());
        atualizarCalculados();
      }
    });
    var fIdAnest = UI.campo({ rotulo: 'ID do anestesista', nome: '_idAnest', calculado: true, valor: '' });
    var fPosicao = UI.campo({ rotulo: 'Posição no rodízio', nome: '_posicao', calculado: true, valor: '' });

    var fAvalNec = UI.campo({
      rotulo: 'Avaliação pré necessária?', nome: 'avaliacaoNec', tipo: 'select',
      opcoes: DOMINIOS.SIM_NAO, vazioPermitido: false, valor: c.avaliacaoNec || 'Não',
      dica: 'Ao marcar "Sim", a linha da avaliação é criada sozinha.',
      aoMudar: atualizarCalculados
    });

    var fValor = UI.campo({ rotulo: 'Valor da anestesia', nome: 'valor', tipo: 'number', passo: '0.01', min: '0', valor: c.valor === null || c.valor === undefined ? '' : c.valor, modo: 'decimal' });
    var fPago = UI.campo({ rotulo: 'Pago?', nome: 'pago', tipo: 'select', opcoes: DOMINIOS.SIM_NAO, vazioPermitido: false, valor: c.pago || 'Não', aoMudar: atualizarCalculados });
    var fDataPag = UI.campo({ rotulo: 'Data do pagamento', nome: 'dataPagamento', tipo: 'date', valor: c.dataPagamento || '' });
    var fNF = UI.campo({ rotulo: 'Número da nota fiscal', nome: 'nf', valor: c.nf || '' });

    var fObs = UI.campo({ rotulo: 'Observações', nome: 'obs', tipo: 'textarea', valor: c.obs || '', largo: true, linhas: 2 });

    /* Área de informação viva: escalados do dia e avisos */
    var painelAuto = el('div', { class: 'painel-auto' });

    /* O boletim já existe (Operação › Boletim anestésico): aqui só se diz como chegar nele. */
    var boletimDela = novo ? null : store.boletimDaCirurgia(c.id);
    var textoBoletim = novo
      ? 'O registro intraoperatório (técnica, fármacos, sinais vitais, intercorrências) fica no boletim anestésico ' +
        'desta cirurgia. Depois de lançá-la, abra-a de novo e use "Criar boletim".'
      : boletimDela
        ? 'Esta cirurgia já tem o boletim ' + boletimDela.id + ' (' + String(boletimDela.status).toLowerCase() +
          '). Use o botão "Boletim" abaixo para abri-lo.'
        : 'O registro intraoperatório (técnica, fármacos, sinais vitais, intercorrências) fica no boletim anestésico. ' +
          'Use o botão "Criar boletim" abaixo.';

    var form = UI.formulario([
      fData, fStatus, fIniPrev, fFimPrev, fIniReal, fFimReal,
      fPaciente, fConvenio, fTelefone, fProc, fCirurgiao, fSala,
      fAnest, fAvalNec, fValor, fPago, fDataPag, fNF, fObs
    ]);

    /**
     * Recalcula os campos automáticos a cada mudança relevante, usando o
     * MESMO core que grava — não há uma "conta da tela" e outra "conta do
     * sistema".
     */
    function atualizarCalculados() {
      /* Atribuição automática — menor posição livre, antes de tudo, para os
         campos calculados já enxergarem quem foi escalado. */
      sugestao = null;
      if (anestAutomatico) {
        sugestao = store.sugerirAnestesista({
          data: fData.valor(), status: fStatus.valor(),
          inicioPrev: fIniPrev.valor(), fimPrev: fFimPrev.valor()
        }, c.id);
        fAnest.definir(sugestao.nome || '');
      }

      var parcial = {
        id: c.id || '(novo)',
        data: fData.valor(), status: fStatus.valor(),
        inicioPrev: fIniPrev.valor(), fimPrev: fFimPrev.valor(),
        inicioReal: fIniReal.valor(), fimReal: fFimReal.valor(),
        anestesista: fAnest.valor(), avaliacaoNec: fAvalNec.valor(),
        pago: fPago.valor()
      };

      recalcularCirurgia(parcial, {
        porNome: store.indices.porNome,
        idxEscala: store.indices.escala,
        avaliacoesPorCirurgia: store.indices.avaliacoesPorCirurgia
      });

      fTempoPrev.definir(parcial.tempoEstimado === null ? '—' : horasHHMM(parcial.tempoEstimado));
      fTempoReal.definir(parcial.tempoReal === null ? '—' : horasHHMM(parcial.tempoReal));
      fIdAnest.definir(parcial.idAnestesista || '—');
      fPosicao.definir(parcial.posicao === '' ? '—' : parcial.posicao);

      /* --- painel de contexto ---------------------------------------- */
      UI.limpar(painelAuto);

      if (parcial.escalados) {
        painelAuto.appendChild(el('div', { class: 'aviso aviso-info' }, [
          icone('pessoas'),
          el('div', { class: 'aviso-corpo' }, [
            el('strong', null, 'Escalados em ' + UI.data(parcial.data) +
              ' (' + UI.diaSemana(parcial.dia) + ')'),
            el('div', { class: 't-pq' }, parcial.escalados)
          ])
        ]));
      }

      if (anestAutomatico && sugestao && sugestao.nome) {
        painelAuto.appendChild(el('div', { class: 'aviso aviso-ok' }, [
          icone('check'),
          el('div', { class: 'aviso-corpo' }, [
            el('strong', null, 'Escalado automaticamente: ' + sugestao.nome),
            el('div', { class: 't-pq' },
              sugestao.motivo + ' Para trocar, é só escolher outro no campo Anestesista.')
          ])
        ]));
      }

      if (anestAutomatico && sugestao && !sugestao.nome && !vazio(fData.valor())) {
        painelAuto.appendChild(el('div', { class: 'aviso aviso-atencao' }, [
          icone('alerta'),
          el('div', { class: 'aviso-corpo' }, [
            el('strong', null, 'Ninguém livre para este horário'),
            el('div', { class: 't-pq' },
              sugestao.motivo + ' Escolha alguém à mão ou ajuste o horário.')
          ])
        ]));
      }

      if (parcial.posicao === CONFIG.FORA_DA_ESCALA) {
        painelAuto.appendChild(el('div', { class: 'aviso aviso-atencao' }, [
          icone('alerta'),
          el('div', { class: 'aviso-corpo' }, [
            el('strong', null, 'Anestesista fora da escala desta data'),
            el('div', { class: 't-pq' },
              txt(fAnest.valor()) + ' não está entre os 5 escalados. Se houve troca, registre o ajuste na tela Escala para o rodízio ficar coerente.')
          ])
        ]));
      }

      /* Mesmo anestesista com outra cirurgia cruzando este horário: avisa aqui,
         antes de gravar. Vale para o escolhido à mão e para o editado. */
      var cruzam = core.conflitosDaCirurgia({
        id: parcial.id, data: parcial.data, status: parcial.status, anestesista: parcial.anestesista,
        inicioPrev: parcial.inicioPrev, fimPrev: parcial.fimPrev
      }, store.estado.cirurgias);
      if (cruzam.length) {
        painelAuto.appendChild(el('div', { class: 'aviso aviso-atencao' }, [
          icone('alerta'),
          el('div', { class: 'aviso-corpo' }, [
            el('strong', null, 'Conflito de horário para ' + txt(parcial.anestesista)),
            el('div', { class: 't-pq' }, 'Já tem cirurgia neste horário: ' + cruzam.map(function (o) {
              return o.id + ' (' + UI.hora(o.inicioPrev) + '–' + UI.hora(o.fimPrev) + ', ' + UI.ou(o.paciente) + ')';
            }).join(' · ') + '. Dá para gravar assim, mas confira a escala do dia.')
          ])
        ]));
      }

      if (ehPendenciaHorario(parcial)) {
        painelAuto.appendChild(el('div', { class: 'aviso aviso-atencao' }, [
          icone('relogio'),
          el('div', { class: 'aviso-corpo' }, [
            el('strong', null, 'Cirurgia realizada sem horário real completo'),
            el('div', { class: 't-pq' },
              'Ela vai contar em CIRURGIAS SEM HORÁRIO REAL PREENCHIDO, e o tempo estimado' +
              (parcial.tempoEstimado !== null ? ' (' + horasHHMM(parcial.tempoEstimado) + ')' : '') +
              ' será adotado provisoriamente — sem entrar nas horas reais.')
          ])
        ]));
      }

      if (ehSim(fAvalNec.valor()) && novo) {
        painelAuto.appendChild(el('div', { class: 'aviso aviso-ok' }, [
          icone('check'),
          el('div', { class: 'aviso-corpo' }, [
            el('strong', null, 'A avaliação pré será criada automaticamente'),
            el('div', { class: 't-pq' },
              'Uma linha nova aparece em AVALIAÇÕES PRÉ já vinculada a esta cirurgia, com paciente, data, procedimento e anestesista preenchidos.')
          ])
        ]));
      }
    }

    atualizarCalculados();

    /* --- corpo do modal ----------------------------------------------- */
    var corpo = [
      painelAuto,

      secao('Agendamento', [
        el('div', { class: 'campo-grupo' }, [fData.no, fStatus.no]),
        el('div', { class: 'campo-grupo-3 mt-3' }, [fIniPrev.no, fFimPrev.no, fTempoPrev.no]),
        el('div', { class: 'campo-grupo-3 mt-3' }, [fIniReal.no, fFimReal.no, fTempoReal.no])
      ]),

      secao('Paciente', [
        el('div', { class: 'campo-grupo' }, [fPaciente.no]),
        el('div', { class: 'campo-grupo mt-3' }, [fConvenio.no, fTelefone.no])
      ]),

      secao('Procedimento', [
        listaProc,
        el('div', { class: 'campo-grupo' }, [fProc.no, fTipo.no]),
        el('div', { class: 'campo-grupo mt-3' }, [fCirurgiao.no, fSala.no])
      ]),

      secao('Equipe e rodízio', [
        el('div', { class: 'campo-grupo-3' }, [fAnest.no, fIdAnest.no, fPosicao.no])
      ]),

      secao('Avaliação pré-anestésica', [
        el('div', { class: 'campo-grupo' }, [fAvalNec.no])
      ]),

      secao('Financeiro', [
        el('div', { class: 'campo-grupo' }, [fValor.no, fPago.no]),
        el('div', { class: 'campo-grupo mt-3' }, [fDataPag.no, fNF.no])
      ]),

      secao('Boletim anestésico', [
        el('div', { class: 'aviso aviso-info' }, [
          icone('nota'),
          el('div', { class: 'aviso-corpo t-pq' }, textoBoletim)
        ])
      ]),

      secao('Observações', [el('div', { class: 'campo-grupo' }, [fObs.no])])
    ];

    /* --- salvar -------------------------------------------------------- */
    function salvar() {
      var d = form.dados();

      /* Remove os auxiliares de exibição (prefixo _). */
      Object.keys(d).forEach(function (k) { if (k.charAt(0) === '_') delete d[k]; });

      var pendentesAntes = store.pendencias({ mes: app.mes, ano: app.ano }).length;
      var r = novo ? store.adicionarCirurgia(d) : store.atualizarCirurgia(c.id, d);

      if (!r.ok) {
        var soltos = form.mostrarErros(r.erros);
        if (soltos.length) UI.erro('Não foi possível salvar', soltos.join(' '));
        else UI.erro('Confira os campos destacados');
        return;
      }

      form.limparErros();
      UI.fecharModal();
      UI.resultado(r, novo ? 'Cirurgia lançada' : 'Cirurgia atualizada');
      app.salvarEredesenhar();

      // A última pendência do mês saiu: quem fecha horas todo mês merece saber que acabou.
      if (pendentesAntes > 0 && store.pendencias({ mes: app.mes, ano: app.ano }).length === 0) {
        UI.marco('Horas de ' + COMP.nomeMes(app.mes) + ' fechadas',
          'Nenhuma cirurgia realizada ficou sem horário real.');
      }
    }

    UI.abrirModal({
      titulo: novo ? 'Nova cirurgia' : 'Cirurgia ' + c.id,
      sub: novo
        ? 'Os campos com cadeado são calculados pelo sistema.'
        : 'Paciente: ' + UI.ou(c.paciente) + ' · ' + UI.data(c.data),
      tamanho: 'largo',
      corpo: corpo,
      acoes: [
        novo ? null : el('button', {
          class: 'btn btn-perigo',
          onclick: function () { UI.fecharModal(); excluirCirurgia(app, c); }
        }, [icone('lixo'), 'Excluir']),
        novo ? null : el('button', {
          class: 'btn',
          onclick: function () { UI.fecharModal(); TELAS.boletim.abrir(app, c); }
        }, [icone('nota'), store.boletimDaCirurgia(c.id) ? 'Boletim' : 'Criar boletim']),
        el('div', { class: 'espaco' }),
        el('button', { class: 'btn', onclick: function () { UI.fecharModal(); } }, 'Cancelar'),
        el('button', { class: 'btn btn-primario', onclick: salvar },
          [icone('check'), novo ? 'Lançar cirurgia' : 'Salvar alterações'])
      ]
    });
  }

  /** Exclusão com confirmação, avisando sobre a cascata. */
  function excluirCirurgia(app, c) {
    var vinculadas = app.store.estado.avaliacoes.filter(function (a) {
      return txt(a.idCirurgia) === txt(c.id);
    });

    UI.confirmar({
      titulo: 'Excluir a cirurgia ' + c.id + '?',
      tipo: 'perigo',
      rotulo: 'Excluir',
      aviso: vinculadas.length
        ? [
            el('strong', null, 'Isto também exclui ' + vinculadas.length +
              (vinculadas.length === 1 ? ' avaliação pré-anestésica' : ' avaliações pré-anestésicas') + '.'),
            el('div', { class: 't-pq' }, 'Os PDFs de exames anexados a ela também são apagados. ' +
              'A exclusão fica registrada no LOG, mas o dado em si não volta.')
          ]
        : [el('strong', null, 'A exclusão fica registrada no LOG, mas o dado em si não volta.')],
      texto: UI.ou(c.paciente) + ' · ' + UI.data(c.data) + ' · ' + UI.ou(c.procedimento)
    }, function () {
      var r = app.store.removerCirurgia(c.id, { comAvaliacoes: true });
      if (!r.ok) { UI.erro('Não foi possível excluir', (r.erros[0] || {}).msg); return; }
      UI.ok('Cirurgia excluída', vinculadas.length
        ? vinculadas.length + ' avaliação(ões) também foram removidas.' : null);
      app.salvarEredesenhar();
    });
  }

  /**
   * Sugere a data de uma cirurgia nova: o primeiro dia com escala do mês
   * selecionado. Evita abrir o formulário com data vazia ou fora do horizonte.
   */
  function sugerirData(app) {
    var dias = datasUteisDoMes(app.ano, app.mes);
    return dias.length ? dias[0] : '';
  }

  function baixarCirurgias(app, lista) {
    DADOS.baixarCSV('CIRURGIAS_' + app.mes + '_' + app.ano, DADOS.matrizDaAba('CIRURGIAS', lista));
    UI.ok('CSV gerado', lista.length + ' linha(s) exportada(s).');
  }

  return {
    render: cirurgias,
    form: formCirurgia,
    excluir: excluirCirurgia
  };
})();
