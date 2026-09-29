/**
 * ============================================================================
 * TELA — Avaliações pré
 * ============================================================================
 * Consultas pré-anestésicas vinculadas às cirurgias, com os PDFs de exame
 * anexados pela secretaria e o termo de consentimento em PDF.
 * ============================================================================
 */
'use strict';

TELAS.avaliacoes = (function () {

  var el = UI.el, icone = UI.icone;
  var secao = COMP.secao, seletor = COMP.seletor, botaoSeg = COMP.botaoSeg;

  /** Tabela mostra no máximo isto; o resto fica a um filtro ou CSV de distância. */
  var LIMITE_LINHAS = 300;

  function avaliacoes(app) {
    var store = app.store;
    var f = app.filtros.avaliacoes;

    var todas = store.estado.avaliacoes.slice();
    var porIdCirurgia = {};
    store.estado.cirurgias.forEach(function (c) { porIdCirurgia[txt(c.id)] = c; });

    var lista = todas.filter(function (a) {
      if (!f.todosOsMeses) {
        if (Number(a.mes) !== Number(app.mes) || Number(a.ano) !== Number(app.ano)) return false;
      }
      if (f.situacao === 'pendentes' && ehSim(a.realizada)) return false;
      if (f.situacao === 'realizadas' && !ehSim(a.realizada)) return false;
      if (f.anestesista && !mesmoTexto(a.anestesista, f.anestesista)) return false;

      if (f.texto) {
        var alvo = normalizar([a.id, a.idCirurgia, a.paciente, a.nomeCirurgia,
          a.anestesista, a.anestCirurgia, a.nf, a.obs].join(' '));
        if (alvo.indexOf(normalizar(f.texto)) < 0) return false;
      }
      return true;
    });

    lista.sort(function (a, b) {
      var da = a.data || a.dataCirurgia, db = b.data || b.dataCirurgia;
      if (da !== db) return String(db) < String(da) ? -1 : 1;
      return String(a.id) < String(b.id) ? -1 : 1;
    });

    var pendentes = todas.filter(function (a) { return !ehSim(a.realizada); }).length;
    var raiz = el('div', { class: 'pilha' });

    /* ---- Explicação do automatismo (TASK-301) ------------------------ */
    raiz.appendChild(el('div', { class: 'aviso aviso-info', style: 'margin:0' }, [
      icone('info'),
      el('div', { class: 'aviso-corpo' }, [
        el('strong', null, 'Estas linhas nascem sozinhas'),
        el('div', { class: 't-pq' },
          'Sempre que uma cirurgia é marcada com AVALIAÇÃO PRÉ NECESSÁRIA? = "Sim", a linha aparece aqui já vinculada pelo ID_CIRURGIA, ' +
          'com paciente, data, procedimento e anestesista da cirurgia preenchidos. Você só completa quem avaliou, quando e o valor.')
      ])
    ]));

    /* ---- Filtros ------------------------------------------------------ */
    raiz.appendChild(el('div', { class: 'cartao' },
      el('div', { class: 'cartao-corpo compacto' },
        el('div', { class: 'linha' }, [
          el('div', { class: 'busca', style: 'flex:1;min-width:200px;max-width:320px' }, [
            icone('busca'),
            el('input', {
              class: 'entrada', type: 'search', value: f.texto || '',
              placeholder: 'Paciente, cirurgia, ID…',
              oninput: function (ev) { f.texto = ev.target.value; app.redesenhar(); }
            })
          ]),
          el('div', { class: 'segmentado' }, [
            botaoSeg('Todas', !f.situacao, function () { f.situacao = ''; app.redesenhar(); }),
            botaoSeg('Pendentes' + (pendentes ? ' (' + pendentes + ')' : ''), f.situacao === 'pendentes',
              function () { f.situacao = 'pendentes'; app.redesenhar(); }),
            botaoSeg('Realizadas', f.situacao === 'realizadas',
              function () { f.situacao = 'realizadas'; app.redesenhar(); })
          ]),
          seletor({
            valor: f.anestesista || '', largura: '190px',
            opcoes: [{ valor: '', rotulo: 'Quem avaliou: todos' }].concat(
              store.nomesAnestesistas().map(function (n) { return { valor: n, rotulo: n }; })),
            aoMudar: function (v) { f.anestesista = v; app.redesenhar(); }
          }),
          el('div', { class: 'segmentado' }, [
            botaoSeg('Mês atual', !f.todosOsMeses, function () { f.todosOsMeses = false; app.redesenhar(); }),
            botaoSeg('Todos', !!f.todosOsMeses, function () { f.todosOsMeses = true; app.redesenhar(); })
          ]),
          el('div', { class: 'espaco' }),
          el('span', { class: 't-pq t-suave' }, lista.length + ' de ' + todas.length),
          el('button', {
            class: 'btn btn-pq', disabled: lista.length === 0,
            onclick: function () {
              DADOS.baixarCSV('AVALIACOES_PRE_' + app.mes + '_' + app.ano,
                DADOS.matrizDaAba('AVALIACOES_PRE', lista));
              UI.ok('CSV gerado');
            }
          }, [icone('baixar'), 'CSV'])
        ]))));

    /* ---- Tabela ------------------------------------------------------ */
    raiz.appendChild(el('div', { class: 'cartao' }, [
      el('div', { class: 'cartao-corpo rente' }, UI.tabela({
        colunas: [
          { rotulo: 'ID' }, { rotulo: 'Cirurgia' }, { rotulo: 'Paciente' },
          { rotulo: 'Procedimento' }, { rotulo: 'Quem avaliou' },
          { rotulo: 'Data / hora' }, { rotulo: 'Realizada' }, { rotulo: 'TCLE' },
          { rotulo: 'Exames', dica: 'PDFs de exames anexados pela secretaria' },
          { rotulo: 'Valor', num: true }, { rotulo: 'Pago' }, { rotulo: '', classe: 'acoes' }
        ],
        linhas: lista.slice(0, LIMITE_LINHAS).map(function (a) {
          var cir = porIdCirurgia[txt(a.idCirurgia)];
          var nExames = ANEXOS.contar(a.uid);
          var linha = [
            el('span', { class: 'mono t-suave' }, a.id),
            el('div', null, [
              el('div', { class: 'mono' }, UI.ou(a.idCirurgia)),
              el('div', { class: 'celula-apoio' }, UI.data(a.dataCirurgia))
            ]),
            el('span', { class: 'celula-principal' }, UI.ou(a.paciente)),
            el('div', { class: 'envolve' }, [
              el('div', null, UI.ou(a.nomeCirurgia)),
              a.anestCirurgia ? el('div', { class: 'celula-apoio' }, 'anest.: ' + a.anestCirurgia) : null
            ]),
            vazio(a.anestesista)
              ? el('span', { class: 'selo selo-pendente' }, 'a definir')
              : el('span', null, a.anestesista),
            el('div', null, [
              el('div', null, UI.data(a.data)),
              a.hora ? el('div', { class: 'celula-apoio num' }, paraHora(a.hora)) : null
            ]),
            ehSim(a.realizada)
              ? el('span', { class: 'selo selo-ok' }, 'Sim')
              : el('span', { class: 'selo selo-pendente' }, 'Não'),
            UI.seloSimNao(a.tcle),
            nExames
              ? el('span', { class: 'selo selo-info sem-ponto', title: nExames + ' PDF(s) anexado(s)' },
                  [icone('clipe', 'selo-icone'), String(nExames)])
              : el('span', { class: 't-suave' }, '—'),
            UI.moeda(a.valor),
            ehSim(a.pago)
              ? el('span', { class: 'selo selo-ok' }, 'Sim')
              : el('span', { class: 'selo selo-na' }, 'Não'),
            el('div', { class: 'linha', style: 'justify-content:flex-end;flex-wrap:nowrap' }, [
              cir ? el('button', {
                class: 'btn btn-plano btn-icone btn-pq', title: 'Abrir a cirurgia', 'aria-label': 'Abrir a cirurgia',
                onclick: function (ev) { ev.stopPropagation(); TELAS.cirurgias.form(app, cir); }
              }, icone('bisturi')) : null,
              el('button', {
                class: 'btn btn-plano btn-icone btn-pq', title: 'Editar avaliação', 'aria-label': 'Editar avaliação',
                onclick: function (ev) { ev.stopPropagation(); formAvaliacao(app, a); }
              }, icone('lapis'))
            ])
          ];
          return {
            celulas: linha,
            __onclick: function () { formAvaliacao(app, a); },
            __classe: (!cir ? 'destaque-linha' : null)
          };
        }),
        vazio: {
          icone: 'estetoscopio',
          titulo: todas.length ? 'Nenhuma avaliação com esses filtros' : 'Nenhuma avaliação pré registrada',
          texto: todas.length
            ? 'Ajuste os filtros acima.'
            : 'Marque AVALIAÇÃO PRÉ NECESSÁRIA? = "Sim" em uma cirurgia e a linha aparece aqui automaticamente.'
        }
      })),
      lista.length > LIMITE_LINHAS ? el('div', { class: 'cartao-pe' },
        'Mostrando ' + LIMITE_LINHAS + ' de ' + lista.length + ' avaliações. Refine a busca ou use o CSV para ver tudo.') : null
    ]));

    return raiz;
  }

  function formAvaliacao(app, a) {
    var store = app.store;
    var cir = store.estado.cirurgias.filter(function (c) { return txt(c.id) === txt(a.idCirurgia); })[0];

    var fAnest = UI.campo({
      rotulo: 'Anestesista da avaliação', nome: 'anestesista', tipo: 'select',
      opcoes: store.nomesAnestesistas(), valor: a.anestesista || '',
      dica: 'Quem fez a consulta prévia — pode ser diferente de quem operou.'
    });
    var fData = UI.campo({ rotulo: 'Data da avaliação', nome: 'data', tipo: 'date', valor: a.data || '' });
    var fHora = UI.campo({ rotulo: 'Hora da avaliação', nome: 'hora', tipo: 'time', valor: a.hora || '' });

    var fRealizada = UI.campo({
      rotulo: 'Realizada?', nome: 'realizada', tipo: 'select', vazioPermitido: false,
      opcoes: DOMINIOS.SIM_NAO, valor: a.realizada || 'Não',
      dica: 'Ao marcar "Sim", a coluna STATUS DA AVALIAÇÃO PRÉ da cirurgia passa a "Realizada".'
    });
    var fTcle = UI.campo({
      rotulo: 'TCLE assinado?', nome: 'tcle', tipo: 'select', vazioPermitido: false,
      opcoes: DOMINIOS.SIM_NAO, valor: a.tcle || 'Não'
    });

    var fValor = UI.campo({ rotulo: 'Valor da avaliação', nome: 'valor', tipo: 'number', passo: '0.01', min: '0', valor: a.valor === null || a.valor === undefined ? '' : a.valor });
    var fPago = UI.campo({ rotulo: 'Pago?', nome: 'pago', tipo: 'select', vazioPermitido: false, opcoes: DOMINIOS.SIM_NAO, valor: a.pago || 'Não' });
    var fDataPag = UI.campo({ rotulo: 'Data do pagamento', nome: 'dataPagamento', tipo: 'date', valor: a.dataPagamento || '' });
    var fNF = UI.campo({ rotulo: 'Número da nota fiscal', nome: 'nf', valor: a.nf || '' });
    var fObs = UI.campo({ rotulo: 'Observações', nome: 'obs', tipo: 'textarea', valor: a.obs || '', largo: true, linhas: 2 });

    var form = UI.formulario([fAnest, fData, fHora, fRealizada, fTcle, fValor, fPago, fDataPag, fNF, fObs]);

    /* Bloco de dados espelhados: mostra o vínculo sem deixar editar. */
    var espelho = el('div', { class: 'aviso ' + (cir ? 'aviso-info' : 'aviso-erro') }, [
      icone(cir ? 'bisturi' : 'alerta'),
      el('div', { class: 'aviso-corpo' }, cir ? [
        el('strong', null, 'Vinculada à cirurgia ' + txt(a.idCirurgia)),
        el('div', { class: 't-pq' }, [
          UI.ou(a.paciente), ' · ', UI.data(a.dataCirurgia), ' · ',
          UI.ou(a.nomeCirurgia), ' · anestesista: ', UI.ou(a.anestCirurgia)
        ]),
        el('div', { class: 't-mpq t-suave mt-2' },
          'Estes quatro campos são copiados da cirurgia e se atualizam sozinhos — edite-os lá, não aqui.')
      ] : [
        el('strong', null, 'Avaliação órfã'),
        el('div', { class: 't-pq' },
          'O ID_CIRURGIA "' + txt(a.idCirurgia) + '" não existe mais em CIRURGIAS. ' +
          'O registro foi mantido para não perder o histórico, mas não entra em nenhum indicador de cirurgia.')
      ])
    ]);

    /* ---- Exames do paciente (PDF) e termo de consentimento ------------ */
    var blocoExames = el('div');
    var blocoTcle = el('div');
    desenharExames(app, a, blocoExames);
    desenharTcle(app, a, cir, blocoTcle, function () {
      return { anestesista: fAnest.valor(), data: fData.valor() };
    });

    function salvar() {
      var r = store.atualizarAvaliacao(a.id, form.dados());
      if (!r.ok) {
        var soltos = form.mostrarErros(r.erros);
        if (soltos.length) UI.erro('Não foi possível salvar', soltos.join(' '));
        else UI.erro('Confira os campos destacados');
        return;
      }
      UI.fecharModal();
      UI.resultado(r, 'Avaliação atualizada');
      app.salvarEredesenhar();
    }

    UI.abrirModal({
      titulo: 'Avaliação ' + a.id,
      sub: 'Consulta pré-anestésica',
      corpo: [
        espelho,
        secao('Quem avaliou e quando', [
          el('div', { class: 'campo-grupo-3' }, [fAnest.no, fData.no, fHora.no])
        ]),
        secao('Situação', [
          el('div', { class: 'campo-grupo' }, [fRealizada.no, fTcle.no])
        ]),
        secao('Exames do paciente', [blocoExames]),
        secao('Termo de consentimento (TCLE)', [blocoTcle]),
        secao('Financeiro', [
          el('div', { class: 'campo-grupo' }, [fValor.no, fPago.no]),
          el('div', { class: 'campo-grupo mt-3' }, [fDataPag.no, fNF.no])
        ]),
        secao('Observações', [el('div', { class: 'campo-grupo' }, [fObs.no])])
      ],
      acoes: [
        cir ? el('button', {
          class: 'btn',
          onclick: function () { UI.fecharModal(); TELAS.cirurgias.form(app, cir); }
        }, [icone('bisturi'), 'Abrir cirurgia']) : null,
        el('div', { class: 'espaco' }),
        el('button', { class: 'btn', onclick: function () { UI.fecharModal(); } }, 'Cancelar'),
        el('button', { class: 'btn btn-primario', onclick: salvar }, [icone('check'), 'Salvar'])
      ]
    });
  }

  /**
   * Lista de PDFs de exame da avaliação, com enviar / abrir / baixar /
   * remover. Redesenha só este bloco (o modal continua aberto) e a tela de
   * trás, para o contador da tabela acompanhar.
   */
  function desenharExames(app, a, no) {
    UI.limpar(no);

    if (!ANEXOS.disponivel()) {
      no.appendChild(el('div', { class: 'aviso aviso-atencao' }, [icone('alerta'), el('div', { class: 'aviso-corpo' }, [
        el('strong', null, 'Este navegador não permite guardar arquivos'),
        el('div', { class: 't-pq' }, 'Janela privada ou armazenamento bloqueado. Abra o sistema numa janela normal.')
      ])]));
      return;
    }

    var itens = ANEXOS.listar(a.uid);
    var redesenhar = function () { desenharExames(app, a, no); app.redesenhar(); };

    var entrada = el('input', {
      type: 'file', accept: 'application/pdf,.pdf', multiple: true, style: 'display:none',
      onchange: function () {
        var arquivos = Array.prototype.slice.call(entrada.files || []);
        entrada.value = '';
        if (!arquivos.length) return;
        var feitos = 0, falhas = [];
        arquivos.reduce(function (fila, arq) {
          return fila.then(function () {
            return ANEXOS.adicionar(a, arq, app.store.usuario)
              .then(function () { feitos++; }, function (e) { falhas.push(e.message); });
          });
        }, Promise.resolve()).then(function () {
          redesenhar();
          if (feitos) UI.ok(feitos === 1 ? 'Exame anexado' : feitos + ' exames anexados', UI.ou(a.paciente, ''));
          if (falhas.length) UI.erro('Alguns arquivos não foram aceitos', falhas.join(' '));
        });
      }
    });

    no.appendChild(entrada);

    no.appendChild(itens.length
      ? el('div', { class: 'anexos' }, itens.map(function (m) { return linhaAnexo(m, redesenhar); }))
      : el('div', { class: 'anexos-vazio t-pq t-suave' }, 'Nenhum exame anexado ainda.'));

    no.appendChild(el('div', { class: 'linha mt-3' }, [
      el('button', { class: 'btn', onclick: function () { entrada.click(); } }, [icone('clipe'), 'Anexar PDFs de exames']),
      el('span', { class: 't-mpq t-suave' },
        'Só PDF, até ' + Math.round(ANEXOS.TAMANHO_MAXIMO / 1048576) + ' MB cada. Ficam guardados neste computador.')
    ]));
  }

  function linhaAnexo(m, aoMudar) {
    var botaoRemover = el('button', {
      class: 'btn btn-plano btn-icone btn-pq', title: 'Remover', 'aria-label': 'Remover ' + m.nome,
      onclick: function () {
        // Dois cliques: o primeiro arma, o segundo remove. Evita um confirm()
        // que fecharia o modal da avaliação.
        if (!botaoRemover.classList.contains('armado')) {
          botaoRemover.classList.add('armado');
          botaoRemover.title = 'Clique de novo para remover';
          UI.limpar(botaoRemover);
          botaoRemover.appendChild(el('span', { class: 't-mpq t-forte' }, 'Remover?'));
          botaoRemover.classList.remove('btn-icone');
          setTimeout(function () { if (botaoRemover.classList.contains('armado')) desarmar(); }, 4000);
          return;
        }
        ANEXOS.remover(m.id).then(function () { UI.ok('Exame removido', m.nome); aoMudar(); },
          function (e) { UI.erro('Não foi possível remover', e.message); });
      }
    }, icone('lixo'));

    function desarmar() {
      botaoRemover.classList.remove('armado');
      botaoRemover.classList.add('btn-icone');
      botaoRemover.title = 'Remover';
      UI.limpar(botaoRemover);
      botaoRemover.appendChild(icone('lixo'));
    }

    return el('div', { class: 'anexo' }, [
      el('div', { class: 'anexo-marca' }, icone('nota')),
      el('div', { class: 'anexo-corpo' }, [
        el('div', { class: 'anexo-nome', title: m.nome }, m.nome),
        el('div', { class: 't-mpq t-suave' }, ANEXOS.tamanhoLegivel(m.tamanho) + ' · ' +
          UI.data(m.criadoEm) + (m.criadoPor ? ' · ' + m.criadoPor : ''))
      ]),
      el('button', {
        class: 'btn btn-plano btn-icone btn-pq', title: 'Abrir', 'aria-label': 'Abrir ' + m.nome,
        onclick: function () { ANEXOS.abrirEmAba(m.id, m.nome).catch(function (e) { UI.erro('Não foi possível abrir', e.message); }); }
      }, icone('olho')),
      el('button', {
        class: 'btn btn-plano btn-icone btn-pq', title: 'Baixar', 'aria-label': 'Baixar ' + m.nome,
        onclick: function () { ANEXOS.baixar(m.id, m.nome).catch(function (e) { UI.erro('Não foi possível baixar', e.message); }); }
      }, icone('baixar')),
      botaoRemover
    ]);
  }

  /**
   * Termo de consentimento: gera o PDF com os dados da cirurgia e da
   * avaliação e oferece baixar ou compartilhar (WhatsApp, e-mail…).
   * `atual()` devolve o que está digitado no formulário agora, para o termo
   * sair com o anestesista escolhido mesmo antes de salvar.
   */
  function desenharTcle(app, a, cir, no, atual) {
    function dados() {
      var f = atual();
      return {
        paciente: a.paciente, procedimento: a.nomeCirurgia, dataCirurgia: a.dataCirurgia,
        convenio: cir ? cir.convenio : '', cirurgiao: cir ? cir.cirurgiao : '',
        anestesista: f.anestesista || a.anestCirurgia, dataAvaliacao: f.data,
        idCirurgia: a.idCirurgia, idAvaliacao: a.id
      };
    }

    function gerar() {
      var d = dados();
      try {
        return { blob: TCLE.gerar(d, { clinica: app.store.clinica() }), nome: TCLE.nomeArquivo(d), paciente: d.paciente };
      } catch (e) {
        UI.erro('Não foi possível gerar o termo', e.message);
        return null;
      }
    }

    var link = TCLE.linkWhatsApp(cir && cir.telefone, a.paciente, app.store.clinica());

    UI.limpar(no);
    no.appendChild(el('p', { class: 't-pq t-medio', style: 'margin:0 0 var(--e3)' },
      'O termo sai preenchido com paciente, cirurgia, data, cirurgião, anestesiologista e os dados da clínica ' +
      '(Cadastro › Clínica e termo). Dois caminhos: o paciente assina aqui na tela — o termo assinado é anexado ' +
      'aos exames e o TCLE fica "Sim" — ou você envia o PDF para ele assinar e marca o TCLE quando voltar.'));

    no.appendChild(el('div', { class: 'linha', style: 'flex-wrap:wrap' }, [
      el('button', {
        class: 'btn btn-primario',
        onclick: function () { formAssinatura(app, a, cir, dados()); }
      }, [icone('lapis'), 'Assinar na tela']),
      el('button', {
        class: 'btn',
        onclick: function () {
          var g = gerar();
          if (!g) return;
          ANEXOS.baixarBlob(g.blob, g.nome).then(function (ok) { if (ok) UI.ok('Termo gerado', g.nome); });
        }
      }, [icone('baixar'), 'Gerar PDF do termo']),
      TCLE.podeCompartilhar() ? el('button', {
        class: 'btn',
        onclick: function () {
          var g = gerar();
          if (!g) return;
          TCLE.compartilhar(g.blob, g.nome, g.paciente).catch(function (e) {
            if (e && e.name === 'AbortError') return;   // o usuário fechou o menu
            UI.erro('Não foi possível compartilhar', 'Use "Gerar PDF do termo" e envie o arquivo baixado.');
          });
        }
      }, [icone('compartilhar'), 'Enviar ao paciente']) : null,
      link ? el('a', {
        class: 'btn', href: link, target: '_blank', rel: 'noopener noreferrer',
        title: 'Abre a conversa com a mensagem pronta; anexe o PDF do termo na conversa'
      }, [icone('compartilhar'), 'WhatsApp do paciente']) : null
    ]));

    if (!link) {
      no.appendChild(el('div', { class: 't-mpq t-suave mt-2' },
        'Para o atalho do WhatsApp, preencha o TELEFONE DO PACIENTE (com DDD) na cirurgia.'));
    }
  }

  /**
   * Assinatura do paciente na tela (dedo, caneta ou mouse). Os traços viram
   * vetor no PDF — nada de imagem — e o termo assinado é anexado à avaliação
   * com um código de conferência (SHA-256 do conteúdo assinado).
   */
  function formAssinatura(app, a, cir, dadosTermo) {
    var quadro = COMP.quadroAssinatura({ rotulo: 'Área para o paciente assinar com o dedo ou o mouse' });

    var fNome = UI.campo({ rotulo: 'Nome de quem assina', nome: 'nome', valor: a.paciente || '', largo: true });
    var fDoc = UI.campo({ rotulo: 'Documento (CPF ou RG)', nome: 'documento', valor: '',
      dica: 'Se for o responsável legal, escreva também o parentesco.' });
    var form = UI.formulario([fNome, fDoc]);

    function codigoDeConferencia(texto) {
      try {
        if (!window.crypto || !crypto.subtle) return Promise.resolve('');
        return crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto)).then(function (buf) {
          return Array.prototype.map.call(new Uint8Array(buf), function (b) { return ('0' + b.toString(16)).slice(-2); })
            .join('').slice(0, 16);
        }).catch(function () { return ''; });
      } catch (e) { return Promise.resolve(''); }
    }

    function confirmar(botao) {
      var d = form.dados();
      var tracos = quadro.tracos();
      if (!tracos.length) { UI.atencao('Falta a assinatura', 'Peça ao paciente para assinar no quadro.'); return; }
      if (vazio(d.nome)) { fNome.erro('Informe o nome de quem assina.'); return; }
      botao.disabled = true;
      var quando = agoraTexto();
      var conteudo = JSON.stringify({ avaliacao: a.id, cirurgia: a.idCirurgia, termo: dadosTermo, nome: d.nome,
        documento: d.documento, tracos: tracos, quando: quando });

      codigoDeConferencia(conteudo).then(function (codigo) {
        var blob = TCLE.gerar(dadosTermo, {
          clinica: app.store.clinica(),
          assinatura: { tracos: tracos, nome: txt(d.nome), documento: txt(d.documento), quando: quando, codigo: codigo }
        });
        var arquivo = new File([blob], 'TCLE assinado - ' + txt(a.paciente || 'paciente') + ' - ' + quando.slice(0, 10) + '.pdf',
          { type: 'application/pdf' });
        return ANEXOS.adicionar(a, arquivo, app.store.usuario).then(function () { return codigo; });
      }).then(function (codigo) {
        var r = app.store.atualizarAvaliacao(a.id, { tcle: 'Sim' });
        if (!r.ok) throw new Error((r.erros[0] || {}).msg || 'falha ao marcar o TCLE');
        app.salvarEredesenhar();
        var atualizada = app.store.estado.avaliacoes.filter(function (x) { return x.id === a.id; })[0] || a;
        TELAS.avaliacoes.form(app, atualizada);
        UI.ok('Termo assinado e anexado', 'TCLE marcado como assinado' + (codigo ? ' · código ' + codigo : '') + '.');
      }).catch(function (e) {
        botao.disabled = false;
        UI.erro('Não foi possível guardar o termo assinado', e && e.message);
      });
    }

    var botaoOk = el('button', { class: 'btn btn-primario', onclick: function () { confirmar(botaoOk); } },
      [icone('check'), 'Assinar e anexar']);

    UI.abrirModal({
      titulo: 'Assinatura do termo de consentimento',
      sub: UI.ou(a.paciente) + ' · ' + UI.ou(a.nomeCirurgia) + ' · ' + UI.data(a.dataCirurgia),
      corpo: [
        el('div', { class: 'aviso aviso-info' }, [icone('info'), el('div', { class: 'aviso-corpo' }, [
          el('strong', null, 'Antes de assinar, o paciente lê o termo'),
          el('div', { class: 't-pq' }, 'Use "Gerar PDF do termo" para mostrar o texto completo, se ele pedir. A assinatura ' +
            'vai para o PDF junto com a data e um código de conferência; o termo assinado fica nos exames da avaliação.')
        ])]),
        quadro.no,
        el('div', { class: 'campo-grupo mt-3' }, [fNome.no, fDoc.no])
      ],
      acoes: [
        el('button', { class: 'btn', onclick: function () { quadro.limpar(); } }, [icone('x'), 'Limpar']),
        el('div', { class: 'espaco' }),
        el('button', { class: 'btn', onclick: function () { UI.fecharModal(); TELAS.avaliacoes.form(app, a); } }, 'Voltar'),
        botaoOk
      ]
    });
  }

  return {
    render: avaliacoes,
    form: formAvaliacao
  };
})();
