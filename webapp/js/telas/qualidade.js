/**
 * ============================================================================
 * TELA — Qualidade e segurança (ficha por atendimento)
 * ============================================================================
 * Lista das fichas do mês e o formulário do atendimento, dividido nas etapas
 * que o serviço pediu: identificação, avaliação pré-anestésica, período
 * intraoperatório, recuperação pós-anestésica, acompanhamento (24 h, 48 h e
 * 30 dias) e transição de cuidado / satisfação, mais a revisão clínica.
 *
 * Duas decisões de tela que valem comentário:
 *
 *  - As perguntas de evento têm QUATRO botões (Sim, Não, Não se aplica, Não
 *    avaliado) e nascem todas apagadas. Clicar de novo no botão marcado
 *    desmarca. Não existe padrão: em branco quer dizer "ninguém respondeu",
 *    e é assim que o painel conta.
 *  - Cada campo grava sozinho ao sair dele (o mesmo caminho do boletim),
 *    então dá para preencher aos poucos, no celular, entre um caso e outro,
 *    sem botão de salvar e sem perder o que já foi digitado.
 * ============================================================================
 */
'use strict';

TELAS.qualidade = (function () {

  var el = UI.el, icone = UI.icone;
  var cab = COMP.cabecalhoCartao, nomeMes = COMP.nomeMes;

  /* ------------------------------------------------------------ apoio -- */

  /**
   * Classe de cada resposta, na ordem de RESPOSTAS_QUALIDADE. Não dá para
   * derivar do texto: três das quatro começam com "Não".
   */
  var CLASSES_RESPOSTA = ['resp-sim', 'resp-nao', 'resp-na', 'resp-sem'];

  function situacao(f) { return !f ? 'sem' : f.status === FICHA_CONCLUIDA ? 'concluida' : 'rascunho'; }

  function seloFicha(f) {
    if (!f) return el('span', { class: 'selo selo-na' }, 'sem ficha');
    if (f.status === FICHA_CONCLUIDA) return el('span', { class: 'selo selo-realizada' }, 'concluída');
    return el('span', { class: 'selo selo-pendente' }, 'em preenchimento');
  }

  function numTexto(v, casas) {
    if (v === null || v === undefined || v === '') return '';
    return typeof v === 'number' ? String(casas ? v.toFixed(casas) : v).replace('.', ',') : String(v);
  }

  function horaAgora() {
    var d = new Date();
    return pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }

  function cirurgiaDe(app, f) {
    if (!f) return null;
    return app.store.estado.cirurgias.filter(function (c) { return c.id === f.idCirurgia; })[0] || null;
  }

  function marcarErro(input, msg) {
    if (!input) return;
    var campo = input.closest ? input.closest('.campo') : null;
    if (campo) campo.classList.toggle('invalido', !!msg);
    input.setAttribute('aria-invalid', msg ? 'true' : 'false');
    input.title = msg || '';
  }

  /** Remover em dois toques (o mesmo do boletim): sem modal para um clique só. */
  function botaoRemover(aoConfirmar) {
    var armado = false, timer = null;
    var b = el('button', {
      class: 'btn btn-plano btn-icone btn-pq', type: 'button', title: 'Remover', 'aria-label': 'Remover',
      onclick: function (ev) {
        ev.stopPropagation();
        if (armado) { clearTimeout(timer); aoConfirmar(); return; }
        armado = true;
        b.classList.add('armado');
        b.textContent = 'Remover?';
        timer = setTimeout(function () {
          armado = false;
          b.classList.remove('armado');
          UI.preencher(b, icone('lixo'));
        }, 4000);
      }
    }, icone('lixo'));
    return b;
  }

  /* ------------------------------------------------------------ lista -- */

  /** Abre a ficha de uma cirurgia, criando-a se ainda não existir. */
  function abrir(app, cirurgia) {
    var f = app.store.fichaDaCirurgia(cirurgia.id);
    if (!f) {
      var r = app.store.criarFichaQualidade(cirurgia.id);
      if (!r.ok) { UI.resultado(r); return; }
      app.salvar();
      f = r.ficha;
      UI.ok('Ficha de qualidade criada', f.id);
    }
    app.filtros.qualidade.id = f.id;
    app.ir('qualidade');
  }

  function lista(app) {
    var store = app.store;
    var filtro = app.filtros.qualidade;
    var hoje = hojeISO();

    var cirurgias = store.estado.cirurgias.filter(function (c) {
      return Number(c.mes) === app.mes && Number(c.ano) === app.ano && c.status !== CONFIG.STATUS_EXCLUIDO;
    });

    // No servidor da clínica, quem entrou com o nome de um anestesista do cadastro vê primeiro os próprios pacientes.
    var eu = app.servidor && typeof SERVIDOR !== 'undefined' && SERVIDOR.usuario() ? SERVIDOR.usuario() : null;
    var souAnestesista = !!eu && store.estado.anestesistas.some(function (a) { return mesmoTexto(a.nome, eu.nome); });
    if (souAnestesista && filtro.soMeus === undefined) filtro.soMeus = true;
    if (souAnestesista && filtro.soMeus) {
      cirurgias = cirurgias.filter(function (c) { return mesmoTexto(c.anestesista, eu.nome); });
    }

    var linhas = cirurgias.map(function (c) {
      var f = store.fichaDaCirurgia(c.id);
      return { c: c, f: f, sit: situacao(f),
        pend: f ? totalPendenciasFicha(f, hoje, c) : null,
        seg: f ? seguimentosPendentes(f, hoje, c).length : 0 };
    }).filter(function (l) {
      if (filtro.situacao && l.sit !== filtro.situacao) return false;
      if (filtro.texto) {
        var alvo = normalizar([l.c.paciente, l.c.procedimento, l.c.anestesista, l.f && l.f.id].join(' '));
        if (alvo.indexOf(normalizar(filtro.texto)) < 0) return false;
      }
      return true;
    }).sort(function (a, b) { return a.c.data < b.c.data ? -1 : a.c.data > b.c.data ? 1 : 0; });

    var raiz = el('div', { class: 'pilha' });

    var comFicha = linhas.filter(function (l) { return !!l.f; });
    var incompletas = comFicha.filter(function (l) { return l.pend > 0; }).length;
    var acomp = comFicha.filter(function (l) { return l.seg > 0; }).length;
    raiz.appendChild(el('div', { class: 'grade grade-4' }, [
      COMP.kpi({ rotulo: 'Cirurgias do mês', valor: UI.inteiro(linhas.length), nota: 'exceto canceladas' }),
      COMP.kpi({ rotulo: 'Com ficha de qualidade', valor: UI.inteiro(comFicha.length), tom: 'acento',
        nota: linhas.length ? UI.pct(comFicha.length / linhas.length * 100) + ' de cobertura' : '—' }),
      COMP.kpi({ rotulo: 'Fichas incompletas', valor: UI.inteiro(incompletas),
        tom: incompletas ? 'alerta' : null, nota: 'itens ainda sem resposta' }),
      COMP.kpi({ rotulo: 'Acompanhamentos em aberto', valor: UI.inteiro(acomp),
        tom: acomp ? 'alerta' : null, nota: '24 h, 48 h ou 30 dias vencidos' })
    ]));

    var busca = el('input', {
      class: 'entrada', type: 'search', placeholder: 'Paciente, procedimento, anestesista ou ID',
      'aria-label': 'Buscar ficha de qualidade',
      value: filtro.texto, style: 'min-width:220px;flex:1',
      oninput: function (ev) { filtro.texto = ev.target.value; app.redesenhar(); }
    });

    raiz.appendChild(el('div', { class: 'cartao' }, [
      cab('Fichas de qualidade', nomeMes(app.mes) + ' de ' + app.ano, [
        el('button', { class: 'btn btn-pq', onclick: function () { baixarCSV(app, linhas); } },
          [icone('baixar'), 'CSV']),
        el('button', { class: 'btn btn-pq', onclick: function () { app.ir('painel_qualidade'); } },
          [icone('grafico'), 'Painel'])
      ]),
      el('div', { class: 'cartao-corpo compacto' }, [
        el('div', { class: 'linha' }, [
          busca,
          souAnestesista
            ? el('label', { class: 'marcar' }, [
              (function () {
                var c = el('input', { type: 'checkbox',
                  onchange: function (ev) { filtro.soMeus = ev.target.checked; app.redesenhar(); } });
                c.checked = !!filtro.soMeus;
                return c;
              })(),
              el('span', null, 'Só os meus atendimentos')
            ])
            : null,
          COMP.seletor({
            rotulo: 'Situação da ficha', valor: filtro.situacao, largura: '180px',
            opcoes: [{ valor: '', rotulo: 'Todas as situações' }, { valor: 'sem', rotulo: 'Sem ficha' },
              { valor: 'rascunho', rotulo: 'Em preenchimento' }, { valor: 'concluida', rotulo: 'Concluída' }],
            aoMudar: function (v) { filtro.situacao = v; app.redesenhar(); }
          })
        ])
      ]),
      el('div', { class: 'cartao-corpo rente' }, UI.tabela({
        colunas: [
          { rotulo: 'Data' }, { rotulo: 'Paciente' }, { rotulo: 'Procedimento' },
          { rotulo: 'Anestesista' }, { rotulo: 'Ficha' }, { rotulo: 'Situação' },
          { rotulo: 'Pendências', num: true }, { rotulo: '', classe: 'acoes' }
        ],
        linhas: linhas.map(function (l) {
          return [
            UI.dataCurta(l.c.data),
            el('span', { class: 'celula-principal' }, l.c.paciente || '—'),
            l.c.procedimento || '—',
            l.c.anestesista || '—',
            l.f ? l.f.id : '—',
            seloFicha(l.f),
            l.f ? celulaPendencias(l) : '—',
            el('div', { class: 'linha', style: 'justify-content:flex-end;flex-wrap:nowrap' }, [
              el('button', {
                class: 'btn btn-pq' + (l.f ? '' : ' btn-primario'),
                onclick: function () { abrir(app, l.c); }
              }, l.f ? 'Abrir' : 'Criar ficha')
            ])
          ];
        }),
        vazio: { icone: 'escudo', titulo: 'Nenhuma cirurgia neste mês',
          texto: 'A ficha de qualidade nasce de uma cirurgia — marque a cirurgia primeiro.' }
      }))
    ]));

    return raiz;
  }

  function celulaPendencias(l) {
    if (!l.pend && !l.seg) return el('span', { class: 'selo selo-ok sem-ponto' }, 'completa');
    var partes = [];
    if (l.pend) partes.push(el('strong', { class: 't-alerta' }, l.pend + ' item(ns)'));
    if (l.seg) partes.push(el('div', { class: 'celula-apoio t-alerta' }, l.seg + ' acompanhamento(s)'));
    return el('div', null, partes);
  }

  /* ----------------------------------------------------------- editor -- */

  function editor(app, f0) {
    var store = app.store;
    var id = f0.id;
    var cir = cirurgiaDe(app, f0);
    var hoje = hojeISO();
    var atualizadores = [];          // da etapa aberta: recriados a cada troca de aba
    var atualizadoresFixos = [];     // do topo da ficha: valem para todas as etapas
    var aba = app.filtros.qualidade.aba || 'identificacao';
    // Formulários de evento da etapa aberta: { selecionar(tipo) }. "Sim" numa pergunta abre o do evento dela.
    var formsEvento = {};

    function atual() { return store.fichaQualidade(id); }
    function fechado() { var f = atual(); return !!f && f.status === FICHA_CONCLUIDA; }
    function refazer() { var f = atual(); if (f) atualizadoresFixos.concat(atualizadores).forEach(function (fn) { fn(f); }); }
    function aoMudar(fn) { atualizadores.push(fn); return fn; }
    function aoMudarFixo(fn) { atualizadoresFixos.push(fn); return fn; }

    function gravar(mudancas, input) {
      var r = store.salvarFichaQualidade(id, mudancas);
      if (!r.ok) {
        var msg = r.erros.map(function (e) { return e.msg; }).join(' ');
        marcarErro(input, msg);
        UI.erro('Não foi possível salvar', msg);
        return false;
      }
      marcarErro(input, null);
      (r.avisos || []).forEach(function (a) { UI.atencao('Atenção', a.msg); });
      app.salvar();
      refazer();
      return true;
    }

    function mudanca(secao, chave, v) {
      var m = {};
      if (secao) { m[secao] = {}; m[secao][chave] = v; } else m[chave] = v;
      return m;
    }

    function valorDe(f, secao, chave) { return secao ? f[secao][chave] : f[chave]; }

    /* ---- peças de formulário ------------------------------------------ */

    function campo(cfg) {
      var f = atual();
      var v = valorDe(f, cfg.secao, cfg.chave);
      if (typeof v === 'number') v = numTexto(v, cfg.casas);
      var c = UI.campo({
        rotulo: cfg.rotulo, nome: 'q_' + (cfg.secao || 'f') + '_' + cfg.chave,
        tipo: cfg.tipo || 'text', valor: v === null ? '' : v, opcoes: cfg.opcoes,
        rotuloVazio: cfg.rotuloVazio, dica: cfg.dica, largo: cfg.largo, modo: cfg.modo,
        exemplo: cfg.exemplo, linhas: cfg.linhas, desabilitado: fechado() && !cfg.sempre,
        aoMudar: function (ev) { gravar(mudanca(cfg.secao, cfg.chave, ev.target.value), ev.target); }
      });
      if (cfg.agora && !fechado()) {
        var pai = c.input.parentNode, depois = c.input.nextSibling;
        pai.insertBefore(el('div', { class: 'com-botao' }, [
          c.input,
          el('button', {
            class: 'btn btn-pq', type: 'button', title: 'Hora de agora',
            'aria-label': cfg.rotulo + ': hora de agora',
            onclick: function () {
              c.input.value = horaAgora();
              gravar(mudanca(cfg.secao, cfg.chave, c.input.value), c.input);
            }
          }, icone('relogio'))
        ]), depois);
      }
      if (cfg.largura) c.no.classList.add('largura-' + cfg.largura);
      return c.no;
    }

    function numero(rotulo, secao, chave, extra) {
      return campo(Object.assign({ rotulo: rotulo, secao: secao, chave: chave, modo: 'decimal' }, extra || {}));
    }

    function hora(rotulo, secao, chave, extra) {
      return campo(Object.assign({ rotulo: rotulo, secao: secao, chave: chave, tipo: 'time', agora: true }, extra || {}));
    }

    /**
     * Pergunta de quatro opções. Nada nasce marcado; clicar no botão marcado
     * desmarca (volta a "ninguém respondeu").
     */
    function pergunta(rotulo, secao, chave, dica) {
      var grupo = el('div', { class: 'segmentado seg-resposta', role: 'group', 'aria-label': rotulo });
      var def = secao === 'respostas' ? eventoQualidade(chave) : null;
      var aviso = el('div', { class: 'dica t-alerta', hidden: true });
      function desenhar() {
        var f = atual();
        var v = secao === 'respostas' ? f.respostas[chave] : valorDe(f, secao, chave);
        // "Sim" sem o detalhamento do evento: lembra, sem impedir nada.
        var semDetalhe = !!def && v === RESPOSTA_SIM && !f.eventos.some(function (e) { return e.tipo === chave; });
        aviso.hidden = !semDetalhe;
        aviso.textContent = semDetalhe ? 'Registre o evento (data, descrição, gravidade, conduta e evolução) no formulário desta etapa.' : '';
        UI.preencher(grupo, RESPOSTAS_QUALIDADE.map(function (o, i) {
          return el('button', {
            type: 'button', 'aria-pressed': v === o ? 'true' : 'false',
            class: CLASSES_RESPOSTA[i], title: o, disabled: fechado(),
            onclick: function () {
              var novo = v === o ? '' : o;
              var m = secao === 'respostas' ? { respostas: {} } : null;
              if (m) m.respostas[chave] = novo; else m = mudanca(secao, chave, novo);
              if (gravar(m)) {
                desenhar();
                // Sim numa pergunta de evento: abre os campos do evento, já com o tipo escolhido.
                if (def && novo === RESPOSTA_SIM && formsEvento[def.etapa]) formsEvento[def.etapa].selecionar(chave);
              }
            }
          }, o === 'Não avaliado/sem informação' ? 'Sem informação' : o);
        }));
      }
      desenhar();
      aoMudar(function () { desenhar(); });
      var no = el('div', { class: 'campo campo-seg largura-2' }, [
        el('div', { class: 'campo-rotulo' }, rotulo),
        grupo,
        dica ? el('div', { class: 'dica' }, dica) : null,
        aviso
      ]);
      if (def && def.aplicaA) return soSe(def.aplicaA, no);
      return no;
    }

    /**
     * Mostra o campo só quando ele é pertinente à técnica anestésica do
     * atendimento (via aérea, bloqueador neuromuscular e despertar são da
     * anestesia geral). Sem técnica escolhida, tudo aparece.
     */
    function soSe(aplicaA, no) {
      function avaliar(f) { no.hidden = !pertinenteNaFicha(f, aplicaA); }
      avaliar(atual());
      aoMudar(avaliar);
      return no;
    }

    /** Escolha única em botões; clicar de novo limpa. */
    function segmento(rotulo, secao, chave, opcoes, largura) {
      var grupo = el('div', { class: 'segmentado', role: 'group', 'aria-label': rotulo });
      function desenhar() {
        var v = valorDe(atual(), secao, chave);
        UI.preencher(grupo, opcoes.map(function (o) {
          return el('button', {
            type: 'button', 'aria-pressed': v === o ? 'true' : 'false', disabled: fechado(),
            onclick: function () { if (gravar(mudanca(secao, chave, v === o ? '' : o))) desenhar(); }
          }, o);
        }));
      }
      desenhar();
      aoMudar(function () { desenhar(); });
      return el('div', { class: 'campo campo-seg' + (largura ? ' largura-' + largura : '') }, [
        el('div', { class: 'campo-rotulo' }, rotulo), grupo
      ]);
    }

    /** Escolha múltipla em fichas. */
    function fichas(rotulo, secao, chave, opcoes) {
      var grupo = el('div', { class: 'fichas', role: 'group', 'aria-label': rotulo });
      function desenhar() {
        var sel = valorDe(atual(), secao, chave);
        var todas = opcoes.concat(sel.filter(function (s) { return opcoes.indexOf(s) < 0; }));
        UI.preencher(grupo, todas.map(function (o) {
          var ligado = sel.indexOf(o) >= 0;
          return el('button', {
            type: 'button', class: 'ficha', 'aria-pressed': ligado ? 'true' : 'false', disabled: fechado(),
            onclick: function () {
              var nova = ligado ? sel.filter(function (s) { return s !== o; }) : sel.concat([o]);
              if (gravar(mudanca(secao, chave, nova))) desenhar();
            }
          }, [ligado ? icone('check') : null, o]);
        }));
      }
      desenhar();
      aoMudar(function () { desenhar(); });
      return el('div', { class: 'campo campo-largo' }, [
        el('div', { class: 'campo-rotulo' }, rotulo), grupo
      ]);
    }

    function marcarItem(rotulo, chave) {
      var input = el('input', {
        type: 'checkbox', name: 'q_passagem_' + chave, disabled: fechado(),
        onchange: function (ev) {
          var m = { transicao: { itens: {} } };
          m.transicao.itens[chave] = ev.target.checked;
          if (!gravar(m)) ev.target.checked = !ev.target.checked;
        }
      });
      input.checked = !!atual().transicao.itens[chave];
      aoMudar(function (f) { input.checked = !!f.transicao.itens[chave]; });
      return el('label', { class: 'marcar' }, [input, el('span', null, rotulo)]);
    }

    /** Cartão de seção. `aplicaA` ('geral') esconde o cartão inteiro quando não é pertinente à técnica. */
    function secao(titulo, sub, filhos, acoes, aplicaA) {
      var no = el('section', { class: 'cartao' }, [cab(titulo, sub, acoes), el('div', { class: 'cartao-corpo' }, filhos)]);
      return aplicaA ? soSe(aplicaA, no) : no;
    }

    function grade(filhos, hora) {
      return el('div', { class: 'campos-auto' + (hora ? ' campos-hora' : '') }, filhos);
    }

    /* ---- eventos ------------------------------------------------------- */

    /**
     * Lista de eventos de uma etapa, com o formulário de registro. Os campos
     * mostrados dependem do tipo escolhido — só o que é pertinente àquele
     * evento aparece.
     */
    function eventos(etapa) {
      var raiz = el('div', { class: 'registros' });
      var tipos = eventosPertinentes(atual(), etapa);
      var chavesEtapa = tipos.map(function (t) { return t.chave; });
      var editando = null;
      var tipoAtual = tipos.length ? tipos[0].chave : '';
      var camposExtra = el('div', { class: 'campos-auto' });
      var tabela = el('div');

      var selTipo = el('select', {
        class: 'entrada', 'aria-label': 'Tipo de evento',
        onchange: function () { tipoAtual = selTipo.value; desenharExtras(); }
      }, tipos.map(function (t) { return el('option', { value: t.chave }, t.rotulo); }));

      var entradas = {};
      function entrada(chave, rotulo, tipo, opcoes) {
        var input;
        if (tipo === 'select') {
          input = el('select', { class: 'entrada', 'aria-label': rotulo },
            [el('option', { value: '' }, '—')].concat((opcoes || []).map(function (o) {
              return el('option', { value: o }, o);
            })));
        } else {
          input = el('input', { class: 'entrada', type: tipo || 'text', 'aria-label': rotulo, autocomplete: 'off' });
        }
        entradas[chave] = input;
        return el('div', { class: 'reg-campo', style: 'flex:1' }, [
          el('label', { class: 'reg-rotulo' }, rotulo), input
        ]);
      }

      var base = el('div', { class: 'reg-entrada' }, [
        el('div', { class: 'reg-campo reg-largo', style: 'flex:2.6' }, [
          el('label', { class: 'reg-rotulo' }, 'Tipo de evento'), selTipo
        ]),
        entrada('data', 'Data', 'date'),
        entrada('hora', 'Horário', 'time'),
        entrada('gravidade', 'Gravidade', 'select', OPCOES_QUALIDADE.gravidade),
        entrada('relacao', 'Relação com a anestesia', 'select', OPCOES_QUALIDADE.relacao),
        entrada('investigacao', 'Investigação', 'select', OPCOES_QUALIDADE.investigacao)
      ]);

      var descricao = el('textarea', { class: 'entrada', rows: 2, 'aria-label': 'Descrição do evento',
        placeholder: 'O que aconteceu' });
      var conduta = el('textarea', { class: 'entrada', rows: 2, 'aria-label': 'Conduta adotada',
        placeholder: 'Conduta adotada' });
      var evolucao = el('textarea', { class: 'entrada', rows: 2, 'aria-label': 'Evolução',
        placeholder: 'Evolução' });

      var botaoOk = el('button', { class: 'btn btn-primario', type: 'button',
        onclick: function () { confirmar(); } }, [icone('mais'), 'Registrar evento']);
      var botaoCancelar = el('button', { class: 'btn', type: 'button', hidden: true,
        onclick: function () { limpar(); } }, 'Cancelar');

      function desenharExtras() {
        var def = eventoQualidade(tipoAtual);
        UI.preencher(camposExtra, (def ? def.campos : []).map(function (c) {
          var input;
          if (c.tipo === 'opcao') {
            input = el('select', { class: 'entrada', 'aria-label': c.rotulo },
              [el('option', { value: '' }, '—')].concat(c.opcoes.map(function (o) {
                return el('option', { value: o }, o);
              })));
          } else if (c.tipo === 'resposta') {
            input = el('select', { class: 'entrada', 'aria-label': c.rotulo },
              [el('option', { value: '' }, '—')].concat(RESPOSTAS_QUALIDADE.map(function (o) {
                return el('option', { value: o }, o);
              })));
          } else {
            input = el('input', { class: 'entrada', type: c.tipo === 'hora' ? 'time' : 'text',
              'aria-label': c.rotulo, inputmode: c.tipo === 'numero' ? 'decimal' : null, autocomplete: 'off' });
          }
          entradas['dados.' + c.chave] = input;
          return el('div', { class: 'campo' + (c.largo ? ' largura-2' : '') }, [
            el('div', { class: 'campo-rotulo' }, c.rotulo), input
          ]);
        }));
      }

      // "Sim" na pergunta: escolhe o tipo, leva o formulário à vista e põe o cursor na descrição.
      formsEvento[etapa] = {
        selecionar: function (tipo) {
          if (!chavesEtapa.length || chavesEtapa.indexOf(tipo) < 0 || editando) return;
          tipoAtual = tipo;
          selTipo.value = tipo;
          desenharExtras();
          if (base.scrollIntoView) base.scrollIntoView({ block: 'center', behavior: 'smooth' });
          descricao.focus({ preventScroll: true });
        }
      };

      function limpar() {
        editando = null;
        UI.preencher(botaoOk, [icone('mais'), 'Registrar evento']);
        botaoCancelar.hidden = true;
        Object.keys(entradas).forEach(function (k) { entradas[k].value = ''; });
        descricao.value = '';
        conduta.value = '';
        evolucao.value = '';
        selTipo.value = tipoAtual;
        entradas.data.value = paraData(cir && cir.data) || '';
      }

      function montarEvento() {
        var def = eventoQualidade(tipoAtual);
        var dados = {};
        (def ? def.campos : []).forEach(function (c) {
          var input = entradas['dados.' + c.chave];
          if (input) dados[c.chave] = input.value;
        });
        return {
          tipo: tipoAtual, data: entradas.data.value, hora: entradas.hora.value,
          gravidade: entradas.gravidade.value, relacao: entradas.relacao.value,
          investigacao: entradas.investigacao.value,
          descricao: descricao.value, conduta: conduta.value, evolucao: evolucao.value,
          dados: dados
        };
      }

      function confirmar() {
        var ev = montarEvento();
        var op = editando
          ? { acao: 'alterar', indice: editando.indice, conferir: editando.evento, evento: Object.assign({}, editando.evento, ev) }
          : { acao: 'adicionar', evento: ev };
        var r = store.alterarEventoQualidade(id, op);
        if (!r.ok) { UI.erro('Evento não salvo', r.erros.map(function (e) { return e.msg; }).join(' ')); return; }
        app.salvar();
        limpar();
        refazer();
        selTipo.focus();
      }

      function editar(indice, ev) {
        editando = { indice: indice, evento: ev };
        tipoAtual = ev.tipo;
        selTipo.value = ev.tipo;
        desenharExtras();
        entradas.data.value = ev.data;
        entradas.hora.value = ev.hora;
        entradas.gravidade.value = ev.gravidade;
        entradas.relacao.value = ev.relacao;
        entradas.investigacao.value = ev.investigacao;
        descricao.value = ev.descricao;
        conduta.value = ev.conduta;
        evolucao.value = ev.evolucao;
        var def = eventoQualidade(ev.tipo);
        (def ? def.campos : []).forEach(function (c) {
          var input = entradas['dados.' + c.chave];
          if (input) input.value = ev.dados[c.chave] === null || ev.dados[c.chave] === undefined ? '' : numTexto(ev.dados[c.chave]);
        });
        UI.preencher(botaoOk, [icone('check'), 'Salvar evento']);
        botaoCancelar.hidden = false;
      }

      function remover(indice, ev) {
        var r = store.alterarEventoQualidade(id, { acao: 'remover', indice: indice, conferir: ev });
        if (!r.ok) { UI.resultado(r); return; }
        app.salvar();
        if (editando) limpar();
        refazer();
      }

      aoMudar(function (f) {
        var lista = f.eventos.map(function (ev, i) { return { ev: ev, i: i }; })
          .filter(function (x) { return chavesEtapa.indexOf(x.ev.tipo) >= 0; });
        UI.preencher(tabela, lista.length ? UI.tabela({
          colunas: [{ rotulo: 'Evento' }, { rotulo: 'Quando' }, { rotulo: 'Gravidade' },
            { rotulo: 'Relação com a anestesia' }, { rotulo: 'Registro' }]
            .concat(fechado() ? [] : [{ rotulo: '', classe: 'acoes' }]),
          linhas: lista.map(function (x) {
            var def = eventoQualidade(x.ev.tipo);
            var cel = [
              el('div', null, [
                el('span', { class: 'celula-principal' }, def ? def.rotulo : x.ev.tipo),
                x.ev.descricao ? el('div', { class: 'celula-apoio' }, x.ev.descricao) : null
              ]),
              (UI.dataCurta(x.ev.data) || '—') + (x.ev.hora ? ' ' + x.ev.hora : ''),
              x.ev.gravidade || '—',
              el('span', { class: 'selo ' + (x.ev.relacao && x.ev.relacao !== 'Não avaliada' ? 'selo-info' : 'selo-na') },
                x.ev.relacao || 'não avaliada'),
              el('div', null, [
                el('span', { class: 'selo ' + (x.ev.origem === 'Revisão clínica' ? 'selo-info' : 'selo-na') + ' sem-ponto' },
                  x.ev.origem),
                x.ev.confirmado ? el('div', { class: 'celula-apoio' }, x.ev.confirmado) : null
              ])
            ];
            if (!fechado()) {
              cel.push(el('div', { class: 'linha', style: 'justify-content:flex-end;flex-wrap:nowrap' }, [
                el('button', { class: 'btn btn-plano btn-icone btn-pq', type: 'button', title: 'Editar',
                  'aria-label': 'Editar', onclick: function (e2) { e2.stopPropagation(); editar(x.i, x.ev); } },
                  icone('lapis')),
                botaoRemover(function () { remover(x.i, x.ev); })
              ]));
            }
            return cel;
          })
        }) : el('div', { class: 'reg-vazio' },
          'Nenhum evento registrado nesta etapa. Responder "Sim" acima é o que pede o detalhamento aqui.'));
      });

      if (!fechado() && tipos.length) {
        raiz.appendChild(base);
        raiz.appendChild(camposExtra);
        raiz.appendChild(el('div', { class: 'campo-grupo-3 mt-3' }, [
          el('div', { class: 'campo' }, [el('div', { class: 'campo-rotulo' }, 'Descrição'), descricao]),
          el('div', { class: 'campo' }, [el('div', { class: 'campo-rotulo' }, 'Conduta adotada'), conduta]),
          el('div', { class: 'campo' }, [el('div', { class: 'campo-rotulo' }, 'Evolução'), evolucao])
        ]));
        raiz.appendChild(el('div', { class: 'linha mt-3' }, [botaoOk, botaoCancelar]));
        desenharExtras();
        limpar();
      }
      raiz.appendChild(tabela);
      return raiz;
    }

    /* ---- etapas --------------------------------------------------------- */

    /**
     * Estrutura da unidade neste turno, vinda do registro da coordenação — o
     * anestesista não digita isto em cada paciente. Casa por data, unidade,
     * sala e horário; se nada casa, diz que falta o registro.
     */
    function cartaoEstrutura() {
      var corpo = el('div');
      aoMudar(function (f) {
        var r = store.estruturaDoAtendimento(f, cir);
        if (!r) {
          UI.preencher(corpo, [el('p', { class: 'sem-margem t-suave' },
            'Nenhum registro de estrutura da coordenação cobre este dia, unidade, sala e horário. ' +
            'Quando a coordenação registrar o turno, ele aparece aqui sozinho.')]);
          return;
        }
        var res = resumoEstrutura([r]);
        var faltando = res.itens.filter(function (i) { return i.critico && i.indisponiveis > 0; });
        UI.preencher(corpo, [
          el('div', { class: 'campos-auto' }, [
            COMP.def('Registro', r.id + ' · ' + UI.dataCurta(r.data) + ' · ' + r.turno),
            COMP.def('Unidade e sala', (r.unidade || '—') + (r.sala ? ' · ' + r.sala : ' · toda a unidade')),
            COMP.def('Carro de parada', r.carroParada.checado === RESPOSTA_SIM ? 'checado'
              : (r.carroParada.checado === RESPOSTA_NAO ? 'não checado' : 'sem informação')),
            COMP.def('Anestesiologistas · salas', num2(r.anestesiologistas) + ' · ' + num2(r.salasFuncionando)),
            COMP.def('Sangue e hemoderivados', r.sangue.disponivel || 'sem informação')
          ]),
          faltando.length
            ? el('div', { class: 'aviso aviso-atencao mt-3' }, [icone('alerta'),
              el('div', { class: 'aviso-corpo' }, 'Equipamento essencial indisponível neste turno: ' +
                faltando.map(function (i) { return i.rotulo; }).join(', ') + '.')])
            : null
        ]);
      });
      return el('section', { class: 'cartao' }, [
        cab('Estrutura da unidade neste turno', 'Registrada pela coordenação e vinculada ao atendimento'),
        el('div', { class: 'cartao-corpo' }, [corpo])
      ]);
    }

    function num2(v) { return v === null || v === undefined ? '—' : String(v); }

    function etapaIdentificacao() {
      return el('div', { class: 'pilha' }, [
        secao('Atendimento', 'Vínculo do registro com o paciente e o procedimento', [
          grade([
            campo({ rotulo: 'Número do prontuário', secao: 'atendimento', chave: 'prontuario' }),
            segmento('Vínculo', 'atendimento', 'vinculo', OPCOES_QUALIDADE.vinculo, 2),
            campo({ rotulo: 'Convênio', secao: 'atendimento', chave: 'convenio' }),
            campo({ rotulo: 'Especialidade', secao: 'atendimento', chave: 'especialidade' }),
            campo({ rotulo: 'Unidade', secao: 'atendimento', chave: 'unidade' }),
            campo({ rotulo: 'Sala', secao: 'atendimento', chave: 'sala' })
          ]),
          el('div', { class: 'campos-auto mt-3' }, [
            numero('Idade (anos)', 'atendimento', 'idade'),
            numero('Peso (kg)', 'atendimento', 'peso', { casas: 1 }),
            numero('Altura (cm)', 'atendimento', 'altura'),
            segmento('ASA', 'atendimento', 'asa', OPCOES_QUALIDADE.asa, 2),
            segmento('Caráter do procedimento', 'atendimento', 'carater', OPCOES_QUALIDADE.carater, 2)
          ]),
          el('div', { class: 'campos-auto mt-3' }, [
            fichas('Técnica anestésica', 'atendimento', 'tecnicas', OPCOES_QUALIDADE.tecnicas),
            campo({ rotulo: 'Outra técnica', secao: 'atendimento', chave: 'tecnicaOutra', largura: 2 })
          ])
        ]),
        secao('Horários e destino', 'O sistema calcula os intervalos a partir do que for informado', [
          grade([
            hora('Início da anestesia', 'atendimento', 'inicioAnestesia'),
            hora('Término da anestesia', 'atendimento', 'fimAnestesia'),
            hora('Entrada na SRPA', 'atendimento', 'entradaSrpa'),
            hora('Saída da SRPA', 'atendimento', 'saidaSrpa')
          ], true),
          el('div', { class: 'campos-auto mt-3' }, [
            segmento('Destino após o procedimento', 'atendimento', 'destino', OPCOES_QUALIDADE.destino, 2),
            campo({ rotulo: 'Qual (se outro)', secao: 'atendimento', chave: 'destinoOutro', largura: 2 })
          ]),
          resumoCalculado()
        ]),
        cartaoEstrutura()
      ]);
    }

    function resumoCalculado() {
      var caixa = el('div', { class: 'grade grade-4 mt-3' });
      aoMudar(function (f) {
        var r = resumoQualidade(f, cir);
        UI.preencher(caixa, [
          COMP.kpi({ rotulo: 'Duração da anestesia', valor: UI.horasZero((r.duracaoAnestesia || 0) / 60), valorPq: true }),
          COMP.kpi({ rotulo: 'Permanência na SRPA', valor: UI.horasZero((r.permanenciaSrpa || 0) / 60), valorPq: true }),
          COMP.kpi({ rotulo: 'Tempo de jejum', valor: r.jejumHoras === null ? '—' : numTexto(r.jejumHoras, 1) + ' h', valorPq: true }),
          COMP.kpi({ rotulo: 'IMC', valor: r.imc === null ? '—' : numTexto(r.imc, 1), valorPq: true })
        ]);
      });
      return caixa;
    }

    function etapaPre() {
      return el('div', { class: 'pilha' }, [
        secao('Avaliação pré-anestésica', 'Documentação, via aérea e jejum', [
          grade([
            pergunta('Avaliação pré-anestésica documentada', 'pre', 'avaliacaoDocumentada'),
            pergunta('Avaliação pré-anestésica completa', 'pre', 'avaliacaoCompleta'),
            pergunta('Via aérea avaliada', 'pre', 'viaAereaAvaliada'),
            pergunta('Via aérea difícil prevista', 'pre', 'viaAereaDificilPrevista'),
            pergunta('Adesão ao protocolo de via aérea difícil', 'pre', 'protocoloViaAerea',
              'Só se aplica quando a dificuldade era prevista.'),
            pergunta('Carrinho de via aérea difícil disponível', 'pre', 'carrinhoDisponivel'),
            pergunta('Carrinho de via aérea difícil checado', 'pre', 'carrinhoChecado')
          ]),
          el('div', { class: 'campos-auto mt-3' }, [
            campo({ rotulo: 'Data da última ingestão', secao: 'pre', chave: 'jejumData', tipo: 'date' }),
            hora('Horário da última ingestão', 'pre', 'jejumHora'),
            campo({ rotulo: 'Tipo de alimento ou líquido', secao: 'pre', chave: 'jejumTipo', tipo: 'select',
              opcoes: OPCOES_QUALIDADE.jejumTipo, largura: 2 })
          ]),
          campo({ rotulo: 'Observações da avaliação pré-anestésica', secao: 'pre', chave: 'obs',
            tipo: 'textarea', largo: true })
        ])
      ]);
    }

    function etapaIntra() {
      return el('div', { class: 'pilha' }, [
        secao('Checklist de segurança cirúrgica', null, [
          grade([
            pergunta('Checklist realizado', 'processo', 'checklistRealizado'),
            pergunta('Etapa de entrada', 'processo', 'checklistEntrada'),
            pergunta('Pausa cirúrgica', 'processo', 'checklistPausa'),
            pergunta('Etapa de saída', 'processo', 'checklistSaida'),
            pergunta('Checklist completo', 'processo', 'checklistCompleto')
          ]),
          campo({ rotulo: 'Itens pendentes do checklist', secao: 'processo', chave: 'checklistPendencias',
            tipo: 'textarea', largo: true })
        ]),
        secao('Monitorização e profilaxias', 'Indicadores de processo do intraoperatório', [
          grade([
            pergunta('Capnografia contínua indicada', 'processo', 'capnografiaIndicada'),
            pergunta('Capnografia contínua utilizada', 'processo', 'capnografiaUsada')
          ]),
          el('div', { class: 'campos-auto mt-3' }, [
            campo({ rotulo: 'Motivo de indisponibilidade ou interrupção', secao: 'processo',
              chave: 'capnografiaMotivo', largura: 3 })
          ]),
          el('div', { class: 'campos-auto mt-3' }, [
            pergunta('Profilaxia antibiótica indicada', 'processo', 'atbIndicada'),
            campo({ rotulo: 'Antibiótico', secao: 'processo', chave: 'atbNome' }),
            campo({ rotulo: 'Dose', secao: 'processo', chave: 'atbDose' }),
            hora('Horário da administração', 'processo', 'atbHora'),
            hora('Horário da incisão', 'processo', 'incisaoHora'),
            pergunta('Houve redose', 'processo', 'atbRedose'),
            hora('Horário da redose', 'processo', 'atbRedoseHora')
          ]),
          el('div', { class: 'campos-auto mt-3' }, [
            pergunta('Profundidade anestésica indicada pelo protocolo', 'processo', 'profundidadeIndicada'),
            pergunta('Profundidade anestésica monitorizada', 'processo', 'profundidadeUsada'),
            campo({ rotulo: 'Dispositivo', secao: 'processo', chave: 'profundidadeDispositivo' })
          ]),
          el('div', { class: 'campos-auto mt-3' }, [
            pergunta('Aquecimento ativo', 'processo', 'aquecimentoAtivo'),
            pergunta('Monitorização de temperatura', 'processo', 'monitorTemperatura')
          ])
        ]),
        secao('Bloqueio neuromuscular', null, [
          grade([
            pergunta('Uso de bloqueador neuromuscular', 'processo', 'bnmUsado'),
            pergunta('Monitorização neuromuscular', 'processo', 'bnmMonitorizado')
          ]),
          el('div', { class: 'campos-auto mt-3' }, [
            campo({ rotulo: 'Método de monitorização', secao: 'processo', chave: 'bnmMetodo', tipo: 'select',
              opcoes: OPCOES_QUALIDADE.metodoTof, largura: 2 }),
            numero('Último valor da relação TOF', 'processo', 'tofValor', { casas: 2, exemplo: '0,90' }),
            hora('Momento da medição', 'processo', 'tofHora')
          ]),
          el('div', { class: 'campos-auto mt-3' }, [
            pergunta('Reversão do bloqueio neuromuscular', 'processo', 'bnmRevertido'),
            campo({ rotulo: 'Medicamento', secao: 'processo', chave: 'bnmRevMedicamento' }),
            campo({ rotulo: 'Dose', secao: 'processo', chave: 'bnmRevDose' }),
            hora('Horário', 'processo', 'bnmRevHora')
          ])
        ], null, 'geral'),
        secao('Medidas do intraoperatório', 'Os limiares clínicos ficam na configuração da coordenação', [
          grade([
            soSe('geral', pergunta('Intubação traqueal', 'intra', 'intubacao')),
            numero('Menor SpO₂ registrada (%)', 'intra', 'spo2Minima'),
            numero('Tempo acumulado abaixo do limiar de SpO₂ (min)', 'intra', 'minutosSpo2Abaixo'),
            numero('Menor PAM registrada (mmHg)', 'intra', 'pamMinima'),
            numero('Tempo acumulado abaixo do limiar de PAM (min)', 'intra', 'minutosPamAbaixo'),
            numero('Maior PA sistólica registrada (mmHg)', 'intra', 'pasMaxima')
          ]),
          campo({ rotulo: 'Observações do intraoperatório', secao: 'intra', chave: 'obs',
            tipo: 'textarea', largo: true })
        ]),
        secao('Eventos do intraoperatório', 'Responda cada item; quando houver evento, registre o detalhamento abaixo', [
          grade(eventosDaEtapa('intra').map(function (e) {
            return pergunta(e.rotulo, 'respostas', e.chave);
          })),
          el('div', { class: 'mt-4' }, [eventos('intra')])
        ])
      ]);
    }

    function etapaSrpa() {
      return el('div', { class: 'pilha' }, [
        secao('Recuperação pós-anestésica', 'Temperatura, náusea e vômito, dor', [
          grade([
            numero('Temperatura na chegada (°C)', 'srpa', 'temperaturaChegada', { casas: 1 }),
            pergunta('Náusea pós-operatória', 'srpa', 'nausea'),
            hora('Horário da avaliação de náusea', 'srpa', 'nauseaHora'),
            pergunta('Vômito pós-operatório', 'srpa', 'vomito'),
            hora('Horário da avaliação de vômito', 'srpa', 'vomitoHora')
          ]),
          el('div', { class: 'campos-auto mt-3' }, [
            campo({ rotulo: 'Tratamento realizado (náusea e vômito)', secao: 'srpa', chave: 'tratamentoNv', largura: 3 })
          ]),
          el('div', { class: 'campos-auto mt-3' }, [
            pergunta('Profilaxia de náusea e vômito indicada', 'srpa', 'profilaxiaNvIndicada'),
            pergunta('Profilaxia realizada', 'srpa', 'profilaxiaNvFeita'),
            campo({ rotulo: 'Medicamentos da profilaxia', secao: 'srpa', chave: 'profilaxiaNvMedicamentos', largura: 2 }),
            campo({ rotulo: 'Horários da profilaxia', secao: 'srpa', chave: 'profilaxiaNvHorarios' })
          ]),
          el('div', { class: 'campos-auto mt-3' }, [
            campo({ rotulo: 'Escala de dor', secao: 'srpa', chave: 'dorEscala', tipo: 'select',
              opcoes: OPCOES_QUALIDADE.escalaDor, largura: 2 }),
            numero('Pontuação', 'srpa', 'dorPontuacao', { casas: 1 }),
            hora('Horário', 'srpa', 'dorHora'),
            campo({ rotulo: 'Tratamento da dor', secao: 'srpa', chave: 'dorTratamento', largura: 2 }),
            numero('Pontuação na reavaliação', 'srpa', 'dorReavaliacao', { casas: 1 }),
            hora('Horário da reavaliação', 'srpa', 'dorReavaliacaoHora')
          ]),
          avisoDor(),
          campo({ rotulo: 'Observações da SRPA', secao: 'srpa', chave: 'obs', tipo: 'textarea', largo: true })
        ]),
        secao('Eventos da recuperação', null, [
          grade(eventosDaEtapa('srpa').map(function (e) {
            return pergunta(e.rotulo, 'respostas', e.chave);
          })),
          el('div', { class: 'mt-4' }, [eventos('srpa')])
        ])
      ]);
    }

    /** Destaque de EVA acima do limiar e de temperatura abaixo dele. */
    function avisoDor() {
      var caixa = el('div', { class: 'mt-3' });
      aoMudar(function (f) {
        var lim = store.configQualidade().limiares;
        var itens = [];
        if (f.srpa.dorPontuacao !== null && f.srpa.dorPontuacao > lim.dor) {
          itens.push('Dor ' + numTexto(f.srpa.dorPontuacao, 1) + ' acima do limiar configurado (' +
            numTexto(lim.dor) + ') — registre o tratamento e a reavaliação.');
        }
        if (f.srpa.temperaturaChegada !== null && f.srpa.temperaturaChegada < lim.temperatura) {
          itens.push('Temperatura ' + numTexto(f.srpa.temperaturaChegada, 1) + ' °C abaixo de ' +
            numTexto(lim.temperatura) + ' °C na chegada à SRPA.');
        }
        UI.preencher(caixa, itens.length
          ? [el('div', { class: 'aviso aviso-atencao' }, [icone('alerta'),
              el('div', { class: 'aviso-corpo' }, itens.join(' '))])]
          : []);
      });
      return caixa;
    }

    function etapaSeguimento() {
      var raiz = el('div', { class: 'pilha' });

      SEGUIMENTOS_QUALIDADE.forEach(function (s) {
        var corpo = el('div');
        var inputs = {};

        function desenhar(f) {
          var g = f.seguimentos[s.chave];
          var vencida = janelasVencidas(f, hoje, cir).some(function (j) { return j.chave === s.chave; });
          var fSit = UI.campo({
            rotulo: 'Situação', nome: 'seg_' + s.chave + '_situacao', tipo: 'select', valor: g.situacao,
            rotuloVazio: 'Pendente', opcoes: SITUACOES_SEGUIMENTO,
            aoMudar: function (ev) { salvar({ situacao: ev.target.value }, ev.target); }
          });
          var fData = UI.campo({
            rotulo: 'Data', nome: 'seg_' + s.chave + '_data', tipo: 'date', valor: g.data,
            aoMudar: function (ev) { salvar({ data: ev.target.value }, ev.target); }
          });
          var fHora = UI.campo({
            rotulo: 'Horário', nome: 'seg_' + s.chave + '_hora', tipo: 'time', valor: g.hora,
            aoMudar: function (ev) { salvar({ hora: ev.target.value }, ev.target); }
          });
          var fPor = UI.campo({
            rotulo: 'Quem realizou', nome: 'seg_' + s.chave + '_por', valor: g.por,
            aoMudar: function (ev) { salvar({ por: ev.target.value }, ev.target); }
          });
          var fJust = UI.campo({
            rotulo: 'Justificativa (sem informação ou perda de seguimento)', nome: 'seg_' + s.chave + '_just',
            tipo: 'textarea', valor: g.justificativa, largo: true,
            aoMudar: function (ev) { salvar({ justificativa: ev.target.value }, ev.target); }
          });
          var fObs = UI.campo({
            rotulo: 'Observações', nome: 'seg_' + s.chave + '_obs', tipo: 'textarea', valor: g.obs, largo: true,
            aoMudar: function (ev) { salvar({ obs: ev.target.value }, ev.target); }
          });
          inputs = { fSit: fSit, fData: fData };

          UI.preencher(corpo, [
            vencida && !g.situacao
              ? el('div', { class: 'aviso aviso-atencao' }, [icone('alerta'),
                el('div', { class: 'aviso-corpo' },
                  'A janela de ' + s.rotulo + ' já venceu e continua sem resposta.')])
              : null,
            el('div', { class: 'campos-auto' }, [fSit.no, fData.no, fHora.no, fPor.no]),
            el('div', { class: 'campo-grupo mt-3' }, [fJust.no, fObs.no]),
            el('div', { class: 'linha mt-3' }, [
              el('button', {
                class: 'btn btn-pq', type: 'button',
                onclick: function () {
                  salvar({ situacao: 'Realizado', data: hojeISO(), hora: horaAgora(), por: store.usuario });
                }
              }, [icone('check'), 'Marcar como realizado agora'])
            ])
          ]);
        }

        function salvar(dados, input) {
          var r = store.registrarSeguimentoQualidade(id, s.chave, dados);
          if (!r.ok) {
            var msg = r.erros.map(function (e) { return e.msg; }).join(' ');
            marcarErro(input, msg);
            UI.erro('Não foi possível salvar', msg);
            return;
          }
          marcarErro(input, null);
          app.salvar();
          refazer();
        }

        aoMudar(desenhar);

        raiz.appendChild(el('section', { class: 'cartao' }, [
          cab('Acompanhamento de ' + s.rotulo,
            'Sem dado posterior, registre "sem informação" ou "perda de seguimento" com a justificativa'),
          el('div', { class: 'cartao-corpo' }, [corpo])
        ]));
      });

      raiz.appendChild(el('section', { class: 'cartao' }, [
        cab('Eventos do acompanhamento', 'Óbito, despertar, disfunção neurológica, reintubação, isquemia'),
        el('div', { class: 'cartao-corpo' }, [
          el('div', { class: 'campos-auto' }, eventosDaEtapa('seg').map(function (e) {
            return pergunta(e.rotulo, 'respostas', e.chave);
          })),
          el('div', { class: 'mt-4' }, [eventos('seg')])
        ])
      ]));

      return raiz;
    }

    function etapaTransicao() {
      return el('div', { class: 'pilha' }, [
        secao('Passagem de cuidado', 'Quem transmite, quem recebe e o que foi transmitido', [
          grade([
            pergunta('Passagem de cuidado registrada', 'transicao', 'realizada'),
            campo({ rotulo: 'Destino', secao: 'transicao', chave: 'destino', tipo: 'select',
              opcoes: OPCOES_QUALIDADE.destinoPassagem }),
            hora('Horário', 'transicao', 'hora'),
            campo({ rotulo: 'Profissional que transmite', secao: 'transicao', chave: 'transmitidoPor', largura: 2 }),
            campo({ rotulo: 'Profissional que recebe', secao: 'transicao', chave: 'recebidoPor', largura: 2 })
          ]),
          el('div', { class: 'secao-form mt-3' }, [
            el('h4', null, 'Checklist das informações essenciais'),
            el('div', { class: 'campo-grupo' }, ITENS_PASSAGEM.map(function (i) {
              return marcarItem(i.rotulo, i.chave);
            }))
          ]),
          el('div', { class: 'campos-auto mt-3' }, [
            pergunta('Houve falha de comunicação', 'respostas', 'falhaComunicacao')
          ]),
          campo({ rotulo: 'Observações da passagem', secao: 'transicao', chave: 'obs',
            tipo: 'textarea', largo: true }),
          el('div', { class: 'mt-4' }, [eventos('transicao')])
        ]),
        secao('Satisfação do paciente', 'Experiência com a anestesia', [
          grade([
            pergunta('Pesquisa de satisfação aplicada', 'satisfacao', 'aplicada'),
            campo({ rotulo: 'Instrumento', secao: 'satisfacao', chave: 'instrumento', largura: 2 }),
            campo({ rotulo: 'Escala', secao: 'satisfacao', chave: 'escala' }),
            campo({ rotulo: 'Data', secao: 'satisfacao', chave: 'data', tipo: 'date' }),
            campo({ rotulo: 'Respondente', secao: 'satisfacao', chave: 'respondente', tipo: 'select',
              opcoes: OPCOES_QUALIDADE.respondente }),
            numero('Nota (0 a 10)', 'satisfacao', 'nota', { casas: 1 })
          ]),
          campo({ rotulo: 'Comentário', secao: 'satisfacao', chave: 'comentario', tipo: 'textarea', largo: true })
        ])
      ]);
    }

    function etapaRevisao() {
      var raiz = el('div', { class: 'pilha' });
      var corpo = el('div');

      aoMudar(function (f) {
        var fQuem = UI.campo({ rotulo: 'Revisado por', nome: 'rev_quem', valor: f.revisao.revisadoPor });
        var fParecer = UI.campo({ rotulo: 'Parecer da revisão clínica', nome: 'rev_parecer', tipo: 'textarea',
          linhas: 4, valor: f.revisao.parecer, largo: true });
        var escolhas = {};

        var tabelaEventos = f.eventos.length ? UI.tabela({
          colunas: [{ rotulo: 'Evento' }, { rotulo: 'Registrado por' }, { rotulo: 'Relação com a anestesia' },
            { rotulo: 'Investigação' }, { rotulo: 'Confirmação na revisão' }],
          linhas: f.eventos.map(function (ev, i) {
            var def = eventoQualidade(ev.tipo);
            var selConf = el('select', { class: 'entrada', 'aria-label': 'Confirmação' },
              [el('option', { value: '' }, '— não avaliado —')].concat(OPCOES_QUALIDADE.confirmacao.map(function (o) {
                return el('option', { value: o }, o);
              })));
            selConf.value = ev.confirmado;
            var selRel = el('select', { class: 'entrada', 'aria-label': 'Relação com a anestesia' },
              [el('option', { value: '' }, '—')].concat(OPCOES_QUALIDADE.relacao.map(function (o) {
                return el('option', { value: o }, o);
              })));
            selRel.value = ev.relacao;
            var selInv = el('select', { class: 'entrada', 'aria-label': 'Investigação' },
              [el('option', { value: '' }, '—')].concat(OPCOES_QUALIDADE.investigacao.map(function (o) {
                return el('option', { value: o }, o);
              })));
            selInv.value = ev.investigacao;
            escolhas[i] = { conf: selConf, rel: selRel, inv: selInv };
            return [
              el('div', null, [
                el('span', { class: 'celula-principal' }, def ? def.rotulo : ev.tipo),
                el('div', { class: 'celula-apoio' }, (UI.dataCurta(ev.data) || '') + ' ' + ev.hora)
              ]),
              el('div', null, [
                el('span', { class: 'selo selo-na sem-ponto' }, ev.origem),
                ev.registradoPor ? el('div', { class: 'celula-apoio' }, ev.registradoPor) : null
              ]),
              selRel, selInv, selConf
            ];
          })
        }) : el('div', { class: 'reg-vazio' }, 'Nenhum evento registrado neste atendimento.');

        UI.preencher(corpo, [
          el('div', { class: 'aviso aviso-info' }, [icone('info'),
            el('div', { class: 'aviso-corpo' },
              'A revisão clínica não apaga o que o anestesista registrou: ela acrescenta a confirmação, ' +
              'a relação com a anestesia e o parecer. Os dois ficam guardados.')]),
          el('div', { class: 'campo-grupo' }, [fQuem.no]),
          el('div', { class: 'mt-3' }, [tabelaEventos]),
          el('div', { class: 'campo-grupo mt-3' }, [fParecer.no]),
          el('div', { class: 'linha mt-3' }, [
            el('button', {
              class: 'btn btn-primario', type: 'button',
              onclick: function () {
                var eventos = Object.keys(escolhas).map(function (i) {
                  return { indice: Number(i), confirmado: escolhas[i].conf.value,
                    relacao: escolhas[i].rel.value, investigacao: escolhas[i].inv.value };
                });
                var r = store.revisarFichaQualidade(id, {
                  revisadoPor: fQuem.valor(), parecer: fParecer.valor(), eventos: eventos
                });
                if (!r.ok) { UI.resultado(r); return; }
                app.salvar();
                UI.ok('Revisão clínica registrada');
                refazer();
              }
            }, [icone('check'), 'Registrar revisão clínica']),
            f.revisao.revisadoEm
              ? el('span', { class: 't-suave' }, 'Última revisão: ' + f.revisao.revisadoPor + ' em ' +
                UI.dataCurta(f.revisao.revisadoEm.slice(0, 10)) + ' ' + f.revisao.revisadoEm.slice(11, 16))
              : null
          ])
        ]);
      });

      raiz.appendChild(el('section', { class: 'cartao' }, [
        cab('Revisão clínica', 'Confirmação posterior dos eventos e parecer'),
        el('div', { class: 'cartao-corpo' }, [corpo])
      ]));

      raiz.appendChild(historicoCartao());
      return raiz;
    }

    function historicoCartao() {
      var corpo = el('div');
      aoMudar(function (f) {
        UI.preencher(corpo, [f.historico.length ? UI.tabela({
          colunas: [{ rotulo: 'Quando' }, { rotulo: 'Quem' }, { rotulo: 'Etapa' }, { rotulo: 'Campo' },
            { rotulo: 'De' }, { rotulo: 'Para' }],
          linhas: f.historico.slice(-120).reverse().map(function (h) {
            return [
              UI.dataCurta(h.quando.slice(0, 10)) + ' ' + h.quando.slice(11, 16),
              h.quem, h.etapa, h.campo, h.de, h.para
            ];
          })
        }) : el('div', { class: 'reg-vazio' }, 'Nenhuma alteração registrada ainda.')]);
      });
      return el('section', { class: 'cartao' }, [
        cab('Histórico de alterações', 'Autor, data e horário de cada mudança'),
        el('div', { class: 'cartao-corpo rente' }, [corpo])
      ]);
    }

    /* ---- ações ---------------------------------------------------------- */

    function gerarPdf() {
      var f = atual();
      try {
        var g = QUALIDADE_PDF.gerarFicha(f, cir, {
          clinica: store.clinica(), hoje: hoje,
          estrutura: store.estruturaDoAtendimento(f, cir)
        });
        ANEXOS.baixarBlob(g.blob, g.nome).then(function (ok) { if (ok) UI.ok('PDF da ficha gerado', g.nome); });
      } catch (e) {
        UI.erro('Não foi possível gerar o PDF', e && e.message);
      }
    }

    function concluir() {
      var f = atual();
      var pend = pendenciasFicha(f, hoje, cir);
      var texto = pend.length
        ? 'Ainda faltam ' + totalPendenciasFicha(f, hoje, cir) + ' item(ns): ' +
          pend.map(function (g) { return g.rotulo; }).join(', ') +
          '. A ficha pode ser concluída assim mesmo — o que faltar continua contando como registro incompleto.'
        : 'Todos os itens do centro cirúrgico foram respondidos. O acompanhamento de 24 h, 48 h e 30 dias continua aberto.';
      UI.confirmar({ titulo: 'Concluir a ficha', texto: texto, rotulo: 'Concluir' }, function () {
        var r = store.concluirFichaQualidade(id);
        if (!r.ok) { UI.resultado(r); return; }
        app.salvar();
        (r.avisos || []).forEach(function (a) { UI.atencao('Registro incompleto', a.msg); });
        UI.ok('Ficha concluída', id);
        app.redesenhar();
      });
    }

    function reabrir() {
      var motivo = el('textarea', { class: 'entrada', rows: 3,
        placeholder: 'Por que a ficha precisa ser reaberta (pelo menos 10 letras)' });
      UI.abrirModal({
        titulo: 'Reabrir a ficha ' + id,
        tamanho: 'estreito',
        corpo: [
          el('p', null, 'O motivo fica no LOG de auditoria e no histórico da própria ficha.'),
          el('div', { class: 'campo' }, [el('div', { class: 'campo-rotulo' }, 'Motivo'), motivo])
        ],
        acoes: [
          el('div', { class: 'espaco' }),
          el('button', { class: 'btn', onclick: function () { UI.fecharModal(); } }, 'Cancelar'),
          el('button', {
            class: 'btn btn-primario',
            onclick: function () {
              var r = store.reabrirFichaQualidade(id, motivo.value);
              if (!r.ok) { UI.resultado(r); return; }
              UI.fecharModal();
              app.salvar();
              UI.ok('Ficha reaberta');
              app.redesenhar();
            }
          }, 'Reabrir')
        ]
      });
    }

    function descartar() {
      UI.confirmar({
        titulo: 'Descartar a ficha ' + id,
        texto: 'A ficha e os eventos registrados nela serão apagados. Só é possível enquanto ela nunca foi concluída nem revisada.',
        tipo: 'perigo', rotulo: 'Descartar'
      }, function () {
        var r = store.descartarFichaQualidade(id);
        if (!r.ok) { UI.resultado(r); return; }
        app.salvar();
        app.filtros.qualidade.id = '';
        UI.ok('Ficha descartada');
        app.redesenhar();
      });
    }

    /* ---- do boletim ----------------------------------------------------- */

    function boletimDaFicha() { var f = atual(); return f ? store.boletimDaCirurgia(f.idCirurgia) : null; }

    /** Por que o botão fica parado; '' quando dá para usar. */
    function motivoSemBoletim() {
      if (fechado()) return 'Reabra a ficha para copiar do boletim.';
      if (!boletimDaFicha()) return 'Esta cirurgia ainda não tem boletim anestésico.';
      return '';
    }

    /**
     * O boletim já registra peso, ASA, técnica, horários e sinais vitais que a ficha
     * pergunta de novo. Aqui a pessoa vê a comparação e escolhe o que copiar; nada
     * é gravado sem o clique, e resposta Sim/Não nunca vem do boletim.
     */
    function puxarDoBoletim() {
      var f = atual(), bol = boletimDaFicha();
      if (!f || !bol || fechado()) return;
      var todas = sugestoesDoBoletim(f, bol);
      var novas = todas.filter(function (s) { return s.situacao !== 'igual'; });
      var iguais = todas.length - novas.length;
      var rascunho = bol.status !== BOLETIM_FINALIZADO;
      var marcas = {};
      var primario = el('button', { class: 'btn btn-primario', type: 'button', onclick: copiar });

      function marcadas() { return novas.filter(function (s) { return marcas[s.campo].checked; }); }
      function atualizarBotao() {
        var n = marcadas().length;
        primario.disabled = !n;
        UI.preencher(primario, [icone('check'), n ? 'Copiar ' + n + ' campo(s)' : 'Nada marcado']);
      }

      function copiar() {
        var chaves = marcadas().map(function (s) { return s.campo; });
        if (!chaves.length) return;
        var r = store.preencherFichaDoBoletim(id, chaves);
        if (!r.ok) { UI.resultado(r); return; }
        UI.fecharModal();
        app.salvar();
        (r.avisos || []).forEach(function (a) { UI.atencao('Atenção', a.msg); });
        UI.ok('Ficha preenchida com o boletim ' + bol.id,
          r.preenchidos.length + ' campo(s) copiado(s). Cada um ficou no histórico da ficha.');
        trocar(aba);
      }

      var corpo = [el('div', { class: 'aviso aviso-' + (rascunho ? 'atencao' : 'info') }, [
        icone(rascunho ? 'alerta' : 'info'),
        el('div', { class: 'aviso-corpo' }, [
          el('strong', null, 'Boletim ' + bol.id + (rascunho ? ' · em preenchimento' : ' · finalizado e assinado')),
          el('div', { class: 't-pq' }, rascunho
            ? 'O boletim ainda pode mudar, e o que for copiado agora não acompanha uma correção depois. Se der, copie de um boletim finalizado.'
            : 'Marque o que copiar para a ficha. O que a ficha já tem só troca se você marcar.')
        ])
      ])];

      if (!novas.length) {
        corpo.push(el('p', { class: 't-medio' }, todas.length
          ? 'A ficha já tem os mesmos valores do boletim (' + iguais + ' campo(s)). Nada a copiar.'
          : 'O boletim ainda não tem valor que a ficha peça: idade, peso, ASA, técnica, horários ou sinais vitais.'));
      } else {
        corpo.push(UI.tabela({
          colunas: [{ rotulo: '' }, { rotulo: 'Campo' }, { rotulo: 'Na ficha' }, { rotulo: 'No boletim' }],
          linhas: novas.map(function (s) {
            var c = el('input', { type: 'checkbox', 'aria-label': 'Copiar ' + s.rotulo, onchange: atualizarBotao });
            c.checked = s.situacao === 'vazio';
            marcas[s.campo] = c;
            return [
              c,
              el('span', { class: 'celula-principal' }, s.rotulo),
              s.situacao === 'vazio'
                ? el('span', { class: 't-suave' }, '—')
                : el('span', { class: 't-alerta' }, s.atualTexto + ' (já preenchido)'),
              el('strong', null, s.novoTexto)
            ];
          })
        }));
        var notas = [];
        if (novas.some(function (s) { return s.secao === 'intra'; })) {
          notas.push('SpO₂, PAM e PA sistólica são o menor e o maior valor REGISTRADO nos sinais vitais do boletim; ' +
            'PAM = (PAS + 2 × PAD) ÷ 3. Valor que ninguém registrou no boletim não é copiado.');
        }
        notas.push('Ficam com quem preenche a ficha: respostas Sim/Não (eventos, checklist, indicações), o tempo abaixo do ' +
          'limiar de SpO₂ e de PAM (o boletim só tem amostras) e a dor da recuperação.');
        if (iguais) notas.push(iguais + ' campo(s) já iguais ao boletim não aparecem na lista.');
        corpo.push(el('div', { class: 'mt-3 t-mpq t-suave' }, notas.map(function (t) { return el('p', { class: 'sem-margem' }, t); })));
      }

      UI.abrirModal({
        titulo: 'Copiar do boletim ' + bol.id,
        sub: 'Ficha ' + id + (cir ? ' · ' + (cir.paciente || '') : ''),
        tamanho: 'largo',
        corpo: corpo,
        acoes: [
          el('div', { class: 'espaco' }),
          el('button', { class: 'btn', type: 'button', onclick: function () { UI.fecharModal(); } }, novas.length ? 'Cancelar' : 'Fechar'),
          novas.length ? primario : null
        ]
      });
      if (novas.length) atualizarBotao();
    }

    /* ---- montagem ------------------------------------------------------- */

    var ETAPAS_TELA = [
      { chave: 'identificacao', rotulo: 'Identificação', render: etapaIdentificacao },
      { chave: 'pre', rotulo: 'Pré-anestésica', render: etapaPre },
      { chave: 'intra', rotulo: 'Intraoperatório', render: etapaIntra },
      { chave: 'srpa', rotulo: 'Recuperação', render: etapaSrpa },
      { chave: 'seg', rotulo: 'Acompanhamento', render: etapaSeguimento },
      { chave: 'transicao', rotulo: 'Transição e satisfação', render: etapaTransicao },
      { chave: 'revisao', rotulo: 'Revisão clínica', render: etapaRevisao }
    ];

    var raiz = el('div', { class: 'pilha' });
    var pendCaixa = el('div');
    var botaoBoletim = el('button', { class: 'btn btn-pq', type: 'button', onclick: puxarDoBoletim }, [icone('nota'), 'Do boletim']);
    // O número é o de campos que o boletim preenche e a ficha ainda não tem.
    aoMudarFixo(function (f) {
      var motivo = motivoSemBoletim(), bol = boletimDaFicha();
      var vazias = !motivo && bol ? sugestoesDoBoletim(f, bol).filter(function (s) { return s.situacao === 'vazio'; }).length : 0;
      botaoBoletim.disabled = !!motivo;
      botaoBoletim.title = motivo || 'Copia para a ficha o que o boletim ' + bol.id +
        ' já registrou: dados do paciente, ASA, técnica, horários e as piores medidas dos sinais vitais.';
      UI.preencher(botaoBoletim, [icone('nota'), vazias ? 'Do boletim (' + vazias + ')' : 'Do boletim']);
    });

    var topo = el('div', { class: 'cartao' }, [
      cab('Ficha ' + id + ' · ' + (cir ? cir.paciente : 'cirurgia removida'),
        cir ? UI.data(cir.data) + ' · ' + (cir.procedimento || '') + ' · ' + (cir.anestesista || '') : '', [
          el('button', { class: 'btn btn-pq', onclick: function () {
            app.filtros.qualidade.id = ''; app.redesenhar();
          } }, [icone('voltar'), 'Lista']),
          el('button', { class: 'btn btn-pq', onclick: gerarPdf }, [icone('baixar'), 'PDF']),
          botaoBoletim,
          fechado()
            ? el('button', { class: 'btn btn-pq', onclick: reabrir }, [icone('troca'), 'Reabrir'])
            : el('button', { class: 'btn btn-primario btn-pq', onclick: concluir }, [icone('check'), 'Concluir']),
          fechado() ? null : el('button', { class: 'btn btn-pq', onclick: descartar }, [icone('lixeira'), 'Descartar'])
        ]),
      el('div', { class: 'cartao-corpo compacto' }, [
        el('div', { class: 'linha' }, [seloFicha(f0), pendCaixa])
      ])
    ]);
    raiz.appendChild(topo);

    // Registrado como fixo: trocar(aba) zera os atualizadores da etapa, e o chip do topo sumia junto.
    aoMudarFixo(function (f) {
      var n = totalPendenciasFicha(f, hoje, cir);
      var seg = seguimentosPendentes(f, hoje, cir);
      UI.preencher(pendCaixa, [
        n ? el('span', { class: 'selo selo-pendente' }, n + ' item(ns) sem resposta')
          : el('span', { class: 'selo selo-ok' }, 'sem itens em aberto'),
        seg.length ? el('span', { class: 'selo selo-remarcada' },
          'acompanhamento: ' + seg.map(function (s) { return s.rotulo; }).join(', ')) : null,
        f.revisao.revisadoEm ? el('span', { class: 'selo selo-info' }, 'revisada') : null
      ]);
    });

    var abas = el('div', { class: 'abas', role: 'tablist' });
    var conteudo = el('div');

    function trocar(chave) {
      aba = chave;
      app.filtros.qualidade.aba = chave;
      atualizadores = [];
      UI.preencher(abas, ETAPAS_TELA.map(function (e) {
        return COMP.abaBtn(e.rotulo, e.chave === aba, function () { trocar(e.chave); });
      }));
      var etapa = ETAPAS_TELA.filter(function (e) { return e.chave === aba; })[0] || ETAPAS_TELA[0];
      UI.preencher(conteudo, [etapa.render()]);
      refazer();
    }

    raiz.appendChild(el('div', { class: 'cartao' }, [el('div', { class: 'cartao-corpo compacto' }, [abas])]));
    raiz.appendChild(conteudo);
    trocar(aba);
    return raiz;
  }

  /* -------------------------------------------------------------- CSV -- */

  var COLUNAS_CSV = [
    { rotulo: 'ID FICHA', valor: function (l) { return l.f ? l.f.id : ''; }, tipo: 'texto' },
    { rotulo: 'ID CIRURGIA', valor: function (l) { return l.c.id; }, tipo: 'texto' },
    { rotulo: 'DATA', valor: function (l) { return l.c.data; }, tipo: 'data' },
    { rotulo: 'PACIENTE', valor: function (l) { return l.c.paciente; }, tipo: 'texto' },
    { rotulo: 'PRONTUÁRIO', valor: function (l) { return l.f ? l.f.atendimento.prontuario : ''; }, tipo: 'texto' },
    { rotulo: 'ANESTESISTA', valor: function (l) { return l.c.anestesista; }, tipo: 'texto' },
    { rotulo: 'PROCEDIMENTO', valor: function (l) { return l.c.procedimento; }, tipo: 'texto' },
    { rotulo: 'ESPECIALIDADE', valor: function (l) { return l.f ? l.f.atendimento.especialidade : ''; }, tipo: 'texto' },
    { rotulo: 'SALA', valor: function (l) { return l.f ? (l.f.atendimento.sala || l.c.sala) : l.c.sala; }, tipo: 'texto' },
    { rotulo: 'CARÁTER', valor: function (l) { return l.f ? l.f.atendimento.carater : ''; }, tipo: 'texto' },
    { rotulo: 'ASA', valor: function (l) { return l.f ? l.f.atendimento.asa : ''; }, tipo: 'texto' },
    { rotulo: 'TÉCNICA', valor: function (l) { return l.f ? l.f.atendimento.tecnicas.join(' + ') : ''; }, tipo: 'texto' },
    { rotulo: 'SITUAÇÃO', valor: function (l) { return l.f ? l.f.status : 'Sem ficha'; }, tipo: 'texto' },
    { rotulo: 'EVENTOS', valor: function (l) { return l.f ? l.f.eventos.length : ''; }, tipo: 'inteiro' },
    { rotulo: 'ITENS SEM RESPOSTA', valor: function (l) { return l.pend === null ? '' : l.pend; }, tipo: 'inteiro' },
    { rotulo: 'ACOMPANHAMENTOS EM ABERTO', valor: function (l) { return l.f ? l.seg : ''; }, tipo: 'inteiro' },
    { rotulo: 'REVISÃO CLÍNICA', valor: function (l) { return l.f ? l.f.revisao.revisadoPor : ''; }, tipo: 'texto' }
  ];

  function baixarCSV(app, linhas) {
    var m = [COLUNAS_CSV.map(function (c) { return c.rotulo; })];
    linhas.forEach(function (l) {
      m.push(COLUNAS_CSV.map(function (c) { return DADOS.paraCelula(c.valor(l), c.tipo); }));
    });
    DADOS.baixarCSV('QUALIDADE_fichas_' + app.mes + '_' + app.ano, m);
    UI.ok('CSV gerado');
  }

  /* ------------------------------------------------------------ render -- */

  function render(app) {
    var id = app.filtros.qualidade.id;
    var f = id ? app.store.fichaQualidade(id) : null;
    if (id && !f) app.filtros.qualidade.id = '';
    return f ? editor(app, f) : lista(app);
  }

  return { render: render, abrir: abrir, lista: lista, COLUNAS_CSV: COLUNAS_CSV };
})();
