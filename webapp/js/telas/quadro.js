/**
 * ============================================================================
 * TELA — Quadro do dia
 * ============================================================================
 * As 5 posições do dia como colunas e as horas como linhas — o mesmo desenho
 * do quadro de sala. Remanejar tem dois caminhos de propósito: arrastar o
 * bloco (mouse) e o menu do bloco (toque e teclado).
 * ============================================================================
 */
'use strict';

TELAS.quadro = (function () {

  var el = UI.el, icone = UI.icone;

  var QUADRO_PX_HORA = 52;   // altura de 1 hora na grade

  function quadro(app) {
    var store = app.store;
    var f = app.filtros.quadro;
    if (vazio(f.data)) f.data = primeiroDiaUtil(app);

    var data = paraData(f.data) || primeiroDiaUtil(app);
    f.data = data;

    var raiz = el('div', { class: 'pilha' });

    raiz.appendChild(barraDoQuadro(app, data));

    var doDia = store.estado.cirurgias.filter(function (c) {
      return paraData(c.data) === data;
    });

    var escalaDoDia = store.escalaDoMes(anoDe(data), mesDe(data)).filter(function (l) {
      return paraData(l.data) === data;
    }).sort(function (a, b) { return Number(a.posicao) - Number(b.posicao); });

    if (!escalaDoDia.length) {
      raiz.appendChild(UI.vazioEstado({
        icone: 'calendario',
        titulo: 'Sem escala em ' + UI.data(data),
        texto: store.temMes(anoDe(data), mesDe(data))
          ? 'Domingo não entra no rodízio. Escolha outro dia.'
          : 'Este mês ainda não tem escala montada. O sistema monta a escala até ' +
            CONFIG.MESES_A_FRENTE + ' meses à frente, e antes disso se já houver cirurgia marcada no mês.'
      }));
      return raiz;
    }

    /* Colunas: as 5 posições + uma para quem está fora da escala do dia. */
    var colunas = escalaDoDia.map(function (l) {
      return { posicao: Number(l.posicao), nome: txt(l.efetivo), ajuste: ehSim(l.ajuste), cirurgias: [] };
    });

    var foraDaEscala = { posicao: null, nome: '', ajuste: false, cirurgias: [] };

    doDia.forEach(function (c) {
      var col = colunas.filter(function (x) { return mesmoTexto(x.nome, c.anestesista); })[0];
      (col || foraDaEscala).cirurgias.push(c);
    });

    var todas = colunas.slice();
    if (foraDaEscala.cirurgias.length) {
      todas.push(foraDaEscala);

      // A coluna dos "fora da escala" é a última e costuma nascer fora da
      // vista. Sem este aviso, o topo diz "2 cirurgias no dia" e as 5 colunas
      // visíveis dizem "livre" — parece defeito, e não é.
      raiz.appendChild(el('div', { class: 'aviso aviso-atencao', style: 'margin:0' }, [
        icone('alerta'),
        el('div', { class: 'aviso-corpo' }, [
          el('strong', null, foraDaEscala.cirurgias.length +
            ' cirurgia(s) com anestesista fora da escala deste dia'),
          el('div', { class: 't-pq' },
            'Elas aparecem na última coluna do quadro, à direita. Isso acontece quando alguém assumiu ' +
            'sem a substituição ter sido registrada, ou quando a escala-base mudou depois da marcação. ' +
            'Arraste o bloco para a posição certa ou registre o ajuste na tela Escala.')
        ])
      ]));
    }

    raiz.appendChild(grade(app, data, todas, doDia));
    return raiz;
  }

  /** Cabeçalho do quadro: navegação por dia e resumo. */
  function barraDoQuadro(app, data) {
    var store = app.store;
    var f = app.filtros.quadro;

    var doDia = store.estado.cirurgias.filter(function (c) {
      return paraData(c.data) === data && !mesmoTexto(c.status, CONFIG.STATUS_EXCLUIDO);
    });

    function andar(dias) {
      var d = new Date(data + 'T12:00:00');
      d.setDate(d.getDate() + dias);
      f.data = paraData(d);
      // Segue o mês do dia escolhido, senão a escala do quadro e a do topo
      // ficariam falando de meses diferentes.
      seguirMes(app, f.data);
      app.redesenhar();
    }

    var campoData = el('button', {
      class: 'btn botao-calendario', title: 'Escolher o dia no calendário',
      'aria-label': 'Dia do quadro: ' + UI.data(data) + '. Abrir calendário',
      onclick: function () { app.abrirCalendario(data); }
    }, [icone('calendario'), UI.data(data)]);

    return el('div', { class: 'cartao' }, [
      el('div', { class: 'cartao-corpo linha', style: 'flex-wrap:wrap;gap:var(--e3)' }, [
        el('div', { class: 'linha', style: 'gap:4px' }, [
          el('button', { class: 'btn btn-icone', 'aria-label': 'Dia anterior', title: 'Dia anterior',
                         onclick: function () { andar(-1); } }, icone('voltar')),
          campoData,
          el('button', { class: 'btn btn-icone', 'aria-label': 'Próximo dia', title: 'Próximo dia',
                         onclick: function () { andar(1); } }, icone('avancar'))
        ]),
        el('div', { class: 'quadro-resumo' }, [
          el('strong', null, UI.diaSemana(diaDaSemana(data))),
          el('span', { class: 't-suave' }, ' · ' + doDia.length + ' cirurgia(s) no dia')
        ]),
        el('div', { class: 'espaco' }),
        el('button', {
          class: 'btn', onclick: function () { TELAS.cirurgias.form(app, null, { data: data }); }
        }, [icone('mais'), 'Nova cirurgia neste dia'])
      ])
    ]);
  }

  /** A grade em si: gutter de horas + uma pista por posição. */
  function grade(app, data, colunas, doDia) {
    var faixa = faixaDeHoras(doDia);
    var altura = (faixa.fim - faixa.ini) * QUADRO_PX_HORA;

    var grade = el('div', {
      class: 'quadro-grade',
      style: '--quadro-cols:' + colunas.length +
             ';--quadro-altura:' + altura + 'px' +
             ';--quadro-px-hora:' + QUADRO_PX_HORA + 'px'
    });

    // O que o arrasto precisa saber da grade: onde estão as pistas, a faixa de
    // horas e as cirurgias do dia (para avisar de sobreposição ao vivo).
    var ctx = { app: app, data: data, faixa: faixa, doDia: doDia, grade: grade, pistas: [], rolagem: null, suprimirClique: false };

    /* ---- linha 1: cabeçalhos ---- */
    grade.appendChild(el('div', { class: 'quadro-canto' }));
    colunas.forEach(function (col) {
      grade.appendChild(cabecalhoColuna(app, data, col));
    });

    /* ---- linha 2: gutter de horas + pistas ---- */
    var gutter = el('div', { class: 'quadro-horas' });
    for (var h = faixa.ini; h <= faixa.fim; h++) {
      gutter.appendChild(el('div', {
        class: 'quadro-hora', style: 'top:' + ((h - faixa.ini) * QUADRO_PX_HORA) + 'px'
      }, (h < 10 ? '0' : '') + h + ':00'));
    }
    grade.appendChild(gutter);

    colunas.forEach(function (col) {
      grade.appendChild(pista(ctx, col));
    });

    ctx.rolagem = el('div', { class: 'quadro-rolagem' }, grade);
    return el('div', { class: 'cartao' }, ctx.rolagem);
  }

  function cabecalhoColuna(app, data, col) {
    var minutos = 0;
    col.cirurgias.forEach(function (c) {
      if (mesmoTexto(c.status, CONFIG.STATUS_EXCLUIDO)) return;
      var m = minutosPrevistos(c);
      if (m) minutos += m;
    });

    var fora = col.posicao === null;

    return el('div', { class: 'quadro-topo' + (fora ? ' fora' : '') }, [
      el('div', { class: 'linha', style: 'gap:6px;align-items:center' }, [
        fora ? el('span', { class: 'selo selo-fora sem-ponto' }, 'fora da escala')
             : el('span', { class: 'posto-num' }, col.posicao),
        el('div', { class: 'quadro-nome' }, fora ? 'Sem posição no dia' : UI.ou(col.nome, 'vago')),
        col.ajuste ? el('span', { class: 'selo selo-remarcada sem-ponto', title: 'Substituição registrada' }, 'ajuste') : null
      ]),
      el('div', { class: 'linha', style: 'gap:6px;align-items:center;margin-top:2px' }, [
        el('span', { class: 'quadro-carga' + (minutos ? '' : ' t-suave') },
          minutos ? horasHHMM(minutos / 60) + ' no dia' : 'livre'),
        el('div', { class: 'espaco' }),
        fora || vazio(col.nome) ? null : el('button', {
          class: 'btn btn-plano btn-pq',
          title: 'Registrar falta e remanejar as cirurgias',
          onclick: function () { modalRemanejar(app, data, col.nome); }
        }, 'Faltou')
      ])
    ]);
  }

  /** Uma coluna: linhas de hora ao fundo e os blocos por cima. */
  /**
   * Cirurgias que se cruzam na mesma coluna ficam lado a lado, cada uma numa
   * "raia" (a primeira livre), em vez de empilhadas uma sobre a outra — senão
   * o horário de quem está por baixo some justamente quando importa. A largura
   * vem do maior número de raias do grupo que se cruza. Cancelada não conta:
   * fica atrás, na largura toda.
   */
  function raiasDaColuna(cirurgias, faixa) {
    var itens = cirurgias.filter(function (c) { return !mesmoTexto(c.status, CONFIG.STATUS_EXCLUIDO); }).map(function (c) {
      var a = horaParaMinutos(c.inicioPrev), b = horaParaMinutos(c.fimPrev);
      if (a === null || b === null) { a = faixa.ini * 60; b = a + 45; }
      if (b < a) b += 1440;
      return { id: c.id, a: a, b: Math.max(b, a + 30), raia: 0 };   // 30 min ≈ a altura mínima do bloco
    }).sort(function (x, y) { return x.a - y.a || x.b - y.b; });

    var mapa = {}, grupo = [], fimGrupo = -1, fimDaRaia = [];
    function fechar() {
      var n = grupo.reduce(function (m, g) { return Math.max(m, g.raia + 1); }, 1);
      grupo.forEach(function (g) { mapa[g.id] = { raia: g.raia, de: n }; });
      grupo = []; fimDaRaia = []; fimGrupo = -1;
    }
    itens.forEach(function (it) {
      if (grupo.length && it.a >= fimGrupo) fechar();                 // não cruza mais com o grupo: recomeça
      var r = 0;
      while (fimDaRaia[r] !== undefined && fimDaRaia[r] > it.a) r++;   // encostar não cruza: a raia libera no fim
      it.raia = r; fimDaRaia[r] = it.b; grupo.push(it);
      fimGrupo = Math.max(fimGrupo, it.b);
    });
    if (grupo.length) fechar();
    return mapa;
  }

  function pista(ctx, col) {
    var no = el('div', { class: 'quadro-pista' + (col.posicao === null ? ' fora' : '') });
    ctx.pistas.push({ no: no, col: col });

    var raias = raiasDaColuna(col.cirurgias, ctx.faixa);
    col.cirurgias.forEach(function (c) {
      no.appendChild(bloco(ctx, c, col, raias[c.id]));
    });

    if (!col.cirurgias.length) {
      no.appendChild(el('div', { class: 'quadro-livre' }, el('span', null, 'sem cirurgia')));
    }

    return no;
  }

  function bloco(ctx, c, col, raia) {
    var app = ctx.app, faixa = ctx.faixa;
    var ini = horaParaMinutos(c.inicioPrev);
    var fim = horaParaMinutos(c.fimPrev);
    var cancelada = mesmoTexto(c.status, CONFIG.STATUS_EXCLUIDO);

    // Sem horário previsto não dá para posicionar: entra como faixa curta no
    // topo, marcada, em vez de sumir do quadro.
    var semHorario = ini === null || fim === null;
    if (semHorario) { ini = faixa.ini * 60; fim = ini + 45; }
    if (fim < ini) fim += 1440;           // virada de meia-noite (igual não é 24h)

    var topo = ((ini - faixa.ini * 60) / 60) * QUADRO_PX_HORA;
    var alto = Math.max(26, ((fim - ini) / 60) * QUADRO_PX_HORA);

    var rotulo = c.id + ' · ' + UI.ou(c.paciente, 'sem paciente');

    var no = el('div', {
      class: 'quadro-bloco' + (cancelada ? ' cancelada' : '') + (semHorario ? ' sem-horario' : ''),
      style: 'top:' + topo + 'px;height:' + alto + 'px' + (raia && raia.de > 1
        ? ';left:calc(4px + (100% - 8px) * ' + raia.raia + ' / ' + raia.de + ');right:auto;width:calc((100% - 8px) / ' + raia.de + ' - 2px)'
        : ''),
      role: 'button', tabindex: '0',
      dataset: { cirurgia: c.id },
      'aria-label': rotulo + ', ' + (semHorario ? 'sem horário previsto'
        : UI.hora(c.inicioPrev) + ' às ' + UI.hora(c.fimPrev)) + '. Abrir opções.',
      // Mouse e caneta: arrasta ao mover. Toque: segura um instante (senão não
      // dá para rolar o quadro com o dedo). Clicar sem arrastar abre o menu.
      onpointerdown: function (ev) { if (!cancelada) iniciarArrasto(ctx, c, no, ev); },
      oncontextmenu: function (ev) { if (ctx.emArrasto) ev.preventDefault(); },
      onclick: function () {
        if (ctx.suprimirClique) { ctx.suprimirClique = false; return; }   // o clique que fecha um arrasto não abre o menu
        menuDoBloco(app, c, col);
      },
      onkeydown: function (ev) {
        if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); menuDoBloco(app, c, col); }
      }
    }, [
      el('div', { class: 'quadro-bloco-hora' },
        semHorario ? 'sem horário' : UI.hora(c.inicioPrev) + '–' + UI.hora(c.fimPrev)),
      el('div', { class: 'quadro-bloco-nome' }, UI.ou(c.paciente, 'sem paciente')),
      alto >= 60 ? el('div', { class: 'quadro-bloco-meta' },
        [UI.ou(c.procedimento, ''), UI.ou(c.sala, '')].filter(function (x) { return x; }).join(' · ')) : null
    ]);

    return no;
  }

  /* ==================================================================== */
  /*                              ARRASTO VIVO                            */
  /* ==================================================================== */
  /*
   * O bloco sobe da grade (levanta, sombra, leve inclinação com a velocidade) e
   * a grade responde por baixo: a coluna sob o ponteiro acende, um "encaixe"
   * mostra onde ele vai pousar — horário grudando de 15 em 15 minutos — e, se
   * aquele encaixe cruza outra cirurgia do mesmo anestesista, o aviso aparece
   * ANTES de soltar. Conflito não bloqueia (é aviso operacional no core), então
   * soltar continua permitido; o que muda é que ninguém é pego de surpresa.
   * Soltar faz o bloco assentar com uma mola curta; o toast traz "Desfazer".
   * Esc, ou soltar fora da grade, devolve o bloco ao lugar de onde saiu.
   */

  var PASSO_MIN = 15;            // o horário gruda de 15 em 15 minutos
  var ZONA_MORTA_PX = 10;        // menos que isto na vertical: só troca de coluna, o horário não mexe
  var TOQUE_SEGURAR_MS = 280;    // no celular, arrastar exige segurar um instante
  var BORDA_ROLAGEM_PX = 48;     // perto da borda, o quadro rola sozinho

  function minutosParaHora(m) { return pad2(Math.floor(m / 60) % 24) + ':' + pad2(m % 60); }

  function semMovimento() {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  function iniciarArrasto(ctx, c, no, ev) {
    if (ev.pointerType === 'mouse' && ev.button !== 0) return;
    if (ctx.emArrasto) return;

    var toque = ev.pointerType === 'touch';
    var pid = ev.pointerId;
    var comeco = { x: ev.clientX, y: ev.clientY };
    var timer = null;
    var d = null;                       // estado do arrasto, só depois de ativar

    window.addEventListener('pointermove', aoMover);
    window.addEventListener('pointerup', aoSoltar);
    window.addEventListener('pointercancel', aoCancelar);
    if (toque) timer = setTimeout(function () { ativar({ clientX: comeco.x, clientY: comeco.y }); }, TOQUE_SEGURAR_MS);

    function desligar() {
      clearTimeout(timer);
      window.removeEventListener('pointermove', aoMover);
      window.removeEventListener('pointerup', aoSoltar);
      window.removeEventListener('pointercancel', aoCancelar);
    }

    function aoMover(e) {
      if (e.pointerId !== pid) return;
      if (!d) {
        var dist = Math.hypot(e.clientX - comeco.x, e.clientY - comeco.y);
        if (toque) { if (dist > 8) desligar(); return; }     // mexeu antes de segurar: é rolagem
        if (dist < 4) return;
        ativar(e);
      }
      d.ptr.x = e.clientX; d.ptr.y = e.clientY;
      recalcular();
    }

    function aoSoltar(e) {
      if (e.pointerId !== pid) return;
      if (!d) { desligar(); return; }                        // foi só um clique: o onclick abre o menu
      terminar(true);
    }

    function aoCancelar(e) {
      if (e.pointerId !== pid) return;
      if (!d) { desligar(); return; }
      terminar(false);
    }

    function teclas(e) { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); terminar(false); } }
    function travarRolagem(e) { if (e.cancelable) e.preventDefault(); }

    /* ------------------------------------------------------------ ativar */
    function ativar(p) {
      if (d) return;
      var r = no.getBoundingClientRect();
      var ini0 = horaParaMinutos(c.inicioPrev), fim0 = horaParaMinutos(c.fimPrev);
      var semHorario = ini0 === null || fim0 === null;
      var dur = semHorario ? 0 : (fim0 < ini0 ? fim0 + 1440 - ini0 : fim0 - ini0);

      var clone = no.cloneNode(true);
      clone.classList.remove('arrastando');
      clone.classList.add('flutuando');
      clone.removeAttribute('role'); clone.removeAttribute('tabindex'); clone.removeAttribute('data-cirurgia');
      clone.setAttribute('aria-hidden', 'true');
      clone.style.cssText = 'top:' + r.top + 'px;left:' + r.left + 'px;width:' + r.width + 'px;height:' + r.height + 'px';
      document.body.appendChild(clone);

      d = {
        r: r, clone: clone, ini0: ini0, dur: dur, semHorario: semHorario,
        // Sem horário previsto ou já cruzando a meia-noite: só troca de coluna, o horário não se mexe.
        travaV: semHorario || fim0 < ini0,
        // O ponto de pega é onde se apertou, não onde o arrasto foi detectado: senão o bloco "pula" alguns pixels.
        grabX: comeco.x - r.left, grabY: comeco.y - r.top,
        ptr: { x: p.clientX, y: p.clientY }, lastX: comeco.x,
        vx: 0, tilt: 0, tiltV: 0, alvo: null, slot: null, raf: 0, marcados: []
      };

      d.dica = el('div', { class: 'quadro-dica', 'aria-hidden': 'true' });
      document.body.appendChild(d.dica);

      ctx.emArrasto = true;
      ctx.suprimirClique = true;                 // o clique de quem solta não abre o menu
      no.classList.add('arrastando');
      ctx.grade.classList.add('mira');           // o encaixe de 15 minutos aparece na pista
      document.body.classList.add('arrastando-quadro');
      try { no.setPointerCapture(pid); } catch (x) { /* ok */ }
      if (toque) {
        document.addEventListener('touchmove', travarRolagem, { passive: false });
        if (navigator.vibrate) navigator.vibrate(10);
      }
      document.addEventListener('keydown', teclas, true);
      d.raf = requestAnimationFrame(quadroAnimacao);
      recalcular();
    }

    function dica(texto, tipo) {
      if (!d) return;
      d.dica.textContent = texto;
      d.dica.className = 'quadro-dica' + (tipo ? ' ' + tipo : '');
    }

    /* ------------------------------------------------- alvo (o encaixe) */
    function recalcular() {
      var p = d.ptr;
      var melhor = null, dist = Infinity;
      ctx.pistas.forEach(function (x) {
        x.rr = x.no.getBoundingClientRect();
        var dx = p.x < x.rr.left ? x.rr.left - p.x : (p.x > x.rr.right ? p.x - x.rr.right : 0);
        if (dx < dist) { dist = dx; melhor = x; }
      });

      var grade = ctx.grade.getBoundingClientRect();
      var dentro = melhor && dist <= 48 && p.y >= grade.top - 40 && p.y <= grade.bottom + 40;

      ctx.pistas.forEach(function (x) {
        x.no.classList.toggle('alvo', dentro && x === melhor && !(x.col.posicao === null || vazio(x.col.nome)));
        x.no.classList.toggle('nao-recebe', dentro && x === melhor && (x.col.posicao === null || vazio(x.col.nome)));
      });

      d.alvo = null;
      if (!dentro || melhor.col.posicao === null || vazio(melhor.col.nome)) {
        mostrarEncaixe(null);
        // Soltar aqui não move nada: o bloco volta. A dica diz por quê, antes de soltar.
        dica(dentro ? 'Esta posição não tem anestesista' : 'Fora do quadro: volta ao lugar', dentro ? 'recusa' : '');
        document.body.style.cursor = dentro ? 'not-allowed' : '';
        return;
      }
      document.body.style.cursor = '';

      var col = melhor.col;
      var ini = d.ini0, fimMin = null;
      var horarioMudou = false;
      if (!d.travaV) {
        if (Math.abs(p.y - comeco.y) >= ZONA_MORTA_PX) {
          var y = (p.y - d.grabY) - melhor.rr.top;                       // px desde o topo da pista
          var min = ctx.faixa.ini * 60 + (y / QUADRO_PX_HORA) * 60;
          ini = Math.round(min / PASSO_MIN) * PASSO_MIN;
          ini = Math.max(ctx.faixa.ini * 60, Math.min(ini, Math.min(ctx.faixa.fim * 60, 1440) - d.dur));
        }
        fimMin = ini + d.dur;
        horarioMudou = ini !== d.ini0;
      }

      var cand = d.travaV ? c : { inicioPrev: minutosParaHora(ini), fimPrev: minutosParaHora(fimMin) };
      var choque = ctx.doDia.filter(function (x) {
        return txt(x.id) !== txt(c.id) && mesmoTexto(x.anestesista, col.nome) &&
          !mesmoTexto(x.status, CONFIG.STATUS_EXCLUIDO) && horariosSobrepostos(x, cand);
      });

      d.alvo = {
        pista: melhor, col: col, ini: ini, horarioMudou: horarioMudou,
        iniStr: d.travaV ? null : minutosParaHora(ini), fimStr: d.travaV ? null : minutosParaHora(fimMin),
        colunaMudou: !mesmoTexto(col.nome, c.anestesista), choque: choque
      };
      d.alvo.mudou = d.alvo.colunaMudou || d.alvo.horarioMudou;
      mostrarEncaixe(d.alvo);
    }

    /** Desenha o encaixe na pista de destino e marca quem ele cruzaria. */
    function mostrarEncaixe(alvo) {
      d.marcados.forEach(function (n) { n.classList.remove('em-conflito'); });
      d.marcados = [];
      if (!alvo) { if (d.slot && d.slot.parentNode) d.slot.parentNode.removeChild(d.slot); return; }

      if (!d.slot) {
        d.slot = el('div', { class: 'quadro-alvo', 'aria-hidden': 'true' });
      }
      var ini = d.travaV ? (d.semHorario ? ctx.faixa.ini * 60 : d.ini0) : alvo.ini;
      var alto = Math.max(26, (d.dur / 60) * QUADRO_PX_HORA);
      // Posição por transform (o encaixe desliza de um passo a outro sem mexer em layout).
      d.slot.style.transform = 'translateY(' + (((ini - ctx.faixa.ini * 60) / 60) * QUADRO_PX_HORA) + 'px)';
      d.slot.style.height = (d.semHorario ? 26 : alto) + 'px';
      if (d.slot.parentNode !== alvo.pista.no) alvo.pista.no.appendChild(d.slot);

      var choque = alvo.choque.length > 0;
      d.slot.classList.toggle('choque', choque);
      // A dica anda com o bloco (o encaixe fica embaixo dele): horário de pouso, ou o aviso de cruzamento.
      var hora = d.semHorario ? 'sem horário' : alvo.iniStr + '–' + alvo.fimStr;
      dica(choque ? hora + ' · cruza ' + alvo.choque.map(function (x) { return x.id; }).join(', ') : hora, choque ? 'choque' : '');

      alvo.choque.forEach(function (x) {
        var n = ctx.grade.querySelector('[data-cirurgia="' + x.id + '"]');
        if (n) { n.classList.add('em-conflito'); d.marcados.push(n); }
      });
    }

    /* ------------------------------------------- a mola, quadro a quadro */
    function quadroAnimacao() {
      if (!d) return;
      var p = d.ptr;
      var reduz = semMovimento();

      // Inclinação: acompanha a velocidade horizontal e volta ao prumo com uma mola amortecida.
      d.vx += ((p.x - d.lastX) - d.vx) * 0.35;
      d.lastX = p.x;
      var alvoTilt = reduz ? 0 : Math.max(-2.5, Math.min(2.5, d.vx * 0.3));
      d.tiltV = (d.tiltV + (alvoTilt - d.tilt) * 0.18) * 0.72;
      d.tilt += d.tiltV;

      var dx = p.x - d.grabX - d.r.left, dy = p.y - d.grabY - d.r.top;
      var larg = d.dica.offsetWidth;
      d.dica.style.transform = 'translate3d(' + Math.max(8, Math.min(p.x - d.grabX, window.innerWidth - larg - 8)) + 'px,' +
        Math.max(8, p.y - d.grabY - 32) + 'px,0)';
      d.clone.style.transform = 'translate3d(' + dx + 'px,' + dy + 'px,0) rotate(' + d.tilt.toFixed(2) + 'deg) scale(' + (reduz ? 1 : 1.025) + ')';

      rolarPerto();
      d.raf = requestAnimationFrame(quadroAnimacao);
    }

    /** Perto da borda, o quadro rola sozinho (na horizontal) e a página também (na vertical). */
    function rolarPerto() {
      var p = d.ptr, mudou = false;
      var rol = ctx.rolagem.getBoundingClientRect();
      if (p.y >= rol.top && p.y <= rol.bottom) {
        if (p.x < rol.left + BORDA_ROLAGEM_PX && ctx.rolagem.scrollLeft > 0) { ctx.rolagem.scrollLeft -= 10; mudou = true; }
        else if (p.x > rol.right - BORDA_ROLAGEM_PX) { var antes = ctx.rolagem.scrollLeft; ctx.rolagem.scrollLeft += 10; mudou = mudou || ctx.rolagem.scrollLeft !== antes; }
      }
      if (p.y < BORDA_ROLAGEM_PX && window.scrollY > 0) { window.scrollBy(0, -12); mudou = true; }
      else if (p.y > window.innerHeight - BORDA_ROLAGEM_PX) { var y0 = window.scrollY; window.scrollBy(0, 12); mudou = mudou || window.scrollY !== y0; }
      if (mudou) recalcular();
    }

    /* ---------------------------------------------------------- terminar */
    function terminar(confirmar) {
      var estado = d;
      if (!estado) return;
      d = null;
      cancelAnimationFrame(estado.raf);
      desligar();
      document.removeEventListener('keydown', teclas, true);
      document.removeEventListener('touchmove', travarRolagem);
      try { no.releasePointerCapture(pid); } catch (x) { /* ok */ }
      setTimeout(function () { ctx.suprimirClique = false; ctx.emArrasto = false; }, 60);

      var alvo = estado.alvo;
      var vaiMudar = confirmar && alvo && alvo.mudou;

      // Para onde o bloco assenta: o encaixe (se vai mudar) ou de volta ao lugar de origem.
      var destino = estado.r;
      if (vaiMudar && estado.slot && estado.slot.parentNode) destino = estado.slot.getBoundingClientRect();
      var dx = destino.left - estado.r.left, dy = destino.top - estado.r.top;
      var reduz = semMovimento();

      function limpar() {
        if (estado.clone.parentNode) estado.clone.parentNode.removeChild(estado.clone);
        if (estado.dica.parentNode) estado.dica.parentNode.removeChild(estado.dica);
        if (estado.slot && estado.slot.parentNode) estado.slot.parentNode.removeChild(estado.slot);
        estado.marcados.forEach(function (n) { n.classList.remove('em-conflito'); });
        ctx.pistas.forEach(function (x) { x.no.classList.remove('alvo', 'nao-recebe'); });
        no.classList.remove('arrastando');
        ctx.grade.classList.remove('mira');
        document.body.classList.remove('arrastando-quadro');
        document.body.style.cursor = '';
      }

      function assentou() {
        limpar();
        if (vaiMudar) confirmarMovimento(ctx, c, alvo);
      }

      if (reduz || !estado.clone.animate) { assentou(); return; }
      // O bloco assenta desacelerando, sem quique: o corpo sério de um quadro clínico.
      estado.clone.animate([
        { transform: estado.clone.style.transform },
        { transform: 'translate3d(' + dx + 'px,' + dy + 'px,0) rotate(0deg) scale(1)' }
      ], { duration: vaiMudar ? 200 : 240, easing: 'cubic-bezier(.16,1,.3,1)', fill: 'forwards' }).onfinish = assentou;
    }
  }

  /** Grava o movimento pelo caminho de sempre (store) e oferece desfazer. */
  function confirmarMovimento(ctx, c, alvo) {
    var app = ctx.app;
    var mud = {}, antes = {};
    if (alvo.colunaMudou) { mud.anestesista = alvo.col.nome; antes.anestesista = c.anestesista; }
    if (alvo.horarioMudou) {
      mud.inicioPrev = alvo.iniStr; mud.fimPrev = alvo.fimStr;
      antes.inicioPrev = c.inicioPrev; antes.fimPrev = c.fimPrev;
    }
    var horaAntes = (paraHora(c.inicioPrev) || '—') + '–' + (paraHora(c.fimPrev) || '—');
    var de = txt(c.anestesista);

    var r = app.store.atualizarCirurgia(c.id, mud);
    if (!r.ok) { UI.erro('Não foi possível mover', (r.erros[0] || {}).msg); app.redesenhar(); return; }
    app.salvarEredesenhar();

    var partes = [];
    if (mud.anestesista) partes.push((de || 'sem anestesista') + ' → ' + mud.anestesista);
    if (mud.inicioPrev) partes.push(mud.inicioPrev + '–' + mud.fimPrev + ' (era ' + horaAntes + ')');
    UI.torrada(c.id + ' movida', partes.map(function (t) { return el('div', null, t); }), 'ok', 9000, {
      rotulo: 'Desfazer',
      aoClicar: function () {
        var d = app.store.atualizarCirurgia(c.id, antes);
        if (!d.ok) { UI.erro('Não foi possível desfazer', (d.erros[0] || {}).msg); return; }
        app.salvarEredesenhar();
        UI.info('Movimento desfeito', c.id + ' voltou ao que era.');
      }
    });
    if (alvo.choque.length) {
      UI.atencao('Horário sobreposto', alvo.col.nome + ' já tem ' + alvo.choque.map(function (x) {
        return x.id + ' (' + (paraHora(x.inicioPrev) || '—') + '–' + (paraHora(x.fimPrev) || '—') + ')';
      }).join(', ') + ' nesse horário.');
    }
    (r.avisos || []).forEach(function (a) { UI.atencao('Atenção', a.msg); });
  }

  /** Menu do bloco — o caminho de toque e teclado para o que o arraste faz. */
  function menuDoBloco(app, c, colAtual) {
    var store = app.store;
    var data = paraData(c.data);

    var destinos = store.escalaDoMes(anoDe(data), mesDe(data)).filter(function (l) {
      return paraData(l.data) === data;
    }).sort(function (a, b) { return Number(a.posicao) - Number(b.posicao); });

    var lista = el('div', { class: 'pilha-pq' }, destinos.map(function (l) {
      var nome = txt(l.efetivo);
      var atual = mesmoTexto(nome, c.anestesista);

      var ocupado = store.estado.cirurgias.some(function (x) {
        return txt(x.id) !== txt(c.id) && paraData(x.data) === data &&
          mesmoTexto(x.anestesista, nome) && !mesmoTexto(x.status, CONFIG.STATUS_EXCLUIDO) &&
          horariosSobrepostos(x, c);
      });

      return el('button', {
        class: 'btn quadro-destino' + (atual ? ' atual' : ''),
        disabled: atual || vazio(nome),
        onclick: function () { UI.fecharModal(); moverCirurgia(app, c.id, nome); }
      }, [
        el('span', { class: 'posto-num' }, l.posicao),
        el('div', { style: 'flex:1;min-width:0;text-align:left' }, [
          el('div', { class: 'posto-nome' }, UI.ou(nome, 'vago')),
          el('div', { class: 'posto-meta' },
            atual ? 'é quem está agora' : (ocupado ? 'tem cirurgia neste horário' : 'livre neste horário'))
        ]),
        ocupado && !atual ? el('span', { class: 'selo selo-pendente sem-ponto' }, 'conflito') : null
      ]);
    }));

    UI.abrirModal({
      titulo: 'Mover ' + c.id,
      sub: UI.ou(c.paciente, 'sem paciente') + ' · ' +
           (vazio(c.inicioPrev) ? 'sem horário' : UI.hora(c.inicioPrev) + '–' + UI.hora(c.fimPrev)),
      tamanho: 'estreito',
      corpo: [
        el('div', { class: 'secao-form' }, [el('h4', null, 'Passar para')]),
        lista
      ],
      acoes: [
        el('button', { class: 'btn', onclick: function () {
          UI.fecharModal(); TELAS.cirurgias.form(app, c);
        } }, [icone('lapis'), 'Abrir cirurgia']),
        el('div', { class: 'espaco' }),
        el('button', { class: 'btn', onclick: function () { UI.fecharModal(); } }, 'Fechar')
      ]
    });
  }

  function moverCirurgia(app, id, nomeDestino) {
    var c = app.store.estado.cirurgias.filter(function (x) { return txt(x.id) === txt(id); })[0];
    if (!c || mesmoTexto(c.anestesista, nomeDestino)) return;

    var de = txt(c.anestesista);
    var r = app.store.atualizarCirurgia(id, { anestesista: nomeDestino });
    if (!r.ok) {
      UI.erro('Não foi possível mover', (r.erros[0] || {}).msg);
      return;
    }
    app.salvarEredesenhar();
    UI.resultado(r, 'Cirurgia remanejada');
    UI.ok(id + ' agora é de ' + nomeDestino, de ? 'Era de ' + de + '.' : null);
  }

  /**
   * Proposta de remanejamento de quem faltou.
   * Mostra e espera confirmação: trocar o anestesista troca também quem recebe
   * pela anestesia, então isso não se aplica sozinho.
   */
  function modalRemanejar(app, data, nome) {
    var p = app.store.proporRemanejamento(data, nome);

    if (!p.movimentos.length && !p.semDestino.length) {
      UI.info('Nada a remanejar', nome + ' não tem cirurgia em ' + UI.data(data) + '.');
      return;
    }

    var corpo = [
      el('div', { class: 'aviso aviso-atencao' }, [
        icone('alerta'),
        el('div', { class: 'aviso-corpo' }, [
          el('strong', null, 'Isto troca o titular do faturamento'),
          el('div', { class: 't-pq' },
            'Cada cirurgia movida passa a ser de quem assumir — valor, recebimento e nota acompanham. ' +
            'A escala em si não muda: para registrar substituição na posição, use a tela Escala.')
        ])
      ])
    ];

    if (p.movimentos.length) {
      corpo.push(UI.tabela({
        colunas: [
          { rotulo: 'Cirurgia' }, { rotulo: 'Horário' },
          { rotulo: 'De' }, { rotulo: 'Para' }, { rotulo: 'Posição', num: true }
        ],
        linhas: p.movimentos.map(function (m) {
          return [
            el('div', null, [
              el('div', { class: 'celula-principal mono' }, m.id),
              el('div', { class: 'celula-apoio' }, UI.ou(m.paciente, ''))
            ]),
            vazio(m.inicio) ? '—' : UI.hora(m.inicio) + '–' + UI.hora(m.fim),
            m.de,
            el('strong', null, m.para),
            m.posicao
          ];
        })
      }));
    }

    if (p.semDestino.length) {
      corpo.push(el('div', { class: 'aviso aviso-erro mt-3' }, [
        icone('alerta'),
        el('div', { class: 'aviso-corpo' }, [
          el('strong', null, p.semDestino.length + ' cirurgia(s) sem destino automático'),
          el('ul', null, p.semDestino.map(function (s) {
            return el('li', null, s.id + ' (' + UI.ou(s.paciente, 'sem paciente') + ') — ' + s.motivo);
          })),
          el('div', { class: 't-pq' }, 'Estas continuam com ' + nome + '. Resolva uma a uma no quadro.')
        ])
      ]));
    }

    UI.abrirModal({
      titulo: 'Remanejar as cirurgias de ' + nome,
      sub: UI.data(data) + ' · ' + UI.diaSemana(diaDaSemana(data)),
      corpo: corpo,
      acoes: [
        el('div', { class: 'espaco' }),
        el('button', { class: 'btn', onclick: function () { UI.fecharModal(); } }, 'Cancelar'),
        p.movimentos.length ? el('button', {
          class: 'btn btn-primario',
          onclick: function () {
            var r = app.store.aplicarRemanejamento(p.movimentos);
            if (!r.ok) { UI.erro('Não foi possível remanejar', (r.erros[0] || {}).msg); return; }
            UI.fecharModal();
            app.salvarEredesenhar();
            UI.ok('Remanejado', p.movimentos.length + ' cirurgia(s) mudaram de anestesista.');
          }
        }, [icone('check'), 'Aplicar ' + p.movimentos.length + ' troca(s)']) : null
      ]
    });
  }

  /** Faixa de horas que a grade precisa cobrir, com folga de 1h nas pontas. */
  function faixaDeHoras(doDia) {
    var ini = 7, fim = 19;

    (doDia || []).forEach(function (c) {
      var a = horaParaMinutos(c.inicioPrev), b = horaParaMinutos(c.fimPrev);
      if (a === null || b === null) return;
      if (b < a) b += 1440;
      ini = Math.min(ini, Math.floor(a / 60));
      fim = Math.max(fim, Math.ceil(b / 60));
    });

    return { ini: Math.max(0, ini), fim: Math.min(30, Math.max(fim, ini + 4)) };
  }

  function minutosPrevistos(c) {
    return duracaoMinutos(c.inicioPrev, c.fimPrev) || 0;
  }

  /**
   * Dia em que o quadro abre: hoje, se hoje estiver no mês selecionado e
   * tiver escala; senão, o primeiro dia com escala do mês.
   */
  function primeiroDiaUtil(app) {
    var linhas = app.store.escalaDoMes(app.ano, app.mes);
    var hoje = hojeISO();
    if (linhas.some(function (l) { return l.data === hoje; })) return hoje;
    if (linhas.length) return paraData(linhas[0].data);
    return chaveMes(app.ano, app.mes) + '-01';
  }

  /**
   * O mês do topo acompanha o dia escolhido no quadro — senão a escala do
   * quadro e a do resto do sistema falariam de meses diferentes.
   */
  function seguirMes(app, data) {
    if (app.store.temMes(anoDe(data), mesDe(data))) {
      app.mes = mesDe(data);
      app.ano = anoDe(data);
    }
  }

  return {
    render: quadro,
    modalRemanejar: modalRemanejar
  };
})();
