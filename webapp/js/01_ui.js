/**
 * ============================================================================
 * 01_UI — Peças de interface: DOM, ícones, torradas, modal, formatação
 * ============================================================================
 * Sem framework e sem dependência externa. O sistema tem de abrir com dois
 * cliques numa máquina de consultório, offline, sem npm install.
 * ============================================================================
 */
'use strict';

var UI = (function () {

  /* ====================================================== DOM ========== */

  /** Atalho para querySelector. */
  function $(sel, raiz) { return (raiz || document).querySelector(sel); }

  /** Atalho para querySelectorAll, já como array. */
  function $$(sel, raiz) {
    return Array.prototype.slice.call((raiz || document).querySelectorAll(sel));
  }

  /**
   * Cria elemento.
   *   el('div', { class: 'x', onclick: fn }, 'texto')
   *   el('td', { class: 'num' }, [outroEl, 'texto'])
   * Texto entra como textContent — nunca como HTML. É a barreira contra
   * injeção quando o dado vem do usuário (nome de paciente, observação).
   */
  function el(tag, attrs, filhos) {
    var n = document.createElement(tag);

    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v === null || v === undefined || v === false) return;

        if (k === 'class') n.className = v;
        else if (k === 'text') n.textContent = v;
        else if (k === 'html') n.innerHTML = v;      // só para ícones internos
        else if (k === 'dataset') Object.keys(v).forEach(function (d) { n.dataset[d] = v[d]; });
        else if (k.slice(0, 2) === 'on' && typeof v === 'function') {
          n.addEventListener(k.slice(2), v);
        } else if (v === true) n.setAttribute(k, '');
        else n.setAttribute(k, v);
      });
    }

    anexar(n, filhos);
    return n;
  }

  /** Anexa filhos (nó, texto, número ou lista). */
  function anexar(pai, filhos) {
    if (filhos === null || filhos === undefined) return pai;

    if (Array.isArray(filhos)) {
      filhos.forEach(function (f) { anexar(pai, f); });
      return pai;
    }
    if (filhos instanceof Node) { pai.appendChild(filhos); return pai; }
    pai.appendChild(document.createTextNode(String(filhos)));
    return pai;
  }

  /** Esvazia um elemento. */
  function limpar(n) {
    while (n && n.firstChild) n.removeChild(n.firstChild);
    return n;
  }

  /** Substitui todo o conteúdo. */
  function preencher(n, filhos) {
    limpar(n);
    return anexar(n, filhos);
  }

  /* ==================================================== ÍCONES ========= */

  /**
   * Traçado dos ícones (Lucide-like, 24x24, stroke). Guardado como caminho
   * puro para que `icone()` monte o SVG com as classes certas.
   */
  var TRACOS = {
    painel: '<path d="M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z"/>',
    calendario: '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/>',
    bisturi: '<path d="M14 4l6 6-9 9H5v-6z"/><path d="M11 7l6 6"/>',
    estetoscopio: '<path d="M4 3v6a5 5 0 0 0 10 0V3"/><path d="M9 14v2a5 5 0 0 0 10 0v-3"/><circle cx="19" cy="10" r="2"/>',
    dinheiro: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/>',
    relogio: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
    grafico: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    pessoas: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13A4 4 0 0 1 16 11"/>',
    lista: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
    historico: '<path d="M3 3v5h5"/><path d="M3.05 13A9 9 0 1 0 6 5.3L3 8"/><path d="M12 7v5l4 2"/>',
    engrenagem: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .33 1.76l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06A1.6 1.6 0 0 0 15 19.4a1.6 1.6 0 0 0-1 1.46V21a2 2 0 0 1-4 0v-.09A1.6 1.6 0 0 0 9 19.4a1.6 1.6 0 0 0-1.76.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.6 1.6 0 0 0 4.6 15a1.6 1.6 0 0 0-1.46-1H3a2 2 0 0 1 0-4h.09A1.6 1.6 0 0 0 4.6 9a1.6 1.6 0 0 0-.33-1.76l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.6 1.6 0 0 0 9 4.6 1.6 1.6 0 0 0 10 3.14V3a2 2 0 0 1 4 0v.09a1.6 1.6 0 0 0 1 1.46 1.6 1.6 0 0 0 1.76-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.6 1.6 0 0 0 19.4 9v.01a1.6 1.6 0 0 0 1.46 1H21a2 2 0 0 1 0 4h-.09a1.6 1.6 0 0 0-1.46 1z"/>',
    mais: '<path d="M12 5v14M5 12h14"/>',
    lapis: '<path d="M17 3a2.8 2.8 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5z"/>',
    lixo: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/>',
    x: '<path d="M18 6L6 18M6 6l12 12"/>',
    check: '<path d="M20 6L9 17l-5-5"/>',
    alerta: '<path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/>',
    busca: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
    baixar: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5M12 15V3"/>',
    subir: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M17 8l-5-5-5 5M12 3v12"/>',
    escudo: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/>',
    menu: '<path d="M3 6h18M3 12h18M3 18h18"/>',
    sol: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    lua: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
    troca: '<path d="M16 3l4 4-4 4"/><path d="M20 7H4"/><path d="M8 21l-4-4 4-4"/><path d="M4 17h16"/>',
    vazio: '<path d="M21 8v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8"/><path d="M1 8h22v-3a2 2 0 0 0-2-2H3a2 2 0 0 0-2 2z"/><path d="M10 12h4"/>',
    nota: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8M8 17h5"/>',
    cadeado: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    quadro: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18M15 3v18"/>',
    voltar: '<path d="M15 18l-6-6 6-6"/>',
    avancar: '<path d="M9 18l6-6-6-6"/>',
    clipe: '<path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>',
    olho: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
    compartilhar: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/>'
  };

  /** Monta o <svg> de um ícone. */
  function icone(nome, classe) {
    var traco = TRACOS[nome];
    if (!traco) traco = TRACOS.info;

    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '1.7');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    if (classe) svg.setAttribute('class', classe);
    svg.innerHTML = traco;
    return svg;
  }

  /* ================================================= FORMATAÇÃO ======== */

  /** Data ISO -> DD/MM/AAAA; vazio devolve travessão. */
  function data(iso) { return dataBR(iso) || '—'; }

  /** Data ISO -> '01 out' (rótulo curto para cabeçalho de escala). */
  function dataCurta(iso) {
    var d = paraData(iso);
    if (!d) return '—';
    var m = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
    return d.slice(8, 10) + ' ' + m[Number(d.slice(5, 7)) - 1];
  }

  /** Dia da semana capitalizado: 'QUINTA-FEIRA' -> 'Quinta-feira'. */
  function diaSemana(d) {
    var s = txt(d).toLowerCase();
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
  }

  /** Hora ou travessão. */
  function hora(h) { return paraHora(h) || '—'; }

  /** Moeda ou travessão. */
  function moeda(v) {
    var n = paraNumero(v);
    return n === null ? '—' : moedaBR(n);
  }

  /** Moeda que mostra 'R$ 0,00' em vez de travessão (para totais). */
  function moedaZero(v) { return moedaBR(paraNumero(v) || 0); }

  /** Horas em [h]:mm ou travessão. */
  function horas(h) {
    if (h === null || h === undefined || h === '') return '—';
    return horasHHMM(h);
  }

  /** Horas que mostra '0:00' (para totais). */
  function horasZero(h) { return horasHHMM(paraNumero(h) || 0); }

  /** Texto ou travessão. */
  function ou(v, alternativa) {
    var s = txt(v);
    return s === '' ? (alternativa === undefined ? '—' : alternativa) : s;
  }

  /** Inteiro formatado com separador de milhar. */
  function inteiro(v) {
    var n = Number(v) || 0;
    return n.toLocaleString('pt-BR');
  }

  /** Percentual com uma casa. */
  function pct(v) {
    var n = Number(v) || 0;
    return n.toFixed(1).replace('.', ',') + '%';
  }

  /* ====================================================== SELOS ======== */

  /** Selo de status de cirurgia, com a cor do status. */
  function seloStatus(status) {
    var s = txt(status);
    var classe = CLASSE_STATUS[canonizar('STATUS_CIRURGIA', s)] || 'na';
    return el('span', { class: 'selo selo-' + classe }, s || '—');
  }

  /** Selo do STATUS DA AVALIAÇÃO PRÉ (N/A, Pendente, Realizada). */
  function seloAvaliacao(valor) {
    var v = txt(valor);
    var classe = v === 'Realizada' ? 'realizada' : (v === 'Pendente' ? 'pendente' : 'na');
    return el('span', { class: 'selo selo-' + classe }, v || '—');
  }

  /** Selo Sim/Não colorido. */
  function seloSimNao(valor, rotuloSim, rotuloNao) {
    var sim = ehSim(valor);
    return el('span', { class: 'selo ' + (sim ? 'selo-ok' : 'selo-na') },
      sim ? (rotuloSim || 'Sim') : (rotuloNao || 'Não'));
  }

  /** Selo de posição no rodízio; trata o literal 'fora da escala-base'. */
  function seloPosicao(valor) {
    var v = txt(valor);
    if (v === '') return el('span', { class: 't-suave' }, '—');
    if (v === CONFIG.FORA_DA_ESCALA) {
      return el('span', {
        class: 'selo selo-fora',
        title: 'Este anestesista não está na escala-base desta data. Confira se houve substituição não registrada.'
      }, 'fora da escala');
    }
    return el('span', { class: 'selo selo-pos', title: 'Posição no rodízio' }, v);
  }

  /* ==================================================== TORRADAS ======= */

  var raizTorradas = null;

  function garantirTorradas() {
    if (!raizTorradas) {
      raizTorradas = el('div', { class: 'torradas', role: 'status', 'aria-live': 'polite' });
      document.body.appendChild(raizTorradas);
    }
    return raizTorradas;
  }

  /**
   * Mostra um aviso flutuante.
   * tipo: 'ok' | 'erro' | 'atencao' | 'info'
   */
  function torrada(titulo, detalhe, tipo, duracao, acao) {
    tipo = tipo || 'info';
    var icones = { ok: 'check', erro: 'x', atencao: 'alerta', info: 'info' };

    // `acao` { rotulo, aoClicar }: uma saída pela própria torrada (o "Desfazer").
    var botaoAcao = acao ? el('button', {
      class: 'btn btn-pq torrada-acao',
      onclick: function () { fechar(); acao.aoClicar(); }
    }, acao.rotulo) : null;

    var n = el('div', { class: 'torrada torrada-' + tipo }, [
      icone(icones[tipo] || 'info'),
      el('div', { class: 'torrada-corpo' }, [
        el('strong', null, titulo),
        detalhe ? el('div', { class: 'detalhe' }, detalhe) : null
      ]),
      botaoAcao,
      el('button', {
        class: 'btn btn-plano btn-icone btn-pq',
        'aria-label': 'Fechar aviso',
        onclick: function () { fechar(); }
      }, icone('x'))
    ]);

    function fechar() {
      n.classList.add('saindo');
      setTimeout(function () { if (n.parentNode) n.parentNode.removeChild(n); }, 200);
    }

    garantirTorradas().appendChild(n);
    var ms = duracao === undefined ? (tipo === 'erro' ? 8000 : 4200) : duracao;
    if (ms > 0) setTimeout(fechar, ms);

    return n;
  }

  /**
   * O "visto": o traço que se faz numa ficha de papel ao conferir algo. Desenha-se
   * uma vez (`animar`) e depois fica parado. É o único gesto de comemoração do
   * sistema, reservado para o que fecha de verdade: boletim assinado, horas do
   * mês sem pendência, repasse quitado. Sem animar, é só um ícone.
   */
  function visto(animar) {
    var ns = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('class', 'visto' + (animar ? ' visto-anima' : ''));
    svg.setAttribute('aria-hidden', 'true');
    var aro = document.createElementNS(ns, 'circle');
    aro.setAttribute('cx', '12'); aro.setAttribute('cy', '12'); aro.setAttribute('r', '9.5');
    var traco = document.createElementNS(ns, 'path');
    traco.setAttribute('d', 'M7.6 12.6l3.1 3.1 5.8-6.8');
    [aro, traco].forEach(function (n) { n.setAttribute('pathLength', '1'); svg.appendChild(n); });
    return svg;
  }

  /**
   * Torrada de marco: um aviso de sucesso com o visto se desenhando, e um pouco
   * mais de tempo na tela. Só para o que encerra um ciclo (não para salvar).
   */
  function marco(titulo, detalhe) {
    var n = torrada(titulo, detalhe, 'ok', 7000);
    var velho = n.querySelector('svg');
    if (velho) velho.parentNode.replaceChild(visto(true), velho);
    n.classList.add('torrada-marco');
    return n;
  }

  /* Atalhos */
  function ok(t, d) { return torrada(t, d, 'ok'); }
  function erro(t, d) { return torrada(t, d, 'erro'); }
  function atencao(t, d) { return torrada(t, d, 'atencao'); }
  function info(t, d) { return torrada(t, d, 'info'); }

  /**
   * Mostra o resultado de uma transação do store como torrada.
   * Centraliza a tradução "resultado técnico -> mensagem humana".
   */
  function resultado(r, tituloOk) {
    if (!r) return;

    if (!r.ok) {
      var msgs = (r.erros || []).map(function (e) { return e.msg; });
      erro(msgs.length === 1 ? 'Não foi possível salvar' : 'Encontrei ' + msgs.length + ' problemas',
        msgs.join(' '));
      return;
    }

    var extras = [];
    if (r.criadas && r.criadas.length) {
      extras.push(r.criadas.length === 1
        ? 'Uma avaliação pré-anestésica foi criada automaticamente.'
        : r.criadas.length + ' avaliações pré-anestésicas foram criadas automaticamente.');
    }
    if (r.orfas && r.orfas.length) {
      extras.push(r.orfas.length === 1
        ? 'Uma avaliação ficou sem cirurgia correspondente — confira a aba de avaliações.'
        : r.orfas.length + ' avaliações ficaram sem cirurgia correspondente.');
    }

    ok(tituloOk || 'Salvo', extras.join(' ') || null);

    (r.avisos || []).forEach(function (a) { atencao('Atenção', a.msg); });
  }

  /* ====================================================== MODAL ======== */

  var modalAberto = null;
  var contadorModal = 0;

  /**
   * Abre um modal.
   *   abrirModal({ titulo, sub, corpo, acoes, tamanho, aoFechar })
   * `corpo` e `acoes` são nós ou listas de nós.
   */
  function abrirModal(cfg) {
    fecharModal();

    // IDs únicos por modal: o anterior ainda está no DOM durante a animação
    // de saída, e dois "modal-titulo" fariam o leitor de tela ler o errado.
    contadorModal++;
    var idTitulo = 'modal-titulo-' + contadorModal;
    var idSub = cfg.sub ? 'modal-sub-' + contadorModal : null;

    var caixa = el('div', {
      class: 'modal' + (cfg.tamanho ? ' ' + cfg.tamanho : ''),
      role: 'dialog', 'aria-modal': 'true',
      'aria-labelledby': idTitulo, 'aria-describedby': idSub
    }, [
      el('div', { class: 'modal-topo' }, [
        el('div', { style: 'flex:1;min-width:0' }, [
          el('h2', { id: idTitulo }, cfg.titulo),
          cfg.sub ? el('div', { class: 'sub', id: idSub }, cfg.sub) : null
        ]),
        el('button', {
          class: 'btn btn-plano btn-icone', 'aria-label': 'Fechar',
          onclick: function () { fecharModal(); }
        }, icone('x'))
      ]),
      el('div', { class: 'modal-corpo' }, cfg.corpo),
      cfg.acoes ? el('div', { class: 'modal-pe' }, cfg.acoes) : null
    ]);

    var fundo = el('div', {
      class: 'modal-fundo',
      onclick: function (ev) { if (ev.target === fundo) fecharModal(); }
    }, caixa);

    // Esconde o resto do app de teclado e leitor de tela enquanto o modal
    // estiver aberto — sem isso, Tab escapa para a navegação por trás.
    var casca = $('.casca');
    if (casca) casca.inert = true;

    document.body.appendChild(fundo);
    document.body.style.overflow = 'hidden';

    modalAberto = { fundo: fundo, aoFechar: cfg.aoFechar, casca: casca, gatilho: document.activeElement };

    // O modal cresce do ponto onde se clicou. Sem gatilho visível, cresce do centro.
    var g = modalAberto.gatilho;
    if (g && g !== document.body && typeof g.getBoundingClientRect === 'function') {
      var rg = g.getBoundingClientRect(), rm = caixa.getBoundingClientRect();
      if (rg.width && rm.width) {
        var ox = Math.min(Math.max(rg.left + rg.width / 2 - rm.left, 0), rm.width);
        var oy = Math.min(Math.max(rg.top + rg.height / 2 - rm.top, 0), rm.height);
        caixa.style.transformOrigin = Math.round(ox) + 'px ' + Math.round(oy) + 'px';
      }
    }

    // Foco no primeiro campo utilizável, para quem digita sem mouse — sem rolar
    // o corpo: um botão lá no meio não pode esconder o começo do modal.
    var alvo = caixa.querySelector('.entrada:not([readonly]):not([disabled]), .btn-primario');
    if (alvo) setTimeout(function () { alvo.focus({ preventScroll: true }); }, 40);

    return caixa;
  }

  function fecharModal() {
    if (!modalAberto) return;
    var m = modalAberto;
    modalAberto = null; // conta como fechado já — quem chamar de novo (Esc, clique duplo) não faz nada

    document.body.style.overflow = '';
    if (m.casca) m.casca.inert = false;

    // Devolve o foco pra quem abriu o modal, senão ele volta pro topo da página.
    // Isso e o inert acontecem na hora — o usuário não espera a animação pra
    // poder interagir de novo, só o modal some suavemente por cima.
    if (m.gatilho && document.contains(m.gatilho) && typeof m.gatilho.focus === 'function') {
      m.gatilho.focus();
    }
    if (typeof m.aoFechar === 'function') m.aoFechar();

    m.fundo.classList.add('saindo');
    setTimeout(function () {
      if (m.fundo.parentNode) m.fundo.parentNode.removeChild(m.fundo);
    }, 170);
  }

  function temModal() { return modalAberto !== null; }

  /** Confirmação — usada antes de qualquer ação destrutiva. */
  function confirmar(cfg, aoConfirmar) {
    abrirModal({
      titulo: cfg.titulo || 'Confirmar',
      tamanho: 'estreito',
      corpo: [
        cfg.aviso ? el('div', { class: 'aviso aviso-' + (cfg.tipo === 'perigo' ? 'erro' : 'atencao') }, [
          icone(cfg.tipo === 'perigo' ? 'alerta' : 'info'),
          el('div', { class: 'aviso-corpo' }, cfg.aviso)
        ]) : null,
        cfg.texto ? el('p', { class: 'sem-margem t-medio' }, cfg.texto) : null
      ],
      acoes: [
        el('div', { class: 'espaco' }),
        el('button', { class: 'btn', onclick: function () { fecharModal(); } }, 'Cancelar'),
        el('button', {
          class: 'btn ' + (cfg.tipo === 'perigo' ? 'btn-perigo' : 'btn-primario'),
          onclick: function () { fecharModal(); aoConfirmar(); }
        }, cfg.rotulo || 'Confirmar')
      ]
    });
  }

  /* ====================================================== TABELA ======= */

  /**
   * Monta uma tabela.
   *   tabela({
   *     colunas: [{ rotulo, num, classe }],
   *     linhas: [[celula, ...]],
   *     rodape: [celula, ...],
   *     vazio: { titulo, texto, acao }
   *   })
   */
  function tabela(cfg) {
    if (!cfg.linhas || cfg.linhas.length === 0) {
      return vazioEstado(cfg.vazio || {});
    }

    // Os papéis ARIA vão escritos: no celular a tabela vira uma pilha de
    // cartões (display: block/grid) e o navegador deixaria de anunciá-la como
    // tabela. O rótulo da coluna vai em cada célula para o cartão mostrar.
    var thead = el('thead', { role: 'rowgroup' }, el('tr', { role: 'row' }, cfg.colunas.map(function (c) {
      return el('th', { class: (c.num ? 'num ' : '') + (c.classe || ''), title: c.dica || null, role: 'columnheader' }, c.rotulo);
    })));

    function td(c, classe, conteudo) {
      var n = el('td', { class: (c.num ? 'num ' : '') + (classe || ''), role: 'cell' }, conteudo);
      if (c.rotulo) n.setAttribute('data-rotulo', c.rotulo);
      else n.classList.add('sem-rotulo');
      // Célula sem dado: no cartão do celular some, em vez de ocupar uma linha com "—".
      if (/^[—\s]*$/.test(n.textContent) && !n.querySelector('button, input, select, svg')) n.classList.add('cel-vazia');
      return n;
    }

    var tbody = el('tbody', { role: 'rowgroup' }, cfg.linhas.map(function (linha, i) {
      var attrs = { role: 'row', style: 'animation-delay:' + (Math.min(i, 10) * 18) + 'ms' };
      if (linha.__classe) attrs.class = linha.__classe;
      if (linha.__onclick) { attrs.onclick = linha.__onclick; attrs.class = (attrs.class || '') + ' selecionavel'; }

      var celulas = Array.isArray(linha) ? linha : linha.celulas;

      return el('tr', attrs, celulas.map(function (v, i) {
        var c = cfg.colunas[i] || {};
        if (v && v.__td) return td(c, v.classe, v.conteudo);
        return td(c, c.classeCelula, v);
      }));
    }));

    var tfoot = cfg.rodape ? el('tfoot', { role: 'rowgroup' }, el('tr', { role: 'row' }, cfg.rodape.map(function (v, i) {
      return td(cfg.colunas[i] || {}, null, v);
    }))) : null;

    return el('div', { class: 'tabela-envolve' },
      el('table', { class: 'tabela', role: 'table' }, [thead, tbody, tfoot]));
  }

  /** Célula com classe própria. */
  function celula(conteudo, classe) { return { __td: true, conteudo: conteudo, classe: classe }; }

  /** Estado vazio. */
  function vazioEstado(cfg) {
    return el('div', { class: 'vazio' }, [
      icone(cfg.icone || 'vazio'),
      el('h3', null, cfg.titulo || 'Nada por aqui'),
      cfg.texto ? el('p', null, cfg.texto) : null,
      cfg.acao || null
    ]);
  }

  /* ====================================================== CAMPOS ======= */

  /**
   * Monta um campo de formulário.
   *   campo({ rotulo, nome, tipo, valor, opcoes, obrigatorio, dica, calculado, ... })
   * Devolve { no, input, valor(), erro(msg) } para o formulário orquestrar.
   */
  function campo(cfg) {
    var input;
    var id = 'c_' + cfg.nome + '_' + Math.random().toString(36).slice(2, 7);

    if (cfg.tipo === 'select') {
      input = el('select', { class: 'entrada', id: id, name: cfg.nome });
      var opcoes = cfg.opcoes || [];
      if (cfg.vazioPermitido !== false) {
        input.appendChild(el('option', { value: '' }, cfg.rotuloVazio || '— selecione —'));
      }
      opcoes.forEach(function (o) {
        var valor = (o && o.valor !== undefined) ? o.valor : o;
        var rotulo = (o && o.rotulo !== undefined) ? o.rotulo : o;
        input.appendChild(el('option', { value: valor }, rotulo));
      });
      input.value = cfg.valor === null || cfg.valor === undefined ? '' : String(cfg.valor);

    } else if (cfg.tipo === 'textarea') {
      input = el('textarea', { class: 'entrada', id: id, name: cfg.nome, rows: cfg.linhas || 3 });
      input.value = cfg.valor === null || cfg.valor === undefined ? '' : String(cfg.valor);

    } else {
      input = el('input', {
        class: 'entrada', id: id, name: cfg.nome,
        type: cfg.tipo || 'text',
        placeholder: cfg.exemplo || null,
        step: cfg.passo || null,
        min: cfg.min === undefined ? null : cfg.min,
        list: cfg.lista || null,
        inputmode: cfg.modo || null,
        autocomplete: 'off'
      });
      input.value = cfg.valor === null || cfg.valor === undefined ? '' : String(cfg.valor);
    }

    if (cfg.calculado) {
      input.readOnly = true;
      input.classList.add('calculado');
      input.tabIndex = -1;
    }
    if (cfg.desabilitado) input.disabled = true;
    if (cfg.aoMudar) input.addEventListener('change', cfg.aoMudar);
    if (cfg.aoDigitar) input.addEventListener('input', cfg.aoDigitar);

    var idErro = id + '-erro';
    var erroNo = el('div', { class: 'campo-erro', id: idErro, hidden: true });

    var no = el('div', { class: 'campo' + (cfg.largo ? ' campo-largo' : '') }, [
      el('label', { for: id }, [
        cfg.rotulo,
        cfg.obrigatorio ? el('span', { class: 'obrigatorio', title: 'Obrigatório', 'aria-label': 'Obrigatório' }, '*') : null,
        cfg.calculado ? icone('cadeado', 'nav-icone') : null
      ]),
      input,
      cfg.dica ? el('div', { class: 'dica' }, cfg.dica) : null,
      erroNo
    ]);

    return {
      no: no,
      input: input,
      nome: cfg.nome,
      valor: function () { return input.value; },
      definir: function (v) { input.value = v === null || v === undefined ? '' : String(v); },
      erro: function (msg) {
        if (msg) {
          no.classList.add('invalido');
          erroNo.textContent = msg;
          erroNo.hidden = false;
          input.setAttribute('aria-invalid', 'true');
          input.setAttribute('aria-describedby', idErro);
        } else {
          no.classList.remove('invalido');
          erroNo.hidden = true;
          input.removeAttribute('aria-invalid');
          input.removeAttribute('aria-describedby');
        }
      }
    };
  }

  /**
   * Orquestra um conjunto de campos.
   *   var f = UI.formulario([campo(...), campo(...)]);
   *   f.dados()                -> { nome: valor }
   *   f.mostrarErros(erros)    -> pinta os campos citados
   */
  function formulario(campos) {
    var porNome = {};
    campos.forEach(function (c) { if (c && c.nome) porNome[c.nome] = c; });

    return {
      campos: campos,
      campo: function (nome) { return porNome[nome]; },

      dados: function () {
        var d = {};
        campos.forEach(function (c) { if (c && c.nome) d[c.nome] = c.valor(); });
        return d;
      },

      limparErros: function () {
        campos.forEach(function (c) { if (c && c.erro) c.erro(null); });
      },

      mostrarErros: function (erros) {
        this.limparErros();
        var semCampo = [];
        (erros || []).forEach(function (e) {
          var c = porNome[e.campo];
          if (c) c.erro(e.msg); else semCampo.push(e.msg);
        });
        return semCampo;
      }
    };
  }

  /* ======================================================= TEMA ======== */

  var CHAVE_TEMA = 'anestesia.tema';

  function temaAtual() {
    try { return localStorage.getItem(CHAVE_TEMA) || 'auto'; } catch (e) { return 'auto'; }
  }

  function aplicarTema(t) {
    if (t === 'auto') document.documentElement.removeAttribute('data-tema');
    else document.documentElement.setAttribute('data-tema', t);
    try { localStorage.setItem(CHAVE_TEMA, t); } catch (e) { /* modo privado */ }
  }

  function alternarTema() {
    var atual = temaAtual();
    var escuroAgora = atual === 'escuro' ||
      (atual === 'auto' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
    aplicarTema(escuroAgora ? 'claro' : 'escuro');
    return temaAtual();
  }

  /* ====================================================== ARQUIVO ====== */

  /*
   * Todo arquivo que o sistema entrega (PDF, CSV, backup) passa por
   * salvarArquivo. Na versão instalada é o download comum do navegador. Na
   * versão publicada online, a página não pode baixar nada sozinha: o
   * arquivo vai pela capacidade "downloads" da página, que mostra a quem
   * está usando o nome e o tamanho e pede confirmação.
   */
  var capacidadeDownloads = null;

  function downloadsDaPagina() {
    if (!capacidadeDownloads) {
      capacidadeDownloads = window.claude && typeof window.claude.use === 'function'
        ? Promise.resolve(window.claude.use('downloads')).catch(function () { return null; })
        : Promise.resolve(null);
    }
    return capacidadeDownloads;
  }

  function downloadIndisponivel() {
    atencao('Download indisponível aqui',
      'Esta página não conseguiu entregar o arquivo neste navegador. Na versão instalada na clínica, o botão gera o arquivo.');
  }

  /**
   * Entrega um arquivo. `dados`: texto ou Blob. Devolve uma Promise que
   * resolve true quando o arquivo foi entregue (online: a pessoa aceitou).
   */
  function salvarArquivo(nomeArquivo, dados, mime) {
    // Fora do Artifact (GitHub Pages, servidor próprio) não há a capacidade "downloads": vale o download comum.
    if (!window.MODO_ONLINE || !(window.claude && typeof window.claude.use === 'function')) {
      var blob = dados instanceof Blob ? dados : new Blob([dados], { type: mime || 'application/octet-stream' });
      var url = URL.createObjectURL(blob);
      var a = el('a', { href: url, download: nomeArquivo });
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      return Promise.resolve(true);
    }
    return downloadsDaPagina().then(function (downloads) {
      if (!downloads) { downloadIndisponivel(); return false; }
      return downloads.save({ filename: nomeArquivo, data: dados }).then(function () { return true; }, function (e) {
        var codigo = e && e.code;
        if (codigo === 'declined') return false;   // a pessoa disse não: nada a avisar
        if (codigo === 'rate_limited') {
          atencao('Já há um arquivo esperando confirmação', 'Responda à janela aberta e tente de novo.');
        } else if (codigo === 'rejected_extension' || codigo === 'extension_not_enabled') {
          atencao('Este formato não pode ser entregue aqui', nomeArquivo);
        } else if (codigo === 'too_large') {
          atencao('Arquivo grande demais para esta página', nomeArquivo);
        } else {
          downloadIndisponivel();
        }
        return false;
      });
    });
  }

  /** Entrega um texto como arquivo (UTF-8 com BOM, que o Excel reconhece). */
  function baixarTexto(nomeArquivo, conteudo, mime) {
    return salvarArquivo(nomeArquivo, new Blob(['\ufeff' + conteudo], { type: (mime || 'text/plain') + ';charset=utf-8' }));
  }

  /** Abre o seletor de arquivo e devolve o texto lido. */
  function lerArquivo(aceita, aoLer) {
    var input = el('input', { type: 'file', accept: aceita, style: 'display:none' });
    input.addEventListener('change', function () {
      var arq = input.files && input.files[0];
      if (!arq) return;
      var leitor = new FileReader();
      leitor.onload = function () { aoLer(String(leitor.result), arq.name); };
      leitor.onerror = function () { erro('Não consegui ler o arquivo', arq.name); };
      leitor.readAsText(arq, 'utf-8');
    });
    document.body.appendChild(input);
    input.click();
    setTimeout(function () { if (input.parentNode) input.parentNode.removeChild(input); }, 60000);
  }

  /* ==================================================================== */

  return {
    $: $, $$: $$, el: el, anexar: anexar, limpar: limpar, preencher: preencher,
    icone: icone, TRACOS: TRACOS,

    data: data, dataCurta: dataCurta, diaSemana: diaSemana, hora: hora,
    moeda: moeda, moedaZero: moedaZero, horas: horas, horasZero: horasZero,
    ou: ou, inteiro: inteiro, pct: pct,

    seloStatus: seloStatus, seloAvaliacao: seloAvaliacao,
    seloSimNao: seloSimNao, seloPosicao: seloPosicao,

    torrada: torrada, ok: ok, erro: erro, atencao: atencao, info: info,
    visto: visto, marco: marco,
    resultado: resultado,

    abrirModal: abrirModal, fecharModal: fecharModal, temModal: temModal,
    confirmar: confirmar,

    tabela: tabela, celula: celula, vazioEstado: vazioEstado,
    campo: campo, formulario: formulario,

    temaAtual: temaAtual, aplicarTema: aplicarTema, alternarTema: alternarTema,

    salvarArquivo: salvarArquivo, baixarTexto: baixarTexto, lerArquivo: lerArquivo
  };
})();
