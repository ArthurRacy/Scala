/**
 * ============================================================================
 * 01B_COMPONENTES — Peças de tela reutilizadas por várias telas
 * ============================================================================
 * KPI, cabeçalho de cartão, seção de formulário, filtros, linha de definição.
 * Antes moravam dentro do módulo de uma tela e as outras telas iam buscá-las
 * lá (TELAS.kpi, TELAS2.def) — acoplamento entre telas que não têm nada a ver
 * uma com a outra. Aqui é a biblioteca comum; telas dependem dela, nunca umas
 * das outras (salvo o que uma tela oferece de propósito, como o formulário de
 * cirurgia).
 *
 * Também cria o registro TELAS: cada arquivo em js/telas/ se registra como
 * TELAS.<chave> = { render, ... }. A casca (06_app) só conhece o registro.
 * ============================================================================
 */
'use strict';

/** Registro das telas. Preenchido pelos arquivos de js/telas/. */
var TELAS = {};

var COMP = (function () {

  var el = UI.el, icone = UI.icone;

  /** Cartão de KPI. */
  function kpi(cfg) {
    // O número animado é decorativo (aria-hidden); o leitor de tela lê o
    // valor final no texto oculto, e não "0… 3… 7…" durante a contagem.
    var animado = el('span', { 'aria-hidden': 'true' });
    contarValor(animado, cfg.valor);
    var valorNo = el('div', { class: 'kpi-valor' + (cfg.valorPq ? ' pq' : '') }, [
      animado, el('span', { class: 'so-leitor' }, String(cfg.valor))
    ]);
    return el('div', { class: 'kpi' + (cfg.tom ? ' ' + cfg.tom : '') }, [
      el('div', { class: 'kpi-rotulo' }, cfg.rotulo),
      valorNo,
      cfg.nota ? el('div', { class: 'kpi-nota' }, cfg.nota) : null
    ]);
  }

  var SEM_MOVIMENTO = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  /**
   * Sobe o número de 0 até o valor final em vez de só aparecer pronto.
   * Só mexe em valor reconhecidamente numérico (dinheiro ou inteiro, com ou
   * sem "R$" e separador de milhar); qualquer outra coisa ("14:10",
   * "5 semanas", "—") é escrita direto, sem tentativa de animar.
   */
  function contarValor(no, textoFinal) {
    var m = /^(-)?(R\$\s?)?(\d{1,3}(?:\.\d{3})*|\d+)(?:,(\d{2}))?$/.exec(String(textoFinal).trim());
    if (!m || SEM_MOVIMENTO) { no.textContent = textoFinal; return; }

    var alvo = (m[1] ? -1 : 1) * (Number(m[3].replace(/\./g, '')) + (m[4] ? Number(m[4]) / 100 : 0));
    var prefixo = m[2] || '';
    var casas = m[4] ? 2 : 0;
    var inicio = null, duracao = 650;

    function escreve(v) {
      no.textContent = prefixo + v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
    }
    function passo(agora) {
      if (inicio === null) inicio = agora;
      var t = Math.min(1, (agora - inicio) / duracao);
      escreve(alvo * (1 - Math.pow(1 - t, 3))); // desacelera chegando no valor certo
      if (t < 1) requestAnimationFrame(passo);
    }
    escreve(0);
    requestAnimationFrame(passo);
  }

  /** Cabeçalho de cartão, com ações opcionais à direita. */
  function cabecalhoCartao(titulo, sub, acoes) {
    return el('div', { class: 'cartao-topo' }, [
      el('div', { style: 'flex:1;min-width:0' }, [
        el('h2', null, titulo),
        sub ? el('div', { class: 'sub' }, sub) : null
      ]),
      acoes ? el('div', { class: 'linha' }, acoes) : null
    ]);
  }

  /** Seção de formulário. */
  function secao(titulo, filhos) {
    return el('div', { class: 'secao-form' }, [el('h4', null, titulo)].concat(filhos));
  }

  /** Select solto de filtro (fora de formulário). */
  function seletor(cfg) {
    var s = el('select', {
      class: 'entrada',
      style: 'width:' + (cfg.largura || '160px'),
      onchange: function (ev) { cfg.aoMudar(ev.target.value); }
    });
    (cfg.opcoes || []).forEach(function (o) {
      var valor = o && o.valor !== undefined ? o.valor : o;
      var rotulo = o && o.rotulo !== undefined ? o.rotulo : o;
      s.appendChild(el('option', { value: valor }, rotulo));
    });
    s.value = cfg.valor === null || cfg.valor === undefined ? '' : String(cfg.valor);
    return s;
  }

  /** Botão de grupo segmentado. */
  function botaoSeg(rotulo, ativo, aoClicar) {
    return el('button', { 'aria-pressed': ativo ? 'true' : 'false', onclick: aoClicar }, rotulo);
  }

  function abaBtn(rotulo, ativo, aoClicar) {
    return el('button', {
      class: 'aba', role: 'tab',
      'aria-selected': ativo ? 'true' : 'false',
      onclick: aoClicar
    }, rotulo);
  }

  /** Linha de definição rótulo/valor. */
  function def(rotulo, valor, tom, total) {
    return el('div', { class: 'def' + (total ? ' total' : '') }, [
      el('span', { class: 'def-rotulo' }, rotulo),
      el('span', { class: 'def-valor' + (tom ? ' ' + tom : '') }, valor)
    ]);
  }

  /** Nome do mês. */
  function nomeMes(m) { return MESES_NOME[Number(m) - 1] || String(m); }

  /** Cor fixa por status, para o gráfico casar com os selos da tabela. */
  function corDoStatus(status) {
    var mapa = {
      'Agendada': 'var(--s2)', 'Confirmada': 'var(--s1)', 'Realizada': 'var(--s5)',
      'Cancelada': 'var(--s6)', 'Remarcada': 'var(--s3)'
    };
    return mapa[status] || 'var(--neutro)';
  }

  /* ================================================== assinatura ====== */

  /**
   * Quadro para assinar com o dedo, a caneta ou o mouse. Os traços saem como
   * listas de pontos [x, y] entre 0 e 1 (y a partir do topo) — no PDF viram
   * vetor, sem imagem. Usado no termo de consentimento e no boletim.
   */
  function quadroAssinatura(cfg) {
    cfg = cfg || {};
    var tela = el('canvas', { class: 'assinatura-tela', width: 900, height: 280,
      'aria-label': cfg.rotulo || 'Área para assinar com o dedo ou o mouse' });
    var ctx = tela.getContext('2d');
    var tracos = [];
    var atual = null;

    function ponto(ev) {
      var r = tela.getBoundingClientRect();
      return [Math.round(((ev.clientX - r.left) / r.width) * 1000) / 1000,
              Math.round(((ev.clientY - r.top) / r.height) * 1000) / 1000];
    }
    function desenhar() {
      ctx.clearRect(0, 0, tela.width, tela.height);
      ctx.lineWidth = 3.2; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#0b2a59';
      tracos.forEach(function (t) {
        ctx.beginPath();
        t.forEach(function (p, i) {
          var x = p[0] * tela.width, y = p[1] * tela.height;
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        });
        if (t.length === 1) ctx.lineTo(t[0][0] * tela.width + 0.5, t[0][1] * tela.height);
        ctx.stroke();
      });
    }
    tela.addEventListener('pointerdown', function (ev) {
      ev.preventDefault();
      try { tela.setPointerCapture(ev.pointerId); } catch (e) { /* ok */ }
      atual = [ponto(ev)];
      tracos.push(atual);
      desenhar();
    });
    tela.addEventListener('pointermove', function (ev) {
      if (!atual) return;
      var p = ponto(ev), u = atual[atual.length - 1];
      if (Math.abs(p[0] - u[0]) + Math.abs(p[1] - u[1]) < 0.004) return;   // menos pontos, PDF menor
      atual.push(p);
      desenhar();
    });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (t) {
      tela.addEventListener(t, function () { atual = null; });
    });

    return {
      no: el('div', { class: 'assinatura-moldura' }, [tela, el('div', { class: 'assinatura-linha' }, cfg.linha || 'Assine acima da linha')]),
      tracos: function () { return tracos.map(function (t) { return t.slice(); }); },
      vazio: function () { return tracos.length === 0; },
      limpar: function () { tracos = []; desenhar(); }
    };
  }

  /**
   * A assinatura já feita, como tinta sobre papel. Os traços são os mesmos
   * pontos [x, y] (0 a 1) que o quadro grava, então é vetor e cabe em qualquer
   * largura. `animar`: na hora de assinar, cada traço se escreve de novo, na
   * ordem em que foi feito; nas outras aberturas, aparece parada.
   */
  function assinaturaVista(tracos, animar) {
    var ns = 'http://www.w3.org/2000/svg';
    var W = 900, H = 280;
    var svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    svg.setAttribute('class', 'assinatura-vista' + (animar ? ' assinatura-anima' : ''));
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'Assinatura do anestesiologista');
    (tracos || []).forEach(function (t, i) {
      if (!t || !t.length) return;
      var pontos = t.map(function (p) { return (p[0] * W).toFixed(1) + ' ' + (p[1] * H).toFixed(1); });
      // Um toque sem arrasto vira um ponto, como no quadro.
      var d = t.length === 1
        ? 'M' + pontos[0] + 'l.5 0'
        : 'M' + pontos[0] + pontos.slice(1).map(function (p) { return 'L' + p; }).join('');
      var caminho = document.createElementNS(ns, 'path');
      caminho.setAttribute('d', d);
      caminho.setAttribute('pathLength', '1');
      caminho.style.setProperty('--i', String(Math.min(i, 4)));
      svg.appendChild(caminho);
    });
    return el('div', { class: 'assinatura-vista-caixa' }, svg);
  }

  /* ================================================== calendário ====== */

  var SEMANA_CURTA = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
  var SEMANA_NOME = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

  /**
   * Calendário para escolher dia, mês e ano.
   *   cfg.ano, cfg.mes       mês mostrado ao abrir
   *   cfg.selecionado        dia marcado ('YYYY-MM-DD'), opcional
   *   cfg.faixa              { de:{ano,mes}, ate:{ano,mes} } — fora dela, desabilitado
   *   cfg.contagem(iso)      número a mostrar no dia (cirurgias), opcional
   *   cfg.aoMudarMes(a, m)   quando o mês mostrado muda (setas, listas)
   *   cfg.aoEscolherDia(iso) quando um dia é escolhido
   * Teclado: setas andam entre os dias, PageUp/PageDown trocam o mês,
   * Enter escolhe. Semana começa no domingo, como no calendário brasileiro.
   */
  function calendario(cfg) {
    var raiz = el('div', { class: 'calendario', role: 'group', 'aria-label': 'Calendário' });
    var estado = { ano: Number(cfg.ano), mes: Number(cfg.mes), foco: cfg.selecionado || null };
    var hoje = hojeISO();

    function dentro(ano, mes) {
      var m = { ano: ano, mes: mes };
      return !cfg.faixa || (compararMeses(m, cfg.faixa.de) >= 0 && compararMeses(m, cfg.faixa.ate) <= 0);
    }

    function irPara(ano, mes, focoDia) {
      if (!dentro(ano, mes)) return;
      estado.ano = ano; estado.mes = mes;
      if (focoDia) estado.foco = focoDia;
      desenhar(true);
      if (cfg.aoMudarMes) cfg.aoMudarMes(ano, mes);
    }

    function desenhar(manterFoco) {
      UI.limpar(raiz);
      var ant = somarMeses(estado.ano, estado.mes, -1), prox = somarMeses(estado.ano, estado.mes, 1);

      var selMes = el('select', { class: 'entrada cal-mes', 'aria-label': 'Mês',
        onchange: function (ev) { irPara(estado.ano, Number(ev.target.value)); } },
        MESES_NOME.map(function (nome, i) {
          return el('option', { value: i + 1, disabled: !dentro(estado.ano, i + 1) }, nome);
        }));
      selMes.value = String(estado.mes);

      var anos = [];
      var aIni = cfg.faixa ? cfg.faixa.de.ano : estado.ano - 1, aFim = cfg.faixa ? cfg.faixa.ate.ano : estado.ano + 1;
      for (var a = aIni; a <= aFim; a++) anos.push(a);
      var selAno = el('select', { class: 'entrada cal-ano', 'aria-label': 'Ano',
        onchange: function (ev) {
          var ano = Number(ev.target.value), mes = estado.mes;
          // Mês fora da faixa naquele ano: vai para o mês mais próximo que existe.
          if (!dentro(ano, mes)) mes = compararMeses({ ano: ano, mes: mes }, cfg.faixa.de) < 0 ? cfg.faixa.de.mes : cfg.faixa.ate.mes;
          irPara(ano, mes);
        } }, anos.map(function (x) { return el('option', { value: x }, String(x)); }));
      selAno.value = String(estado.ano);

      raiz.appendChild(el('div', { class: 'cal-topo' }, [
        el('button', { class: 'btn btn-plano btn-icone btn-pq', 'aria-label': 'Mês anterior', title: 'Mês anterior',
          disabled: !dentro(ant.ano, ant.mes), onclick: function () { irPara(ant.ano, ant.mes); } }, icone('voltar')),
        selMes, selAno,
        el('button', { class: 'btn btn-plano btn-icone btn-pq', 'aria-label': 'Próximo mês', title: 'Próximo mês',
          disabled: !dentro(prox.ano, prox.mes), onclick: function () { irPara(prox.ano, prox.mes); } }, icone('avancar'))
      ]));

      raiz.appendChild(el('div', { class: 'cal-semana', 'aria-hidden': 'true' },
        SEMANA_CURTA.map(function (d, i) { return el('span', { class: i === 0 ? 'domingo' : null }, d); })));

      // 6 semanas, começando no domingo da semana do dia 1.
      var primeiro = chaveMes(estado.ano, estado.mes) + '-01';
      var inicio = somarDias(primeiro, -new Date(primeiro + 'T12:00:00').getDay());
      var grade = el('div', { class: 'cal-dias', role: 'grid' });
      var focoValido = estado.foco && estado.foco.slice(0, 7) === chaveMes(estado.ano, estado.mes) ? estado.foco : null;
      if (!focoValido) focoValido = hoje.slice(0, 7) === chaveMes(estado.ano, estado.mes) ? hoje : primeiro;

      for (var i = 0; i < 42; i++) {
        grade.appendChild(dia(somarDias(inicio, i), focoValido));
      }
      raiz.appendChild(grade);

      raiz.appendChild(el('div', { class: 'cal-pe' }, [
        el('button', { class: 'btn btn-pq', onclick: function () {
          var m = mesDaData(hoje);
          if (dentro(m.ano, m.mes)) { if (cfg.aoEscolherDia) cfg.aoEscolherDia(hoje); }
          else UI.info('Hoje está fora do período da escala', 'A escala começa em ' + dataBR(CONFIG.ANCORA_RODIZIO) + '.');
        } }, 'Hoje'),
        el('span', { class: 't-mpq t-suave' }, 'Clique num dia para abrir o quadro')
      ]));

      if (manterFoco) {
        var alvo = grade.querySelector('[tabindex="0"]');
        if (alvo) alvo.focus();
      }
    }

    function dia(iso, focoIso) {
      var m = mesDaData(iso);
      var doMes = m.ano === estado.ano && m.mes === estado.mes;
      var semana = new Date(iso + 'T12:00:00').getDay();
      var n = cfg.contagem && doMes ? cfg.contagem(iso) : 0;
      var classes = ['cal-dia'];
      if (!doMes) classes.push('fora');
      if (semana === 0) classes.push('domingo');
      if (iso === hoje) classes.push('hoje');
      if (iso === cfg.selecionado) classes.push('selecionado');
      var rotulo = SEMANA_NOME[semana] + ', ' + dataBR(iso) + (n ? ', ' + n + ' cirurgia(s)' : '') + (iso === hoje ? ', hoje' : '');

      return el('button', {
        class: classes.join(' '), role: 'gridcell', 'aria-label': rotulo, title: rotulo,
        tabindex: iso === focoIso ? '0' : '-1',
        disabled: !dentro(m.ano, m.mes),
        'aria-selected': iso === cfg.selecionado ? 'true' : 'false',
        onclick: function () {
          if (!doMes) { irPara(m.ano, m.mes, iso); return; }
          if (cfg.aoEscolherDia) cfg.aoEscolherDia(iso);
        },
        onkeydown: function (ev) {
          var passo = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[ev.key];
          if (passo) {
            ev.preventDefault();
            var novo = somarDias(iso, passo), nm = mesDaData(novo);
            if (nm.ano !== estado.ano || nm.mes !== estado.mes) { irPara(nm.ano, nm.mes, novo); return; }
            estado.foco = novo;
            var b = raiz.querySelector('.cal-dia[data-dia="' + novo + '"]');
            if (b) { raiz.querySelectorAll('.cal-dia[tabindex="0"]').forEach(function (x) { x.tabIndex = -1; }); b.tabIndex = 0; b.focus(); }
          } else if (ev.key === 'PageUp' || ev.key === 'PageDown') {
            ev.preventDefault();
            var alvo = somarMeses(estado.ano, estado.mes, ev.key === 'PageUp' ? -1 : 1);
            irPara(alvo.ano, alvo.mes);
          }
        },
        dataset: { dia: iso }
      }, [
        el('span', { class: 'cal-num' }, String(Number(iso.slice(8, 10)))),
        n ? el('span', { class: 'cal-conta', 'aria-hidden': 'true' }, String(n)) : null
      ]);
    }

    desenhar(false);
    return raiz;
  }

  return {
    calendario: calendario,
    quadroAssinatura: quadroAssinatura,
    assinaturaVista: assinaturaVista,
    kpi: kpi,
    contarValor: contarValor,
    cabecalhoCartao: cabecalhoCartao,
    secao: secao,
    seletor: seletor,
    botaoSeg: botaoSeg,
    abaBtn: abaBtn,
    def: def,
    nomeMes: nomeMes,
    corDoStatus: corDoStatus
  };
})();
