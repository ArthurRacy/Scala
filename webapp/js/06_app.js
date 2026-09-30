/**
 * ============================================================================
 * 06_APP — Casca, navegação e ciclo de vida
 * ============================================================================
 * Responsabilidades (e só estas):
 *   - montar a barra lateral, o topo e a área de conteúdo;
 *   - guardar o que é estado de TELA (mês, ano, aba, filtros) — o estado de
 *     DADO vive no store do core;
 *   - redesenhar a tela ativa depois de cada alteração;
 *   - salvar no navegador a cada transação (auto-save);
 *   - ligar os efeitos colaterais do store que moram fora dele (PDFs de exame).
 *
 * As telas ficam em js/telas/ e se registram em TELAS (01b_componentes).
 * Só existe um caminho de atualização: `app.salvarEredesenhar()`. Só existe
 * um caminho para trocar o estado inteiro: `app.trocarEstado()`.
 * ============================================================================
 */
'use strict';

var APP = (function () {

  var el = UI.el, icone = UI.icone;

  /* ------------------------------------------------------------ telas -- */

  var TELAS_DEF = [
    { chave: 'painel',       rotulo: 'Painel',             icone: 'painel',       grupo: 'Visão geral' },
    { chave: 'escala',       rotulo: 'Escala',             icone: 'calendario',   grupo: 'Operação' },
    { chave: 'quadro',       rotulo: 'Quadro do dia',      icone: 'quadro',       grupo: 'Operação' },
    { chave: 'cirurgias',    rotulo: 'Cirurgias',          icone: 'bisturi',      grupo: 'Operação' },
    { chave: 'avaliacoes',   rotulo: 'Avaliações pré',     icone: 'estetoscopio', grupo: 'Operação' },
    { chave: 'boletim',      rotulo: 'Boletim anestésico', icone: 'nota',         grupo: 'Operação' },
    { chave: 'qualidade',    rotulo: 'Qualidade',          icone: 'escudo',       grupo: 'Operação' },
    { chave: 'horas',        rotulo: 'Horas',              icone: 'relogio',      grupo: 'Gestão' },
    { chave: 'financeiro',   rotulo: 'Financeiro',         icone: 'dinheiro',     grupo: 'Gestão' },
    { chave: 'repasse',      rotulo: 'Repasse',            icone: 'pessoas',      grupo: 'Gestão' },
    { chave: 'indicadores',  rotulo: 'Indicadores',        icone: 'grafico',      grupo: 'Gestão' },
    { chave: 'painel_qualidade', rotulo: 'Painel de qualidade', icone: 'escudo',  grupo: 'Gestão' },
    { chave: 'estrutura',    rotulo: 'Estrutura',          icone: 'quadro',       grupo: 'Gestão' },
    { chave: 'anestesistas', rotulo: 'Anestesistas',       icone: 'pessoas',      grupo: 'Cadastro' },
    { chave: 'clinica',      rotulo: 'Clínica e termo',    icone: 'nota',         grupo: 'Cadastro' },
    { chave: 'integridade',  rotulo: 'Integridade',        icone: 'escudo',       grupo: 'Cadastro' },
    { chave: 'log',          rotulo: 'Auditoria',          icone: 'historico',    grupo: 'Cadastro' },
    // Só no servidor da clínica, só para o administrador.
    { chave: 'usuarios',     rotulo: 'Usuários',           icone: 'cadeado',      grupo: 'Cadastro', soAdminServidor: true }
  ];

  var SUBTITULOS = {
    painel: 'Visão consolidada do mês',
    escala: 'Rodízio, escala mensal e substituições',
    quadro: 'As 5 posições do dia, hora a hora',
    cirurgias: 'Base principal — todas as ligações partem daqui',
    avaliacoes: 'Consultas pré-anestésicas, exames do paciente e termo de consentimento',
    boletim: 'Registro da anestesia: técnica, sinais vitais, fármacos, recuperação e assinatura',
    qualidade: 'Indicadores de qualidade e segurança por paciente e por procedimento anestésico',
    horas: 'Horas reais e estimadas, sempre em colunas separadas',
    financeiro: 'Indicadores mensais e ledger unificado',
    repasse: 'Divisão igual do resultado do mês, com a chave PIX de cada um',
    indicadores: 'Produção do grupo: cirurgias, avaliações e horas por anestesista',
    painel_qualidade: 'Desfechos, processos e estrutura, com definição, fórmula e completude',
    estrutura: 'Equipamentos, carro de parada, equipe e treinamentos por unidade, sala e turno',
    anestesistas: 'Cadastro mestre da equipe',
    clinica: 'Identificação da clínica e texto do termo de consentimento',
    integridade: 'Verificação de consistência dos dados',
    log: 'Trilha de auditoria das alterações críticas',
    usuarios: 'Quem entra no sistema da clínica, com que papel'
  };

  /* ------------------------------------------------------------ estado -- */

  var app = {
    store: null,
    telaAtual: 'painel',
    // Mês/ano de referência do topo — definidos na partida (mês atual).
    mes: null,
    ano: null,
    origemDados: null,

    /** Sobe a cada gravação; invalida os cálculos guardados em cache. */
    revisao: 0,

    /** Outra aba gravou por cima: esta para de salvar até recarregar. */
    bloqueadaPorOutraAba: false,

    filtros: {
      cirurgias:   { texto: '', status: '', anestesista: '', todosOsMeses: false },
      avaliacoes:  { texto: '', situacao: '', anestesista: '', todosOsMeses: false },
      escala:      { aba: 'mes', anestesista: '', soAjustes: false, texto: '', todosOsMeses: false },
      quadro:      { data: '' },
      boletim:     { id: '', situacao: '', texto: '' },
      qualidade:   { id: '', aba: 'identificacao', situacao: '', texto: '' },
      painel_qualidade: { aba: 'indicadores', de: '', ate: '', unidade: '', especialidade: '',
                          procedimento: '', tecnica: '', asa: '', carater: '', anestesista: '', indicador: '' },
      estrutura:   { texto: '', todosOsMeses: false },
      financeiro:  { texto: '', situacao: '', tipo: '', todosOsMeses: false },
      repasse:     { base: 'caixa' },
      log:         { texto: '', aba: '' }
    }
  };

  var nos = {};      // referências do DOM montado uma única vez

  /* ------------------------------------------------------------- setup -- */

  function iniciar() {
    /* 1. Tema antes de desenhar, para não piscar branco no escuro. */
    UI.aplicarTema(UI.temaAtual());

    /* 2. Estado salvo (IndexedDB, com migração do localStorage antigo) ou seed.
          A leitura é assíncrona: até ela voltar, a página mostra "Carregando". */
    var carregando = el('div', { class: 'carregando', role: 'status' }, 'Carregando os dados…');
    document.body.appendChild(carregando);
    function tirarCarregando() { if (carregando.parentNode) carregando.parentNode.removeChild(carregando); }

    // No servidor da clínica os dados vêm de lá (com login); fora dele, deste navegador.
    SERVIDOR.detectar().then(function (m) {
      if (m.modo === 'local') {
        return GUARDA.carregar().then(function (lido) { tirarCarregando(); partir(lido); },
          function (e) { tirarCarregando(); partir({ estado: null, erro: e }); });
      }
      tirarCarregando();
      if (m.modo === 'entrada') SERVIDOR.telaDeEntrada(m);
      else if (m.modo === 'fora') SERVIDOR.telaForaDoAr();
      else partirServidor(m);
    }).catch(falhaNaPartida);
  }

  /**
   * Erro na partida (arquivo que não carregou, dado que não se lê…): sem isto a
   * promessa rejeitava calada e a pessoa ficava olhando para uma tela vazia.
   */
  function falhaNaPartida(e) {
    if (window.console && console.error) console.error('Falha na partida', e);
    if (window.CORE_INCOMPLETO) return;   // o bootstrap já explicou, com a lista do que falta
    var carregando = document.querySelector('.carregando');
    if (carregando && carregando.parentNode) carregando.parentNode.removeChild(carregando);
    document.body.appendChild(el('div', { class: 'aviso aviso-erro', role: 'alert', style: 'max-width:640px;margin:56px auto' }, [
      icone('alerta'),
      el('div', { class: 'aviso-corpo' }, [
        el('strong', null, 'Não foi possível abrir o sistema'),
        el('div', { class: 't-pq' }, String(e && e.message ? e.message : e)),
        el('div', { class: 't-mpq t-suave mt-2' },
          'Os dados continuam guardados neste navegador. Recarregue a página (Ctrl+F5). Se o erro voltar, ' +
          'avise quem cuida do sistema e não apague os dados do navegador.'),
        el('button', { class: 'btn mt-3', onclick: function () { location.reload(); } }, 'Recarregar')
      ])
    ]));
  }

  /** Partida no servidor da clínica: estado de lá, sem nada guardado neste navegador. */
  function partirServidor(m) {
    app.servidor = true;
    trocarEstado(m.estado, 'servidor');

    var prefs = DADOS.carregarPrefs();
    if (prefs.tela && buscarTela(prefs.tela)) app.telaAtual = prefs.tela;
    if (prefs.dia === hojeISO() && app.store.temMes(prefs.ano, prefs.mes)) {
      app.mes = Number(prefs.mes);
      app.ano = Number(prefs.ano);
    }
    garantirMesValido();
    montarCasca();
    redesenhar();

    ANEXOS.usarServidor(SERVIDOR.anexos);
    ANEXOS.iniciar().then(function () { redesenhar(); }, function (e) {
      UI.atencao('Exames indisponíveis', e && e.message);
    });
    SERVIDOR.conectar(app);
    ligarAtalhos();
  }

  function partir(lido) {
    var inicial = lido.estado ? lido : DADOS.estadoDoSeed();
    inicial.corrompido = lido.corrompido;
    inicial.semIndexedDB = lido.semIndexedDB;
    inicial.migrado = lido.migrado;
    trocarEstado(inicial.estado, inicial.origem);

    // Versão online de demonstração: sem dado salvo neste navegador, abre
    // com cirurgias de EXEMPLO para quem visita ver o sistema funcionando.
    if (window.MODO_ONLINE && inicial.origem === 'seed' && typeof DEMO !== 'undefined') {
      DEMO.popular(app.store);
      salvar();
    }

    /* 3. Preferências de tela. O mês abre no mês atual; o escolhido na
          última sessão só vale se foi hoje (recarregar a página no meio do
          trabalho não pode jogar a pessoa para outro mês). */
    var prefs = DADOS.carregarPrefs();
    if (prefs.tela && buscarTela(prefs.tela)) app.telaAtual = prefs.tela;
    if (prefs.dia === hojeISO() && app.store.temMes(prefs.ano, prefs.mes)) {
      app.mes = Number(prefs.mes);
      app.ano = Number(prefs.ano);
    }
    garantirMesValido();

    /* 4. Casca. */
    montarCasca();
    redesenhar();

    /* 5. Lista dos PDFs de exame (IndexedDB) — chega depois e redesenha. */
    ANEXOS.iniciar()
      .then(function (ok) { return ok ? ANEXOS.migrarLegado(app.store.estado.avaliacoes) : 0; })
      .then(function () { redesenhar(); }, function (e) {
        if (window.console) console.warn('Anexos indisponíveis:', e);
      });

    /* 6. Outra aba do sistema gravou: trava esta para não sobrescrever. */
    GUARDA.observarOutrasAbas(function () { bloquearPorOutraAba(); });

    /* 7. Durar um ano: pede ao navegador para não despejar os dados, faz o
          backup do dia na pasta escolhida e lembra de backup esquecido. */
    GUARDA.pedirPersistencia().then(function (ok) { app.persistente = ok; });
    backupDoDia();
    lembreteDeBackup();

    /* 8. Atalhos e avisos de partida. */
    ligarAtalhos();
    avisoDePartida(inicial);
  }

  /** Backup diário na pasta, se houver pasta e permissão; senão, avisa quando precisa de clique. */
  function backupDoDia() {
    if (!GUARDA.suportaPasta()) return;
    GUARDA.backupDiarioNaPasta(app.store.estado).then(function (r) {
      if (r.feito) {
        UI.ok('Backup do dia gravado na pasta', r.arquivo + (r.pdfs ? ' e ' + r.pdfs + ' PDF(s) de exame' : '') + '.');
      } else if (r.motivo === 'permissao') {
        mostrarFaixaBackup('A pasta de backup automático precisa de permissão de novo (o navegador pede um clique por sessão).',
          'Liberar e fazer backup', function () {
            GUARDA.retomarPasta().then(function (p) {
              if (p !== 'granted') { UI.atencao('Permissão não concedida', 'O backup automático fica parado até liberar.'); return; }
              esconderFaixaBackup();
              backupDoDia();
            });
          });
      }
    });
  }

  /** Faixa quando passam dias demais sem backup fora do navegador. */
  function lembreteDeBackup() {
    if (window.MODO_ONLINE || !app.store.estado.cirurgias.length) return;
    GUARDA.diasSemBackup().then(function (dias) {
      if (dias !== null && dias < GUARDA.DIAS_LEMBRETE) return;
      mostrarFaixaBackup(dias === null
          ? 'Ainda não há nenhum backup destes dados fora deste navegador.'
          : 'O último backup fora do navegador foi há ' + dias + ' dias.',
        'Fazer backup agora', function () { TELAS.dados.abrir(app); });
    });
  }

  function mostrarFaixaBackup(texto, rotulo, acao) {
    if (!nos.faixaBackup) return;
    UI.preencher(nos.faixaBackup, [
      icone('escudo'),
      el('div', { style: 'flex:1;min-width:0' }, [el('strong', null, 'Proteja os dados. '), texto]),
      el('button', { class: 'btn btn-pq', onclick: acao }, rotulo),
      el('button', { class: 'btn btn-plano btn-icone btn-pq', 'aria-label': 'Fechar aviso', onclick: esconderFaixaBackup }, icone('x'))
    ]);
    nos.faixaBackup.hidden = false;
  }

  function esconderFaixaBackup() { if (nos.faixaBackup) nos.faixaBackup.hidden = true; }

  /**
   * Único jeito de substituir o estado inteiro (partida, importar backup,
   * apagar tudo). Cria o store, liga os efeitos colaterais e invalida cache.
   */
  function trocarEstado(estado, origem) {
    var opcoes = { usuario: carregarUsuario(), horizonte: 'movel' };
    // No servidor: o nome é o do login e "hoje" é o do servidor — é o que faz
    // o comando executado aqui e lá dar exatamente o mesmo resultado.
    if (app.servidor) { opcoes.usuario = SERVIDOR.usuario().nome; opcoes.hoje = SERVIDOR.hoje(); }
    app.store = criarStore(estado, opcoes);
    app.store.aoMudar(aoGravar);
    app.store.recalcular();
    if (app.servidor) SERVIDOR.envolver(app.store);
    app.origemDados = origem;
    app.revisao++;
    garantirMesValido();
  }

  /**
   * Mês do topo sempre dentro do horizonte: o atual, se tiver escala; senão
   * o mês mais próximo de hoje.
   */
  function garantirMesValido() {
    if (!app.store) return;
    if (app.mes && app.ano && app.store.temMes(app.ano, app.mes)) return;
    var h = app.store.horizonte;
    var hoje = mesDaData(hojeISO());
    var alvo = buscarMes(h, hoje.ano, hoje.mes) ||
      (compararMeses(hoje, h[0]) < 0 ? h[0] : h[h.length - 1]);
    app.mes = alvo.mes;
    app.ano = alvo.ano;
  }

  /**
   * Efeitos de toda transação bem-sucedida. A cascata dos PDFs mora aqui, e
   * não na tela de cirurgias: qualquer caminho que apague uma avaliação
   * (hoje ou no futuro) leva os anexos junto.
   */
  function aoGravar(estado, saida) {
    app.revisao++;
    if (app.servidor) return;   // no servidor, os PDFs saem em cascata lá mesmo
    (saida.removidas || []).forEach(function (a) {
      if (a.uid) ANEXOS.removerDaAvaliacao(a.uid).catch(function () { /* órfão aparece em Integridade */ });
    });
  }

  function carregarUsuario() {
    var p = DADOS.carregarPrefs();
    return typeof p.usuario === 'string' && p.usuario ? p.usuario : CONFIG.USUARIO_PADRAO;
  }

  function avisoDePartida(inicial) {
    if (inicial.corrompido) {
      UI.erro('Os dados salvos neste navegador estavam ilegíveis',
        'Uma cópia foi guardada (' + inicial.corrompido + ') antes de o sistema recomeçar. ' +
        'Restaure uma cópia automática ou importe seu último backup em Dados e backup.', 0);
    }
    if (inicial.migrado) {
      UI.info('Dados migrados para o armazenamento novo',
        'O que estava salvo neste navegador passou para o IndexedDB, que guarda muito mais e faz cópias automáticas.');
    }

    if (inicial.semIndexedDB && !DADOS.disponivel()) {
      UI.atencao('Sem armazenamento no navegador',
        'O navegador está bloqueando o armazenamento local (janela privada, por exemplo). ' +
        'O sistema funciona, mas nada será salvo ao fechar a aba — exporte um backup antes de sair.', 0);
      return;
    }

    if (inicial.origem === 'seed') {
      UI.info('Dados mestres carregados',
        app.store.estado.anestesistas.length + ' anestesistas e a escala-base da planilha. ' +
        'Lance a primeira cirurgia para começar.');
    } else if (inicial.origem === 'vazio') {
      UI.atencao('Sistema sem dados mestres',
        'Nenhum anestesista cadastrado. Use Cadastro > Anestesistas, ou importe um backup pelo menu do topo.', 0);
    }
  }

  /* -------------------------------------------------------------- DOM --- */

  function montarCasca() {
    document.title = CONFIG.NOME_SISTEMA;

    nos.conteudo = el('main', { class: 'conteudo', id: 'conteudo' });

    nos.tituloTela = el('h1', null, '');
    nos.subTela = el('div', { class: 'sub' }, '');

    nos.rotuloMes = el('span', { class: 'rotulo-mes' }, '');
    nos.seletorMes = el('button', {
      class: 'btn botao-calendario', 'aria-haspopup': 'dialog', 'aria-expanded': 'false',
      title: 'Escolher dia, mês e ano', onclick: function () { alternarCalendario(); }
    }, [icone('calendario'), nos.rotuloMes]);
    nos.popCalendario = el('div', { class: 'pop-calendario', role: 'dialog', 'aria-label': 'Escolher dia, mês e ano', hidden: true });

    nos.topo = el('header', { class: 'topo' }, [
      el('button', {
        class: 'btn btn-plano btn-icone abre-lateral', 'aria-label': 'Abrir menu',
        onclick: function () { alternarLateral(true); }
      }, icone('menu')),
      el('div', { class: 'topo-titulo' }, [nos.tituloTela, nos.subTela]),
      el('div', { class: 'topo-acoes' }, [
        nos.seletorMes,
        el('button', {
          class: 'btn btn-primario',
          onclick: function () { TELAS.cirurgias.form(app, null); }
        }, [icone('mais'), el('span', { class: 'rotulo-botao' }, 'Nova cirurgia')]),
        el('button', {
          class: 'btn btn-icone', title: 'Dados e backup', 'aria-label': 'Dados e backup',
          onclick: function () { TELAS.dados.abrir(app); }
        }, icone('baixar')),
        el('button', {
          class: 'btn btn-icone', title: 'Alternar tema claro/escuro', 'aria-label': 'Alternar tema claro/escuro',
          onclick: function () { UI.alternarTema(); redesenhar(); }
        }, icone('sol'))
      ])
    ]);

    nos.faixaBackup = el('div', { class: 'faixa-backup', role: 'note', hidden: true });

    nos.faixaBloqueio = el('div', { class: 'faixa-bloqueio', role: 'alert', hidden: true }, [
      icone('alerta'),
      el('div', { style: 'flex:1;min-width:0' }, [
        el('strong', null, 'Os dados foram alterados em outra aba ou janela. '),
        'Esta aba parou de salvar para não apagar o que foi feito lá. Recarregue para continuar.'
      ]),
      el('button', { class: 'btn btn-primario btn-pq', onclick: function () { location.reload(); } },
        [icone('troca'), 'Recarregar'])
    ]);

    nos.faixaOnline = window.MODO_ONLINE ? el('div', { class: 'faixa-online', role: 'note' }, [
      icone('info'),
      el('div', { style: 'flex:1;min-width:0' }, [
        el('strong', null, 'Versão online de demonstração. '),
        'O que você lançar aqui fica só neste navegador. As cirurgias marcadas EXEMPLO são fictícias.'
      ]),
      typeof DEMO !== 'undefined' ? el('button', {
        class: 'btn btn-pq', onclick: function () { DEMO.limpar(app); }
      }, [icone('lixo'), 'Tirar exemplos']) : null
    ]) : null;

    nos.nav = el('nav', { class: 'nav', 'aria-label': 'Navegação principal' });

    nos.lateral = el('aside', { class: 'lateral' }, [
      el('div', { class: 'marca' }, [
        el('div', { class: 'marca-bloco' },
          el('img', { class: 'marca-logo', src: window.LOGO_MARCA_URL || 'public/the-one-logo.png', alt: 'THE ONE', width: 172, height: 96 })),
        el('div', { class: 'marca-texto' }, [
          el('div', { class: 'marca-titulo' }, 'Gestão de Anestesia')
        ])
      ]),
      nos.nav,
      el('div', { class: 'lateral-pe' }, [
        app.servidor ? SERVIDOR.noDeStatus() : null,
        el('button', {
          class: 'nav-item',
          onclick: function () { if (app.servidor) SERVIDOR.menuConta(); else formUsuario(); }
        }, [icone('pessoas', 'nav-icone'), el('span', { id: 'rotulo-usuario' }, app.store.usuario)])
      ])
    ]);

    nos.veu = el('div', {
      class: 'veu-lateral', hidden: true,
      onclick: function () { alternarLateral(false); }
    });

    nos.principal = el('div', { class: 'principal' }, [nos.topo, nos.faixaOnline, nos.faixaBloqueio, nos.faixaBackup, nos.conteudo]);

    document.body.appendChild(el('div', { class: 'casca' }, [
      nos.lateral,
      nos.veu,
      nos.principal
    ]));
    // O calendário mora direto no <body>: dentro do topo (que tem desfoque de
    // fundo) o "fixo na tela" ficaria preso ao topo e a janela encolheria.
    document.body.appendChild(nos.popCalendario);
    // Reposiciona (não fecha): no celular a barra do navegador some ao rolar
    // e isso também dispara 'resize'.
    window.addEventListener('resize', function () { if (!nos.popCalendario.hidden) posicionarCalendario(); });

    montarNav();
  }

  /** Telas que esta pessoa vê (Usuários: só administrador, só no servidor). */
  function telasVisiveis() {
    return TELAS_DEF.filter(function (t) { return !t.soAdminServidor || (app.servidor && SERVIDOR.ehAdmin()); });
  }

  function montarNav() {
    UI.limpar(nos.nav);

    var grupos = [];
    telasVisiveis().forEach(function (t) {
      var g = grupos.filter(function (x) { return x.nome === t.grupo; })[0];
      if (!g) { g = { nome: t.grupo, telas: [] }; grupos.push(g); }
      g.telas.push(t);
    });

    grupos.forEach(function (g) {
      nos.nav.appendChild(el('div', { class: 'nav-grupo' }, [
        el('div', { class: 'nav-rotulo' }, g.nome),
        el('div', null, g.telas.map(function (t) {
          return el('button', {
            class: 'nav-item',
            'aria-current': app.telaAtual === t.chave ? 'page' : null,
            dataset: { tela: t.chave },
            onclick: function () { ir(t.chave); }
          }, [
            icone(t.icone, 'nav-icone'),
            el('span', { style: 'flex:1' }, t.rotulo),
            contadorNav(t.chave)
          ]);
        }))
      ]));
    });
  }

  /**
   * Contador ao lado do item de menu. Mostra só o que pede ação — número
   * decorativo em menu vira ruído e o usuário para de olhar.
   */
  function contadorNav(chave) {
    var st = app.store;

    if (chave === 'cirurgias') {
      var n = st.estado.cirurgias.length;
      return n ? el('span', { class: 'nav-conta' }, String(n)) : null;
    }

    if (chave === 'avaliacoes') {
      var pend = st.estado.avaliacoes.filter(function (a) { return !ehSim(a.realizada); }).length;
      return pend
        ? el('span', { class: 'nav-conta destaque', title: pend + ' avaliação(ões) pendente(s)' }, String(pend))
        : (st.estado.avaliacoes.length
            ? el('span', { class: 'nav-conta' }, String(st.estado.avaliacoes.length)) : null);
    }

    if (chave === 'boletim') {
      var rasc = st.boletins().filter(function (b) { return b.status !== BOLETIM_FINALIZADO; }).length;
      return rasc ? el('span', { class: 'nav-conta destaque', title: rasc + ' boletim(ns) em preenchimento' }, String(rasc)) : null;
    }

    if (chave === 'horas') {
      var p = st.pendencias().length;
      return p ? el('span', { class: 'nav-conta destaque', title: p + ' cirurgia(s) sem horário real' }, String(p)) : null;
    }

    if (chave === 'integridade') {
      var r = integridade();
      return r.erros.length
        ? el('span', { class: 'nav-conta destaque', title: r.erros.length + ' erro(s) de integridade' },
            String(r.erros.length))
        : null;
    }

    return null;
  }

  /* ---------------------------------------------------------- cache --- */

  var cache = {};

  /**
   * Guarda um cálculo caro até a próxima gravação. A verificação de
   * integridade valida o estado inteiro; sem isto ela rodaria a cada tecla
   * digitada numa busca (o menu e o painel redesenham junto).
   */
  function emCache(chave, calcular) {
    var c = cache[chave];
    if (c && c.revisao === app.revisao && c.store === app.store) return c.valor;
    var valor = calcular();
    cache[chave] = { revisao: app.revisao, store: app.store, valor: valor };
    return valor;
  }

  function integridade() {
    return emCache('integridade', function () { return app.store.verificarIntegridade(); });
  }

  /* ----------------------------------------------------- navegação ----- */

  function buscarTela(chave) {
    return telasVisiveis().filter(function (t) { return t.chave === chave; })[0];
  }

  /**
   * Troca de tela com continuidade: View Transitions onde existir, entrada
   * curta por CSS onde não. Com movimento reduzido, troca seca.
   */
  function comTransicao(fn) {
    var reduz = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduz) { fn(); return; }
    if (document.startViewTransition) {
      try {
        var t = document.startViewTransition(fn);
        // Navegar rápido aborta a transição anterior; a tela já foi trocada, então a
        // rejeição não é erro e não pode ir parar no console como promessa solta.
        var calar = function () {};
        ['ready', 'finished', 'updateCallbackDone'].forEach(function (k) { if (t && t[k]) t[k].catch(calar); });
        return;
      } catch (e) { /* cai no CSS */ }
    }
    app.entrando = true;
    try { fn(); } finally { app.entrando = false; }
  }

  function ir(chave) {
    if (!buscarTela(chave)) return;
    var mudou = app.telaAtual !== chave;
    app.telaAtual = chave;
    salvarPrefs();
    alternarLateral(false);
    var mostrar = function () {
      redesenhar();
      if (nos.conteudo) nos.conteudo.scrollIntoView({ block: 'start' });
      window.scrollTo(0, 0);
    };
    if (mudou) comTransicao(mostrar); else mostrar();
  }

  function alternarLateral(abrir) {
    if (!nos.lateral) return;
    var deve = abrir === undefined ? !nos.lateral.classList.contains('aberta') : abrir;
    nos.lateral.classList.toggle('aberta', deve);
    nos.veu.hidden = !deve;
    // Com a gaveta aberta por cima, o conteúdo por trás não pode ficar
    // alcançável por Tab nem por leitor de tela (mesmo escondido pelo véu).
    if (nos.principal) nos.principal.inert = deve;
  }

  /* ---------------------------------------------------- redesenhar ----- */

  /**
   * Identidade de um campo que sobrevive ao redesenho (o nó é recriado, mas
   * tipo, nome, placeholder e rótulo acessível são os mesmos).
   */
  function chaveDoCampo(n) {
    return [n.tagName, n.type || '', n.name || '', n.getAttribute('placeholder') || '',
      n.getAttribute('aria-label') || ''].join('|');
  }

  /**
   * Quem está digitando numa busca não pode perder o foco a cada tecla: a
   * tela é redesenhada a cada `input`, o campo é recriado, e sem isto o
   * cursor iria parar no <body> depois da primeira letra.
   */
  function capturarFoco() {
    var a = document.activeElement;
    if (!a || !nos.conteudo || !nos.conteudo.contains(a)) return null;
    if (!/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) return null;
    var f = { chave: chaveDoCampo(a), ini: null, fim: null };
    try { f.ini = a.selectionStart; f.fim = a.selectionEnd; } catch (e) { /* date/select */ }
    return f;
  }

  function restaurarFoco(f) {
    if (!f) return;
    var campos = nos.conteudo.querySelectorAll('input, textarea, select');
    for (var i = 0; i < campos.length; i++) {
      if (chaveDoCampo(campos[i]) !== f.chave) continue;
      campos[i].focus({ preventScroll: true });
      if (f.ini !== null) {
        try { campos[i].setSelectionRange(f.ini, f.fim); } catch (e) { /* tipo sem cursor */ }
      }
      return;
    }
  }

  function redesenhar() {
    var tela = buscarTela(app.telaAtual) || TELAS_DEF[0];
    var foco = capturarFoco();

    nos.tituloTela.textContent = tela.rotulo;
    nos.subTela.textContent = SUBTITULOS[tela.chave] || '';
    atualizarSeletorMes();

    /* O menu é remontado para os contadores acompanharem o dado. */
    montarNav();

    var conteudo;
    try {
      conteudo = TELAS[tela.chave].render(app);
    } catch (e) {
      /* Uma tela com defeito não pode derrubar o sistema inteiro. */
      conteudo = el('div', { class: 'cartao' }, [
        el('div', { class: 'cartao-corpo' }, [
          el('div', { class: 'aviso aviso-erro' }, [
            icone('alerta'),
            el('div', { class: 'aviso-corpo' }, [
              el('strong', null, 'Falha ao desenhar esta tela'),
              el('div', { class: 't-pq' }, String(e && e.message ? e.message : e)),
              el('div', { class: 't-mpq t-suave mt-2' },
                'Seus dados estão salvos. Vá para outra tela e volte, ou exporte um backup pelo botão de dados no topo.')
            ])
          ]),
          el('button', {
            class: 'btn mt-3',
            onclick: function () { ir('painel'); }
          }, [icone('painel'), 'Voltar ao painel'])
        ])
      ]);
      if (window.console && console.error) console.error('Erro ao renderizar', tela.chave, e);
    }

    UI.preencher(nos.conteudo, el('div', { class: 'vista ativa' + (app.entrando ? ' entrando' : '') }, conteudo));
    restaurarFoco(foco);

    var rotuloUsuario = document.getElementById('rotulo-usuario');
    if (rotuloUsuario) rotuloUsuario.textContent = app.store.usuario;
  }

  /** Rótulo do botão do calendário: o mês de referência do sistema. */
  function atualizarSeletorMes() {
    garantirMesValido();
    nos.rotuloMes.textContent = MESES_NOME[app.mes - 1] + ' de ' + app.ano;
  }

  /**
   * Muda o mês de referência do sistema. Mês além da escala já montada (até
   * 24 meses à frente) tem a escala montada na hora.
   */
  function escolherMes(ano, mes) {
    if (!app.store.temMes(ano, mes) && !app.store.estenderHorizonte(ano, mes)) {
      UI.atencao('Mês fora do período da escala', 'A escala começa em ' + MESES_NOME[mesDe(CONFIG.ANCORA_RODIZIO) - 1] +
        ' de ' + anoDe(CONFIG.ANCORA_RODIZIO) + ' e vai até ' + CONFIG.LIMITE_MESES_FUTURO + ' meses à frente.');
      return false;
    }
    app.mes = Number(mes);
    app.ano = Number(ano);
    app.revisao++;
    salvarPrefs();
    redesenhar();
    return true;
  }

  /** Quantas cirurgias (não canceladas) há em cada dia — para o calendário. */
  function contagemPorDia() {
    var m = {};
    app.store.estado.cirurgias.forEach(function (c) {
      if (!cirurgiaContabilizavel(c) || !c.data) return;
      m[c.data] = (m[c.data] || 0) + 1;
    });
    return m;
  }

  /** Abaixo do botão, alinhado à direita dele, sem sair da tela (celular incluso). */
  function posicionarCalendario() {
    var r = nos.seletorMes.getBoundingClientRect();
    var largura = Math.min(316, window.innerWidth - 16);
    var esquerda = Math.min(Math.max(8, r.right - largura), window.innerWidth - largura - 8);
    nos.popCalendario.style.width = largura + 'px';
    nos.popCalendario.style.left = esquerda + 'px';
    nos.popCalendario.style.top = (r.bottom + 6) + 'px';
  }

  function fecharCalendario() {
    if (!nos.popCalendario || nos.popCalendario.hidden) return false;
    nos.popCalendario.hidden = true;
    nos.seletorMes.setAttribute('aria-expanded', 'false');
    return true;
  }

  /** Abre (ou fecha) o calendário do topo. `dia` marca um dia (ex.: o do quadro). */
  function alternarCalendario(dia) {
    if (!nos.popCalendario.hidden && !dia) { fecharCalendario(); return; }
    var porDia = contagemPorDia();
    var selecionado = dia || (app.telaAtual === 'quadro' ? app.filtros.quadro.data : null);
    UI.preencher(nos.popCalendario, COMP.calendario({
      ano: selecionado ? anoDe(selecionado) : app.ano,
      mes: selecionado ? mesDe(selecionado) : app.mes,
      selecionado: selecionado,
      faixa: faixaNavegavel(hojeISO()),
      contagem: function (iso) { return porDia[iso] || 0; },
      aoMudarMes: function (ano, mes) { escolherMes(ano, mes); },
      aoEscolherDia: function (iso) {
        if (!escolherMes(anoDe(iso), mesDe(iso))) return;
        app.filtros.quadro.data = iso;
        fecharCalendario();
        ir('quadro');
      }
    }));
    nos.popCalendario.hidden = false;
    posicionarCalendario();
    nos.seletorMes.setAttribute('aria-expanded', 'true');
    var foco = nos.popCalendario.querySelector('.cal-dia[tabindex="0"]');
    if (foco) setTimeout(function () { foco.focus(); }, 0);
  }

  /* --------------------------------------------------- persistência ---- */

  /**
   * Grava o estado (assíncrono, em fila — ver GUARDA.salvar). Devolve a
   * Promise da gravação; quem não precisa esperar pode ignorá-la, a falha
   * vira aviso na tela de qualquer jeito.
   */
  function salvar() {
    // No servidor, cada operação já foi enviada como comando; "salvar" é
    // esperar a fila esvaziar.
    if (app.servidor) return SERVIDOR.aguardarFila();
    if (app.bloqueadaPorOutraAba) {
      UI.atencao('Nada foi salvo', 'Os dados mudaram em outra aba. Recarregue esta página para continuar.');
      return Promise.resolve({ ok: false, motivo: 'outra-aba' });
    }
    return GUARDA.salvar(app.store.estado).then(function (r) {
      app.ultimaGravacao = Date.now();
      return r;
    }, function (e) {
      UI.erro('Não foi possível salvar no navegador',
        (e && e.motivo === 'cota') || /quota/i.test(String(e && (e.name || e.message)))
          ? 'O espaço do navegador acabou. Faça um backup agora (Dados e backup) e libere espaço no disco.'
          : 'O navegador recusou a gravação (' + (e && (e.message || e.name) || 'erro') + '). Faça um backup agora.', 0);
      return { ok: false, motivo: 'erro', erro: e };
    });
  }

  function salvarEredesenhar() {
    salvar();
    redesenhar();
  }

  /**
   * Redesenho pedido de fora (outra pessoa gravou): se alguém está digitando
   * num campo da tela, espera o foco sair dos campos — o que estava sendo
   * digitado não pode sumir no meio.
   */
  var redesenhoPendente = false;
  function digitandoNaTela() {
    var a = document.activeElement;
    return !!(a && nos.conteudo && nos.conteudo.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName));
  }
  function redesenharQuandoLivre() {
    if (!nos.conteudo) return;
    if (!digitandoNaTela()) { redesenhar(); return; }
    if (redesenhoPendente) return;
    redesenhoPendente = true;
    nos.conteudo.addEventListener('focusout', function tentar() {
      setTimeout(function () {
        if (digitandoNaTela()) return;
        nos.conteudo.removeEventListener('focusout', tentar);
        redesenhoPendente = false;
        redesenhar();
      }, 0);
    });
  }

  function bloquearPorOutraAba() {
    if (app.bloqueadaPorOutraAba) return;
    app.bloqueadaPorOutraAba = true;
    if (nos.faixaBloqueio) nos.faixaBloqueio.hidden = false;
  }

  function salvarPrefs() {
    DADOS.salvarPrefs({
      tela: app.telaAtual, mes: app.mes, ano: app.ano, dia: hojeISO(), usuario: app.store.usuario
    });
  }

  /* ------------------------------------------------------- usuário ----- */

  function formUsuario() {
    var f = UI.campo({
      rotulo: 'Seu nome', nome: 'usuario', valor: app.store.usuario,
      dica: 'Vai para a coluna USUÁRIO do log, em cada alteração que você fizer.'
    });

    UI.abrirModal({
      titulo: 'Quem está usando o sistema',
      tamanho: 'estreito',
      corpo: [f.no],
      acoes: [
        el('div', { class: 'espaco' }),
        el('button', { class: 'btn', onclick: function () { UI.fecharModal(); } }, 'Cancelar'),
        el('button', {
          class: 'btn btn-primario',
          onclick: function () {
            var nome = txt(f.valor());
            if (!nome) { f.erro('Informe um nome.'); return; }
            app.store.usuario = nome.slice(0, 80);
            salvarPrefs();
            UI.fecharModal();
            redesenhar();
            UI.ok('Identificação atualizada', 'As próximas alterações ficam registradas como "' + app.store.usuario + '".');
          }
        }, [icone('check'), 'Salvar'])
      ]
    });
  }

  /* ------------------------------------------------------- atalhos ----- */

  function ligarAtalhos() {
    document.addEventListener('keydown', function (ev) {
      /* Esc fecha o calendário, o modal ou a lateral. */
      if (ev.key === 'Escape') {
        if (fecharCalendario()) { nos.seletorMes.focus(); return; }
        if (UI.temModal()) { UI.fecharModal(); return; }
        alternarLateral(false);
        return;
      }

      /* Atalhos só fora de campo de texto. */
      var alvo = ev.target;
      var digitando = alvo && (alvo.tagName === 'INPUT' || alvo.tagName === 'TEXTAREA' ||
        alvo.tagName === 'SELECT' || alvo.isContentEditable);
      if (digitando || ev.ctrlKey || ev.metaKey || ev.altKey) return;

      if (ev.key === 'n' || ev.key === 'N') {
        if (!UI.temModal()) { ev.preventDefault(); TELAS.cirurgias.form(app, null); }
        return;
      }

      /* 1..9 salta para a tela correspondente. */
      var n = Number(ev.key);
      if (n >= 1 && n <= 9 && n <= TELAS_DEF.length && !UI.temModal()) {
        ev.preventDefault();
        ir(TELAS_DEF[n - 1].chave);
      }
    });

    /* Clique fora do calendário fecha o calendário. */
    document.addEventListener('mousedown', function (ev) {
      if (!nos.popCalendario || nos.popCalendario.hidden) return;
      if (nos.popCalendario.contains(ev.target) || nos.seletorMes.contains(ev.target)) return;
      fecharCalendario();
    });

    /* Avisa ao sair quando nada pôde ser salvo no navegador. */
    // (Aba travada por outra não entra aqui: o botão "Recarregar" da faixa é
    // justamente o caminho de saída, e cada tentativa de salvar já avisou.)
    window.addEventListener('beforeunload', function (ev) {
      if (GUARDA.disponivel() || DADOS.disponivel()) return;
      if (app.store.estado.cirurgias.length === 0) return;
      ev.preventDefault();
      ev.returnValue = '';
    });
  }

  /* ---------------------------------------------------- API pública ---- */

  app.ir = ir;
  app.redesenhar = redesenhar;
  app.redesenharQuandoLivre = redesenharQuandoLivre;
  app.salvar = salvar;
  app.salvarEredesenhar = salvarEredesenhar;
  app.trocarEstado = trocarEstado;
  app.integridade = integridade;
  app.backupDoDia = backupDoDia;
  app.abrirCalendario = alternarCalendario;
  app.escolherMes = escolherMes;

  return {
    iniciar: iniciar,
    app: app,
    TELAS_DEF: TELAS_DEF
  };
})();

/* Arranque quando o DOM estiver pronto. */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', function () { APP.iniciar(); });
} else {
  APP.iniciar();
}
