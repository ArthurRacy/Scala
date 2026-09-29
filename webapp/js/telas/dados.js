/**
 * ============================================================================
 * TELA — Dados e backup (modal)
 * ============================================================================
 * Tudo o que garante que o dado dure: situação do armazenamento, pasta de
 * backup automático, cópias automáticas (com restauração), backup manual
 * com ou sem PDFs, importação, recarga de dados mestres e "apagar tudo".
 *
 * Troca de estado passa por `app.trocarEstado`, o único jeito de substituir
 * o store inteiro. Toda operação que descarta o estado atual guarda antes
 * uma cópia automática ("antes de importar", "antes de apagar").
 *
 * No servidor da clínica a tela é outra (abrirNoServidor): os dados, as
 * cópias e o backup ficam no servidor, e só o administrador restaura,
 * importa ou apaga — as outras telas recarregam sozinhas quando isso
 * acontece.
 * ============================================================================
 */
'use strict';

TELAS.dados = (function () {

  var el = UI.el, icone = UI.icone;
  var def = COMP.def, secao = COMP.secao;

  function abrir(app) {
    if (app.servidor) { abrirNoServidor(app); return; }
    var st = app.store;
    var e = st.estado;

    var blocoProtecao = el('div', { class: 'defs' }, [def('Situação', 'verificando…')]);
    var blocoPasta = el('div');
    var blocoCopias = el('div', { class: 't-pq t-medio' }, 'Carregando as cópias…');

    UI.abrirModal({
      titulo: 'Dados e backup',
      sub: 'Onde os dados estão guardados e como recuperá-los',
      corpo: [
        secao('Proteção dos dados', [blocoProtecao]),

        GUARDA.suportaPasta() ? secao('Backup automático numa pasta', [
          el('p', { class: 't-pq t-medio' },
            'Uma vez por dia o sistema grava uma cópia compactada de tudo numa pasta deste computador ' +
            '(pode ser uma pasta do OneDrive ou do Google Drive, para ter cópia fora da máquina) e copia ' +
            'os PDFs de exame para "exames". Ficam os arquivos dos últimos ' + GUARDA.RETENCAO.diasPasta +
            ' dias e o primeiro de cada mês, sem prazo.'),
          blocoPasta
        ]) : null,

        secao('Cópias automáticas no navegador', [
          el('p', { class: 't-pq t-medio' },
            'Uma por dia (últimos ' + GUARDA.RETENCAO.diasDiarios + ' dias), a primeira de cada mês (' +
            GUARDA.RETENCAO.mesesMensais + ' meses) e uma antes de importar ou apagar (' +
            GUARDA.RETENCAO.diasMarcos + ' dias). Restaurar volta o sistema para aquele momento — ' +
            'o estado atual vira uma cópia antes.'),
          blocoCopias
        ]),

        secao('Backup em arquivo', [
          el('p', { class: 't-pq t-medio' },
            'Um arquivo .json com tudo: cadastro, escala, cirurgias, avaliações e LOG. O backup completo leva ' +
            'também os PDFs de exame. O arquivo tem dados de pacientes: guarde em local protegido.'),
          el('div', { class: 'linha' }, [
            el('button', { class: 'btn btn-primario', onclick: function () { exportar(app, false); } },
              [icone('baixar'), 'Exportar backup']),
            el('button', { class: 'btn', onclick: function () { exportar(app, true); } },
              [icone('clipe'), 'Exportar com PDFs']),
            el('button', { class: 'btn', onclick: function () { importarBackup(app); } },
              [icone('subir'), 'Importar backup'])
          ])
        ]),

        secaoPlanilhas(app),

        secao('Recarregar dados mestres', [
          el('p', { class: 't-pq t-medio' },
            'Substitui apenas o cadastro de anestesistas e a escala-base, a partir do seed.json gerado por ' +
            'tools/extrair_dados.py. As cirurgias e avaliações lançadas são preservadas.'),
          el('button', { class: 'btn', onclick: function () { importarSeed(app); } }, [icone('subir'), 'Importar seed.json'])
        ]),

        secao('Zona de risco', [
          el('div', { class: 'aviso aviso-erro' }, [
            icone('alerta'),
            el('div', { class: 'aviso-corpo' }, [
              el('strong', null, 'Apagar tudo zera o sistema neste navegador'),
              el('div', { class: 't-pq' },
                'Antes, o sistema guarda uma cópia automática (restaurável por ' + GUARDA.RETENCAO.diasMarcos +
                ' dias). Os PDFs de exame não são apagados: ficam para essa restauração e podem ser removidos em Integridade.')
            ])
          ]),
          el('button', { class: 'btn btn-perigo', onclick: function () { apagarTudo(app); } },
            [icone('lixo'), 'Apagar todos os dados'])
        ])
      ],
      acoes: [
        el('div', { class: 'espaco' }),
        el('button', { class: 'btn', onclick: function () { UI.fecharModal(); } }, 'Fechar')
      ]
    });

    preencherProtecao(app, blocoProtecao, e);
    if (GUARDA.suportaPasta()) preencherPasta(app, blocoPasta);
    preencherCopias(app, blocoCopias);
  }

  /** Planilhas: um .zip com um .csv por aba (feito aqui, do estado desta tela). */
  function secaoPlanilhas(app) {
    return secao('Planilha (CSV por aba)', [
      el('p', { class: 't-pq t-medio' },
        'Um .csv por aba, com o nome e as colunas como na planilha (separador ponto-e-vírgula, que o ' +
        'Excel em português abre direto). O bloco do FINANCEIRO sai com o mês selecionado no topo.'),
      el('button', {
        class: 'btn',
        onclick: function () {
          // Um .zip com um .csv por aba: um arquivo só, em vez de uma fila de downloads.
          var arquivos = DADOS.exportarCSVs(app.store, app.mes, app.ano).map(function (a) {
            return { nome: a.nome.replace(/[\\/:*?"<>|]/g, '_') + '.csv', dados: '\ufeff' + a.conteudo };
          });
          var nome = 'anestesia_planilhas_' + paraData(new Date()) + '.zip';
          UI.salvarArquivo(nome, DADOS.zip(arquivos)).then(function (ok) {
            if (ok) UI.ok('Planilhas exportadas', nome + ' — ' + arquivos.length + ' arquivos .csv dentro.');
          });
        }
      }, [icone('baixar'), 'Exportar todas as abas em CSV (.zip)'])
    ]);
  }

  /* ------------------------------------------------------- servidor --- */

  function abrirNoServidor(app) {
    var e = app.store.estado;
    var admin = SERVIDOR.ehAdmin();
    var blocoCopias = el('div', { class: 't-pq t-medio' }, 'Carregando as cópias do servidor…');
    var R = RETENCAO_COPIAS;

    UI.abrirModal({
      titulo: 'Dados e backup',
      sub: 'Os dados ficam no servidor da clínica',
      corpo: [
        secao('Onde os dados estão', [el('div', { class: 'defs' }, [
          def('Guardados', 'no servidor da clínica — nenhum dado fica neste navegador', 'ok'),
          def('Cada alteração', 'gravada no disco do servidor antes de ser confirmada', 'ok'),
          def('Cópias automáticas', 'uma por dia (' + R.diasDiarios + ' dias), a primeira de cada mês (' + R.mesesMensais +
            ' meses) e antes de importar ou restaurar (' + R.diasMarcos + ' dias)'),
          def('Registros', e.cirurgias.length + ' cirurgias · ' + e.avaliacoes.length + ' avaliações · ' +
            (e.boletins || []).length + ' boletins · ' + ANEXOS.total() + ' PDF(s)', null, true)
        ])]),

        admin ? secao('Cópias automáticas do servidor', [
          el('p', { class: 't-pq t-medio' }, 'Restaurar volta o sistema da clínica inteiro para aquele momento, em todos os ' +
            'computadores. O estado atual vira uma cópia antes — dá para desfazer.'),
          blocoCopias
        ]) : null,

        admin ? secao('Backup em arquivo', [
          el('p', { class: 't-pq t-medio' }, 'Um arquivo .json com tudo; o completo leva os PDFs de exame. Guarde fora do ' +
            'servidor (pendrive, nuvem da clínica): é a proteção contra perder o computador. Tem dados de pacientes.'),
          el('div', { class: 'linha' }, [
            el('button', { class: 'btn btn-primario', onclick: function () { baixarDoServidor(false); } }, [icone('baixar'), 'Exportar backup']),
            el('button', { class: 'btn', onclick: function () { baixarDoServidor(true); } }, [icone('clipe'), 'Exportar com PDFs']),
            el('button', { class: 'btn', onclick: function () { importarNoServidor(); } }, [icone('subir'), 'Importar backup'])
          ])
        ]) : secao('Backup', [el('p', { class: 't-pq t-medio' },
          'O servidor faz cópias automáticas todos os dias. Exportar, importar e restaurar ficam com o administrador do sistema.')]),

        secaoPlanilhas(app),

        admin ? secao('Zona de risco', [
          el('div', { class: 'aviso aviso-erro' }, [icone('alerta'), el('div', { class: 'aviso-corpo' }, [
            el('strong', null, 'Apagar tudo zera o sistema da clínica, em todos os computadores'),
            el('div', { class: 't-pq' }, 'O servidor guarda uma cópia antes (restaurável por ' + R.diasMarcos + ' dias). Os PDFs de exame não são apagados.')
          ])]),
          el('button', { class: 'btn btn-perigo', onclick: function () { apagarNoServidor(); } }, [icone('lixo'), 'Apagar todos os dados'])
        ]) : null
      ],
      acoes: [el('div', { class: 'espaco' }), el('button', { class: 'btn', onclick: function () { UI.fecharModal(); } }, 'Fechar')]
    });

    if (admin) {
      SERVIDOR.admin.copias().then(function (copias) {
        if (!copias.length) { UI.preencher(blocoCopias, 'Nenhuma cópia ainda — a primeira sai na primeira gravação do dia.'); return; }
        UI.preencher(blocoCopias, el('div', { class: 'anexos' }, copias.slice(0, 60).map(function (c) {
          var rotulo = c.tipo === 'diaria' ? 'Cópia do dia' : /importar/.test(c.id) ? 'Antes de importar'
            : /apagar/.test(c.id) ? 'Antes de apagar tudo' : /restaurar/.test(c.id) ? 'Antes de restaurar' : 'Marco';
          return el('div', { class: 'anexo' }, [
            el('div', { class: 'anexo-marca', style: 'background:var(--info-suave);color:var(--info)' }, icone('historico')),
            el('div', { class: 'anexo-corpo' }, [
              el('div', { class: 'anexo-nome' }, UI.data(c.dia) + ' · ' + rotulo),
              el('div', { class: 't-mpq t-suave' }, tamanho(c.tamanho) + ' compactado')
            ]),
            el('button', { class: 'btn btn-pq', onclick: function () { restaurarNoServidor(c, rotulo); } }, [icone('troca'), 'Restaurar'])
          ]);
        })));
      }, function (err) { UI.preencher(blocoCopias, 'Não foi possível listar: ' + err.message); });
    }
  }

  function baixarDoServidor(comPdfs) {
    SERVIDOR.admin.backup(comPdfs).then(function (blob) {
      var nome = 'anestesia_backup_' + paraData(new Date()) + (comPdfs ? '_com_pdfs' : '') + '.json';
      return UI.salvarArquivo(nome, blob).then(function (ok) { if (ok) UI.ok('Backup gerado', nome); });
    }, function (e) { UI.erro('Backup não gerado', e.message); });
  }

  function importarNoServidor() {
    escolherArquivo(function (texto, nome) {
      var r = DADOS.importarJSON(texto);
      if (!r.ok) { UI.erro('Arquivo não aceito', r.erro); return; }
      var resumo = r.estado.cirurgias.length + ' cirurgia(s), ' + r.estado.avaliacoes.length + ' avaliação(ões), ' +
        r.estado.anestesistas.length + ' anestesista(s)' + (r.anexos.length ? ', ' + r.anexos.length + ' PDF(s)' : '');
      UI.fecharModal();
      UI.confirmar({
        titulo: 'Substituir os dados da clínica?', tipo: 'perigo', rotulo: 'Substituir',
        aviso: [el('strong', null, 'O sistema da clínica inteiro passa a ter o conteúdo do arquivo, em todos os computadores.'),
          el('div', { class: 't-pq' }, 'O servidor guarda uma cópia do estado atual antes — restaurável em Dados e backup.')],
        texto: 'Arquivo: ' + nome + ' — contém ' + resumo + '.'
      }, function () {
        SERVIDOR.admin.importar(new Blob([texto], { type: 'application/json' })).then(function (res) {
          UI.ok('Backup importado', resumo + (res.pdfs ? ' · ' + res.pdfs + ' PDF(s) novo(s)' : ''));
        }, function (e) { UI.erro('Não foi importado', e.message); });
      });
    });
  }

  function restaurarNoServidor(c, rotulo) {
    UI.fecharModal();
    UI.confirmar({
      titulo: 'Restaurar a cópia de ' + UI.data(c.dia) + '?', rotulo: 'Restaurar',
      aviso: [el('strong', null, rotulo + ': o sistema da clínica volta para como estava, em todos os computadores.'),
        el('div', { class: 't-pq' }, 'O estado atual vira uma cópia antes — dá para desfazer.')]
    }, function () {
      SERVIDOR.admin.restaurarCopia(c.id).then(function () { UI.ok('Cópia restaurada'); },
        function (e) { UI.erro('Não foi restaurada', e.message); });
    });
  }

  function apagarNoServidor() {
    UI.fecharModal();
    UI.confirmar({
      titulo: 'Apagar todos os dados da clínica?', tipo: 'perigo', rotulo: 'Apagar tudo',
      aviso: [el('strong', null, 'Cirurgias, avaliações, boletins, escala e LOG saem do servidor — para todos.'),
        el('div', { class: 't-pq' }, 'Uma cópia é guardada antes e pode ser restaurada por ' + RETENCAO_COPIAS.diasMarcos + ' dias.')]
    }, function () {
      SERVIDOR.admin.apagarTudo().then(function () { UI.info('Dados apagados', 'A cópia de antes está em Dados e backup.'); },
        function (e) { UI.erro('Não foi possível apagar', e.message); });
    });
  }

  /* ------------------------------------------------------ situação --- */

  function tamanho(bytes) {
    if (bytes === null || bytes === undefined) return '—';
    if (bytes < 1048576) return Math.max(1, Math.round(bytes / 1024)) + ' KB';
    if (bytes < 1073741824) return (bytes / 1048576).toFixed(1).replace('.', ',') + ' MB';
    return (bytes / 1073741824).toFixed(1).replace('.', ',') + ' GB';
  }

  function preencherProtecao(app, no, e) {
    Promise.all([GUARDA.situacao(), GUARDA.diasSemBackup(), GUARDA.listarCopias()]).then(function (r) {
      var s = r[0], dias = r[1], copias = r[2];
      UI.preencher(no, [
        def('Onde os dados estão', s.indexedDB ? 'IndexedDB deste navegador' : 'localStorage (sem IndexedDB — limite de ~5 MB)',
          s.indexedDB ? 'ok' : 'pend'),
        def('Proteção contra limpeza automática',
          s.persistente === true ? 'ativa (o navegador não apaga por falta de espaço)'
            : (s.persistente === false ? 'não concedida pelo navegador — mantenha o backup em dia' : 'não informada'),
          s.persistente === true ? 'ok' : 'pend'),
        def('Espaço usado', tamanho(s.usado) + (s.cota ? ' de ' + tamanho(s.cota) + ' disponíveis' : '')),
        def('Registros', e.cirurgias.length + ' cirurgias · ' + e.avaliacoes.length + ' avaliações · ' +
          e.log.length + ' no LOG · ' + ANEXOS.total() + ' PDF(s)'),
        def('Cópias automáticas', copias.length ? copias.length + ' guardada(s) neste navegador' : 'a primeira sai na próxima gravação'),
        def('Último backup fora do navegador',
          dias === null ? 'nenhum ainda' : (dias === 0 ? 'hoje' : 'há ' + dias + ' dia(s)'),
          dias === null || dias >= GUARDA.DIAS_LEMBRETE ? 'pend' : 'ok', true)
      ]);
    });
  }

  function preencherPasta(app, no) {
    GUARDA.situacaoPasta().then(function (s) {
      var linha;
      if (!s.configurada) {
        linha = [
          el('button', {
            class: 'btn btn-primario',
            onclick: function () {
              GUARDA.escolherPasta().then(function (nome) {
                UI.ok('Pasta de backup escolhida', '"' + nome + '". Fazendo o primeiro backup…');
                return GUARDA.backupNaPasta(app.store.estado);
              }).then(function (r) {
                if (r && r.feito) UI.ok('Backup gravado', r.arquivo + (r.pdfs ? ' e ' + r.pdfs + ' PDF(s)' : '') + '.');
                preencherPasta(app, no);
              }, function (e) {
                if (e && e.name === 'AbortError') return;   // fechou a janela de escolha
                UI.erro('Não foi possível usar a pasta', e && e.message);
              });
            }
          }, [icone('escudo'), 'Escolher pasta e ligar'])
        ];
      } else {
        linha = [
          el('span', { class: 'selo ' + (s.permissao === 'granted' ? 'selo-ok' : 'selo-pendente') },
            s.permissao === 'granted' ? 'Ligado' : 'Precisa de permissão'),
          el('span', { class: 't-pq' }, 'Pasta: ' + s.nome),
          el('div', { class: 'espaco' }),
          el('button', {
            class: 'btn btn-pq',
            onclick: function () {
              (s.permissao === 'granted' ? Promise.resolve('granted') : GUARDA.retomarPasta()).then(function (p) {
                if (p !== 'granted') throw new Error('Permissão não concedida.');
                return GUARDA.backupNaPasta(app.store.estado);
              }).then(function (r) {
                if (r.feito) UI.ok('Backup gravado', r.arquivo + (r.pdfs ? ' e ' + r.pdfs + ' PDF(s)' : '') + '.');
                else UI.atencao('Backup não gravado', r.motivo);
                preencherPasta(app, no);
              }, function (e) { UI.erro('Não foi possível gravar na pasta', e && e.message); });
            }
          }, [icone('baixar'), 'Fazer backup agora']),
          el('button', {
            class: 'btn btn-plano btn-pq',
            onclick: function () {
              GUARDA.esquecerPasta().then(function () {
                UI.info('Backup automático desligado', 'Os arquivos que já estão na pasta continuam lá.');
                preencherPasta(app, no);
              });
            }
          }, 'Desligar')
        ];
      }
      UI.preencher(no, el('div', { class: 'linha' }, linha));
    });
  }

  function preencherCopias(app, no) {
    GUARDA.listarCopias().then(function (copias) {
      if (!copias.length) {
        UI.preencher(no, el('div', { class: 'anexos-vazio t-pq t-suave' },
          'Nenhuma cópia ainda — a primeira é feita na próxima gravação de hoje.'));
        return;
      }
      var nomes = {
        diaria: 'Cópia do dia', 'antes-de-apagar': 'Antes de apagar tudo',
        'antes-de-importar': 'Antes de importar/restaurar', migracao: 'Migração do armazenamento antigo',
        corrompido: 'Dado ilegível preservado'
      };
      UI.preencher(no, el('div', { class: 'anexos' }, copias.slice(0, 40).map(function (c) {
        return el('div', { class: 'anexo' }, [
          el('div', { class: 'anexo-marca', style: 'background:var(--info-suave);color:var(--info)' }, icone('historico')),
          el('div', { class: 'anexo-corpo' }, [
            el('div', { class: 'anexo-nome' }, UI.data(c.dia) + ' · ' + (nomes[c.tipo] || c.tipo)),
            el('div', { class: 't-mpq t-suave' },
              (c.cirurgias !== null && c.cirurgias !== undefined ? c.cirurgias + ' cirurgias · ' : '') + tamanho(c.tamanho))
          ]),
          c.tipo === 'corrompido' ? null : el('button', {
            class: 'btn btn-pq', onclick: function () { restaurarCopia(app, c); }
          }, [icone('troca'), 'Restaurar'])
        ]);
      })));
    });
  }

  /* ------------------------------------------------ backup e restauro -- */

  function exportar(app, comPDFs) {
    var anexos = comPDFs ? ANEXOS.exportarTodos() : Promise.resolve(null);
    anexos.then(function (lista) {
      var nome = 'anestesia_backup_' + paraData(new Date()) + (comPDFs ? '_com_pdfs' : '') + '.json';
      return UI.baixarTexto(nome, DADOS.exportarJSON(app.store.estado, lista), 'application/json').then(function (ok) {
        if (!ok) return;
        GUARDA.marcarBackupExterno('download');
        UI.ok('Backup gerado', nome + (lista && lista.length ? ' — com ' + lista.length + ' PDF(s)' : ''));
      });
    }, function (e) { UI.erro('Não foi possível ler os PDFs', e && e.message); });
  }

  /** Lê um arquivo de backup (.json ou .json.gz) escolhido pelo usuário. */
  function escolherArquivo(aoLer) {
    var input = el('input', { type: 'file', accept: '.json,.gz,application/json,application/gzip', style: 'display:none' });
    input.addEventListener('change', function () {
      var arq = input.files && input.files[0];
      if (!arq) return;
      GUARDA.lerTexto(arq).then(function (texto) { aoLer(texto, arq.name); },
        function (e) { UI.erro('Não consegui ler o arquivo', e && e.message); });
    });
    document.body.appendChild(input);
    input.click();
    setTimeout(function () { if (input.parentNode) input.parentNode.removeChild(input); }, 60000);
  }

  /**
   * Troca o estado inteiro por outro, guardando antes uma cópia do atual.
   * `anexos` = PDFs que vieram junto (backup completo).
   */
  function substituirEstado(app, estado, anexos, mensagemOk) {
    return GUARDA.guardarCopia(app.store.estado, 'antes-de-importar').catch(function () { /* segue */ })
      .then(function () {
        app.trocarEstado(estado, 'navegador');
        return app.salvar();
      })
      .then(function () { return anexos && anexos.length ? ANEXOS.importarTodos(anexos) : 0; })
      .then(function (n) {
        app.redesenhar();
        UI.ok(mensagemOk, n ? n + ' PDF(s) de exame restaurado(s).' : null);
      }, function (e) { UI.erro('Os dados entraram, mas algo falhou depois', e && e.message); });
  }

  function importarBackup(app) {
    escolherArquivo(function (texto, nome) {
      var r = DADOS.importarJSON(texto);
      if (!r.ok) { UI.erro('Arquivo não aceito', r.erro); return; }

      var resumo = r.estado.cirurgias.length + ' cirurgia(s), ' +
        r.estado.avaliacoes.length + ' avaliação(ões), ' +
        r.estado.anestesistas.length + ' anestesista(s)' +
        (r.anexos.length ? ', ' + r.anexos.length + ' PDF(s)' : '');

      UI.fecharModal();
      UI.confirmar({
        titulo: 'Substituir os dados atuais?',
        tipo: 'perigo',
        rotulo: 'Substituir',
        aviso: [
          el('strong', null, 'O que está na tela agora será substituído pelo arquivo.'),
          el('div', { class: 't-pq' }, 'O estado atual fica guardado numa cópia automática, restaurável em Dados e backup.')
        ],
        texto: 'Arquivo: ' + nome + ' — contém ' + resumo + '.'
      }, function () {
        substituirEstado(app, r.estado, r.anexos, 'Backup restaurado: ' + resumo);
      });
    });
  }

  function restaurarCopia(app, c) {
    UI.fecharModal();
    UI.confirmar({
      titulo: 'Restaurar a cópia de ' + UI.data(c.dia) + '?',
      rotulo: 'Restaurar',
      aviso: [
        el('strong', null, 'O sistema volta para como estava nessa cópia.'),
        el('div', { class: 't-pq' }, 'O estado atual fica guardado numa cópia automática antes — dá para desfazer.')
      ]
    }, function () {
      GUARDA.lerCopia(c.id).then(function (estado) {
        return substituirEstado(app, estado, null, 'Cópia de ' + UI.data(c.dia) + ' restaurada');
      }, function (e) { UI.erro('Não foi possível ler a cópia', e && e.message); });
    });
  }

  function importarSeed(app) {
    UI.lerArquivo('.json,application/json', function (texto, nome) {
      var r = DADOS.importarSeed(texto);
      if (!r.ok) { UI.erro('Arquivo não aceito', r.erro); return; }

      UI.fecharModal();
      UI.confirmar({
        titulo: 'Recarregar dados mestres?',
        rotulo: 'Recarregar',
        aviso: [
          el('strong', null, 'O cadastro e a escala-base serão substituídos.'),
          el('div', { class: 't-pq' },
            'Cirurgias, avaliações e log permanecem. Os ajustes manuais da escala são preservados.')
        ],
        texto: 'Arquivo: ' + nome + ' — ' + r.anestesistas.length + ' anestesista(s) e ' +
          r.escalaBase.length + ' posto(s) na escala-base.'
      }, function () {
        var res = app.store.transacao(function (st) {
          st.anestesistas = JSON.parse(JSON.stringify(r.anestesistas));
          st.escalaBase = JSON.parse(JSON.stringify(r.escalaBase));
          return { ok: true };
        });

        if (!res.ok) {
          UI.erro('Não foi possível recarregar', (res.erros[0] || {}).msg);
          return;
        }
        app.salvarEredesenhar();
        UI.ok('Dados mestres recarregados',
          r.anestesistas.length + ' anestesistas e a escala-base atualizados.');
      });
    });
  }

  function apagarTudo(app) {
    UI.fecharModal();
    UI.confirmar({
      titulo: 'Apagar todos os dados?',
      tipo: 'perigo',
      rotulo: 'Apagar tudo',
      aviso: [
        el('strong', null, 'Cirurgias, avaliações, escala e LOG saem deste navegador.'),
        el('div', { class: 't-pq' },
          'Uma cópia automática é guardada antes e pode ser restaurada em Dados e backup por ' +
          GUARDA.RETENCAO.diasMarcos + ' dias.')
      ]
    }, function () {
      GUARDA.apagarAtual(app.store.estado).then(function () {
        var inicial = DADOS.estadoDoSeed();
        app.trocarEstado(inicial.estado, inicial.origem);
        return app.salvar();
      }).then(function () {
        app.ir('painel');
        UI.info('Dados apagados', 'O sistema voltou ao estado inicial. A cópia de antes está em Dados e backup.');
      }, function (e) { UI.erro('Não foi possível apagar', e && e.message); });
    });
  }

  return {
    abrir: abrir
  };
})();
