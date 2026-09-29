/**
 * ============================================================================
 * TELA — Painel de indicadores de qualidade
 * ============================================================================
 * Três abas:
 *
 *   Indicadores   filtros (período, unidade, especialidade, procedimento,
 *                 técnica, ASA, caráter e profissional), cartões por grupo com
 *                 eventos, elegíveis, taxa, registros sem informação e a
 *                 evolução; um clique abre a definição e a fórmula.
 *   Comparação    o mesmo indicador por profissional, SEMPRE ao lado do perfil
 *                 dos pacientes (ASA III+ e procedimentos não eletivos) — taxa
 *                 sem perfil de risco não é comparação.
 *   Configuração  limiares, metas, referências (fonte, versão e data) e a
 *                 aprovação do responsável técnico. Área da coordenação.
 *
 * Exportação: CSV (Excel), PDF e PPTX, sempre agregados e sem identificação
 * de paciente.
 * ============================================================================
 */
'use strict';

TELAS.painel_qualidade = (function () {

  var el = UI.el, icone = UI.icone;
  var cab = COMP.cabecalhoCartao;

  function num(v, casas) {
    if (v === null || v === undefined || v === '') return '—';
    return typeof v === 'number' ? String(casas === undefined ? v : v.toFixed(casas)).replace('.', ',') : String(v);
  }

  function pct(v) { return v === null || v === undefined ? '—' : UI.pct(v); }

  /** "1 evento" / "2 eventos" — plural certo no cartão. */
  function conta(n, singular, plural) { return n + ' ' + (n === 1 ? singular : (plural || singular + 's')); }

  /**
   * A coordenação é quem configura as definições clínicas e quem compara
   * profissionais entre si (no servidor da clínica, o administrador). Quem é
   * da equipe vê o painel do serviço, mas não o ranking individual — a
   * comparação é a parte do painel que mais pesa sobre uma pessoa.
   * No computador único, quem usa é a coordenação.
   */
  function ehCoordenacao(app) {
    return !app.servidor || (typeof SERVIDOR !== 'undefined' && SERVIDOR.ehAdmin());
  }
  var podeConfigurar = ehCoordenacao;

  /* ------------------------------------------------------------ filtros */

  function barraFiltros(app, atendimentosTodos) {
    var f = app.filtros.painel_qualidade;

    function seletor(campo, rotulo, opcoes) {
      if (campo === 'anestesista' && !ehCoordenacao(app)) return null;
      return el('label', { class: 'filtro' }, [
        el('span', { class: 'filtro-rotulo' }, rotulo),
        COMP.seletor({
          valor: f[campo], largura: '170px',
          opcoes: [{ valor: '', rotulo: 'Todos' }].concat(opcoes.map(function (o) {
            return { valor: o, rotulo: o };
          })),
          aoMudar: function (v) { f[campo] = v; app.redesenhar(); }
        })
      ]);
    }

    function dataCampo(campo, rotulo) {
      return el('label', { class: 'filtro' }, [
        el('span', { class: 'filtro-rotulo' }, rotulo),
        el('input', {
          class: 'entrada', type: 'date', value: f[campo], style: 'width:160px',
          onchange: function (ev) { f[campo] = ev.target.value; app.redesenhar(); }
        })
      ]);
    }

    var tecnicas = {};
    atendimentosTodos.forEach(function (a) { a.tecnicas.forEach(function (t) { tecnicas[t] = true; }); });

    return el('div', { class: 'cartao-corpo compacto' }, [
      el('div', { class: 'linha filtros-qualidade' }, [
        dataCampo('de', 'De'),
        dataCampo('ate', 'Até'),
        seletor('unidade', 'Unidade', opcoesDeFiltroQualidade(atendimentosTodos, 'unidade')),
        seletor('especialidade', 'Especialidade', opcoesDeFiltroQualidade(atendimentosTodos, 'especialidade')),
        seletor('procedimento', 'Procedimento', opcoesDeFiltroQualidade(atendimentosTodos, 'tipo')),
        seletor('tecnica', 'Técnica', Object.keys(tecnicas).sort()),
        seletor('asa', 'ASA', OPCOES_QUALIDADE.asa),
        seletor('carater', 'Caráter', OPCOES_QUALIDADE.carater),
        seletor('anestesista', 'Profissional', opcoesDeFiltroQualidade(atendimentosTodos, 'anestesista')),
        el('button', {
          class: 'btn btn-pq',
          onclick: function () {
            ['de', 'ate', 'unidade', 'especialidade', 'procedimento', 'tecnica', 'asa', 'carater', 'anestesista']
              .forEach(function (k) { f[k] = ''; });
            app.redesenhar();
          }
        }, 'Limpar filtros')
      ])
    ]);
  }

  /* -------------------------------------------------------- indicadores */

  function cartaoIndicador(ind) {
    var alvo = ind.tipo === 'processo' ? ['adesão', 'adesões'] : ['evento', 'eventos'];
    var foraDaMeta = ind.meta !== null && ind.taxa !== null &&
      (ind.tipo === 'processo' ? ind.taxa < ind.meta : ind.taxa > ind.meta);

    var no = el('div', { class: 'ind-cartao' + (foraDaMeta ? ' fora-da-meta' : '') }, [
      el('div', { class: 'ind-topo' }, [
        el('div', { class: 'ind-nome' }, ind.nome),
        el('button', {
          class: 'btn btn-plano btn-icone btn-pq', type: 'button',
          title: 'Definição, fórmula e população elegível', 'aria-label': 'Definição de ' + ind.nome,
          onclick: function () { definicao(ind); }
        }, icone('info'))
      ]),
      el('div', { class: 'ind-taxa' }, [
        el('strong', null, pct(ind.taxa)),
        ind.meta === null ? null : el('span', { class: 'ind-meta' }, 'meta ' + pct(ind.meta))
      ]),
      el('div', { class: 'ind-numeros' }, [
        el('span', null, conta(ind.eventos, alvo[0], alvo[1])),
        el('span', null, ind.respondidos + ' com informação'),
        el('span', null, conta(ind.elegiveis, 'elegível', 'elegíveis'))
      ]),
      ind.elegiveis === 0
        ? el('div', { class: 'ind-ok' }, 'nenhum atendimento elegível no recorte')
        : ind.semInformacao
          ? el('div', { class: 'ind-alerta' }, ind.semInformacao + ' sem informação' +
            (ind.semAcompanhamento ? ' · ' + ind.semAcompanhamento + ' sem acompanhamento' : ''))
          : el('div', { class: 'ind-ok' }, 'todos os elegíveis respondidos'),
      ind.serie && ind.serie.length > 1 ? faixaEvolucao(ind) : null
    ]);
    return no;
  }

  /** Mini-evolução: uma barra por mês, altura proporcional à taxa. */
  function faixaEvolucao(ind) {
    var maior = Math.max.apply(null, ind.serie.map(function (p) { return p.taxa === null ? 0 : p.taxa; }).concat([1]));
    return el('div', { class: 'ind-serie', role: 'img',
      'aria-label': 'Evolução: ' + ind.serie.map(function (p) {
        return p.mes + ' ' + (p.taxa === null ? 'sem informação' : p.taxa + '%');
      }).join(', ') }, ind.serie.slice(-12).map(function (p) {
        var altura = p.taxa === null ? 2 : Math.max(2, Math.round(p.taxa / maior * 26));
        return el('span', {
          class: 'ind-barra' + (p.taxa === null ? ' vazia' : ''),
          style: 'height:' + altura + 'px',
          title: p.mes + ': ' + (p.taxa === null ? 'sem informação' : p.taxa + '% (' + p.eventos + '/' + p.respondidos + ')')
        });
      }));
  }

  function definicao(ind) {
    UI.abrirModal({
      titulo: ind.nome,
      tamanho: 'estreito',
      corpo: [
        COMP.def('Grupo', ind.grupo),
        COMP.def('Tipo', ind.tipo === 'processo' ? 'Indicador de processo (maior é melhor)'
          : 'Indicador de desfecho (menor é melhor)'),
        el('div', { class: 'secao-form mt-3' }, [
          el('h4', null, 'Definição'), el('p', { class: 'sem-margem t-medio' }, ind.definicao)
        ]),
        el('div', { class: 'secao-form' }, [
          el('h4', null, 'Fórmula'), el('p', { class: 'sem-margem t-medio' }, ind.formula)
        ]),
        el('div', { class: 'secao-form' }, [
          el('h4', null, 'População elegível'), el('p', { class: 'sem-margem t-medio' }, ind.elegibilidade)
        ]),
        el('div', { class: 'secao-form' }, [
          el('h4', null, 'Referência normativa ou técnica'),
          el('p', { class: 'sem-margem t-medio' }, ind.referencia
            ? ind.referencia.fonte + (ind.referencia.versao ? ' · versão ' + ind.referencia.versao : '') +
              (ind.referencia.revisadaEm ? ' · revisada em ' + UI.data(ind.referencia.revisadaEm) : '')
            : 'Nenhuma fonte registrada. O sistema não atribui este indicador a nenhuma entidade por conta própria — ' +
              'a coordenação registra a fonte, a versão e a data de revisão na configuração clínica.')
        ]),
        el('div', { class: 'secao-form' }, [
          el('h4', null, 'Números no recorte atual'),
          COMP.def('Eventos (numerador)', String(ind.eventos)),
          COMP.def('Com informação (denominador)', String(ind.respondidos)),
          COMP.def('População elegível', String(ind.elegiveis)),
          COMP.def('Sem informação', String(ind.semInformacao)),
          ind.janela ? COMP.def('Sem acompanhamento', String(ind.semAcompanhamento)) : null,
          COMP.def('Cobertura', pct(ind.cobertura)),
          COMP.def('Taxa', pct(ind.taxa), null, true)
        ])
      ],
      acoes: [
        el('div', { class: 'espaco' }),
        el('button', { class: 'btn btn-primario', onclick: function () { UI.fecharModal(); } }, 'Fechar')
      ]
    });
  }

  function abaIndicadores(app, painel) {
    var raiz = el('div', { class: 'pilha' });
    var c = painel.completude;

    raiz.appendChild(el('div', { class: 'grade grade-4' }, [
      COMP.kpi({ rotulo: 'Atendimentos com ficha', valor: UI.inteiro(c.atendimentos), tom: 'acento' }),
      COMP.kpi({ rotulo: 'Fichas incompletas', valor: UI.inteiro(c.incompletas),
        tom: c.incompletas ? 'alerta' : null, nota: c.itensPendentes + ' item(ns) sem resposta' }),
      COMP.kpi({ rotulo: 'Acompanhamentos em aberto', valor: UI.inteiro(c.semAcompanhamento),
        tom: c.semAcompanhamento ? 'alerta' : null, nota: '24 h, 48 h ou 30 dias vencidos' }),
      COMP.kpi({ rotulo: 'Fichas com revisão clínica', valor: UI.inteiro(c.revisadas),
        nota: c.concluidas + ' concluída(s)' })
    ]));

    if (!painel.aprovada) {
      raiz.appendChild(el('div', { class: 'aviso aviso-atencao' }, [icone('alerta'),
        el('div', { class: 'aviso-corpo' }, [
          el('strong', null, 'Definições clínicas ainda não aprovadas'),
          'Os limiares em uso são os padrão do sistema. Antes da implantação, o responsável técnico de ' +
          'anestesiologia precisa revisar e aprovar as definições, os limites de duração, os critérios de ' +
          'elegibilidade e as metas — na aba Configuração.'
        ])]));
    }

    gruposQualidade().forEach(function (grupo) {
      var linhas = painel.indicadores.filter(function (i) { return i.grupo === grupo; });
      if (!linhas.length) return;
      raiz.appendChild(el('div', { class: 'cartao' }, [
        cab(grupo, linhas.length + ' indicador(es)'),
        el('div', { class: 'cartao-corpo' }, [
          el('div', { class: 'ind-grade' }, linhas.map(cartaoIndicador))
        ])
      ]));
    });

    raiz.appendChild(el('div', { class: 'cartao' }, [
      cab('Tabela completa', 'Cada indicador com numerador, denominador e registros sem informação'),
      el('div', { class: 'cartao-corpo rente' }, UI.tabela({
        colunas: [{ rotulo: 'Indicador' }, { rotulo: 'Grupo' }, { rotulo: 'Eventos', num: true },
          { rotulo: 'Com informação', num: true }, { rotulo: 'Elegíveis', num: true },
          { rotulo: 'Sem informação', num: true }, { rotulo: 'Taxa', num: true }, { rotulo: 'Meta', num: true }],
        linhas: painel.indicadores.map(function (i) {
          return [
            el('span', { class: 'celula-principal' }, i.nome), i.grupo,
            UI.inteiro(i.eventos), UI.inteiro(i.respondidos), UI.inteiro(i.elegiveis),
            i.semInformacao ? el('span', { class: 't-alerta' }, UI.inteiro(i.semInformacao)) : '0',
            el('strong', null, pct(i.taxa)),
            i.meta === null ? '—' : pct(i.meta)
          ];
        }),
        vazio: { icone: 'grafico', titulo: 'Nenhum atendimento no recorte' }
      }))
    ]));

    var s = painel.satisfacao;
    var e = painel.estrutura;
    raiz.appendChild(el('div', { class: 'grade grade-2' }, [
      el('div', { class: 'cartao' }, [
        cab('Satisfação do paciente', 'Experiência com a anestesia'),
        el('div', { class: 'cartao-corpo' }, [
          COMP.def('Respostas com nota', String(s.respostas)),
          COMP.def('Nota média', s.media === null ? '—' : num(s.media, 1), null, true),
          s.instrumentos.length
            ? el('div', { class: 'mt-3' }, s.instrumentos.map(function (i) {
              return COMP.def(i.instrumento, i.respostas + ' resposta(s)');
            }))
            : el('p', { class: 'sem-margem t-suave' }, 'Nenhum instrumento registrado no recorte.')
        ])
      ]),
      el('div', { class: 'cartao' }, [
        cab('Estrutura no período', e.registros + ' registro(s) da coordenação'),
        el('div', { class: 'cartao-corpo' }, [
          COMP.def('Carro de parada checado', pct(e.carro.taxa)),
          COMP.def('Sangue e hemoderivados disponíveis', pct(e.sangue.taxa)),
          COMP.def('Anestesiologistas por sala', e.equipe.anestesiologistasPorSala === null ? '—'
            : num(e.equipe.anestesiologistasPorSala, 2)),
          COMP.def('Treinamentos e simulações', String(e.treinamentos.length)),
          el('div', { class: 'mt-3' }, e.itens.filter(function (i) { return i.critico && i.indisponiveis; })
            .map(function (i) { return COMP.def(i.rotulo, i.indisponiveis + ' registro(s) indisponível(is)', 'alerta'); }))
        ])
      ])
    ]));

    return raiz;
  }

  /* --------------------------------------------------------- comparação */

  /** Taxa de um estrato de risco, com o n ao lado: taxa sem n engana. */
  function celulaEstrato(e) {
    if (!e || !e.respondidos) return el('span', { class: 't-suave' }, '—');
    return el('div', null, [
      el('strong', null, pct(e.taxa)),
      el('div', { class: 'celula-apoio' }, e.eventos + '/' + e.respondidos)
    ]);
  }

  function areaDaCoordenacao(texto) {
    return el('div', { class: 'cartao' }, [
      el('div', { class: 'cartao-corpo' }, [
        UI.vazioEstado({ icone: 'cadeado', titulo: 'Área da coordenação', texto: texto })
      ])
    ]);
  }

  function abaComparacao(app, painel) {
    if (!ehCoordenacao(app)) return areaDaCoordenacao(
      'A comparação entre profissionais é feita pela coordenação, com o perfil dos pacientes de cada um ao lado.');
    var f = app.filtros.painel_qualidade;
    if (!f.indicador) f.indicador = painel.indicadores.length ? painel.indicadores[0].chave : '';
    var ind = painel.indicadores.filter(function (i) { return i.chave === f.indicador; })[0] || painel.indicadores[0];
    if (!ind) return el('div', { class: 'cartao' }, [el('div', { class: 'cartao-corpo' },
      [UI.vazioEstado({ icone: 'grafico', titulo: 'Sem indicadores no recorte' })])]);

    var linhas = comparativoQualidade(painel.atendimentos, ind.chave,
      { cfg: painel.config, hoje: hojeISO() });
    var maior = Math.max.apply(null, [1].concat(linhas.map(function (l) { return l.taxa === null ? 0 : l.taxa; })));

    return el('div', { class: 'pilha' }, [
      el('div', { class: 'aviso aviso-info' }, [icone('info'),
        el('div', { class: 'aviso-corpo' }, [
          el('strong', null, 'Comparar exige olhar o perfil junto'),
          'Compare dentro do mesmo estrato: as colunas ASA I–II e ASA III+ separam a taxa de cada profissional ' +
          'por risco do paciente, e o perfil (ASA III+ e não eletivos) mostra o que cada um atende. Este é um ' +
          'ajuste por estratificação, não um modelo estatístico de risco. Com poucos casos (veja o n embaixo de ' +
          'cada taxa), a taxa é instável — um evento muda tudo.'
        ])]),
      el('div', { class: 'cartao' }, [
        cab('Comparação por profissional', ind.nome, [
          COMP.seletor({
            valor: f.indicador, largura: '280px',
            opcoes: painel.indicadores.map(function (i) { return { valor: i.chave, rotulo: i.nome }; }),
            aoMudar: function (v) { f.indicador = v; app.redesenhar(); }
          }),
          el('button', { class: 'btn btn-pq', onclick: function () { baixarComparacaoCSV(ind, linhas); } },
            [icone('baixar'), 'CSV'])
        ]),
        el('div', { class: 'cartao-corpo rente' }, UI.tabela({
          colunas: [{ rotulo: 'Profissional' }, { rotulo: 'Atendimentos', num: true },
            { rotulo: 'Elegíveis', num: true }, { rotulo: 'Com informação', num: true },
            { rotulo: 'Eventos', num: true }, { rotulo: 'Sem informação', num: true },
            { rotulo: 'Taxa', num: true, dica: 'Todos os atendimentos do profissional' },
            { rotulo: 'ASA I–II', num: true, dica: 'Taxa só nos atendimentos ASA I ou II (n com informação)' },
            { rotulo: 'ASA III+', num: true, dica: 'Taxa só nos atendimentos ASA III a VI (n com informação)' },
            { rotulo: 'ASA III+ no perfil', num: true }, { rotulo: 'Não eletivos', num: true }],
          linhas: linhas.map(function (l) {
            return [
              el('span', { class: 'celula-principal' }, l.anestesista),
              UI.inteiro(l.atendimentos), UI.inteiro(l.elegiveis), UI.inteiro(l.respondidos),
              UI.inteiro(l.eventos),
              l.semInformacao ? el('span', { class: 't-alerta' }, UI.inteiro(l.semInformacao)) : '0',
              GFX.barraCelula(l.taxa === null ? 0 : l.taxa, maior, pct(l.taxa)),
              celulaEstrato(l.estratoBaixo), celulaEstrato(l.estratoAlto),
              pct(l.pctAsa3mais), pct(l.pctNaoEletivo)
            ];
          }),
          vazio: { icone: 'pessoas', titulo: 'Sem atendimentos no recorte' }
        }))
      ]),
      el('div', { class: 'cartao' }, [
        cab('Definição usada nesta comparação', ind.nome),
        el('div', { class: 'cartao-corpo' }, [
          COMP.def('Definição', ind.definicao),
          COMP.def('Fórmula', ind.formula),
          COMP.def('População elegível', ind.elegibilidade)
        ])
      ])
    ]);
  }

  /* -------------------------------------------------------- configuração */

  var ROTULOS_LIMIARES = {
    spo2: { rotulo: 'SpO₂ mínima aceitável (%)', dica: 'Abaixo disto conta como hipoxemia intraoperatória.' },
    pam: { rotulo: 'PAM mínima aceitável (mmHg)', dica: 'Abaixo disto conta como hipotensão intraoperatória.' },
    pasGrave: { rotulo: 'PA sistólica de hipertensão grave (mmHg)', dica: 'Referência para o registro do evento.' },
    temperatura: { rotulo: 'Temperatura mínima na chegada à SRPA (°C)', dica: 'Abaixo disto conta como hipotermia.' },
    dor: { rotulo: 'Pontuação de dor considerada forte', dica: 'Acima disto o registro é destacado.' },
    tof: { rotulo: 'Relação TOF adequada', dica: 'Igual ou acima disto conta como adequada.' },
    jejumSolidos: { rotulo: 'Jejum mínimo para sólidos (h)' },
    jejumLiquidos: { rotulo: 'Jejum mínimo para líquidos (h)' },
    antibioticoJanela: { rotulo: 'Janela do antibiótico antes da incisão (min)',
      dica: 'Administrar entre 0 e este valor antes da incisão conta como no tempo.' }
  };

  function abaConfiguracao(app, painel) {
    var store = app.store;
    var cfg = JSON.parse(JSON.stringify(painel.config));

    if (!podeConfigurar(app)) return areaDaCoordenacao(
      'As definições clínicas, os limiares, as metas e as referências são configurados pelo ' +
      'administrador do sistema da clínica.');

    var camposLimiar = {};
    var camposMeta = {};
    var camposRef = {};
    var desativados = {};

    Object.keys(ROTULOS_LIMIARES).forEach(function (k) {
      camposLimiar[k] = UI.campo({
        rotulo: ROTULOS_LIMIARES[k].rotulo, nome: 'lim_' + k, modo: 'decimal',
        valor: num(cfg.limiares[k]), dica: ROTULOS_LIMIARES[k].dica
      });
    });

    var fResp = UI.campo({ rotulo: 'Responsável técnico de anestesiologia', nome: 'ap_resp',
      valor: cfg.aprovacao.responsavel, obrigatorio: true });
    var fCrm = UI.campo({ rotulo: 'CRM', nome: 'ap_crm', valor: cfg.aprovacao.crm });
    var fEm = UI.campo({ rotulo: 'Data da aprovação', nome: 'ap_em', tipo: 'date', valor: cfg.aprovacao.em });
    var fVersao = UI.campo({ rotulo: 'Versão do protocolo', nome: 'ap_versao', valor: cfg.aprovacao.versao,
      exemplo: 'v1.0' });
    var fObs = UI.campo({ rotulo: 'Observações da aprovação', nome: 'ap_obs', tipo: 'textarea',
      valor: cfg.aprovacao.obs, largo: true });

    function linhaIndicador(ind) {
      var meta = el('input', { class: 'entrada', inputmode: 'decimal', 'aria-label': 'Meta de ' + ind.nome,
        placeholder: '%', value: ind.meta === null ? '' : num(ind.meta) });
      var fonte = el('input', { class: 'entrada', 'aria-label': 'Fonte de ' + ind.nome,
        placeholder: 'Fonte normativa ou técnica',
        value: ind.referencia ? ind.referencia.fonte : '' });
      var versao = el('input', { class: 'entrada', 'aria-label': 'Versão da fonte', placeholder: 'Versão',
        value: ind.referencia ? ind.referencia.versao : '' });
      var revisada = el('input', { class: 'entrada', type: 'date', 'aria-label': 'Data de revisão',
        value: ind.referencia ? ind.referencia.revisadaEm : '' });
      var ativo = el('input', { type: 'checkbox' });
      ativo.checked = !cfg.desativados[ind.chave];

      camposMeta[ind.chave] = meta;
      camposRef[ind.chave] = { fonte: fonte, versao: versao, revisada: revisada };
      desativados[ind.chave] = ativo;

      return [
        el('div', null, [
          el('span', { class: 'celula-principal' }, ind.nome),
          el('div', { class: 'celula-apoio' }, ind.grupo)
        ]),
        el('label', { class: 'marcar' }, [ativo, el('span', null, 'ativo')]),
        meta, fonte, versao, revisada
      ];
    }

    var tabelaIndicadores = UI.tabela({
      colunas: [{ rotulo: 'Indicador' }, { rotulo: 'No painel' }, { rotulo: 'Meta (%)' },
        { rotulo: 'Fonte' }, { rotulo: 'Versão' }, { rotulo: 'Revisada em' }],
      linhas: painel.indicadores.map(linhaIndicador)
    });

    function salvar() {
      var limiares = {};
      Object.keys(camposLimiar).forEach(function (k) { limiares[k] = camposLimiar[k].valor(); });
      var metas = {}, referencias = {}, des = {};
      Object.keys(camposMeta).forEach(function (k) {
        if (camposMeta[k].value !== '') metas[k] = camposMeta[k].value;
        var r = camposRef[k];
        if (r.fonte.value) {
          referencias[k] = { fonte: r.fonte.value, versao: r.versao.value, revisadaEm: r.revisada.value };
        }
        if (!desativados[k].checked) des[k] = true;
      });
      var res = store.salvarConfigQualidade({
        limiares: limiares, metas: metas, referencias: referencias, desativados: des,
        aprovacao: { responsavel: fResp.valor(), crm: fCrm.valor(), em: fEm.valor(),
          versao: fVersao.valor(), obs: fObs.valor() }
      });
      if (!res.ok) { UI.resultado(res); return; }
      app.salvarEredesenhar();
      UI.ok('Configuração clínica salva',
        fResp.valor() && fEm.valor() ? 'Aprovada por ' + fResp.valor() + '.'
          : 'Sem aprovação registrada: o painel continua avisando.');
    }

    return el('div', { class: 'pilha' }, [
      el('div', { class: 'aviso aviso-info' }, [icone('info'),
        el('div', { class: 'aviso-corpo' }, [
          el('strong', null, 'Nada aqui é atribuído a uma entidade pelo sistema'),
          'Quando um indicador tiver origem normativa ou técnica, registre a fonte, a versão e a data de revisão ' +
          'na linha dele. Indicador sem fonte aparece no painel como "nenhuma fonte registrada" — e é isso mesmo ' +
          'que deve aparecer enquanto o serviço não decidir a referência.'
        ])]),

      el('div', { class: 'cartao' }, [
        cab('Aprovação do responsável técnico',
          'Enquanto não houver responsável e data, o painel avisa que as definições não foram aprovadas'),
        el('div', { class: 'cartao-corpo' }, [
          el('div', { class: 'campo-grupo' }, [fResp.no, fCrm.no]),
          el('div', { class: 'campo-grupo mt-3' }, [fEm.no, fVersao.no]),
          el('div', { class: 'campo-grupo mt-3' }, [fObs.no])
        ])
      ]),

      el('div', { class: 'cartao' }, [
        cab('Limiares clínicos', 'Usados no cálculo dos indicadores e nos destaques da ficha'),
        el('div', { class: 'cartao-corpo' }, [
          el('div', { class: 'campo-grupo-3' }, Object.keys(ROTULOS_LIMIARES).map(function (k) {
            return camposLimiar[k].no;
          }))
        ])
      ]),

      el('div', { class: 'cartao' }, [
        cab('Indicadores, metas e referências', painel.indicadores.length + ' indicador(es)'),
        el('div', { class: 'cartao-corpo rente' }, tabelaIndicadores)
      ]),

      el('div', { class: 'cartao' }, [
        el('div', { class: 'cartao-corpo' }, [
          el('div', { class: 'linha' }, [
            el('div', { class: 'espaco' }),
            el('button', { class: 'btn btn-primario', onclick: salvar }, [icone('check'), 'Salvar configuração'])
          ])
        ])
      ])
    ]);
  }

  /* -------------------------------------------------------- exportação */

  function linhasCSV(painel) {
    var m = [['INDICADOR', 'GRUPO', 'TIPO', 'EVENTOS', 'COM INFORMAÇÃO', 'ELEGÍVEIS', 'SEM INFORMAÇÃO',
      'SEM ACOMPANHAMENTO', 'TAXA (%)', 'COBERTURA (%)', 'META (%)', 'DEFINIÇÃO', 'FÓRMULA',
      'POPULAÇÃO ELEGÍVEL', 'FONTE', 'VERSÃO DA FONTE', 'FONTE REVISADA EM']];
    painel.indicadores.forEach(function (i) {
      m.push([
        DADOS.paraCelula(i.nome, 'texto'), DADOS.paraCelula(i.grupo, 'texto'),
        DADOS.paraCelula(i.tipo === 'processo' ? 'Processo' : 'Desfecho', 'texto'),
        DADOS.paraCelula(i.eventos, 'inteiro'), DADOS.paraCelula(i.respondidos, 'inteiro'),
        DADOS.paraCelula(i.elegiveis, 'inteiro'), DADOS.paraCelula(i.semInformacao, 'inteiro'),
        DADOS.paraCelula(i.semAcompanhamento, 'inteiro'),
        DADOS.paraCelula(i.taxa, 'numero'), DADOS.paraCelula(i.cobertura, 'numero'),
        DADOS.paraCelula(i.meta, 'numero'),
        DADOS.paraCelula(i.definicao, 'texto'), DADOS.paraCelula(i.formula, 'texto'),
        DADOS.paraCelula(i.elegibilidade, 'texto'),
        DADOS.paraCelula(i.referencia ? i.referencia.fonte : '', 'texto'),
        DADOS.paraCelula(i.referencia ? i.referencia.versao : '', 'texto'),
        DADOS.paraCelula(i.referencia ? i.referencia.revisadaEm : '', 'data')
      ]);
    });
    return m;
  }

  function linhasEvolucaoCSV(painel) {
    var m = [['INDICADOR', 'MÊS', 'EVENTOS', 'COM INFORMAÇÃO', 'ELEGÍVEIS', 'TAXA (%)']];
    painel.indicadores.forEach(function (i) {
      (i.serie || []).forEach(function (p) {
        m.push([DADOS.paraCelula(i.nome, 'texto'), DADOS.paraCelula(p.mes, 'texto'),
          DADOS.paraCelula(p.eventos, 'inteiro'), DADOS.paraCelula(p.respondidos, 'inteiro'),
          DADOS.paraCelula(p.elegiveis, 'inteiro'), DADOS.paraCelula(p.taxa, 'numero')]);
      });
    });
    return m;
  }

  function baixarCSV(painel) {
    DADOS.baixarCSV('INDICADORES_qualidade', linhasCSV(painel));
    UI.ok('CSV gerado', 'Dados agregados, sem identificação de paciente.');
  }

  /**
   * Uma linha por atendimento, com o resultado de cada indicador. Sem nome,
   * prontuário nem data exata (só o mês): a ficha é identificada pelo ID.
   * É a planilha para conferir de onde vem cada número do painel.
   */
  function linhasAtendimentosCSV(app, painel) {
    var resultados = app.store.resultadosQualidade(painel.filtros);
    var cab = ['FICHA', 'MÊS', 'ANESTESISTA', 'ESPECIALIDADE', 'UNIDADE', 'TIPO DE PROCEDIMENTO', 'TÉCNICA',
      'ASA', 'CARÁTER', 'SITUAÇÃO DA FICHA', 'EVENTOS REGISTRADOS']
      .concat(painel.indicadores.map(function (i) { return i.nome.toUpperCase(); }));
    var m = [cab];
    resultados.forEach(function (r) {
      m.push([r.ficha, r.mes, r.anestesista, r.especialidade, r.unidade, r.tipoProcedimento, r.tecnicas,
        r.asa, r.carater, r.situacaoFicha, r.eventos]
        .map(function (v) { return DADOS.paraCelula(v, typeof v === 'number' ? 'inteiro' : 'texto'); })
        .concat(painel.indicadores.map(function (i) { return DADOS.paraCelula(r.resultados[i.chave], 'texto'); })));
    });
    return m;
  }

  function baixarAtendimentosCSV(app, painel) {
    DADOS.baixarCSV('QUALIDADE_atendimentos_sem_identificacao', linhasAtendimentosCSV(app, painel));
    UI.ok('CSV gerado', 'Uma linha por atendimento, sem nome, prontuário nem data exata.');
  }

  function baixarPacote(app, painel) {
    var arquivos = [
      { nome: 'indicadores.csv', dados: DADOS.paraCSV(linhasCSV(painel)) },
      { nome: 'evolucao.csv', dados: DADOS.paraCSV(linhasEvolucaoCSV(painel)) },
      { nome: 'atendimentos_sem_identificacao.csv', dados: DADOS.paraCSV(linhasAtendimentosCSV(app, painel)) }
    ];
    var blob = DADOS.zip(arquivos);
    ANEXOS.baixarBlob(blob, 'Indicadores de qualidade.zip').then(function (ok) {
      if (ok) UI.ok('Planilhas geradas', 'indicadores, evolução e atendimentos — sem identificação de paciente.');
    });
  }

  function baixarPDF(app, painel) {
    try {
      var g = QUALIDADE_PDF.gerarRelatorio(painel, { clinica: app.store.clinica(), anonimo: true });
      ANEXOS.baixarBlob(g.blob, g.nome).then(function (ok) { if (ok) UI.ok('Relatório gerado', g.nome); });
    } catch (e) {
      UI.erro('Não foi possível gerar o PDF', e && e.message);
    }
  }

  /** Slides do painel: capa, cobertura, um slide por grupo e as ressalvas. */
  function slidesDoPainel(app, painel) {
    var clinica = app.store.clinica();
    var periodo = QUALIDADE_PDF.periodoTexto(painel.filtros);
    var rodape = (clinica.nome || CONFIG.NOME_SISTEMA) + ' · gerado em ' +
      (dataBR(agoraTexto().slice(0, 10)) || '');
    var c = painel.completude;

    var slides = [{
      titulo: 'Indicadores de qualidade e segurança em anestesia',
      subtitulo: periodo + ' · ' + QUALIDADE_PDF.filtrosTexto(painel.filtros),
      linhas: [
        { rotulo: 'Atendimentos com ficha', valor: String(c.atendimentos) },
        { rotulo: 'Fichas concluídas', valor: String(c.concluidas) },
        { rotulo: 'Fichas com revisão clínica', valor: String(c.revisadas) },
        { rotulo: 'Fichas incompletas', valor: String(c.incompletas), destaque: c.incompletas > 0 },
        { rotulo: 'Acompanhamentos em aberto', valor: String(c.semAcompanhamento), destaque: c.semAcompanhamento > 0 }
      ],
      texto: [painel.aprovada
        ? 'Definições aprovadas por ' + painel.config.aprovacao.responsavel + ' em ' +
          (dataBR(painel.config.aprovacao.em) || '') + '.'
        : 'As definições clínicas ainda não foram aprovadas pelo responsável técnico; os limiares em uso são os padrão do sistema.'],
      rodape: rodape
    }];

    // Um slide por grupo, em até 9 indicadores por slide (os grupos longos viram "1/2", "2/2").
    var POR_SLIDE = 9;
    gruposQualidade().forEach(function (grupo) {
      var linhas = painel.indicadores.filter(function (i) { return i.grupo === grupo; });
      if (!linhas.length) return;
      var paginas = Math.ceil(linhas.length / POR_SLIDE);
      for (var p = 0; p < paginas; p++) {
        slides.push({
          titulo: grupo + (paginas > 1 ? '  (' + (p + 1) + '/' + paginas + ')' : ''),
          subtitulo: periodo + ' · taxa = numerador ÷ denominador; o que ficou sem informação não entra na conta',
          tabela: {
            colunas: [
              { rotulo: 'Indicador', largura: 13.6 },
              { rotulo: 'Taxa', largura: 3.2, alinhar: 'direita' },
              { rotulo: 'Numerador', largura: 3.6, alinhar: 'direita' },
              { rotulo: 'Denominador', largura: 4.0, alinhar: 'direita' },
              { rotulo: 'Sem informação', largura: 4.9, alinhar: 'direita' }
            ],
            linhas: linhas.slice(p * POR_SLIDE, (p + 1) * POR_SLIDE).map(function (i) {
              var fora = i.meta !== null && i.taxa !== null &&
                (i.tipo === 'processo' ? i.taxa < i.meta : i.taxa > i.meta);
              return [
                i.nome,
                { texto: i.taxa === null ? 'sem taxa' : String(i.taxa).replace('.', ',') + '%', destaque: fora },
                String(i.eventos), String(i.respondidos),
                { texto: String(i.semInformacao) + (i.semAcompanhamento ? '  (' + i.semAcompanhamento + ' s/ acomp.)' : ''),
                  destaque: i.semInformacao > 0 && i.semInformacao >= i.elegiveis / 3 }
              ];
            })
          },
          rodape: rodape
        });
      }
    });

    // Estrutura e satisfação, num slide só.
    var e = painel.estrutura, sat = painel.satisfacao;
    slides.push({
      titulo: 'Estrutura e satisfação',
      subtitulo: periodo + ' · ' + e.registros + ' registro(s) de estrutura da coordenação',
      linhas: [
        { rotulo: 'Carro de parada checado', valor: e.carro.taxa === null ? 'sem informação'
          : String(e.carro.taxa).replace('.', ',') + '%   (' + e.carro.checados + '/' + e.carro.respondidos + ')' },
        { rotulo: 'Sangue e hemoderivados disponíveis', valor: e.sangue.taxa === null ? 'sem informação'
          : String(e.sangue.taxa).replace('.', ',') + '%   (' + e.sangue.disponiveis + '/' + e.sangue.respondidos + ')' },
        { rotulo: 'Anestesiologistas por sala', valor: e.equipe.anestesiologistasPorSala === null ? '—'
          : String(e.equipe.anestesiologistasPorSala).replace('.', ',') },
        { rotulo: 'Treinamentos e simulações no período', valor: String(e.treinamentos.length) },
        { rotulo: 'Equipamento essencial com registro de indisponibilidade',
          valor: String(e.itens.filter(function (i) { return i.critico && i.indisponiveis > 0; }).length) + ' item(ns)',
          destaque: e.itens.some(function (i) { return i.critico && i.indisponiveis > 0; }) },
        { rotulo: 'Satisfação do paciente (nota média)', valor: sat.media === null ? 'sem respostas'
          : String(sat.media).replace('.', ',') + '   (' + sat.respostas + ' resposta(s))' }
      ],
      rodape: rodape
    });

    slides.push({
      titulo: 'Como ler estes números',
      subtitulo: periodo,
      texto: [
        'Dado ausente não é resultado negativo: fica em "sem informação", fora do numerador e fora do denominador.',
        'O denominador de cada indicador é a sua população elegível com informação, não o total de atendimentos.',
        'A atribuição de um evento à anestesia é avaliação clínica registrada evento a evento; o sistema não presume causalidade.',
        'Comparações entre profissionais exigem considerar ASA, caráter do procedimento e volume.',
        'Indicador sem fonte registrada aparece sem referência normativa — é a coordenação que registra fonte, versão e data.'
      ],
      rodape: rodape
    });

    return slides;
  }

  function baixarPPTX(app, painel) {
    try {
      var blob = PPTX.gerar(slidesDoPainel(app, painel), 'Indicadores de qualidade');
      ANEXOS.baixarBlob(blob, 'Indicadores de qualidade.pptx').then(function (ok) {
        if (ok) UI.ok('Apresentação gerada', 'Indicadores de qualidade.pptx');
      });
    } catch (e) {
      UI.erro('Não foi possível gerar a apresentação', e && e.message);
    }
  }

  function baixarComparacaoCSV(ind, linhas) {
    var m = [['ANESTESISTA', 'ATENDIMENTOS', 'ELEGÍVEIS', 'COM INFORMAÇÃO', 'EVENTOS', 'SEM INFORMAÇÃO',
      'TAXA (%)', 'ASA I-II: COM INFORMAÇÃO', 'ASA I-II: EVENTOS', 'ASA I-II: TAXA (%)',
      'ASA III+: COM INFORMAÇÃO', 'ASA III+: EVENTOS', 'ASA III+: TAXA (%)', 'ASA III+ NO PERFIL (%)',
      'NÃO ELETIVOS NO PERFIL (%)']];
    linhas.forEach(function (l) {
      m.push([
        DADOS.paraCelula(l.anestesista, 'texto'), DADOS.paraCelula(l.atendimentos, 'inteiro'),
        DADOS.paraCelula(l.elegiveis, 'inteiro'), DADOS.paraCelula(l.respondidos, 'inteiro'),
        DADOS.paraCelula(l.eventos, 'inteiro'), DADOS.paraCelula(l.semInformacao, 'inteiro'),
        DADOS.paraCelula(l.taxa, 'numero'),
        DADOS.paraCelula(l.estratoBaixo.respondidos, 'inteiro'), DADOS.paraCelula(l.estratoBaixo.eventos, 'inteiro'),
        DADOS.paraCelula(l.estratoBaixo.taxa, 'numero'),
        DADOS.paraCelula(l.estratoAlto.respondidos, 'inteiro'), DADOS.paraCelula(l.estratoAlto.eventos, 'inteiro'),
        DADOS.paraCelula(l.estratoAlto.taxa, 'numero'),
        DADOS.paraCelula(l.pctAsa3mais, 'numero'), DADOS.paraCelula(l.pctNaoEletivo, 'numero')
      ]);
    });
    DADOS.baixarCSV('QUALIDADE_comparacao_' + ind.chave, m);
    UI.ok('CSV gerado');
  }

  /* ------------------------------------------------------------ render */

  function render(app) {
    var store = app.store;
    var f = app.filtros.painel_qualidade;
    var todos = store.atendimentosQualidade({});
    var painel = store.painelQualidade(f);

    var raiz = el('div', { class: 'pilha' });

    raiz.appendChild(el('div', { class: 'cartao' }, [
      cab('Painel de qualidade e segurança',
        painel.completude.atendimentos + ' atendimento(s) no recorte · ' +
        QUALIDADE_PDF.periodoTexto(f), [
          el('button', { class: 'btn btn-pq', onclick: function () { baixarCSV(painel); } },
            [icone('baixar'), 'CSV']),
          el('button', { class: 'btn btn-pq', onclick: function () { baixarAtendimentosCSV(app, painel); } },
            [icone('baixar'), 'Atendimentos']),
          el('button', { class: 'btn btn-pq', onclick: function () { baixarPacote(app, painel); } },
            [icone('baixar'), 'Planilhas (.zip)']),
          el('button', { class: 'btn btn-pq', onclick: function () { baixarPDF(app, painel); } },
            [icone('baixar'), 'PDF']),
          el('button', { class: 'btn btn-pq', onclick: function () { baixarPPTX(app, painel); } },
            [icone('baixar'), 'PPTX'])
        ]),
      barraFiltros(app, todos)
    ]));

    var abas = el('div', { class: 'abas', role: 'tablist' });
    var conteudo = el('div');
    var ABAS = [
      { chave: 'indicadores', rotulo: 'Indicadores', render: function () { return abaIndicadores(app, painel); } },
      { chave: 'comparacao', rotulo: 'Comparação por profissional', render: function () { return abaComparacao(app, painel); } },
      { chave: 'config', rotulo: 'Configuração clínica', render: function () { return abaConfiguracao(app, painel); } }
    ];

    function trocar(chave) {
      f.aba = chave;
      UI.preencher(abas, ABAS.map(function (a) {
        return COMP.abaBtn(a.rotulo, a.chave === f.aba, function () { trocar(a.chave); });
      }));
      var alvo = ABAS.filter(function (a) { return a.chave === f.aba; })[0] || ABAS[0];
      UI.preencher(conteudo, [alvo.render()]);
    }

    raiz.appendChild(el('div', { class: 'cartao' }, [el('div', { class: 'cartao-corpo compacto' }, [abas])]));
    raiz.appendChild(conteudo);
    trocar(f.aba || 'indicadores');
    return raiz;
  }

  return {
    render: render,
    linhasCSV: linhasCSV,
    linhasEvolucaoCSV: linhasEvolucaoCSV,
    linhasAtendimentosCSV: linhasAtendimentosCSV,
    slidesDoPainel: slidesDoPainel,
    ehCoordenacao: ehCoordenacao
  };
})();
