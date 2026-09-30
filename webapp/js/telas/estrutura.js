/**
 * ============================================================================
 * TELA — Estrutura (área da coordenação)
 * ============================================================================
 * Registro por unidade, sala, turno e data: equipamentos de emergência,
 * capnógrafo, monitor multiparamétrico, carro de parada, quantos
 * anestesiologistas e quantas salas em funcionamento, sangue e hemoderivados,
 * treinamentos e simulações.
 *
 * O objetivo do módulo é o anestesista NÃO ter de repetir o estado da unidade
 * em cada paciente: a coordenação registra uma vez por turno e o atendimento
 * daquele período se liga ao registro sozinho (core/06d_estrutura.js).
 *
 * No modo servidor da clínica esta tela é do administrador — as operações de
 * estrutura estão em MUTACOES_SO_ADMIN.
 * ============================================================================
 */
'use strict';

TELAS.estrutura = (function () {

  var el = UI.el, icone = UI.icone;
  var cab = COMP.cabecalhoCartao, nomeMes = COMP.nomeMes;

  function num(v, casas) {
    if (v === null || v === undefined || v === '') return '';
    return typeof v === 'number' ? String(casas ? v.toFixed(casas) : v).replace('.', ',') : String(v);
  }

  /** No servidor da clínica, estrutura é da coordenação: a equipe só consulta. */
  function podeEditar(app) {
    return !app.servidor || (typeof SERVIDOR !== 'undefined' && SERVIDOR.ehAdmin());
  }

  function seloItem(valor) {
    if (!valor) return el('span', { class: 'selo selo-na' }, 'não verificado');
    if (valor === 'Disponível e funcionando') return el('span', { class: 'selo selo-ok' }, 'disponível');
    if (valor === 'Disponível com restrição') return el('span', { class: 'selo selo-pendente' }, 'com restrição');
    if (valor === 'Indisponível') return el('span', { class: 'selo selo-cancelada' }, 'indisponível');
    return el('span', { class: 'selo selo-na' }, 'não se aplica');
  }

  function resumoDoRegistro(r) {
    var criticos = ITENS_ESTRUTURA.filter(function (i) { return i.critico; });
    var faltando = criticos.filter(function (i) { return r.equipamentos[i.chave] === 'Indisponível'; }).length;
    var naoVerificados = criticos.filter(function (i) { return !r.equipamentos[i.chave]; }).length;
    return { faltando: faltando, naoVerificados: naoVerificados, criticos: criticos.length };
  }

  /* ------------------------------------------------------------ lista -- */

  function render(app) {
    var store = app.store;
    var filtro = app.filtros.estrutura;
    var registros = store.estrutura().filter(function (r) {
      if (filtro.todosOsMeses) return true;
      return r.data && Number(r.data.slice(5, 7)) === app.mes && Number(r.data.slice(0, 4)) === app.ano;
    }).filter(function (r) {
      if (!filtro.texto) return true;
      var alvo = normalizar([r.id, r.unidade, r.sala, r.turno, r.obs].join(' '));
      return alvo.indexOf(normalizar(filtro.texto)) >= 0;
    }).sort(function (a, b) { return a.data < b.data ? 1 : a.data > b.data ? -1 : 0; });

    var resumo = resumoEstrutura(registros);
    var raiz = el('div', { class: 'pilha' });

    var criticosIndisponiveis = resumo.itens.filter(function (i) { return i.critico && i.indisponiveis > 0; });
    raiz.appendChild(el('div', { class: 'grade grade-4' }, [
      COMP.kpi({ rotulo: 'Registros no período', valor: UI.inteiro(resumo.registros), tom: 'acento' }),
      COMP.kpi({ rotulo: 'Equipamentos essenciais indisponíveis', valor: UI.inteiro(criticosIndisponiveis.length),
        tom: criticosIndisponiveis.length ? 'alerta' : null, nota: 'itens com ao menos um registro em falta' }),
      COMP.kpi({ rotulo: 'Carro de parada checado', valor: resumo.carro.taxa === null ? '—' : UI.pct(resumo.carro.taxa),
        nota: resumo.carro.respondidos + ' registro(s) com resposta' }),
      COMP.kpi({ rotulo: 'Treinamentos e simulações', valor: UI.inteiro(resumo.treinamentos.length),
        nota: 'no período filtrado' })
    ]));

    raiz.appendChild(el('div', { class: 'cartao' }, [
      cab('Registros de estrutura', filtro.todosOsMeses ? 'Todos os meses' : nomeMes(app.mes) + ' de ' + app.ano, [
        el('button', { class: 'btn btn-pq', onclick: function () { baixarCSV(app, registros); } },
          [icone('baixar'), 'CSV']),
        podeEditar(app)
          ? el('button', { class: 'btn btn-primario btn-pq', onclick: function () { form(app, null); } },
            [icone('mais'), 'Novo registro'])
          : null
      ]),
      el('div', { class: 'cartao-corpo compacto' }, [
        el('div', { class: 'linha' }, [
          el('input', {
            class: 'entrada', type: 'search', placeholder: 'Unidade, sala, turno ou observação',
            'aria-label': 'Buscar registro de estrutura',
            value: filtro.texto, style: 'min-width:220px;flex:1',
            oninput: function (ev) { filtro.texto = ev.target.value; app.redesenhar(); }
          }),
          el('label', { class: 'marcar' }, [
            (function () {
              var c = el('input', { type: 'checkbox',
                onchange: function (ev) { filtro.todosOsMeses = ev.target.checked; app.redesenhar(); } });
              c.checked = !!filtro.todosOsMeses;
              return c;
            })(),
            el('span', null, 'Todos os meses')
          ])
        ])
      ]),
      el('div', { class: 'cartao-corpo rente' }, UI.tabela({
        colunas: [
          { rotulo: 'Data' }, { rotulo: 'Turno' }, { rotulo: 'Unidade' }, { rotulo: 'Sala' },
          { rotulo: 'Essenciais' }, { rotulo: 'Carro de parada' }, { rotulo: 'Equipe', num: true },
          { rotulo: '', classe: 'acoes' }
        ],
        linhas: registros.map(function (r) {
          var st = resumoDoRegistro(r);
          return [
            UI.dataCurta(r.data),
            r.turno || '—',
            el('span', { class: 'celula-principal' }, r.unidade || '—'),
            r.sala || 'toda a unidade',
            st.faltando
              ? el('span', { class: 'selo selo-cancelada' }, st.faltando + ' indisponível(is)')
              : st.naoVerificados
                ? el('span', { class: 'selo selo-pendente' }, st.naoVerificados + ' não verificado(s)')
                : el('span', { class: 'selo selo-ok' }, 'tudo verificado'),
            seloCarro(r),
            el('div', null, [
              el('strong', null, num(r.anestesiologistas) || '—'),
              el('div', { class: 'celula-apoio' },
                (r.salasFuncionando === null ? '—' : r.salasFuncionando) + ' sala(s)')
            ]),
            el('div', { class: 'linha', style: 'justify-content:flex-end;flex-wrap:nowrap' }, [
              el('button', { class: 'btn btn-pq', onclick: function () { form(app, r); } },
                podeEditar(app) ? 'Abrir' : 'Ver')
            ])
          ];
        }),
        vazio: { icone: 'escudo', titulo: 'Nenhum registro de estrutura',
          texto: 'A coordenação registra uma vez por unidade, sala e turno. Os atendimentos do período se ligam sozinhos.' }
      }))
    ]));

    if (resumo.registros) raiz.appendChild(cartaoResumo(resumo));
    if (resumo.treinamentos.length) raiz.appendChild(cartaoTreinamentos(resumo));

    return raiz;
  }

  function seloCarro(r) {
    if (r.carroParada.checado === RESPOSTA_SIM) {
      return el('div', null, [
        el('span', { class: 'selo selo-ok' }, 'checado'),
        r.carroParada.dataChecagem ? el('div', { class: 'celula-apoio' }, UI.dataCurta(r.carroParada.dataChecagem)) : null
      ]);
    }
    if (r.carroParada.checado === RESPOSTA_NAO) return el('span', { class: 'selo selo-cancelada' }, 'não checado');
    if (r.carroParada.disponivel === RESPOSTA_NAO) return el('span', { class: 'selo selo-cancelada' }, 'indisponível');
    return el('span', { class: 'selo selo-na' }, 'sem informação');
  }

  function cartaoResumo(resumo) {
    return el('div', { class: 'cartao' }, [
      cab('Disponibilidade no período',
        'A taxa é calculada só sobre os registros em que o item foi verificado — item não verificado não conta como falta'),
      el('div', { class: 'cartao-corpo rente' }, UI.tabela({
        colunas: [{ rotulo: 'Item' }, { rotulo: 'Verificados', num: true }, { rotulo: 'Disponíveis', num: true },
          { rotulo: 'Indisponíveis', num: true }, { rotulo: 'Não verificados', num: true },
          { rotulo: 'Disponibilidade', num: true }],
        linhas: resumo.itens.map(function (i) {
          return [
            el('div', null, [
              el('span', { class: 'celula-principal' }, i.rotulo),
              i.critico ? el('div', { class: 'celula-apoio' }, 'essencial') : null
            ]),
            UI.inteiro(i.verificados), UI.inteiro(i.disponiveis),
            i.indisponiveis ? el('strong', { class: 't-perigo' }, UI.inteiro(i.indisponiveis)) : '0',
            i.naoVerificados ? el('span', { class: 't-alerta' }, UI.inteiro(i.naoVerificados)) : '0',
            i.taxa === null ? '—' : UI.pct(i.taxa)
          ];
        })
      }))
    ]);
  }

  function cartaoTreinamentos(resumo) {
    return el('div', { class: 'cartao' }, [
      cab('Treinamentos e simulações de emergência', resumo.treinamentos.length + ' registro(s)'),
      el('div', { class: 'cartao-corpo rente' }, UI.tabela({
        colunas: [{ rotulo: 'Data' }, { rotulo: 'Tema' }, { rotulo: 'Tipo' }, { rotulo: 'Unidade' },
          { rotulo: 'Participantes' }, { rotulo: 'Horas', num: true }],
        linhas: resumo.treinamentos.map(function (t) {
          return [UI.dataCurta(t.data), el('span', { class: 'celula-principal' }, t.tema), t.tipo, t.unidade || '—',
            el('div', null, [
              t.numParticipantes === null ? null : el('strong', null, UI.inteiro(t.numParticipantes)),
              t.participantes ? el('div', { class: 'celula-apoio' }, t.participantes) : null
            ]),
            t.horas === null ? '—' : num(t.horas, 1)];
        })
      }))
    ]);
  }

  /* ---------------------------------------------------------- formulário */

  function form(app, registro) {
    var store = app.store;
    var novo = !registro;
    var somenteLeitura = !podeEditar(app);
    var r = registro || normalizarRegistroEstrutura({ data: hojeISO(), turno: 'Dia inteiro' });
    var treinamentos = r.treinamentos.map(function (t) { return Object.assign({}, t); });

    var fData = UI.campo({ rotulo: 'Data', nome: 'data', tipo: 'date', valor: r.data, obrigatorio: true });
    var fTurno = UI.campo({ rotulo: 'Turno', nome: 'turno', tipo: 'select', opcoes: TURNOS_ESTRUTURA,
      valor: r.turno, obrigatorio: true, dica: 'O turno é o que liga o registro ao horário do atendimento.' });
    var fUnidade = UI.campo({ rotulo: 'Unidade', nome: 'unidade', valor: r.unidade, obrigatorio: true,
      exemplo: 'Centro cirúrgico' });
    var fSala = UI.campo({ rotulo: 'Sala', nome: 'sala', valor: r.sala,
      dica: 'Em branco: o registro vale para toda a unidade.' });

    var selEquip = {};
    var camposEquip = ITENS_ESTRUTURA.map(function (i) {
      var c = UI.campo({
        rotulo: i.rotulo + (i.critico ? ' *' : ''), nome: 'eq_' + i.chave, tipo: 'select',
        opcoes: SITUACOES_ITEM, valor: r.equipamentos[i.chave], rotuloVazio: '— não verificado —'
      });
      selEquip[i.chave] = c;
      return c.no;
    });

    function respostaCampo(rotulo, nome, valor, dica) {
      return UI.campo({ rotulo: rotulo, nome: nome, tipo: 'select', opcoes: RESPOSTAS_QUALIDADE,
        valor: valor, rotuloVazio: '— sem resposta —', dica: dica });
    }

    var fCarroDisp = respostaCampo('Carro de parada disponível', 'carro_disp', r.carroParada.disponivel);
    var fCarroChec = respostaCampo('Carro de parada checado', 'carro_chec', r.carroParada.checado);
    var fCarroData = UI.campo({ rotulo: 'Data da checagem', nome: 'carro_data', tipo: 'date',
      valor: r.carroParada.dataChecagem });
    var fCarroPend = UI.campo({ rotulo: 'Pendências do carro de parada', nome: 'carro_pend', tipo: 'textarea',
      valor: r.carroParada.pendencias, largo: true });

    var fAnest = UI.campo({ rotulo: 'Anestesiologistas em atividade', nome: 'anestesiologistas', modo: 'numeric',
      valor: r.anestesiologistas === null ? '' : r.anestesiologistas });
    var fSalas = UI.campo({ rotulo: 'Salas em funcionamento', nome: 'salas', modo: 'numeric',
      valor: r.salasFuncionando === null ? '' : r.salasFuncionando });

    var fSangue = respostaCampo('Sangue e hemoderivados disponíveis', 'sangue_disp', r.sangue.disponivel);
    var fReserva = respostaCampo('Reserva para procedimento de risco', 'sangue_res', r.sangue.reservaProcedimentoRisco);
    var fSangueObs = UI.campo({ rotulo: 'Observações sobre hemoderivados', nome: 'sangue_obs', valor: r.sangue.obs,
      largo: true });

    var fObs = UI.campo({ rotulo: 'Observações do turno', nome: 'obs', tipo: 'textarea', valor: r.obs, largo: true });

    /* ---- treinamentos (lista editável dentro do formulário) ----------- */
    var listaTrein = el('div');
    var tData = el('input', { class: 'entrada', type: 'date', 'aria-label': 'Data do treinamento' });
    var tTema = el('input', { class: 'entrada', 'aria-label': 'Tema', placeholder: 'Tema' });
    var tTipo = el('select', { class: 'entrada', 'aria-label': 'Tipo' },
      ['Treinamento', 'Simulação de emergência'].map(function (o) { return el('option', { value: o }, o); }));
    var tNum = el('input', { class: 'entrada', inputmode: 'numeric', 'aria-label': 'Nº de participantes',
      placeholder: 'Nº' });
    var tHoras = el('input', { class: 'entrada', inputmode: 'decimal', 'aria-label': 'Horas', placeholder: 'Horas' });
    var tQuem = el('input', { class: 'entrada', 'aria-label': 'Profissionais participantes',
      placeholder: 'Profissionais participantes' });

    function desenharTrein() {
      UI.preencher(listaTrein, treinamentos.length ? [UI.tabela({
        colunas: [{ rotulo: 'Data' }, { rotulo: 'Tema' }, { rotulo: 'Tipo' }, { rotulo: 'Participantes' },
          { rotulo: 'Horas', num: true }, { rotulo: '', classe: 'acoes' }],
        linhas: treinamentos.map(function (t, i) {
          return [UI.dataCurta(t.data), t.tema, t.tipo,
            (t.numParticipantes === null ? '' : t.numParticipantes + ' · ') + (t.participantes || ''),
            t.horas === null ? '—' : num(t.horas, 1),
            el('button', {
              class: 'btn btn-plano btn-icone btn-pq', type: 'button', title: 'Remover', 'aria-label': 'Remover',
              onclick: function () { treinamentos.splice(i, 1); desenharTrein(); }
            }, icone('lixo'))];
        })
      })] : [el('div', { class: 'reg-vazio' }, 'Nenhum treinamento ou simulação registrado neste turno.')]);
    }
    desenharTrein();

    var f = UI.formulario([fData, fTurno, fUnidade, fSala, fCarroDisp, fCarroChec, fCarroData, fCarroPend,
      fAnest, fSalas, fSangue, fReserva, fSangueObs, fObs].concat(ITENS_ESTRUTURA.map(function (i) {
        return selEquip[i.chave];
      })));

    function montar() {
      var equipamentos = {};
      ITENS_ESTRUTURA.forEach(function (i) { equipamentos[i.chave] = selEquip[i.chave].valor(); });
      return {
        id: novo ? '' : r.id,
        data: fData.valor(), turno: fTurno.valor(), unidade: fUnidade.valor(), sala: fSala.valor(),
        equipamentos: equipamentos,
        carroParada: { disponivel: fCarroDisp.valor(), checado: fCarroChec.valor(),
          dataChecagem: fCarroData.valor(), pendencias: fCarroPend.valor() },
        anestesiologistas: fAnest.valor(), salasFuncionando: fSalas.valor(),
        sangue: { disponivel: fSangue.valor(), reservaProcedimentoRisco: fReserva.valor(), obs: fSangueObs.valor() },
        treinamentos: treinamentos,
        obs: fObs.valor()
      };
    }

    UI.abrirModal({
      titulo: novo ? 'Novo registro de estrutura' : 'Registro ' + r.id,
      corpo: [
        el('div', { class: 'campo-grupo' }, [fData.no, fTurno.no]),
        el('div', { class: 'campo-grupo mt-3' }, [fUnidade.no, fSala.no]),

        COMP.secao('Equipamentos', [el('div', { class: 'campo-grupo' }, camposEquip)]),

        COMP.secao('Carro de parada', [
          el('div', { class: 'campo-grupo' }, [fCarroDisp.no, fCarroChec.no]),
          el('div', { class: 'campo-grupo mt-3' }, [fCarroData.no]),
          el('div', { class: 'campo-grupo mt-3' }, [fCarroPend.no])
        ]),

        COMP.secao('Equipe e salas', [el('div', { class: 'campo-grupo' }, [fAnest.no, fSalas.no])]),

        COMP.secao('Sangue e hemoderivados', [
          el('div', { class: 'campo-grupo' }, [fSangue.no, fReserva.no]),
          el('div', { class: 'campo-grupo mt-3' }, [fSangueObs.no])
        ]),

        COMP.secao('Treinamentos e simulações de emergência', [
          el('div', { class: 'reg-entrada' }, [
            el('div', { class: 'reg-campo', style: 'flex:1.1' }, [el('label', { class: 'reg-rotulo' }, 'Data'), tData]),
            el('div', { class: 'reg-campo reg-largo', style: 'flex:2.4' }, [el('label', { class: 'reg-rotulo' }, 'Tema'), tTema]),
            el('div', { class: 'reg-campo', style: 'flex:1.4' }, [el('label', { class: 'reg-rotulo' }, 'Tipo'), tTipo]),
            el('div', { class: 'reg-campo', style: 'flex:0.7' }, [el('label', { class: 'reg-rotulo' }, 'Nº'), tNum]),
            el('div', { class: 'reg-campo', style: 'flex:0.7' }, [el('label', { class: 'reg-rotulo' }, 'Horas'), tHoras]),
            el('div', { class: 'reg-botoes' }, [
              el('button', {
                class: 'btn btn-pq', type: 'button',
                onclick: function () {
                  if (!tTema.value || !tData.value) { UI.atencao('Faltou preencher', 'Data e tema do treinamento.'); return; }
                  treinamentos.push({
                    data: tData.value, tema: tTema.value, tipo: tTipo.value,
                    participantes: tQuem.value,
                    numParticipantes: tNum.value === '' ? null : paraNumero(tNum.value),
                    horas: tHoras.value === '' ? null : paraNumero(tHoras.value)
                  });
                  tTema.value = ''; tNum.value = ''; tHoras.value = ''; tQuem.value = '';
                  desenharTrein();
                }
              }, [icone('mais'), 'Incluir'])
            ])
          ]),
          el('div', { class: 'campo mt-3' }, [
            el('div', { class: 'campo-rotulo' }, 'Profissionais participantes'), tQuem
          ]),
          el('div', { class: 'mt-3' }, [listaTrein])
        ]),

        COMP.secao('Observações', [el('div', { class: 'campo-grupo' }, [fObs.no])])
      ],
      acoes: somenteLeitura ? [
        el('div', { class: 'espaco' }),
        el('button', { class: 'btn btn-primario', onclick: function () { UI.fecharModal(); } }, 'Fechar')
      ] : [
        novo ? null : el('button', {
          class: 'btn btn-perigo',
          onclick: function () {
            UI.confirmar({ titulo: 'Remover o registro ' + r.id, tipo: 'perigo', rotulo: 'Remover',
              texto: 'Os atendimentos do período deixam de ter estrutura vinculada.' }, function () {
              var res = store.removerRegistroEstrutura(r.id);
              if (!res.ok) { UI.resultado(res); return; }
              UI.fecharModal();
              app.salvarEredesenhar();
              UI.ok('Registro removido');
            });
          }
        }, 'Remover'),
        el('div', { class: 'espaco' }),
        el('button', { class: 'btn', onclick: function () { UI.fecharModal(); } }, 'Cancelar'),
        el('button', {
          class: 'btn btn-primario',
          onclick: function () {
            f.limparErros();
            var res = store.salvarRegistroEstrutura(montar());
            if (!res.ok) { f.mostrarErros(res.erros); UI.resultado(res); return; }
            UI.fecharModal();
            app.salvarEredesenhar();
            (res.avisos || []).forEach(function (a) { UI.atencao('Atenção', a.msg); });
            UI.ok(novo ? 'Registro de estrutura criado' : 'Registro atualizado');
          }
        }, novo ? 'Criar registro' : 'Salvar')
      ]
    });
  }

  /* -------------------------------------------------------------- CSV -- */

  function baixarCSV(app, registros) {
    var colunas = ['ID', 'DATA', 'TURNO', 'UNIDADE', 'SALA']
      .concat(ITENS_ESTRUTURA.map(function (i) { return i.rotulo.toUpperCase(); }))
      .concat(['CARRO DE PARADA DISPONÍVEL', 'CARRO DE PARADA CHECADO', 'DATA DA CHECAGEM',
        'ANESTESIOLOGISTAS', 'SALAS EM FUNCIONAMENTO', 'SANGUE DISPONÍVEL', 'RESERVA PARA RISCO',
        'TREINAMENTOS', 'OBSERVAÇÕES', 'REGISTRADO POR', 'REGISTRADO EM']);
    var m = [colunas];
    registros.forEach(function (r) {
      m.push([
        DADOS.paraCelula(r.id, 'texto'), DADOS.paraCelula(r.data, 'data'),
        DADOS.paraCelula(r.turno, 'texto'), DADOS.paraCelula(r.unidade, 'texto'),
        DADOS.paraCelula(r.sala, 'texto')
      ].concat(ITENS_ESTRUTURA.map(function (i) {
        return DADOS.paraCelula(r.equipamentos[i.chave], 'texto');
      })).concat([
        DADOS.paraCelula(r.carroParada.disponivel, 'texto'),
        DADOS.paraCelula(r.carroParada.checado, 'texto'),
        DADOS.paraCelula(r.carroParada.dataChecagem, 'data'),
        DADOS.paraCelula(r.anestesiologistas, 'inteiro'),
        DADOS.paraCelula(r.salasFuncionando, 'inteiro'),
        DADOS.paraCelula(r.sangue.disponivel, 'texto'),
        DADOS.paraCelula(r.sangue.reservaProcedimentoRisco, 'texto'),
        DADOS.paraCelula(r.treinamentos.map(function (t) { return t.tema; }).join(' | '), 'texto'),
        DADOS.paraCelula(r.obs, 'texto'),
        DADOS.paraCelula(r.registradoPor, 'texto'),
        DADOS.paraCelula(r.registradoEm, 'texto')
      ]));
    });
    DADOS.baixarCSV('ESTRUTURA_' + (app.filtros.estrutura.todosOsMeses ? 'tudo' : app.mes + '_' + app.ano), m);
    UI.ok('CSV gerado');
  }

  return { render: render, form: form };
})();
