/**
 * ============================================================================
 * TELA — Boletim anestésico
 * ============================================================================
 * Duas vistas:
 *   - lista: as cirurgias do mês e a situação do boletim de cada uma;
 *   - editor: o boletim de uma cirurgia, por seções, salvando campo a campo.
 *
 * O editor NÃO redesenha a tela a cada campo: quem está digitando não pode
 * perder o foco. Cada mudança vai para o store (que valida e recusa o que
 * não faz sentido) e só as partes calculadas — checklist, resumo, gráfico,
 * tabelas — se refazem. Sinais vitais, fármacos, fluidos e intercorrências
 * entram por uma linha de digitação (Enter adiciona).
 *
 * Boletim finalizado abre só para leitura: a correção passa por "Reabrir",
 * com motivo, que vai para o LOG e para o histórico do próprio boletim.
 * ============================================================================
 */
'use strict';

TELAS.boletim = (function () {

  var el = UI.el, icone = UI.icone;
  var cab = COMP.cabecalhoCartao, nomeMes = COMP.nomeMes, botaoSeg = COMP.botaoSeg;
  var NS = 'http://www.w3.org/2000/svg';

  /* ================================================================ util */

  function situacao(b) { return !b ? 'sem' : b.status === BOLETIM_FINALIZADO ? 'finalizado' : 'rascunho'; }

  function seloBoletim(b) {
    if (!b) return el('span', { class: 'selo selo-na' }, 'Sem boletim');
    var v = b.versao > 1 ? ' · v' + b.versao : '';
    return b.status === BOLETIM_FINALIZADO
      ? el('span', { class: 'selo selo-ok' }, 'Finalizado' + v)
      : el('span', { class: 'selo selo-pendente' }, 'Em preenchimento' + v);
  }

  function duracaoTexto(min) {
    if (min === null || min === undefined) return '—';
    var h = Math.floor(min / 60), m = min % 60;
    return h ? h + 'h' + pad2(m) : m + ' min';
  }

  function numTexto(v, casas) {
    if (v === null || v === undefined) return '';
    return (casas ? v.toFixed(casas) : String(v)).replace('.', ',');
  }

  function horaAgora() {
    var d = new Date();
    return pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }

  /** 'HH:MM' + n minutos (dá a volta na meia-noite). */
  function somarMinutos(h, n) {
    var m = horaParaMinutos(h);
    if (m === null) return '';
    m = (((m + n) % 1440) + 1440) % 1440;
    return pad2(Math.floor(m / 60)) + ':' + pad2(m % 60);
  }

  function cirurgiaDe(app, b) {
    return app.store.estado.cirurgias.filter(function (c) { return txt(c.id) === b.idCirurgia; })[0] || null;
  }

  function crmDoCadastro(app, nome) {
    var a = app.store.estado.anestesistas.filter(function (x) { return mesmoTexto(x.nome, nome); })[0];
    return a ? txt(a.crm) : '';
  }

  function marcarErro(input, msg) {
    var campo = input && input.closest ? input.closest('.campo') : null;
    if (campo) campo.classList.toggle('invalido', !!msg);
    if (!input) return;
    if (msg) { input.setAttribute('aria-invalid', 'true'); input.title = msg; }
    else { input.removeAttribute('aria-invalid'); input.removeAttribute('title'); }
  }

  /** Botão de remover que pede um segundo clique (sem modal no meio da digitação). */
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
        timer = setTimeout(function () { armado = false; b.classList.remove('armado'); UI.preencher(b, icone('lixo')); }, 4000);
      }
    }, icone('lixo'));
    return b;
  }

  /* ========================================================= abrir/criar */

  /** Abre o boletim da cirurgia — ou oferece criar. Também usado pelas telas de cirurgias e do quadro. */
  function abrir(app, cirurgia) {
    var b = app.store.boletimDaCirurgia(cirurgia.id);
    if (b) { app.filtros.boletim.id = b.id; app.ir('boletim'); return; }
    UI.confirmar({
      titulo: 'Criar boletim anestésico',
      texto: 'Criar o boletim da cirurgia ' + cirurgia.id + ' — ' + UI.ou(cirurgia.paciente) + ', ' + UI.data(cirurgia.data) +
        (cirurgia.anestesista ? ', anestesista ' + cirurgia.anestesista : '') + '?',
      rotulo: 'Criar boletim'
    }, function () {
      var r = app.store.criarBoletim(cirurgia.id);
      if (!r.ok) { UI.resultado(r); return; }
      app.salvar();
      app.filtros.boletim.id = r.boletim.id;
      app.ir('boletim');
      UI.ok('Boletim ' + r.boletim.id + ' criado',
        r.boletim.tempos.inicioAnestesia ? 'O horário real da cirurgia já entrou como início e fim da anestesia.' : null);
    });
  }

  /* =============================================================== lista */

  function lista(app) {
    var store = app.store, f = app.filtros.boletim;
    var porCir = {};
    store.boletins().forEach(function (b) { porCir[b.idCirurgia] = b; });

    // Cancelada só aparece se tiver boletim (anestesia iniciada e suspensa, por exemplo).
    var doMes = store.estado.cirurgias.filter(function (c) {
      return Number(c.mes) === Number(app.mes) && Number(c.ano) === Number(app.ano) &&
        (cirurgiaContabilizavel(c) || porCir[txt(c.id)]);
    }).sort(function (x, y) {
      return String(x.data + (paraHora(x.inicioPrev) || '99')) < String(y.data + (paraHora(y.inicioPrev) || '99')) ? -1 : 1;
    });

    var cont = { sem: 0, rascunho: 0, finalizado: 0, realizadasSem: 0 };
    doMes.forEach(function (c) {
      var s = situacao(porCir[txt(c.id)]);
      cont[s]++;
      if (s === 'sem' && c.status === 'Realizada') cont.realizadasSem++;
    });

    var busca = normalizar(f.texto);
    var visiveis = doMes.filter(function (c) {
      if (f.situacao && situacao(porCir[txt(c.id)]) !== f.situacao) return false;
      return !busca || normalizar([c.id, c.paciente, c.procedimento, c.anestesista, c.cirurgiao].join(' ')).indexOf(busca) >= 0;
    });

    function filtroSit(rotulo, valor, n) {
      return botaoSeg(rotulo + (n !== undefined ? ' (' + n + ')' : ''), (f.situacao || '') === valor,
        function () { f.situacao = valor; app.redesenhar(); });
    }

    return el('div', { class: 'pilha' }, [
      el('div', { class: 'grade grade-4' }, [
        COMP.kpi({ rotulo: 'Cirurgias do mês', valor: String(doMes.length), nota: nomeMes(app.mes) + ' de ' + app.ano }),
        COMP.kpi({ rotulo: 'Boletins finalizados', valor: String(cont.finalizado), tom: cont.finalizado ? 'ok' : '',
          nota: 'assinados, com código de conferência' }),
        COMP.kpi({ rotulo: 'Em preenchimento', valor: String(cont.rascunho), tom: cont.rascunho ? 'alerta' : '',
          nota: 'ainda sem assinatura' }),
        COMP.kpi({ rotulo: 'Realizadas sem boletim', valor: String(cont.realizadasSem), tom: cont.realizadasSem ? 'alerta' : '',
          nota: 'cirurgias com status Realizada' })
      ]),

      el('div', { class: 'cartao' }, [
        cab('Boletins de ' + nomeMes(app.mes) + ' de ' + app.ano, 'Clique numa cirurgia para abrir o boletim — ou criar, se ainda não houver'),
        el('div', { class: 'cartao-corpo compacto' }, el('div', { class: 'linha' }, [
          el('div', { class: 'busca', style: 'flex:1;min-width:200px;max-width:320px' }, [
            icone('busca'),
            el('input', {
              class: 'entrada', type: 'search', value: f.texto || '', placeholder: 'Paciente, procedimento, anestesista…',
              'aria-label': 'Buscar boletim',
              oninput: function (ev) { f.texto = ev.target.value; app.redesenhar(); }
            })
          ]),
          el('div', { class: 'segmentado' }, [
            filtroSit('Todas', ''),
            filtroSit('Sem boletim', 'sem', cont.sem),
            filtroSit('Em preenchimento', 'rascunho', cont.rascunho),
            filtroSit('Finalizados', 'finalizado', cont.finalizado)
          ])
        ])),
        el('div', { class: 'cartao-corpo rente' }, UI.tabela({
          colunas: [{ rotulo: 'Data' }, { rotulo: 'Paciente' }, { rotulo: 'Procedimento' }, { rotulo: 'Anestesista' },
            { rotulo: 'Cirurgia' }, { rotulo: 'Boletim' }, { rotulo: '', classe: 'acoes' }],
          linhas: visiveis.map(function (c) {
            var b = porCir[txt(c.id)];
            return {
              celulas: [
                el('div', null, [el('div', null, UI.data(c.data)),
                  c.inicioPrev ? el('div', { class: 'celula-apoio num' }, paraHora(c.inicioPrev)) : null]),
                el('span', { class: 'celula-principal' }, UI.ou(c.paciente)),
                el('div', { class: 'envolve' }, [el('div', null, UI.ou(c.procedimento)),
                  el('div', { class: 'celula-apoio' }, core.classificarTipoCirurgia(c.procedimento))]),
                UI.ou(c.anestesista),
                UI.seloStatus(c.status),
                el('div', null, [seloBoletim(b), b ? el('div', { class: 'celula-apoio mono' }, b.id) : null]),
                // Mesmo peso para as duas ações da linha: uma coluna de botões
                // primários disputaria com a única ação principal da tela.
                el('button', {
                  class: 'btn btn-pq',
                  onclick: function (ev) { ev.stopPropagation(); abrir(app, c); }
                }, b ? [icone('nota'), 'Abrir'] : [icone('mais'), 'Criar'])
              ],
              __onclick: function () { abrir(app, c); }
            };
          }),
          vazio: {
            icone: 'nota',
            titulo: doMes.length ? 'Nenhuma cirurgia com esse filtro' : 'Nenhuma cirurgia no mês',
            texto: doMes.length ? 'Ajuste os filtros acima.' : 'Os boletins aparecem aqui conforme as cirurgias do mês forem lançadas.'
          }
        }))
      ])
    ]);
  }

  /* ============================================================== editor */

  function editor(app, b0) {
    var store = app.store;
    var id = b0.id;
    var cir = cirurgiaDe(app, b0);
    var fechado = b0.status === BOLETIM_FINALIZADO;
    var atualizadores = [];

    function atual() { return store.boletim(id); }
    function refazer() { var b = atual(); if (b) atualizadores.forEach(function (fn) { fn(b); }); }
    function aoMudar(fn) { atualizadores.push(fn); return fn; }

    /** Grava mudanças de campos. Devolve true se gravou. */
    function gravar(mudancas, input) {
      var r = store.salvarBoletim(id, mudancas);
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

    function valorDe(b, secao, chave) { return secao ? b[secao][chave] : b[chave]; }

    /** Campo simples (texto, número, hora, área de texto, lista). */
    function campo(cfg) {
      var b = atual();
      var v = valorDe(b, cfg.secao, cfg.chave);
      if (typeof v === 'number') v = numTexto(v, cfg.casas);
      var c = UI.campo({
        rotulo: cfg.rotulo, nome: 'bol_' + (cfg.secao || 'b') + '_' + cfg.chave,
        tipo: cfg.tipo || 'text', valor: v === null ? '' : v, opcoes: cfg.opcoes, rotuloVazio: cfg.rotuloVazio,
        dica: cfg.dica, largo: cfg.largo, modo: cfg.modo, exemplo: cfg.exemplo, lista: cfg.lista, linhas: cfg.linhas,
        desabilitado: fechado,
        aoMudar: function (ev) { gravar(mudanca(cfg.secao, cfg.chave, ev.target.value), ev.target); }
      });
      if (cfg.agora && !fechado) {
        var pai = c.input.parentNode, depois = c.input.nextSibling;
        pai.insertBefore(el('div', { class: 'com-botao' }, [
          c.input,
          el('button', {
            class: 'btn btn-pq', type: 'button', title: 'Hora de agora', 'aria-label': cfg.rotulo + ': hora de agora',
            onclick: function () { c.input.value = horaAgora(); gravar(mudanca(cfg.secao, cfg.chave, c.input.value), c.input); }
          }, icone('relogio'))
        ]), depois);
      }
      return c.no;
    }

    function numero(rotulo, secao, chave, extra) {
      return campo(Object.assign({ rotulo: rotulo, secao: secao, chave: chave, modo: 'decimal' }, extra || {}));
    }

    /** Caixa de marcar (Sim/Não). */
    function marcar(rotulo, secao, chave) {
      var input = el('input', {
        type: 'checkbox', name: 'bol_' + (secao || 'b') + '_' + chave, disabled: fechado,
        onchange: function (ev) {
          if (!gravar(mudanca(secao, chave, ev.target.checked))) ev.target.checked = !ev.target.checked;
        }
      });
      input.checked = !!valorDe(atual(), secao, chave);
      return el('label', { class: 'marcar' }, [input, el('span', null, rotulo)]);
    }

    /** Escolha única em botões (ASA, sexo, destino…); clicar de novo limpa. */
    function segmento(rotulo, secao, chave, opcoes) {
      var grupo = el('div', { class: 'segmentado', role: 'group', 'aria-label': rotulo });
      function desenhar() {
        var v = valorDe(atual(), secao, chave);
        UI.preencher(grupo, opcoes.map(function (o) {
          return el('button', {
            type: 'button', 'aria-pressed': v === o ? 'true' : 'false', disabled: fechado,
            onclick: function () { if (gravar(mudanca(secao, chave, v === o ? '' : o))) desenhar(); }
          }, o);
        }));
      }
      desenhar();
      // Muitas opções (ASA) ou rótulos longos (destino): o campo ocupa mais colunas.
      var tamanho = opcoes.join('').length;
      return el('div', { class: 'campo campo-seg' + (tamanho > 30 ? ' largura-3' : tamanho > 8 ? ' largura-2' : '') }, [
        el('div', { class: 'campo-rotulo' }, rotulo), grupo]);
    }

    /** Escolha múltipla em fichas (técnicas, posição, monitorização). */
    function fichas(rotulo, chave, opcoes, extra) {
      var grupo = el('div', { class: 'fichas', role: 'group', 'aria-label': rotulo });
      function desenhar() {
        var sel = atual()[chave];
        var todas = opcoes.concat(sel.filter(function (s) { return opcoes.indexOf(s) < 0; }));
        UI.preencher(grupo, todas.map(function (o) {
          var ligado = sel.indexOf(o) >= 0;
          return el('button', {
            type: 'button', class: 'ficha', 'aria-pressed': ligado ? 'true' : 'false', disabled: fechado,
            onclick: function () {
              var nova = ligado ? sel.filter(function (s) { return s !== o; }) : sel.concat([o]);
              if (gravar(mudanca(null, chave, nova))) desenhar();
            }
          }, [ligado ? icone('check') : null, o]);
        }));
      }
      desenhar();
      aoMudar(function () { desenhar(); });
      return el('div', { class: 'campo campo-largo' }, [
        el('div', { class: 'linha' }, [el('div', { class: 'campo-rotulo', style: 'flex:1' }, rotulo), extra || null]),
        grupo
      ]);
    }

    function secao(titulo, sub, filhos, acoes) {
      return el('section', { class: 'cartao' }, [cab(titulo, sub, acoes), el('div', { class: 'cartao-corpo' }, filhos)]);
    }

    /* ------------------------------------------------ registros (listas) */

    /**
     * Linha de digitação + tabela de uma lista do boletim.
     * cfg: { lista, campos:[{chave, rotulo, tipo, modo, largura, opcoes, listaId, exemplo}],
     *        colunas:[{rotulo, num, valor(l)}], padrao(b) -> valores iniciais, aoDigitar(chave, valor, inputs) }
     */
    function registros(cfg) {
      var raiz = el('div', { class: 'registros' });
      var inputs = {};
      var editando = null;   // { indice, linha }

      function entrada(cp) {
        var input;
        if (cp.tipo === 'select') {
          input = el('select', { class: 'entrada', name: 'bol_' + cfg.lista + '_' + cp.chave, 'aria-label': cp.rotulo },
            [el('option', { value: '' }, cp.vazio || '—')].concat(cp.opcoes.map(function (o) { return el('option', { value: o }, o); })));
        } else {
          input = el('input', {
            class: 'entrada', type: cp.tipo || 'text', name: 'bol_' + cfg.lista + '_' + cp.chave,
            'aria-label': cp.rotulo, placeholder: cp.exemplo || '', inputmode: cp.modo || null,
            list: cp.listaId || null, autocomplete: 'off'
          });
        }
        input.addEventListener('keydown', function (ev) {
          if (ev.key === 'Enter') { ev.preventDefault(); confirmar(); }
          if (ev.key === 'Escape' && editando) { ev.preventDefault(); cancelar(); }
        });
        if (cfg.aoDigitar) input.addEventListener('change', function () { cfg.aoDigitar(cp.chave, input.value, inputs); });
        inputs[cp.chave] = input;
        // reg-largo: no celular a linha vira grade de 3 colunas e o campo de texto ocupa 2.
        return el('div', { class: 'reg-campo' + ((cp.largura || 1) >= 2.5 ? ' reg-largo' : ''), style: 'flex:' + (cp.largura || 1) }, [
          el('label', { class: 'reg-rotulo' }, cp.rotulo), input
        ]);
      }

      var botaoOk = el('button', { class: 'btn btn-primario', type: 'button', onclick: function () { confirmar(); } }, [icone('mais'), 'Adicionar']);
      var botaoCancelar = el('button', { class: 'btn', type: 'button', hidden: true, onclick: function () { cancelar(); } }, 'Cancelar');
      var linhaEntrada = el('div', { class: 'reg-entrada' },
        cfg.campos.map(entrada).concat([el('div', { class: 'reg-botoes' }, [botaoOk, botaoCancelar])]));
      var tabela = el('div');

      function preencherEntrada(valores, placeholders) {
        cfg.campos.forEach(function (cp) {
          var v = valores[cp.chave];
          inputs[cp.chave].value = v === null || v === undefined ? '' : (typeof v === 'number' ? numTexto(v) : v);
          if (placeholders && cp.tipo !== 'select' && cp.tipo !== 'time') {
            var p = placeholders[cp.chave];
            inputs[cp.chave].placeholder = p === null || p === undefined || p === '' ? (cp.exemplo || '') : numTexto(p);
          }
          marcarErro(inputs[cp.chave], null);
        });
      }

      function prontoParaNovo() {
        editando = null;
        UI.preencher(botaoOk, [icone('mais'), 'Adicionar']);
        botaoCancelar.hidden = true;
        var b = atual();
        var linhas = b[cfg.lista];
        preencherEntrada(cfg.padrao ? cfg.padrao(b) : {}, linhas.length ? linhas[linhas.length - 1] : null);
      }

      function cancelar() { prontoParaNovo(); focarPrimeiro(); }

      function focarPrimeiro() {
        var alvo = cfg.foco ? inputs[cfg.foco] : inputs[cfg.campos[0].chave];
        if (alvo) alvo.focus();
      }

      function confirmar() {
        var linha = {};
        cfg.campos.forEach(function (cp) { linha[cp.chave] = inputs[cp.chave].value; });
        var op = editando
          ? { acao: 'alterar', indice: editando.indice, conferir: editando.linha, linha: linha }
          : { acao: 'adicionar', linha: linha };
        var r = store.alterarLinhaBoletim(id, cfg.lista, op);
        if (!r.ok) {
          UI.erro('Registro não salvo', r.erros.map(function (e) { return e.msg; }).join(' '));
          return;
        }
        app.salvar();
        prontoParaNovo();
        refazer();
        focarPrimeiro();
      }

      function editar(indice, l) {
        editando = { indice: indice, linha: l };
        preencherEntrada(l, null);
        UI.preencher(botaoOk, [icone('check'), 'Salvar']);
        botaoCancelar.hidden = false;
        focarPrimeiro();
      }

      function remover(indice, l) {
        var r = store.alterarLinhaBoletim(id, cfg.lista, { acao: 'remover', indice: indice, conferir: l });
        if (!r.ok) { UI.resultado(r); return; }
        app.salvar();
        if (editando) prontoParaNovo();
        refazer();
      }

      aoMudar(function (b) {
        var linhas = b[cfg.lista];
        UI.preencher(tabela, linhas.length ? UI.tabela({
          colunas: cfg.colunas.map(function (c) { return { rotulo: c.rotulo, num: c.num }; })
            .concat(fechado ? [] : [{ rotulo: '', classe: 'acoes' }]),
          linhas: linhas.map(function (l, i) {
            var cel = cfg.colunas.map(function (c) { return c.valor(l); });
            if (!fechado) {
              cel.push(el('div', { class: 'linha', style: 'justify-content:flex-end;flex-wrap:nowrap' }, [
                el('button', {
                  class: 'btn btn-plano btn-icone btn-pq', type: 'button', title: 'Editar', 'aria-label': 'Editar',
                  onclick: function (ev) { ev.stopPropagation(); editar(i, l); }
                }, icone('lapis')),
                botaoRemover(function () { remover(i, l); })
              ]));
            }
            return cel;
          })
        }) : el('div', { class: 'reg-vazio' }, cfg.vazio || 'Nenhum registro ainda.'));
      });

      if (!fechado) raiz.appendChild(linhaEntrada);
      raiz.appendChild(tabela);
      if (!fechado) prontoParaNovo();
      return raiz;
    }

    /* ----------------------------------------------------------- gráfico */

    function svg(tag, attrs, filhos) {
      var n = document.createElementNS(NS, tag);
      Object.keys(attrs || {}).forEach(function (k) { if (attrs[k] !== null && attrs[k] !== undefined) n.setAttribute(k, attrs[k]); });
      (filhos || []).forEach(function (f) { if (f) n.appendChild(typeof f === 'string' ? document.createTextNode(f) : f); });
      return n;
    }

    /** PA ("v" sistólica, "^" diastólica) e FC (pontos) na linha do tempo — como no PDF. */
    function grafico(b) {
      var ref = referenciaBoletim(b);
      var pts = b.sinais.map(function (s) { return { m: minutoNoBoletim(ref, s.hora), s: s }; })
        .filter(function (p) { return p.m !== null; });
      if (!pts.length) return el('div', { class: 'reg-vazio' }, 'O gráfico aparece com o primeiro registro de sinais vitais.');

      var marcos = [['inicioAnestesia', 'IA'], ['inicioCirurgia', 'IC'], ['fimCirurgia', 'TC'], ['fimAnestesia', 'TA']]
        .map(function (x) { return { sigla: x[1], m: minutoNoBoletim(ref, b.tempos[x[0]]) }; })
        .filter(function (x) { return x.m !== null; });
      var todos = pts.map(function (p) { return p.m; }).concat(marcos.map(function (x) { return x.m; }));
      var t0 = Math.floor(Math.min.apply(null, todos) / 5) * 5, t1 = Math.ceil(Math.max.apply(null, todos) / 5) * 5;
      if (t1 - t0 < 30) t1 = t0 + 30;
      var maxV = 240;
      pts.forEach(function (p) { [p.s.pas, p.s.pad, p.s.fc].forEach(function (v) { if (v !== null && v > maxV) maxV = Math.ceil(v / 20) * 20; }); });

      var W = 760, H = 230, x0 = 34, x1 = W - 8, y0 = H - 22, y1 = 16;
      function X(m) { return x0 + (m - t0) / (t1 - t0) * (x1 - x0); }
      function Y(v) { return y0 - v / maxV * (y0 - y1); }
      var g = [];
      for (var v = 0; v <= maxV; v += 20) {
        g.push(svg('line', { x1: x0, x2: x1, y1: Y(v), y2: Y(v), class: v % 40 ? 'bg-grade-fina' : 'bg-grade' }));
        if (v % 40 === 0) g.push(svg('text', { x: x0 - 5, y: Y(v) + 3.5, 'text-anchor': 'end', class: 'bg-eixo' }, [String(v)]));
      }
      var passo = [5, 10, 15, 30, 60, 120].filter(function (p) { return (x1 - x0) / ((t1 - t0) / p) >= 9; })[0] || 120;
      var rot = [15, 30, 60, 120, 240].filter(function (p) { return p >= passo && (x1 - x0) / ((t1 - t0) / p) >= 44; })[0] || 240;
      for (var m = Math.ceil(t0 / passo) * passo; m <= t1; m += passo) {
        var marcado = ((m % rot) + rot) % rot === 0;
        g.push(svg('line', { x1: X(m), x2: X(m), y1: y1, y2: y0, class: marcado ? 'bg-grade' : 'bg-grade-fina' }));
        if (marcado) {
          var hm = ((((ref || 0) + m) % 1440) + 1440) % 1440;
          g.push(svg('text', { x: X(m), y: H - 6, 'text-anchor': 'middle', class: 'bg-eixo' }, [pad2(Math.floor(hm / 60)) + ':' + pad2(hm % 60)]));
        }
      }
      marcos.forEach(function (mk) {
        g.push(svg('line', { x1: X(mk.m), x2: X(mk.m), y1: y1, y2: y0, class: 'bg-marco' }));
        g.push(svg('text', { x: X(mk.m), y: y1 - 4, 'text-anchor': 'middle', class: 'bg-marco-rotulo' }, [mk.sigla]));
      });
      var fc = pts.filter(function (p) { return p.s.fc !== null; });
      if (fc.length > 1) {
        g.push(svg('polyline', { points: fc.map(function (p) { return X(p.m) + ',' + Y(p.s.fc); }).join(' '), class: 'bg-fc-linha' }));
      }
      fc.forEach(function (p) {
        g.push(svg('circle', { cx: X(p.m), cy: Y(p.s.fc), r: 2.6, class: 'bg-fc' }, [svg('title', null, [p.s.hora + ' · FC ' + p.s.fc])]));
      });
      pts.forEach(function (p) {
        var x = X(p.m), s = 4.5;
        if (p.s.pas !== null && p.s.pad !== null) g.push(svg('line', { x1: x, x2: x, y1: Y(p.s.pas), y2: Y(p.s.pad), class: 'bg-pa-fio' }));
        var titulo = p.s.hora + ' · PA ' + (p.s.pas === null ? '—' : p.s.pas) + '/' + (p.s.pad === null ? '—' : p.s.pad);
        if (p.s.pas !== null) g.push(svg('polyline', { points: (x - s) + ',' + (Y(p.s.pas) - s) + ' ' + x + ',' + Y(p.s.pas) + ' ' + (x + s) + ',' + (Y(p.s.pas) - s), class: 'bg-pa' }, [svg('title', null, [titulo])]));
        if (p.s.pad !== null) g.push(svg('polyline', { points: (x - s) + ',' + (Y(p.s.pad) + s) + ' ' + x + ',' + Y(p.s.pad) + ' ' + (x + s) + ',' + (Y(p.s.pad) + s), class: 'bg-pa' }, [svg('title', null, [titulo])]));
      });
      return el('div', { class: 'bg-grafico' }, [
        svg('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': 'Gráfico de pressão arterial e frequência cardíaca ao longo da anestesia' }, g),
        el('div', { class: 'bg-legenda' }, [
          el('span', null, [el('i', { class: 'lg-pa' }, 'v'), 'PA sistólica']),
          el('span', null, [el('i', { class: 'lg-pa' }, '^'), 'PA diastólica']),
          el('span', null, [el('i', { class: 'lg-fc' }), 'FC']),
          el('span', { class: 't-suave' }, 'IA/TA início e término da anestesia · IC/TC da cirurgia')
        ])
      ]);
    }

    /* ------------------------------------------------------------ ações */

    function gerarPdf() {
      var b = atual();
      try {
        var g = BOLETIM_PDF.gerar(b, cirurgiaDe(app, b), { clinica: store.clinica(), crm: crmDoCadastro(app, cir && cir.anestesista) });
        ANEXOS.baixarBlob(g.blob, g.nome).then(function (ok) { if (ok) UI.ok('PDF do boletim gerado', g.nome); });
      } catch (e) {
        UI.erro('Não foi possível gerar o PDF', e && e.message);
      }
    }

    function finalizar() {
      var b = atual();
      var c = cirurgiaDe(app, b);
      var pend = pendenciasBoletim(b, c);
      if (pend.length) { UI.atencao('Ainda falta preencher', pend.join(' · ') + '.'); return; }
      var quadro = COMP.quadroAssinatura({ rotulo: 'Área para o anestesiologista assinar' });
      var crm = crmDoCadastro(app, c.anestesista);
      var fNome = UI.campo({ rotulo: 'Anestesiologista', nome: 'nome', valor: c.anestesista, obrigatorio: true });
      var fCrm = UI.campo({ rotulo: 'CRM', nome: 'crm', valor: crm, obrigatorio: true, exemplo: '12345-DF',
        dica: crm ? null : 'Vai também para o cadastro do anestesista.' });
      var form = UI.formulario([fNome, fCrm]);

      function confirmar(botao) {
        var d = form.dados();
        var tracos = quadro.tracos();
        if (!tracos.length) { UI.atencao('Falta a assinatura', 'Assine no quadro acima da linha.'); return; }
        botao.disabled = true;
        var r = store.finalizarBoletim(id, { tracos: tracos, nome: d.nome, crm: d.crm });
        if (!r.ok) {
          botao.disabled = false;
          var soltos = form.mostrarErros(r.erros);
          if (soltos.length) UI.erro('Não foi possível finalizar', soltos.join(' '));
          return;
        }
        UI.fecharModal();
        // A assinatura se escreve uma vez, agora, na tela que vai aparecer.
        app.recemAssinado = id;
        app.salvarEredesenhar();
        UI.marco('Boletim finalizado e assinado', 'Código de conferência ' + codigoLegivel(r.boletim.assinatura.codigo) + '.');
        (r.avisos || []).forEach(function (a) { UI.atencao('Atenção', a.msg); });
      }

      var botaoOk = el('button', { class: 'btn btn-primario', onclick: function () { confirmar(botaoOk); } },
        [icone('check'), 'Assinar e finalizar']);
      UI.abrirModal({
        titulo: 'Finalizar e assinar o boletim',
        sub: b.id + ' · ' + UI.ou(c.paciente) + ' · ' + UI.data(c.data),
        corpo: [
          el('div', { class: 'aviso aviso-info' }, [icone('info'), el('div', { class: 'aviso-corpo' }, [
            el('strong', null, 'Depois de assinado, o boletim não se edita'),
            el('div', { class: 't-pq' }, 'Ele passa a fazer parte do prontuário, com a data, a assinatura e um código de conferência. ' +
              'Para corrigir depois, é preciso reabrir informando o motivo — fica registrado no LOG e no próprio boletim.')
          ])]),
          quadro.no,
          el('div', { class: 'campo-grupo mt-3' }, [fNome.no, fCrm.no])
        ],
        acoes: [
          el('button', { class: 'btn', onclick: function () { quadro.limpar(); } }, [icone('x'), 'Limpar']),
          el('div', { class: 'espaco' }),
          el('button', { class: 'btn', onclick: function () { UI.fecharModal(); } }, 'Cancelar'),
          botaoOk
        ]
      });
    }

    function reabrir() {
      var fMotivo = UI.campo({ rotulo: 'Motivo da reabertura', nome: 'motivo', tipo: 'textarea', linhas: 3, largo: true, obrigatorio: true,
        dica: 'Ex.: "corrigir a dose de fentanil digitada errada". Fica no LOG e no histórico do boletim.' });
      var form = UI.formulario([fMotivo]);
      UI.abrirModal({
        titulo: 'Reabrir o boletim ' + id,
        tamanho: 'estreito',
        corpo: [
          el('div', { class: 'aviso aviso-atencao' }, [icone('alerta'), el('div', { class: 'aviso-corpo' },
            'A assinatura atual vai para o histórico (com o código) e o boletim volta a ser editável. ' +
            'Ao terminar a correção, ele precisa ser assinado de novo.')]),
          fMotivo.no
        ],
        acoes: [
          el('div', { class: 'espaco' }),
          el('button', { class: 'btn', onclick: function () { UI.fecharModal(); } }, 'Cancelar'),
          el('button', {
            class: 'btn btn-primario', onclick: function () {
              var r = store.reabrirBoletim(id, form.dados().motivo);
              if (!r.ok) { var s = form.mostrarErros(r.erros); if (s.length) UI.erro('Não foi possível reabrir', s.join(' ')); return; }
              UI.fecharModal();
              app.salvarEredesenhar();
              UI.ok('Boletim reaberto', 'Versão ' + r.boletim.versao + ' em preenchimento.');
            }
          }, [icone('lapis'), 'Reabrir'])
        ]
      });
    }

    function descartar() {
      UI.confirmar({
        titulo: 'Descartar o rascunho ' + id, tipo: 'perigo', rotulo: 'Descartar',
        aviso: 'O boletim em preenchimento é apagado (fica registrado no LOG). Use só se ele foi criado por engano.'
      }, function () {
        var r = store.descartarBoletim(id);
        if (!r.ok) { UI.resultado(r); return; }
        app.filtros.boletim.id = '';
        app.salvarEredesenhar();
        UI.ok('Rascunho descartado');
      });
    }

    /* ----------------------------------------------------------- lateral */

    var blocoSituacao = el('div');
    var blocoChecklist = el('div');
    var blocoResumo = el('div', { class: 'defs' });
    var botaoFinalizar = el('button', { class: 'btn btn-primario', onclick: finalizar }, [icone('check'), 'Finalizar e assinar']);

    aoMudar(function (b) {
      var c = cirurgiaDe(app, b);
      var reqs = requisitosBoletim(b, c);
      var feitos = reqs.filter(function (r) { return r.ok; }).length;
      var erros = validarBoletim(b).erros;
      botaoFinalizar.disabled = feitos < reqs.length || erros.length > 0;

      // Só a primeira montagem depois de assinar anima; qualquer redesenho seguinte a mostra parada.
      var acabouDeAssinar = app.recemAssinado === id && b.status === BOLETIM_FINALIZADO;
      if (acabouDeAssinar) app.recemAssinado = null;

      UI.preencher(blocoSituacao, b.status === BOLETIM_FINALIZADO && b.assinatura ? [
        el('div', { class: 'linha' }, [seloBoletim(b)]),
        el('div', { class: 't-pq mt-2' }, 'Assinado por ' + b.assinatura.nome + (b.assinatura.crm ? ' (CRM ' + b.assinatura.crm + ')' : '') +
          ' em ' + dataBR(b.assinatura.quando.slice(0, 10)) + ' às ' + b.assinatura.quando.slice(11, 16) + '.'),
        (b.assinatura.tracos && b.assinatura.tracos.length) ? COMP.assinaturaVista(b.assinatura.tracos, acabouDeAssinar) : null,
        el('div', { class: 'codigo-conferencia mt-2' }, [
          el('span', { class: 't-mpq t-suave' }, 'Código de conferência'),
          el('strong', { class: 'mono' }, codigoLegivel(b.assinatura.codigo)),
          codigoConfereBoletim(b)
            ? el('span', { class: 'selo selo-ok sem-ponto' }, [icone('check', 'selo-icone'), 'confere'])
            : el('span', { class: 'selo selo-cancelada sem-ponto' }, [icone('alerta', 'selo-icone'), 'não confere'])
        ])
      ] : [
        el('div', { class: 'linha' }, [seloBoletim(b)]),
        el('div', { class: 't-pq t-medio mt-2' }, 'Salvo a cada campo' + (b.atualizadoEm ? ' · última alteração ' +
          b.atualizadoEm.slice(11, 16) + ' de ' + dataBR(b.atualizadoEm.slice(0, 10)) : '') + '.')
      ]);

      // Tudo em ordem: o cartão avisa que já dá para assinar, em vez de deixar "10 de 10" para ser interpretado.
      var pronto = feitos === reqs.length && !erros.length && b.status !== BOLETIM_FINALIZADO;

      UI.preencher(blocoChecklist, [
        el('div', { class: 'checklist-topo' }, [el('strong', null, 'Para finalizar'),
          pronto
            ? el('span', { class: 't-pq t-ok t-forte checklist-pronto' }, [UI.visto(false), 'Pronto para assinar'])
            : el('span', { class: 't-pq t-suave' }, feitos + ' de ' + reqs.length)]),
        el('div', { class: 'progresso' + (pronto ? ' completo' : ''), role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(reqs.length), 'aria-valuenow': String(feitos) },
          el('span', { style: 'transform:scaleX(' + (reqs.length ? feitos / reqs.length : 0) + ')' })),
        el('ul', { class: 'checklist' }, reqs.map(function (r) {
          return el('li', { class: r.ok ? 'ok' : '' }, [icone(r.ok ? 'check' : 'info'), r.rotulo]);
        })),
        erros.length ? el('div', { class: 'aviso aviso-erro mt-2' }, [icone('alerta'), el('div', { class: 'aviso-corpo t-pq' },
          erros.map(function (e) { return e.msg; }).join(' '))]) : null
      ]);

      var r = resumoBoletim(b);
      UI.preencher(blocoResumo, [
        COMP.def('Anestesia', duracaoTexto(r.duracaoAnestesia)),
        COMP.def('Cirurgia', duracaoTexto(r.duracaoCirurgia)),
        COMP.def('Sala', duracaoTexto(r.duracaoSala)),
        COMP.def('Balanço hídrico', r.temBalanco ? (r.balanco > 0 ? '+' : '') + r.balanco + ' mL' : '—'),
        COMP.def('Aldrete', r.aldrete === null ? '—' : r.aldrete + '/10', r.aldrete !== null && r.aldrete >= ALDRETE_ALTA ? 'ok' : null),
        COMP.def('IMC', r.imc === null ? '—' : numTexto(r.imc, 1))
      ]);
    });

    var b = b0;
    var ehRascunhoNovo = b.status !== BOLETIM_FINALIZADO && b.versao === 1 && !b.historico.length;
    var lateral = el('aside', { class: 'bol-lateral' }, [
      el('div', { class: 'cartao' }, el('div', { class: 'cartao-corpo compacto pilha-pq' }, [
        blocoSituacao,
        el('div', { class: 'pilha-pq mt-2' }, fechado ? [
          el('button', { class: 'btn btn-primario', onclick: gerarPdf }, [icone('baixar'), 'PDF do boletim']),
          el('button', { class: 'btn', onclick: reabrir }, [icone('lapis'), 'Reabrir para correção'])
        ] : [
          botaoFinalizar,
          el('button', { class: 'btn', onclick: gerarPdf }, [icone('baixar'), 'PDF (rascunho)']),
          ehRascunhoNovo ? el('button', { class: 'btn btn-perigo', onclick: descartar }, [icone('lixo'), 'Descartar rascunho']) : null
        ])
      ])),
      fechado ? null : el('div', { class: 'cartao' }, el('div', { class: 'cartao-corpo compacto' }, blocoChecklist)),
      el('div', { class: 'cartao' }, [cab('Resumo'), el('div', { class: 'cartao-corpo compacto' }, blocoResumo)])
    ]);

    /* ------------------------------------------------------------ seções */

    var aval = cir ? store.estado.avaliacoes.filter(function (a) { return txt(a.idCirurgia) === txt(cir.id); })[0] : null;
    var imc = el('strong', { class: 'num' });
    aoMudar(function (x) { var r = resumoBoletim(x); imc.textContent = r.imc === null ? '—' : numTexto(r.imc, 1) + ' kg/m²'; });

    var secPaciente = secao('Paciente e avaliação pré-anestésica', aval
      ? 'Avaliação ' + aval.id + (ehSim(aval.realizada) ? ' realizada' + (aval.data ? ' em ' + UI.data(aval.data) : '') : ' ainda não realizada') +
        (aval.anestesista ? ' por ' + aval.anestesista : '') + ' · TCLE ' + (ehSim(aval.tcle) ? 'assinado' : 'pendente')
      : 'Sem avaliação pré vinculada a esta cirurgia', [
      el('div', { class: 'campos-auto' }, [
        numero('Idade (anos)', 'paciente', 'idade', { modo: 'numeric' }),
        segmento('Sexo', 'paciente', 'sexo', OPCOES_BOLETIM.sexo),
        numero('Peso (kg)', 'paciente', 'peso', { casas: 1 }),
        numero('Altura (cm)', 'paciente', 'altura', { modo: 'numeric' }),
        el('div', { class: 'campo' }, [el('div', { class: 'campo-rotulo' }, 'IMC'), el('div', { class: 'valor-calculado' }, imc)]),
        campo({ rotulo: 'Prontuário', secao: 'paciente', chave: 'prontuario' })
      ]),
      el('div', { class: 'campos-auto mt-3' }, [
        segmento('ASA', 'pre', 'asa', OPCOES_BOLETIM.asa),
        el('div', { class: 'campo' }, [el('div', { class: 'campo-rotulo' }, 'Emergência'), marcar('ASA "E"', 'pre', 'emergencia')]),
        numero('Jejum (h)', 'pre', 'jejum', { casas: 1 }),
        segmento('Mallampati', 'pre', 'mallampati', OPCOES_BOLETIM.mallampati),
        el('div', { class: 'campo' }, [el('div', { class: 'campo-rotulo' }, 'Via aérea'), marcar('Difícil prevista', 'pre', 'viaAereaDificil')])
      ]),
      el('div', { class: 'campo-grupo mt-3' }, [
        campo({ rotulo: 'Alergias', secao: 'pre', chave: 'alergias', exemplo: 'Nega alergias', largo: true }),
        campo({ rotulo: 'Comorbidades', secao: 'pre', chave: 'comorbidades', tipo: 'textarea', linhas: 2 }),
        campo({ rotulo: 'Medicações em uso', secao: 'pre', chave: 'medicacoes', tipo: 'textarea', linhas: 2 })
      ])
    ], aval ? [el('button', { class: 'btn btn-pq', onclick: function () { TELAS.avaliacoes.form(app, aval); } },
      [icone('estetoscopio'), 'Abrir avaliação'])] : null);

    var secTecnica = secao('Técnica e via aérea', null, [
      fichas('Técnica anestésica', 'tecnicas', OPCOES_BOLETIM.tecnicas),
      el('div', { class: 'campo-grupo mt-3' }, [
        campo({ rotulo: 'Outra técnica', chave: 'tecnicaOutra', exemplo: 'Se nenhuma acima descrever' }),
        campo({ rotulo: 'Acessos (venoso, arterial)', chave: 'acesso', exemplo: 'Jelco 18G MSE' })
      ]),
      el('div', { class: 'campos-auto mt-3' }, [
        campo({ rotulo: 'Dispositivo de via aérea', secao: 'viaAerea', chave: 'dispositivo', tipo: 'select',
          opcoes: OPCOES_BOLETIM.dispositivos.concat(b.viaAerea.dispositivo && OPCOES_BOLETIM.dispositivos.indexOf(b.viaAerea.dispositivo) < 0 ? [b.viaAerea.dispositivo] : []),
          rotuloVazio: '— nenhum —' }),
        campo({ rotulo: 'Tamanho / número', secao: 'viaAerea', chave: 'tamanho', exemplo: '7,0' }),
        segmento('Cormack-Lehane', 'viaAerea', 'cormack', OPCOES_BOLETIM.cormack),
        numero('Tentativas', 'viaAerea', 'tentativas', { modo: 'numeric' }),
        el('div', { class: 'campo' }, [el('div', { class: 'campo-rotulo' }, 'Intubação'), marcar('Via aérea difícil', 'viaAerea', 'dificil')])
      ]),
      el('div', { class: 'mt-3' }, campo({ rotulo: 'Observação sobre a via aérea', secao: 'viaAerea', chave: 'obs', largo: true,
        exemplo: 'Ex.: videolaringoscópio, bougie, dente frágil…' })),
      el('div', { class: 'mt-3' }, fichas('Posição', 'posicoes', OPCOES_BOLETIM.posicoes))
    ]);

    var secMonitor = secao('Monitorização e ventilação', null, [
      fichas('Monitorização', 'monitorizacao', OPCOES_BOLETIM.monitorizacao, fechado ? null : el('button', {
        class: 'btn btn-pq', type: 'button', title: 'Marca ECG, oximetria, PA não invasiva e capnografia',
        onclick: function () {
          var atuais = atual().monitorizacao;
          var faltam = MONITORIZACAO_BASICA.filter(function (m) { return atuais.indexOf(m) < 0; });
          if (!faltam.length) { UI.info('A monitorização básica já está marcada'); return; }
          gravar({ monitorizacao: atuais.concat(faltam) });
        }
      }, [icone('check'), 'Básica'])),
      el('div', { class: 'campos-auto mt-3' }, [
        campo({ rotulo: 'Modo ventilatório', secao: 'ventilacao', chave: 'modo', tipo: 'select', opcoes: OPCOES_BOLETIM.ventilacao }),
        numero('VC (mL)', 'ventilacao', 'vc', { modo: 'numeric' }),
        numero('FR (irpm)', 'ventilacao', 'fr', { modo: 'numeric' }),
        numero('PEEP (cmH₂O)', 'ventilacao', 'peep', { modo: 'numeric' }),
        numero('FiO₂ (%)', 'ventilacao', 'fio2', { modo: 'numeric' })
      ])
    ]);

    var duracoes = el('div', { class: 'linha t-pq t-medio' });
    aoMudar(function (x) {
      var r = resumoBoletim(x);
      UI.preencher(duracoes, [
        el('span', null, ['Anestesia ', el('strong', null, duracaoTexto(r.duracaoAnestesia))]),
        el('span', null, ['· Cirurgia ', el('strong', null, duracaoTexto(r.duracaoCirurgia))]),
        el('span', null, ['· Sala ', el('strong', null, duracaoTexto(r.duracaoSala))])
      ]);
    });
    var secTempos = secao('Horários', 'Passou da meia-noite? Digite o horário normalmente — o sistema entende a virada.', [
      el('div', { class: 'campos-auto campos-hora' }, TEMPOS_BOLETIM.map(function (t) {
        return campo({ rotulo: t.rotulo, secao: 'tempos', chave: t.campo, tipo: 'time', agora: true });
      })),
      el('div', { class: 'mt-3' }, duracoes)
    ]);

    var areaGrafico = el('div');
    aoMudar(function (x) { UI.preencher(areaGrafico, grafico(x)); });
    var secSinais = secao('Sinais vitais', 'Enter adiciona; a próxima linha já vem 5 minutos depois', [
      areaGrafico,
      el('div', { class: 'mt-3' }, registros({
        lista: 'sinais', foco: 'pas',
        campos: [
          { chave: 'hora', rotulo: 'Hora', tipo: 'time', largura: 1.3 },
          { chave: 'pas', rotulo: 'PAS', modo: 'numeric', exemplo: '120' },
          { chave: 'pad', rotulo: 'PAD', modo: 'numeric', exemplo: '80' },
          { chave: 'fc', rotulo: 'FC', modo: 'numeric', exemplo: '72' },
          { chave: 'spo2', rotulo: 'SpO₂', modo: 'numeric', exemplo: '98' },
          { chave: 'etco2', rotulo: 'EtCO₂', modo: 'numeric', exemplo: '35' },
          { chave: 'temp', rotulo: 'Temp.', modo: 'decimal', exemplo: '36,5' }
        ],
        padrao: function (x) {
          var s = x.sinais;
          return { hora: s.length ? somarMinutos(s[s.length - 1].hora, 5) : (x.tempos.inicioAnestesia || x.tempos.entradaSala || horaAgora()) };
        },
        colunas: [
          { rotulo: 'Hora', valor: function (l) { return el('span', { class: 'num' }, l.hora); } },
          { rotulo: 'PA (mmHg)', valor: function (l) { return l.pas === null && l.pad === null ? '—' : (l.pas === null ? '—' : l.pas) + '/' + (l.pad === null ? '—' : l.pad); } },
          { rotulo: 'FC', num: true, valor: function (l) { return l.fc === null ? '—' : String(l.fc); } },
          { rotulo: 'SpO₂', num: true, valor: function (l) { return l.spo2 === null ? '—' : l.spo2 + '%'; } },
          { rotulo: 'EtCO₂', num: true, valor: function (l) { return l.etco2 === null ? '—' : String(l.etco2); } },
          { rotulo: 'Temp.', num: true, valor: function (l) { return l.temp === null ? '—' : numTexto(l.temp, 1) + ' °C'; } }
        ],
        vazio: 'Nenhum registro de sinais vitais.'
      }))
    ]);

    var nomesFarmacos = FARMACOS_BOLETIM.map(function (f) { return f.nome; });
    var secFarmacos = secao('Fármacos', 'Unidade e via se preenchem ao escolher um fármaco da lista; a dose é sempre digitada', [
      el('datalist', { id: 'bol-lista-farmacos' }, nomesFarmacos.map(function (n) { return el('option', { value: n }); })),
      registros({
        lista: 'farmacos', foco: 'nome',
        campos: [
          { chave: 'hora', rotulo: 'Hora', tipo: 'time', largura: 1.2 },
          { chave: 'nome', rotulo: 'Fármaco', listaId: 'bol-lista-farmacos', largura: 2.6, exemplo: 'Propofol' },
          { chave: 'dose', rotulo: 'Dose', modo: 'decimal', exemplo: '150' },
          { chave: 'unidade', rotulo: 'Unidade', tipo: 'select', opcoes: OPCOES_BOLETIM.unidades, largura: 1.3 },
          { chave: 'via', rotulo: 'Via', tipo: 'select', opcoes: OPCOES_BOLETIM.vias, largura: 1.5 }
        ],
        padrao: function (x) {
          var f = x.farmacos;
          return { hora: f.length ? f[f.length - 1].hora : (x.tempos.inicioAnestesia || horaAgora()) };
        },
        aoDigitar: function (chave, valor, inputs) {
          if (chave !== 'nome') return;
          var conhecido = farmacoConhecido(valor);
          if (!conhecido) return;
          inputs.nome.value = conhecido.nome;
          inputs.unidade.value = conhecido.unidade;
          inputs.via.value = conhecido.via;
        },
        colunas: [
          { rotulo: 'Hora', valor: function (l) { return el('span', { class: 'num' }, l.hora); } },
          { rotulo: 'Fármaco', valor: function (l) { return el('span', { class: 'celula-principal' }, l.nome); } },
          { rotulo: 'Dose', num: true, valor: function (l) { return [l.dose, l.unidade].filter(Boolean).join(' '); } },
          { rotulo: 'Via', valor: function (l) { return l.via; } }
        ],
        vazio: 'Nenhum fármaco registrado.'
      })
    ]);

    var balanco = el('div', { class: 'linha t-pq t-medio' });
    aoMudar(function (x) {
      var r = resumoBoletim(x);
      UI.preencher(balanco, [
        el('span', null, ['Entradas ', el('strong', null, r.entradas + ' mL')]),
        el('span', null, ['· Saídas ', el('strong', null, r.saidas + ' mL')]),
        el('span', null, ['· Balanço ', el('strong', null, r.temBalanco ? (r.balanco > 0 ? '+' : '') + r.balanco + ' mL' : '—')])
      ]);
    });
    var secFluidos = secao('Fluidos e balanço', null, [
      el('datalist', { id: 'bol-lista-fluidos' }, OPCOES_BOLETIM.fluidos.map(function (n) { return el('option', { value: n }); })),
      registros({
        lista: 'fluidos', foco: 'nome',
        campos: [
          { chave: 'nome', rotulo: 'Fluido', listaId: 'bol-lista-fluidos', largura: 3, exemplo: 'Ringer lactato' },
          { chave: 'volume', rotulo: 'Volume (mL)', modo: 'numeric', exemplo: '500', largura: 1.2 }
        ],
        colunas: [
          { rotulo: 'Fluido', valor: function (l) { return l.nome; } },
          { rotulo: 'Volume', num: true, valor: function (l) { return l.volume + ' mL'; } }
        ],
        vazio: 'Nenhum fluido registrado.'
      }),
      el('div', { class: 'campos-auto mt-3' }, [
        numero('Sangramento (mL)', 'perdas', 'sangramento', { modo: 'numeric' }),
        numero('Diurese (mL)', 'perdas', 'diurese', { modo: 'numeric' })
      ]),
      el('div', { class: 'mt-3' }, balanco)
    ]);

    var secIntercorrencias = secao('Intercorrências', null, [
      marcar('Sem intercorrências', null, 'semIntercorrencias'),
      el('div', { class: 'mt-3' }, registros({
        lista: 'intercorrencias', foco: 'descricao',
        campos: [
          { chave: 'hora', rotulo: 'Hora', tipo: 'time', largura: 1.1 },
          { chave: 'descricao', rotulo: 'O que houve e a conduta', largura: 5, exemplo: 'Hipotensão após indução; efedrina 10 mg IV, com resposta.' }
        ],
        padrao: function () { return { hora: '' }; },
        colunas: [
          { rotulo: 'Hora', valor: function (l) { return el('span', { class: 'num' }, l.hora || '—'); } },
          { rotulo: 'O que houve e a conduta', valor: function (l) { return el('div', { class: 'envolve' }, l.descricao); } }
        ],
        vazio: 'Nenhuma intercorrência registrada.'
      }))
    ]);

    var totalAldrete = el('strong', { class: 'num' });
    aoMudar(function (x) {
      var t = aldreteTotal(x.recuperacao);
      totalAldrete.textContent = t === null ? '—' : t + '/10' + (t >= ALDRETE_ALTA ? ' · critério de alta' : '');
      totalAldrete.className = 'num' + (t !== null && t >= ALDRETE_ALTA ? ' t-ok' : '');
    });
    var secRecuperacao = secao('Recuperação e destino', null, [
      el('div', { class: 'campos-auto' }, [
        segmento('Destino', null, 'destino', OPCOES_BOLETIM.destinos),
        campo({ rotulo: 'Alta da recuperação', secao: 'recuperacao', chave: 'horaAlta', tipo: 'time', agora: true }),
        campo({ rotulo: 'Dor (0 a 10)', secao: 'recuperacao', chave: 'dor', tipo: 'select',
          opcoes: ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10'] })
      ]),
      el('div', { class: 'aldrete mt-3' }, [
        el('div', { class: 'linha' }, [el('div', { class: 'campo-rotulo', style: 'flex:1' }, 'Índice de Aldrete e Kroulik'), totalAldrete]),
        el('div', { class: 'campos-auto' }, ALDRETE_ITENS.map(function (a) {
          return campo({ rotulo: a.rotulo, secao: 'recuperacao', chave: a.campo, tipo: 'select', rotuloVazio: '— avaliar —',
            opcoes: a.opcoes.map(function (o, i) { return { valor: String(i), rotulo: i + ' · ' + o }; }) });
        }))
      ])
    ]);

    var secObs = secao('Observações', null, [
      campo({ rotulo: 'Observações', chave: 'observacoes', tipo: 'textarea', linhas: 3, largo: true })
    ]);

    var historico = b.historico.length ? secao('Histórico de versões', 'Cada reabertura guarda a assinatura anterior e o motivo',
      UI.tabela({
        colunas: [{ rotulo: 'Versão' }, { rotulo: 'Assinada em' }, { rotulo: 'Código' }, { rotulo: 'Reaberta' }, { rotulo: 'Motivo' }],
        linhas: b.historico.map(function (h) {
          return [String(h.versao), h.finalizadoEm, el('span', { class: 'mono' }, codigoLegivel(h.codigo)),
            h.reabertoEm + (h.reabertoPor ? ' · ' + h.reabertoPor : ''), el('div', { class: 'envolve' }, h.motivo)];
        })
      })) : null;

    /* ----------------------------------------------------------- montar */

    var topo = el('div', { class: 'cartao' }, el('div', { class: 'cartao-corpo compacto' }, el('div', { class: 'linha bol-topo' }, [
      el('button', {
        class: 'btn btn-plano', onclick: function () { app.filtros.boletim.id = ''; app.redesenhar(); }
      }, [icone('voltar'), 'Boletins']),
      el('div', { style: 'flex:1;min-width:200px' }, [
        el('h2', { class: 'bol-titulo' }, UI.ou(cir && cir.paciente) + (cir && cir.procedimento ? ' — ' + cir.procedimento : '')),
        el('div', { class: 't-pq t-medio' }, [b.id, cir ? cir.id : b.idCirurgia, cir ? UI.data(cir.data) : null,
          cir && cir.anestesista ? cir.anestesista : null, cir && cir.sala ? cir.sala : null].filter(Boolean).join(' · '))
      ]),
      cir ? el('button', { class: 'btn btn-pq', onclick: function () { TELAS.cirurgias.form(app, cir); } }, [icone('bisturi'), 'Cirurgia']) : null
    ])));

    var principal = el('div', { class: 'bol-principal pilha' }, [
      fechado ? el('div', { class: 'aviso aviso-ok', style: 'margin:0' }, [icone('cadeado'), el('div', { class: 'aviso-corpo' }, [
        el('strong', null, 'Boletim finalizado — somente leitura'),
        el('div', { class: 't-pq' }, 'Para corrigir, use "Reabrir para correção": o motivo fica registrado e o boletim precisa ser assinado de novo.')
      ])]) : null,
      secPaciente, secTecnica, secMonitor, secTempos, secSinais, secFarmacos, secFluidos, secIntercorrencias,
      secRecuperacao, secObs, historico
    ]);

    refazer();
    return el('div', { class: 'pilha' }, [topo, el('div', { class: 'bol-editor' }, [principal, lateral])]);
  }

  /* ============================================================== render */

  function render(app) {
    var f = app.filtros.boletim;
    var b = f.id ? app.store.boletim(f.id) : null;
    if (b) return editor(app, b);
    f.id = '';
    return lista(app);
  }

  return {
    render: render,
    abrir: abrir
  };
})();
