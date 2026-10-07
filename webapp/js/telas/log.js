/**
 * ============================================================================
 * TELA — Auditoria (LOG por usuário)
 * ============================================================================
 * Três visões, todas por pessoa (o login de quem fez fica em cada linha):
 *   - Alterações: a trilha das alterações críticas (estado.log). Só cresce, nunca é
 *     reescrita; o que passa de N meses sai da tela depois de virar arquivo conferido.
 *   - Acessos e segurança (só no servidor da clínica): entradas, recusas, senha,
 *     usuários, backup, exames, acessos negados, rotação do LOG.
 *   - Arquivos e retenção (só no servidor da clínica): o arquivo mensal conferido
 *     (SHA-256), por quanto tempo fica na tela e por quanto tempo o arquivo é guardado.
 * Só o Anestesista chefe abre esta tela. As contas do arquivo mensal estão em
 * core/11b_log_arquivo.js e o disco, em server/auditoria.js.
 * ============================================================================
 */
'use strict';

TELAS.log = (function () {

  var el = UI.el, icone = UI.icone;
  var cab = COMP.cabecalhoCartao, seletor = COMP.seletor, botaoSeg = COMP.botaoSeg;

  var LIMITE_LINHAS = 400;

  var ROTULOS_EVENTO = {
    entrada: 'Entrou', saida: 'Saiu', entrada_recusada: 'Entrada recusada', entrada_bloqueada: 'Entrada bloqueada (tentativas)',
    primeiro_acesso: 'Primeiro acesso', primeiro_acesso_recusado: 'Primeiro acesso recusado',
    senha_trocada: 'Trocou a senha', senha_troca_travada: 'Troca de senha bloqueada',
    usuario_criado: 'Criou usuário', usuario_alterado: 'Alterou usuário',
    acesso_negado: 'Acesso negado', backup_baixado: 'Baixou backup', estado_substituido: 'Substituiu os dados',
    exame_anexado: 'Anexou exame', exame_aberto: 'Abriu exame', exame_removido: 'Removeu exame',
    log_arquivado: 'LOG arquivado', log_limpo: 'LOG limpo da tela', log_acessos_limpo: 'Acessos antigos limpos',
    log_arquivo_apagado: 'Arquivo de LOG apagado (prazo)', log_arquivo_com_problema: 'Arquivo de LOG com problema',
    log_rotacao_falhou: 'Rotação do LOG falhou', log_rotacao_manual: 'Rotação do LOG pedida', log_arquivos_conferidos: 'Arquivos de LOG conferidos',
    log_arquivo_baixado: 'Baixou arquivo de LOG',
    dados_exportados: 'Baixou todos os dados', dados_exportacao_interrompida: 'Download de todos os dados interrompido',
    exames_com_problema: 'Exames com problema', exames_indice_refeito: 'Índice dos exames refeito',
    exames_removidos_apagados: 'Exames removidos apagados (prazo)'
  };
  var EVENTOS_DE_ALERTA = ['entrada_recusada', 'entrada_bloqueada', 'acesso_negado', 'senha_troca_travada', 'primeiro_acesso_recusado',
    'log_rotacao_falhou', 'log_arquivo_com_problema', 'exames_com_problema', 'exames_indice_refeito', 'dados_exportacao_interrompida'];

  /** O que veio do servidor, guardado até a pessoa pedir de novo (nada de buscar a cada redesenho). */
  var remoto = { usuarios: null, acessos: null, arquivos: null, erro: null, carregando: false };

  function pessoas(lista) {
    var m = {};
    lista.forEach(function (l) {
      var chave = txt(l.login) || ('nome:' + txt(l.usuario));
      var p = m[chave] || (m[chave] = { chave: chave, login: txt(l.login), nome: txt(l.usuario), n: 0, ultimo: '' });
      p.n++;
      if (txt(l.quando) > p.ultimo) p.ultimo = txt(l.quando);
    });
    return Object.keys(m).map(function (k) { return m[k]; }).sort(function (a, b) { return a.nome < b.nome ? -1 : a.nome > b.nome ? 1 : 0; });
  }

  function rotuloDaPessoa(p) { return p.nome + (p.login ? ' (' + p.login + ')' : ''); }

  /* ----------------------------------------------------------- peças */

  function aviso(titulo, texto, tipo) {
    return el('div', { class: 'aviso aviso-' + (tipo || 'info'), style: 'margin:0' }, [
      icone(tipo === 'atencao' ? 'alerta' : 'escudo'),
      el('div', { class: 'aviso-corpo' }, [el('strong', null, titulo), el('div', { class: 't-pq' }, texto)])
    ]);
  }

  function campoData(rotulo, valor, aoMudar) {
    return el('label', { class: 'filtro' }, [
      el('span', { class: 'filtro-rotulo' }, rotulo),
      el('input', { class: 'entrada', type: 'date', value: valor || '', style: 'width:150px', onchange: function (ev) { aoMudar(ev.target.value); } })
    ]);
  }

  function seletorDePessoa(valor, lista, aoMudar) {
    return seletor({
      valor: valor || '', largura: '230px', rotulo: 'Pessoa',
      opcoes: [{ valor: '', rotulo: 'Todas as pessoas' }].concat(lista.map(function (p) { return { valor: p.chave, rotulo: rotuloDaPessoa(p) }; })),
      aoMudar: aoMudar
    });
  }

  function abas(app, f) {
    var itens = [['alteracoes', 'Alterações']];
    if (app.servidor) itens.push(['acessos', 'Acessos e segurança'], ['arquivos', 'Arquivos e retenção']);
    if (itens.length < 2) return null;
    return el('div', { class: 'segmentado' }, itens.map(function (i) {
      return botaoSeg(i[1], f.visao === i[0], function () { f.visao = i[0]; app.redesenhar(); });
    }));
  }

  /* ------------------------------------------------------ alterações */

  function filtroDoLog(f, todas, semPessoa) {
    var filtro = { texto: f.texto, aba: f.aba || null, de: f.de || '', ate: f.ate || '' };
    if (!semPessoa && f.usuario) {
      if (f.usuario.indexOf('nome:') === 0) filtro.usuario = f.usuario.slice(5);
      else {
        filtro.login = f.usuario;
        var p = pessoas(todas).filter(function (x) { return x.chave === f.usuario; })[0];
        if (p) filtro.nome = p.nome;
      }
    }
    return filtro;
  }

  function alteracoes(app) {
    var f = app.filtros.log;
    var todas = app.store.estado.log;
    var lista = core.filtrarLog(todas, filtroDoLog(f, todas)).slice().reverse();
    var quem = pessoas(core.filtrarLog(todas, filtroDoLog(f, todas, true)));

    var abasDoLog = {};
    todas.forEach(function (l) { abasDoLog[l.aba] = (abasDoLog[l.aba] || 0) + 1; });
    var cfg = app.store.configLog();

    var blocos = [
      aviso('Trilha de auditoria por usuário — só cresce, nunca é reescrita',
        'Registra quem mudou o quê, quando, e com que valor antes e depois, com o login de quem fez. ' +
        'Só campos críticos entram: status, datas, horários reais, anestesista, valores, pagamento e nota fiscal. ' +
        (app.servidor
          ? 'A tela guarda os últimos ' + cfg.mesesNaTela + ' meses; os mais antigos ficam em arquivos mensais conferidos (aba Arquivos e retenção).'
          : 'Neste computador o LOG fica inteiro na tela; o arquivo mensal só existe no servidor da clínica.'))
    ];

    if (quem.length) {
      blocos.push(el('div', { class: 'cartao' }, [
        cab('Quem mexeu', 'no período e nos filtros abaixo — clique numa pessoa para ver só o que ela fez'),
        el('div', { class: 'cartao-corpo rente' }, UI.tabela({
          colunas: [{ rotulo: 'Pessoa' }, { rotulo: 'Alterações', num: true }, { rotulo: 'Última' }, { rotulo: '', classe: 'acoes' }],
          linhas: quem.map(function (p) {
            return [
              el('span', { class: 'celula-principal' }, rotuloDaPessoa(p)),
              String(p.n),
              el('span', { class: 'num t-pq' }, p.ultimo),
              el('button', { class: 'btn btn-pq', onclick: function () { f.usuario = f.usuario === p.chave ? '' : p.chave; app.redesenhar(); } },
                f.usuario === p.chave ? 'Ver todas' : 'Ver só esta')
            ];
          }),
          vazio: { icone: 'pessoas', titulo: 'Ninguém mexeu ainda', texto: 'O LOG começa a preencher assim que alguém lançar ou alterar um registro.' }
        }))
      ]));
    }

    blocos.push(el('div', { class: 'cartao' }, [
      cab('LOG', lista.length + ' de ' + todas.length + ' registro(s)', [
        seletorDePessoa(f.usuario, pessoas(todas), function (v) { f.usuario = v; app.redesenhar(); }),
        campoData('De', f.de, function (v) { f.de = v; app.redesenhar(); }),
        campoData('Até', f.ate, function (v) { f.ate = v; app.redesenhar(); }),
        el('div', { class: 'busca', style: 'width:200px' }, [
          icone('busca'),
          el('input', {
            class: 'entrada', type: 'search', value: f.texto || '', placeholder: 'ID, campo, valor…',
            'aria-label': 'Buscar no LOG',
            oninput: function (ev) { f.texto = ev.target.value; app.redesenhar(); }
          })
        ]),
        seletor({
          valor: f.aba || '', largura: '190px',
          opcoes: [{ valor: '', rotulo: 'Todas as abas' }].concat(
            Object.keys(abasDoLog).sort().map(function (k) { return { valor: k, rotulo: k + ' (' + abasDoLog[k] + ')' }; })),
          aoMudar: function (v) { f.aba = v; app.redesenhar(); }
        }),
        el('button', {
          class: 'btn btn-pq', disabled: lista.length === 0,
          onclick: function () { DADOS.baixarCSV('LOG', DADOS.matrizDaAba('LOG', lista)); UI.ok('CSV gerado'); }
        }, [icone('baixar'), 'CSV'])
      ]),
      el('div', { class: 'cartao-corpo rente' }, UI.tabela({
        colunas: [
          { rotulo: 'Data/hora' }, { rotulo: 'Usuário' }, { rotulo: 'Aba' },
          { rotulo: 'Registro' }, { rotulo: 'Campo alterado' },
          { rotulo: 'Valor anterior', classeCelula: 'envolve' }, { rotulo: 'Novo valor', classeCelula: 'envolve' }
        ],
        linhas: lista.slice(0, LIMITE_LINHAS).map(function (l) {
          return [
            el('span', { class: 'num t-pq' }, l.quando),
            el('div', null, [UI.ou(l.usuario), l.login ? el('div', { class: 'celula-apoio mono' }, l.login) : null]),
            el('span', { class: 't-pq' }, l.aba),
            el('span', { class: 'mono t-suave' }, UI.ou(l.idCirurgia)),
            el('span', { class: 'celula-principal t-pq' }, l.campo),
            el('span', { class: 't-suave t-pq' }, l.de),
            el('span', { class: 't-forte t-pq' }, l.para)
          ];
        }),
        vazio: {
          icone: 'historico', titulo: 'Nenhuma alteração registrada',
          texto: 'O log começa a preencher assim que você lançar ou alterar um registro.'
        }
      })),
      lista.length > LIMITE_LINHAS ? el('div', { class: 'cartao-pe' },
        'Mostrando os ' + LIMITE_LINHAS + ' mais recentes de ' + lista.length + '. Use a pessoa, o período ou a busca para chegar ao que procura.') : null
    ]));

    return blocos;
  }

  /* ----------------------------------------------------------- acessos */

  function carregarAcessos(app) {
    var f = app.filtros.log;
    remoto.carregando = true; remoto.erro = null;
    var login = f.usuario && f.usuario.indexOf('nome:') !== 0 ? f.usuario : '';
    return Promise.all([
      remoto.usuarios ? Promise.resolve(remoto.usuarios) : SERVIDOR.admin.usuarios(),
      SERVIDOR.admin.acessos({ login: login, de: f.de, ate: f.ate, evento: f.evento, texto: f.texto })
    ]).then(function (r) {
      remoto.usuarios = r[0]; remoto.acessos = r[1]; remoto.carregando = false;
      app.redesenhar();
    }, function (e) { remoto.erro = e.message; remoto.carregando = false; app.redesenhar(); });
  }

  function acessos(app) {
    var f = app.filtros.log;
    if (remoto.acessos === null && !remoto.carregando && !remoto.erro) carregarAcessos(app);

    var usuarios = (remoto.usuarios || []).map(function (u) { return { chave: u.login, login: u.login, nome: u.nome, n: 0 }; });
    usuarios.push({ chave: 'sistema', login: 'sistema', nome: 'Sistema', n: 0 });
    var dados = remoto.acessos;

    var corpo = remoto.erro
      ? aviso('Não foi possível ler os acessos', remoto.erro, 'atencao')
      : (dados === null
          ? el('div', { class: 'cartao-corpo t-medio' }, 'Carregando os acessos…')
          : UI.tabela({
              colunas: [{ rotulo: 'Data/hora' }, { rotulo: 'Pessoa' }, { rotulo: 'Perfil' }, { rotulo: 'Evento' },
                { rotulo: 'Detalhe', classeCelula: 'envolve' }, { rotulo: 'Endereço' }],
              linhas: dados.eventos.map(function (e) {
                var alerta = EVENTOS_DE_ALERTA.indexOf(e.evento) >= 0;
                return [
                  el('span', { class: 'num t-pq' }, e.quando),
                  el('div', null, [UI.ou(e.nome), e.login ? el('div', { class: 'celula-apoio mono' }, e.login) : null]),
                  el('span', { class: 't-pq' }, UI.ou(e.papel && core.PERFIS[e.papel] ? core.PERFIS[e.papel].rotulo : e.papel)),
                  el('span', { class: 'selo ' + (alerta ? 'selo-cancelada' : 'selo-na') + ' sem-ponto' }, ROTULOS_EVENTO[e.evento] || e.evento),
                  el('span', { class: 't-pq' }, e.detalhe),
                  el('span', { class: 'mono t-suave t-pq' }, UI.ou(e.ip))
                ];
              }),
              vazio: { icone: 'historico', titulo: 'Nenhum evento com esses filtros', texto: 'Mude a pessoa, o período ou o tipo de evento.' }
            }));

    return [
      aviso('Acessos e eventos de segurança, por usuário',
        'Quem entrou, saiu, errou a senha, foi barrado, criou ou mudou usuário, baixou backup, anexou, abriu ou removeu exame — com o endereço de onde veio. ' +
        'Os meses fechados saem desta lista para arquivos mensais conferidos (aba Arquivos e retenção). Nada aqui guarda senha nem dado de paciente.'),
      el('div', { class: 'cartao' }, [
        cab('Acessos', dados ? dados.eventos.length + ' de ' + dados.total + ' evento(s)' + (dados.total > dados.eventos.length ? ' — os mais recentes' : '') : '', [
          seletorDePessoa(f.usuario, usuarios, function (v) { f.usuario = v; remoto.acessos = null; app.redesenhar(); }),
          campoData('De', f.de, function (v) { f.de = v; remoto.acessos = null; app.redesenhar(); }),
          campoData('Até', f.ate, function (v) { f.ate = v; remoto.acessos = null; app.redesenhar(); }),
          seletor({
            valor: f.evento || '', largura: '210px', rotulo: 'Tipo de evento',
            opcoes: [{ valor: '', rotulo: 'Todos os eventos' }].concat(Object.keys(ROTULOS_EVENTO).map(function (k) { return { valor: k, rotulo: ROTULOS_EVENTO[k] }; })),
            aoMudar: function (v) { f.evento = v; remoto.acessos = null; app.redesenhar(); }
          }),
          el('button', { class: 'btn btn-pq', onclick: function () { remoto.acessos = null; app.redesenhar(); } }, [icone('troca'), 'Atualizar'])
        ]),
        el('div', { class: 'cartao-corpo rente' }, corpo)
      ])
    ];
  }

  /* ------------------------------------------------ arquivos e retenção */

  function carregarArquivos(app) {
    remoto.carregando = true; remoto.erro = null;
    return SERVIDOR.admin.arquivosDeLog().then(function (r) { remoto.arquivos = r; remoto.carregando = false; app.redesenhar(); },
      function (e) { remoto.erro = e.message; remoto.carregando = false; app.redesenhar(); });
  }

  function tamanho(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1).replace('.', ',') + ' KB';
    return (bytes / 1024 / 1024).toFixed(1).replace('.', ',') + ' MB';
  }

  function baixarArquivo(a, formato) {
    SERVIDOR.admin.baixarArquivoDeLog(a.id, formato).then(function (blob) {
      var nome = a.id + (formato === 'jsonl' ? '.jsonl' : '.csv');
      return UI.salvarArquivo(nome, blob).then(function (ok) { if (ok) UI.ok('Arquivo gerado', nome); });
    }, function (e) { UI.erro('Arquivo não gerado', e.message); });
  }

  function formConfig(app, cfg) {
    var fMeses = UI.campo({ rotulo: 'Meses de LOG na tela', nome: 'mesesNaTela', tipo: 'number', passo: '1', min: String(core.LOG_LIMITES.mesesNaTela.min),
      valor: cfg.mesesNaTela, dica: 'O que for mais antigo sai da tela, depois de virar arquivo conferido (12 a 60: nunca menos de um ano).' });
    var fAnos = UI.campo({ rotulo: 'Anos de guarda do arquivo', nome: 'anosDeGuarda', tipo: 'number', passo: '1', min: '0',
      valor: cfg.anosDeGuarda, dica: '0 = nunca apagar sozinho. Prontuário e dinheiro podem ter prazo legal: confirme com o jurídico antes de reduzir.' });
    var form = UI.formulario([fMeses, fAnos]);
    return el('div', null, [
      el('div', { class: 'campo-grupo' }, [fMeses.no, fAnos.no]),
      el('div', { class: 'linha mt-3' }, [
        el('button', {
          class: 'btn btn-primario btn-pq', onclick: function () {
            var d = form.dados();
            var r = app.store.salvarConfigLog(d.mesesNaTela, d.anosDeGuarda);
            if (!r.ok) { form.mostrarErros(r.erros); UI.erro('Não foi possível salvar', r.erros.map(function (e) { return e.msg; }).join(' ')); return; }
            app.salvarEredesenhar();
            UI.ok('Prazos do LOG salvos', 'Valem a partir da próxima rotação.');
          }
        }, [icone('check'), 'Salvar prazos'])
      ])
    ]);
  }

  function arquivos(app) {
    if (remoto.arquivos === null && !remoto.carregando && !remoto.erro) carregarArquivos(app);
    var dados = remoto.arquivos;
    var cfg = app.store.configLog();
    var blocos = [
      aviso('Arquivo mensal do LOG, conferido',
        'Todo mês fechado vira um arquivo (um para as alterações, outro para os acessos), com o código SHA-256 do conteúdo. ' +
        'Só depois de o arquivo estar gravado e conferido a tela e a lista de acessos são limpas dos meses mais antigos. ' +
        'Nenhuma linha sai sem estar num arquivo conferido, e o arquivo existente nunca é reescrito.')
    ];

    if (remoto.erro) { blocos.push(aviso('Não foi possível ler os arquivos', remoto.erro, 'atencao')); return blocos; }

    blocos.push(el('div', { class: 'cartao' }, [
      cab('Prazos', 'quanto fica na tela e quanto o arquivo é guardado'),
      el('div', { class: 'cartao-corpo' }, formConfig(app, cfg))
    ]));

    var rot = dados && dados.ultimaRotacao;
    blocos.push(el('div', { class: 'cartao' }, [
      cab('Rotação mensal', rot ? 'última em ' + rot.quando + (rot.ok ? '' : ' — com falha') : 'ainda não rodou', [
        el('button', {
          class: 'btn btn-pq', onclick: function () {
            UI.confirmar({
              titulo: 'Arquivar e limpar agora?',
              aviso: 'Os meses fechados viram arquivo conferido; o que passou de ' + cfg.mesesNaTela + ' meses sai da tela.',
              texto: 'O que sair da tela já estará num arquivo conferido, que você baixa nesta aba. O servidor faz isto sozinho todo mês.',
              rotulo: 'Arquivar e limpar'
            }, function () {
              SERVIDOR.admin.rotacionarLogs().then(function (r) {
                if (r.erros && r.erros.length) UI.atencao('Rotação com falha', r.erros.join(' '), 0);
                else UI.ok('Rotação concluída', r.criados + ' arquivo(s) novo(s), ' + r.podados + ' linha(s) saíram da tela.');
                remoto.arquivos = null; remoto.acessos = null; app.redesenhar();
              }, function (e) { UI.erro('Rotação não feita', e.message); });
            });
          }
        }, [icone('troca'), 'Arquivar e limpar agora']),
        el('button', {
          class: 'btn btn-pq', onclick: function () {
            SERVIDOR.admin.conferirArquivosDeLog().then(function (r) {
              if (r.ok) UI.ok('Arquivos conferidos', r.conferem + ' de ' + r.total + ' conferem com o SHA-256.');
              else UI.erro('Arquivo que não confere', r.problemas.map(function (p) { return p.arquivo + ': ' + p.motivo; }).join(' · '), 0);
              remoto.arquivos = null; app.redesenhar();
            }, function (e) { UI.erro('Conferência não feita', e.message); });
          }
        }, [icone('escudo'), 'Conferir os arquivos'])
      ]),
      el('div', { class: 'cartao-corpo rente' }, dados === null
        ? el('div', { class: 'cartao-corpo t-medio' }, 'Carregando os arquivos…')
        : UI.tabela({
            colunas: [{ rotulo: 'Mês' }, { rotulo: 'Conteúdo' }, { rotulo: 'Linhas', num: true }, { rotulo: 'Tamanho', num: true },
              { rotulo: 'SHA-256' }, { rotulo: 'Conferido em' }, { rotulo: '', classe: 'acoes' }],
            linhas: dados.arquivos.map(function (a) {
              return [
                el('span', { class: 'celula-principal' }, a.mes + (a.parte > 1 ? ' (parte ' + a.parte + ')' : '')),
                el('span', { class: 't-pq' }, a.tipo === 'alteracoes' ? 'Alterações' : 'Acessos e segurança'),
                String(a.entradas),
                tamanho(a.tamanho || 0),
                el('span', { class: 'mono t-pq', title: a.sha256 }, a.sha256.slice(0, 16) + '…'),
                el('div', null, [
                  el('span', { class: 'num t-pq' }, a.verificadoEm || '—'),
                  a.verificadoOk === false ? el('div', { class: 't-perigo t-pq' }, a.problema || 'não confere') : null
                ]),
                el('div', { class: 'linha', style: 'justify-content:flex-end;flex-wrap:nowrap' }, [
                  el('button', { class: 'btn btn-pq', onclick: function () { baixarArquivo(a, 'csv'); } }, [icone('baixar'), 'CSV']),
                  el('button', { class: 'btn btn-plano btn-pq', title: 'Uma linha por registro, para guardar ou importar noutro sistema', onclick: function () { baixarArquivo(a, 'jsonl'); } }, 'JSON')
                ])
              ];
            }),
            rodape: ['Total', '', '', tamanho(dados.tamanhoTotal || 0), '', '', ''],
            vazio: { icone: 'historico', titulo: 'Nenhum arquivo ainda', texto: 'O primeiro arquivo nasce quando o primeiro mês fechar (a partir do dia 2 do mês seguinte).' }
          }))
    ]));
    return blocos;
  }

  /* ----------------------------------------------------------- render */

  function log(app) {
    var f = app.filtros.log;
    if (!app.servidor && f.visao !== 'alteracoes') f.visao = 'alteracoes';
    var visao = f.visao === 'acessos' ? acessos(app) : f.visao === 'arquivos' ? arquivos(app) : alteracoes(app);
    return el('div', { class: 'pilha' }, [abas(app, f)].concat(visao));
  }

  return {
    render: log
  };
})();
