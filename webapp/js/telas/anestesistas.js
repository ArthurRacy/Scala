/**
 * ============================================================================
 * TELA — Anestesistas
 * ============================================================================
 * Cadastro mestre da equipe: dias fixos (da escala-base) e chave PIX.
 * ============================================================================
 */
'use strict';

TELAS.anestesistas = (function () {

  var el = UI.el, icone = UI.icone;
  var kpi = COMP.kpi, cab = COMP.cabecalhoCartao, nomeMes = COMP.nomeMes;

  function anestesistas(app) {
    var store = app.store;
    var lista = store.estado.anestesistas;
    var comp = store.comparativo(app.mes, app.ano);

    var porNome = {};
    comp.forEach(function (l) { porNome[normalizar(l.anestesista)] = l; });
    var diasFixos = core.diasFixosPorAnestesista(store.estado.escalaBase);

    return el('div', { class: 'pilha' }, [
      el('div', { class: 'grade grade-4' }, [
        kpi({ rotulo: 'Cadastrados', valor: UI.inteiro(lista.length), tom: 'acento' }),
        kpi({ rotulo: 'Ativos', valor: UI.inteiro(lista.filter(function (a) { return ehSim(a.ativo); }).length) }),
        kpi({ rotulo: 'Com cirurgia no mês',
              valor: UI.inteiro(comp.filter(function (l) { return l.numCirurgias > 0; }).length),
              nota: nomeMes(app.mes) }),
        kpi({ rotulo: 'Postos no rodízio',
              valor: UI.inteiro(DOMINIOS.DIA_SEMANA_ESCALA.length * CONFIG.POSICOES.length),
              nota: '6 dias × 5 posições' })
      ]),

      el('div', { class: 'cartao' }, [
        cab('Cadastro de anestesistas', 'o NOME é a chave de vínculo com a escala e as cirurgias · dias fixos vêm da escala-base', [
          el('button', {
            class: 'btn btn-primario btn-pq',
            onclick: function () { formAnestesista(app, null); }
          }, [icone('mais'), 'Novo'])
        ]),
        el('div', { class: 'cartao-corpo rente' }, UI.tabela({
          colunas: [
            { rotulo: 'ID' }, { rotulo: 'Nome' }, { rotulo: 'Ativo' },
            { rotulo: 'Dias fixos', dica: 'Dias da semana em que está na escala-base. A posição gira; o dia não.' },
            { rotulo: 'CRM' }, { rotulo: 'Telefone' }, { rotulo: 'E-mail' }, { rotulo: 'Chave PIX' },
            { rotulo: 'Cirurgias no mês', num: true },
            { rotulo: '', classe: 'acoes' }
          ],
          linhas: lista.map(function (a) {
            var m = porNome[normalizar(a.nome)] || { numCirurgias: 0 };
            var linha = [
              el('span', { class: 'mono t-suave' }, a.id),
              el('span', { class: 'celula-principal' }, a.nome),
              ehSim(a.ativo)
                ? el('span', { class: 'selo selo-ok' }, 'Sim')
                : el('span', { class: 'selo selo-na' }, 'Não'),
              seloDiasFixos(diasFixos[normalizar(a.nome)]),
              vazio(a.crm) ? UI.ou(a.crm) : el('span', { class: 'mono t-pq' }, a.crm),
              UI.ou(a.telefone),
              UI.ou(a.email),
              vazio(a.pix) ? UI.ou(a.pix) : el('span', { class: 'mono t-pq' }, a.pix),
              UI.inteiro(m.numCirurgias),
              el('button', {
                class: 'btn btn-plano btn-icone btn-pq', title: 'Editar', 'aria-label': 'Editar',
                onclick: function (ev) { ev.stopPropagation(); formAnestesista(app, a); }
              }, icone('lapis'))
            ];
            return { celulas: linha, __onclick: function () { formAnestesista(app, a); } };
          }),
          vazio: {
            icone: 'pessoas', titulo: 'Nenhum anestesista cadastrado',
            texto: 'Cadastre a equipe para poder montar a escala-base.'
          }
        }))
      ])
    ]);
  }

  /** Dias fixos como selos curtos: "Seg" "Qui". */
  function seloDiasFixos(dias) {
    if (!dias || !dias.length) return el('span', { class: 't-suave', title: 'Fora da escala-base' }, '—');
    return el('div', { class: 'dias-fixos', title: dias.map(UI.diaSemana).join(' e ') },
      dias.map(function (d) { return el('span', { class: 'selo selo-info sem-ponto' }, siglaDia(d)); }));
  }

  function siglaDia(dia) {
    var s = UI.diaSemana(dia);
    return s.slice(0, 3);
  }

  function formAnestesista(app, a) {
    var store = app.store;
    var novo = !a;
    a = a || {};
    var dias = novo ? null : core.diasFixosPorAnestesista(store.estado.escalaBase)[normalizar(a.nome)];

    var fNome = UI.campo({ rotulo: 'Nome', nome: 'nome', obrigatorio: true, valor: a.nome || '', largo: true,
      dica: 'Usado como chave em toda a planilha — evite renomear sem necessidade.' });
    var fAtivo = UI.campo({ rotulo: 'Ativo', nome: 'ativo', tipo: 'select', vazioPermitido: false,
      opcoes: DOMINIOS.SIM_NAO, valor: a.ativo || 'Sim' });
    var fTel = UI.campo({ rotulo: 'Telefone', nome: 'telefone', valor: a.telefone || '', exemplo: '(00) 00000-0000' });
    var fEmail = UI.campo({ rotulo: 'E-mail', nome: 'email', tipo: 'email', valor: a.email || '' });
    var fPix = UI.campo({ rotulo: 'Chave PIX', nome: 'pix', valor: a.pix || '',
      exemplo: 'CPF, CNPJ, e-mail, celular ou chave aleatória',
      dica: 'Para o repasse. Confira com o próprio anestesista antes de usar.' });
    var fCrm = UI.campo({ rotulo: 'CRM', nome: 'crm', valor: a.crm || '', exemplo: '12345-DF',
      dica: 'Sai na assinatura do boletim anestésico.' });
    var fDias = UI.campo({ rotulo: 'Dias fixos na escala', nome: '_dias', calculado: true,
      valor: novo ? 'definidos pela escala-base após o cadastro'
        : (dias && dias.length ? dias.map(UI.diaSemana).join(' e ') : 'fora da escala-base'),
      dica: 'Vem da escala-base (tela Escala). Para mudar o dia, altere lá.' });
    var fObs = UI.campo({ rotulo: 'Observações', nome: 'obs', tipo: 'textarea', valor: a.obs || '', largo: true, linhas: 2 });

    var form = UI.formulario([fNome, fAtivo, fCrm, fTel, fEmail, fPix, fObs]);

    function salvar() {
      var d = form.dados();
      if (!novo) d.id = a.id;

      var r = store.salvarAnestesista(d);
      if (!r.ok) {
        var soltos = form.mostrarErros(r.erros);
        if (soltos.length) UI.erro('Não foi possível salvar', soltos.join(' '));
        return;
      }
      UI.fecharModal();
      UI.resultado(r, novo ? 'Anestesista cadastrado' : 'Cadastro atualizado');
      app.salvarEredesenhar();
    }

    UI.abrirModal({
      titulo: novo ? 'Novo anestesista' : a.nome,
      sub: novo ? 'O ID é gerado automaticamente' : 'ID ' + a.id,
      tamanho: 'estreito',
      corpo: [
        novo ? null : el('div', { class: 'aviso aviso-atencao' }, [
          icone('alerta'),
          el('div', { class: 'aviso-corpo' }, [
            el('strong', null, 'Alterar o nome atualiza tudo'),
            el('div', { class: 't-pq' },
              'As cirurgias, a escala e as avaliações se ligam a este cadastro pelo NOME. Ao renomear, ' +
              'o sistema troca o nome em todos esses registros e anota no LOG. Para afastar alguém do ' +
              'rodízio, marque como inativo em vez de renomear.')
          ])
        ]),
        fNome.no,
        el('div', { class: 'campo-grupo mt-3' }, [fAtivo.no, fCrm.no]),
        el('div', { class: 'campo-grupo mt-3' }, [fTel.no, fEmail.no]),
        el('div', { class: 'mt-3' }, fPix.no),
        el('div', { class: 'mt-3' }, fDias.no),
        el('div', { class: 'mt-3' }, fObs.no)
      ],
      acoes: [
        el('div', { class: 'espaco' }),
        el('button', { class: 'btn', onclick: function () { UI.fecharModal(); } }, 'Cancelar'),
        el('button', { class: 'btn btn-primario', onclick: salvar }, [icone('check'), 'Salvar'])
      ]
    });
  }

  return {
    render: anestesistas,
    form: formAnestesista
  };
})();
