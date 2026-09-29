/**
 * ============================================================================
 * 02_GRAFICOS — Gráficos em SVG, escritos à mão
 * ============================================================================
 * Nenhuma biblioteca. Motivos:
 *   - o sistema precisa abrir offline, sem CDN;
 *   - as cores saem das variáveis CSS, então claro/escuro funciona de graça;
 *   - o SVG resultante imprime bem, o que importa para relatório mensal.
 *
 * Todos recebem `dados` no formato [{ rotulo, valor }] e devolvem um nó pronto.
 * Nenhum quebra com lista vazia ou com todos os valores em zero.
 * ============================================================================
 */
'use strict';

var GFX = (function () {

  var NS = 'http://www.w3.org/2000/svg';
  var CORES = ['var(--s1)', 'var(--s2)', 'var(--s3)', 'var(--s4)',
               'var(--s5)', 'var(--s6)', 'var(--s7)', 'var(--s8)'];

  /* -------------------------------------------------------- utilidades -- */

  function svgEl(tag, attrs, filhos) {
    var n = document.createElementNS(NS, tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v === null || v === undefined || v === false) return;
        if (k === 'text') n.textContent = v;
        else n.setAttribute(k, v);
      });
    }
    (Array.isArray(filhos) ? filhos : [filhos]).forEach(function (f) {
      if (f instanceof Node) n.appendChild(f);
      else if (f !== null && f !== undefined) n.appendChild(document.createTextNode(String(f)));
    });
    return n;
  }

  function maiorValor(dados, campo) {
    var m = 0;
    (dados || []).forEach(function (d) {
      var v = Number(campo ? d[campo] : d.valor) || 0;
      if (v > m) m = v;
    });
    return m;
  }

  /**
   * Escolhe um teto "redondo" e o passo da malha.
   * Sem isso o eixo fica com números como 37, 74, 111 — ilegíveis.
   */
  function escala(maximo, divisoes) {
    divisoes = divisoes || 4;
    if (maximo <= 0) return { teto: divisoes, passo: 1 };

    var bruto = maximo / divisoes;
    var mag = Math.pow(10, Math.floor(Math.log(bruto) / Math.LN10));
    var norm = bruto / mag;
    var passo = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;

    return { teto: Math.ceil(maximo / passo) * passo, passo: passo };
  }

  /** Formata número para rótulo de eixo, sem casas desnecessárias. */
  function rotuloNum(v) {
    if (Math.abs(v) >= 1000) {
      var mil = v / 1000;
      return (Math.round(mil * 10) / 10).toString().replace('.', ',') + 'k';
    }
    return (Math.round(v * 100) / 100).toString().replace('.', ',');
  }

  /* ------------------------------------------------------ largura real -- */

  /**
   * O SVG é desenhado na largura em que vai aparecer (1 unidade = 1 px). Com
   * um viewBox fixo o texto acompanharia a escala: 20px num cartão largo e
   * 6px no celular. Todos os gráficos compartilham um ResizeObserver; quem
   * saiu da página (a tela redesenha a cada gravação) é solto na hora.
   */
  var LARGURA_PADRAO = 620;
  var observados = [];
  var observador = typeof ResizeObserver === 'function' ? new ResizeObserver(function (entradas) {
    entradas.forEach(function (e) {
      var caixa = e.target, w = Math.round(e.contentRect.width);
      if (!caixa.isConnected || w < 120 || Math.abs(w - caixa.__largura) < 2) return;
      caixa.__largura = w;
      // Só a primeira medida anima; redimensionar a janela não faz as barras nascerem de novo.
      caixa.classList.toggle('sem-animacao', caixa.__medido === true);
      caixa.__medido = true;
      UI.preencher(caixa, caixa.__desenhar(w));
    });
  }) : null;

  function naLarguraReal(desenhar) {
    var caixa = UI.el('div', { class: 'gfx-caixa' });
    caixa.__desenhar = desenhar;
    caixa.__largura = LARGURA_PADRAO;
    UI.anexar(caixa, desenhar(LARGURA_PADRAO));   // impressão e navegador sem ResizeObserver
    if (observador) {
      // Solta só quem já esteve na página: os gráficos desta mesma tela ainda
      // estão sendo montados fora do documento.
      observados = observados.filter(function (c) {
        if (c.isConnected || !c.__medido) return true;
        observador.unobserve(c);
        return false;
      });
      observados.push(caixa);
      observador.observe(caixa);
    }
    return caixa;
  }

  /** Nó de estado vazio no lugar do gráfico. */
  function vazio(texto) {
    return UI.el('div', { class: 'vazio', style: 'padding:32px 16px' }, [
      UI.icone('grafico'),
      UI.el('p', { class: 'sem-margem t-pq' }, texto || 'Sem dados para o período selecionado.')
    ]);
  }

  /* ================================================ BARRAS VERTICAIS === */

  /**
   * Barras verticais. Boa para poucas categorias (meses, status).
   *   barras(dados, { altura, formatar, cor })
   */
  function barras(dados, opcoes) {
    opcoes = opcoes || {};
    dados = (dados || []).filter(function (d) { return d; });

    if (!dados.length) return vazio(opcoes.vazio);
    if (maiorValor(dados) === 0 && !opcoes.mostrarZerado) return vazio(opcoes.vazio);

    return naLarguraReal(function (L) { return desenharBarras(dados, opcoes, L); });
  }

  function desenharBarras(dados, opcoes, L) {
    var A = opcoes.altura || 240;
    var mE = 46, mD = 12, mT = 16, mB = 40;
    var larg = L - mE - mD, alt = A - mT - mB;

    var esc = escala(maiorValor(dados));
    var passoX = larg / dados.length;
    var largBarra = Math.min(54, passoX * 0.6);

    var filhos = [];

    /* malha horizontal + rótulos do eixo Y */
    for (var v = 0; v <= esc.teto + 1e-9; v += esc.passo) {
      var y = mT + alt - (v / esc.teto) * alt;
      filhos.push(svgEl('line', { class: v === 0 ? 'eixo' : 'malha', x1: mE, y1: y, x2: mE + larg, y2: y }));
      filhos.push(svgEl('text', {
        x: mE - 8, y: y + 4, 'text-anchor': 'end', text: rotuloNum(v)
      }));
    }

    dados.forEach(function (d, i) {
      var valor = Number(d.valor) || 0;
      var h = esc.teto ? (valor / esc.teto) * alt : 0;
      var x = mE + i * passoX + (passoX - largBarra) / 2;
      var y = mT + alt - h;
      var cor = opcoes.cor || d.cor || CORES[i % CORES.length];

      if (h > 0) {
        filhos.push(svgEl('rect', {
          class: 'barra barra-v', style: 'animation-delay:' + (i * 35) + 'ms',
          x: x, y: y, width: largBarra, height: h,
          rx: Math.min(4, largBarra / 3), fill: cor
        }, svgEl('title', { text: d.rotulo + ': ' + (opcoes.formatar ? opcoes.formatar(valor) : valor) })));
      }

      /* valor em cima da barra */
      if (valor > 0) {
        filhos.push(svgEl('text', {
          class: 'rotulo-valor', x: x + largBarra / 2, y: Math.max(mT + 10, y - 6),
          'text-anchor': 'middle',
          text: opcoes.formatar ? opcoes.formatar(valor) : rotuloNum(valor)
        }));
      }

      /* rótulo da categoria */
      filhos.push(svgEl('text', {
        x: mE + i * passoX + passoX / 2, y: A - mB + 18,
        'text-anchor': 'middle',
        text: encurtar(d.rotulo, Math.max(6, Math.floor(passoX / 7)))
      }, svgEl('title', { text: d.rotulo })));
    });

    return svgEl('svg', {
      class: 'gfx', viewBox: '0 0 ' + L + ' ' + A,
      role: 'img', 'aria-label': opcoes.descricao || 'Gráfico de barras'
    }, filhos);
  }

  /* ============================================== BARRAS AGRUPADAS ===== */

  /**
   * Duas séries lado a lado — usado em faturado x recebido por mês.
   *   agrupadas(dados, { series: [{campo, rotulo, cor}], ... })
   */
  function agrupadas(dados, opcoes) {
    opcoes = opcoes || {};
    var series = opcoes.series || [];
    dados = dados || [];

    if (!dados.length || !series.length) return vazio(opcoes.vazio);

    var maximo = 0;
    dados.forEach(function (d) {
      series.forEach(function (s) {
        var v = Number(d[s.campo]) || 0;
        if (v > maximo) maximo = v;
      });
    });
    if (maximo === 0) return vazio(opcoes.vazio);

    var grafico = naLarguraReal(function (L) { return desenharAgrupadas(dados, opcoes, series, maximo, L); });

    return UI.el('div', null, [grafico, legenda(series.map(function (s, j) {
      return { rotulo: s.rotulo, cor: s.cor || CORES[j % CORES.length] };
    }))]);
  }

  function desenharAgrupadas(dados, opcoes, series, maximo, L) {
    var A = opcoes.altura || 250;
    var mE = 56, mD = 12, mT = 16, mB = 40;
    var larg = L - mE - mD, alt = A - mT - mB;

    var esc = escala(maximo);
    var passoX = larg / dados.length;
    var largGrupo = Math.min(88, passoX * 0.68);
    var largBarra = largGrupo / series.length;

    var filhos = [];

    for (var v = 0; v <= esc.teto + 1e-9; v += esc.passo) {
      var y = mT + alt - (v / esc.teto) * alt;
      filhos.push(svgEl('line', { class: v === 0 ? 'eixo' : 'malha', x1: mE, y1: y, x2: mE + larg, y2: y }));
      filhos.push(svgEl('text', { x: mE - 8, y: y + 4, 'text-anchor': 'end', text: rotuloNum(v) }));
    }

    dados.forEach(function (d, i) {
      var base = mE + i * passoX + (passoX - largGrupo) / 2;

      series.forEach(function (s, j) {
        var valor = Number(d[s.campo]) || 0;
        var h = esc.teto ? (valor / esc.teto) * alt : 0;
        if (h <= 0) return;

        filhos.push(svgEl('rect', {
          class: 'barra barra-v', style: 'animation-delay:' + (i * 40 + j * 15) + 'ms',
          x: base + j * largBarra + 1, y: mT + alt - h,
          width: Math.max(2, largBarra - 2), height: h,
          rx: 3, fill: s.cor || CORES[j % CORES.length]
        }, svgEl('title', {
          text: d.rotulo + ' — ' + s.rotulo + ': ' + (opcoes.formatar ? opcoes.formatar(valor) : valor)
        })));
      });

      filhos.push(svgEl('text', {
        x: mE + i * passoX + passoX / 2, y: A - mB + 18,
        'text-anchor': 'middle', text: encurtar(d.rotulo, Math.max(3, Math.min(12, Math.floor(passoX / 7))))
      }, svgEl('title', { text: d.rotulo })));
    });

    return svgEl('svg', {
      class: 'gfx', viewBox: '0 0 ' + L + ' ' + A,
      role: 'img', 'aria-label': opcoes.descricao || 'Gráfico de barras agrupadas'
    }, filhos);
  }

  /* =============================================== BARRAS HORIZONTAIS == */

  /**
   * Barras horizontais — a escolha certa para 15 anestesistas, porque o nome
   * cabe deitado e a comparação fica imediata.
   */
  function barrasH(dados, opcoes) {
    opcoes = opcoes || {};
    dados = (dados || []).filter(function (d) { return d; });

    if (!dados.length) return vazio(opcoes.vazio);

    if (opcoes.ordenar !== false) {
      dados = dados.slice().sort(function (a, b) { return (Number(b.valor) || 0) - (Number(a.valor) || 0); });
    }
    if (opcoes.limite) dados = dados.slice(0, opcoes.limite);
    if (opcoes.ocultarZero) dados = dados.filter(function (d) { return (Number(d.valor) || 0) > 0; });

    if (!dados.length) return vazio(opcoes.vazio);

    var maximo = maiorValor(dados);
    if (maximo === 0) return vazio(opcoes.vazio);

    return naLarguraReal(function (L) { return desenharBarrasH(dados, opcoes, maximo, L); });
  }

  function desenharBarrasH(dados, opcoes, maximo, L) {
    var alturaLinha = opcoes.alturaLinha || 26;
    // Numa tela estreita o nome cede espaço, mas a barra fica com mais da metade.
    var mE = Math.min(opcoes.margemRotulo || 150, Math.round(L * 0.34)), mD = 56, mT = 6, mB = 6;
    var A = mT + mB + dados.length * alturaLinha;
    var larg = L - mE - mD;

    var filhos = [];

    dados.forEach(function (d, i) {
      var valor = Number(d.valor) || 0;
      var y = mT + i * alturaLinha;
      var h = alturaLinha - 9;
      var w = maximo ? (valor / maximo) * larg : 0;
      var cor = opcoes.cor || d.cor || CORES[i % CORES.length];

      /* trilha */
      filhos.push(svgEl('rect', {
        x: mE, y: y, width: larg, height: h, rx: 4,
        fill: 'var(--fundo-alt)'
      }));

      if (w > 0) {
        filhos.push(svgEl('rect', {
          class: 'barra barra-h', style: 'animation-delay:' + (i * 35) + 'ms',
          x: mE, y: y, width: Math.max(2, w), height: h, rx: 4, fill: cor
        }, svgEl('title', { text: d.rotulo + ': ' + (opcoes.formatar ? opcoes.formatar(valor) : valor) })));
      }

      /* nome à esquerda */
      filhos.push(svgEl('text', {
        x: mE - 10, y: y + h / 2 + 4, 'text-anchor': 'end',
        text: encurtar(d.rotulo, Math.floor(mE / 6.6))
      }, svgEl('title', { text: d.rotulo })));

      /* valor à direita */
      filhos.push(svgEl('text', {
        class: 'rotulo-valor', x: mE + larg + 8, y: y + h / 2 + 4,
        text: opcoes.formatar ? opcoes.formatar(valor) : rotuloNum(valor)
      }));
    });

    return svgEl('svg', {
      class: 'gfx', viewBox: '0 0 ' + L + ' ' + A,
      role: 'img', 'aria-label': opcoes.descricao || 'Gráfico de barras horizontais'
    }, filhos);
  }

  /* ======================================================== ROSCA ====== */

  /**
   * Rosca — distribuição por status ou convênio.
   * Com uma só categoria desenha o anel inteiro (evita arco degenerado).
   */
  function rosca(dados, opcoes) {
    opcoes = opcoes || {};
    dados = (dados || []).filter(function (d) { return (Number(d.valor) || 0) > 0; });

    if (!dados.length) return vazio(opcoes.vazio);

    var total = dados.reduce(function (s, d) { return s + (Number(d.valor) || 0); }, 0);
    if (total === 0) return vazio(opcoes.vazio);

    var T = 200, cx = T / 2, cy = T / 2;
    var raio = 78, espessura = opcoes.espessura || 26;
    var rInt = raio - espessura;

    var filhos = [];
    var anguloAtual = -Math.PI / 2;   // começa às 12h

    dados.forEach(function (d, i) {
      var fracao = (Number(d.valor) || 0) / total;
      var cor = d.cor || CORES[i % CORES.length];

      if (fracao >= 0.9999) {
        /* categoria única: dois anéis concêntricos formam o donut */
        filhos.push(svgEl('circle', {
          class: 'barra', style: 'animation-delay:' + (i * 50) + 'ms',
          cx: cx, cy: cy, r: (raio + rInt) / 2,
          fill: 'none', stroke: cor, 'stroke-width': espessura
        }, svgEl('title', { text: d.rotulo + ': ' + (opcoes.formatar ? opcoes.formatar(d.valor) : d.valor) + ' (100%)' })));
        anguloAtual += Math.PI * 2;
        return;
      }

      var anguloFim = anguloAtual + fracao * Math.PI * 2;
      var grande = (anguloFim - anguloAtual) > Math.PI ? 1 : 0;

      var x1 = cx + raio * Math.cos(anguloAtual), y1 = cy + raio * Math.sin(anguloAtual);
      var x2 = cx + raio * Math.cos(anguloFim), y2 = cy + raio * Math.sin(anguloFim);
      var x3 = cx + rInt * Math.cos(anguloFim), y3 = cy + rInt * Math.sin(anguloFim);
      var x4 = cx + rInt * Math.cos(anguloAtual), y4 = cy + rInt * Math.sin(anguloAtual);

      filhos.push(svgEl('path', {
        class: 'barra', style: 'animation-delay:' + (i * 50) + 'ms',
        d: 'M' + x1 + ',' + y1 +
           ' A' + raio + ',' + raio + ' 0 ' + grande + ',1 ' + x2 + ',' + y2 +
           ' L' + x3 + ',' + y3 +
           ' A' + rInt + ',' + rInt + ' 0 ' + grande + ',0 ' + x4 + ',' + y4 + ' Z',
        fill: cor
      }, svgEl('title', {
        text: d.rotulo + ': ' + (opcoes.formatar ? opcoes.formatar(d.valor) : d.valor) + ' (' + (fracao * 100).toFixed(1).replace('.', ',') + '%)'
      })));

      anguloAtual = anguloFim;
    });

    /* número no centro — o corpo encolhe até caber no furo ("R$ 34.000,00"
       a 26px vazava pelo anel); 0,6 em é a largura média de um algarismo. */
    var centro = opcoes.centroValor !== undefined ? String(opcoes.centroValor) : String(total);
    var corpo = Math.min(26, Math.floor((rInt * 2 - 14) / (centro.length * 0.6)));
    filhos.push(svgEl('text', {
      x: cx, y: cy - 2, 'text-anchor': 'middle',
      style: 'font-size:' + corpo + 'px;font-weight:650;fill:var(--texto);font-variant-numeric:tabular-nums',
      text: centro
    }));
    if (opcoes.centroRotulo) {
      filhos.push(svgEl('text', {
        x: cx, y: cy + 16, 'text-anchor': 'middle',
        style: 'font-size:10.5px;fill:var(--texto-suave);text-transform:uppercase;letter-spacing:.06em',
        text: opcoes.centroRotulo
      }));
    }

    var grafico = svgEl('svg', {
      viewBox: '0 0 ' + T + ' ' + T,
      style: 'width:100%;max-width:210px;display:block;margin:0 auto',
      role: 'img', 'aria-label': opcoes.descricao || 'Gráfico de rosca'
    }, filhos);

    return UI.el('div', null, [
      grafico,
      legenda(dados.map(function (d, i) {
        return { rotulo: d.rotulo + ' (' + (opcoes.formatar ? opcoes.formatar(d.valor) : d.valor) + ')', cor: d.cor || CORES[i % CORES.length] };
      }))
    ]);
  }

  /* ==================================================== BARRA EMPILHADA */

  /**
   * Barra única empilhada — recebido x pendente num traço só.
   * Ocupa pouco espaço e responde à pergunta "quanto já entrou?".
   */
  function empilhada(partes, opcoes) {
    opcoes = opcoes || {};
    partes = (partes || []).filter(function (p) { return (Number(p.valor) || 0) > 0; });

    if (!partes.length) return vazio(opcoes.vazio);

    var total = partes.reduce(function (s, p) { return s + Number(p.valor); }, 0);
    var L = 600, A = 20;
    var filhos = [];
    var x = 0;

    partes.forEach(function (p, i) {
      var w = (Number(p.valor) / total) * L;
      filhos.push(svgEl('rect', {
        class: 'barra barra-h', style: 'animation-delay:' + (i * 60) + 'ms',
        x: x, y: 0, width: Math.max(1, w), height: A,
        fill: p.cor || CORES[i % CORES.length]
      }, svgEl('title', {
        text: p.rotulo + ': ' + (opcoes.formatar ? opcoes.formatar(p.valor) : p.valor) +
          ' (' + (Number(p.valor) / total * 100).toFixed(1).replace('.', ',') + '%)'
      })));
      x += w;
    });

    var grafico = svgEl('svg', {
      viewBox: '0 0 ' + L + ' ' + A, preserveAspectRatio: 'none',
      style: 'width:100%;height:' + A + 'px;display:block;border-radius:5px;overflow:hidden',
      role: 'img', 'aria-label': opcoes.descricao || 'Composição'
    }, filhos);

    return UI.el('div', null, [
      grafico,
      legenda(partes.map(function (p, i) {
        return {
          rotulo: p.rotulo + ' — ' + (opcoes.formatar ? opcoes.formatar(p.valor) : p.valor),
          cor: p.cor || CORES[i % CORES.length]
        };
      }))
    ]);
  }

  /* ===================================================== AUXILIARES ==== */

  /** Legenda de cores. */
  function legenda(itens) {
    return UI.el('div', { class: 'legenda' }, (itens || []).map(function (i) {
      return UI.el('div', { class: 'legenda-item' }, [
        UI.el('span', { class: 'legenda-cor', style: 'background:' + i.cor }),
        i.rotulo
      ]);
    }));
  }

  /** Corta texto com reticências, preservando a leitura. */
  function encurtar(s, max) {
    s = String(s === null || s === undefined ? '' : s);
    if (!max || s.length <= max) return s;
    return s.slice(0, Math.max(1, max - 1)) + '…';
  }

  /**
   * Barra proporcional para usar dentro de célula de tabela.
   * Devolve um nó HTML (não SVG) — mais leve para 15 linhas.
   */
  function barraCelula(valor, maximo, formatado) {
    var pct = maximo > 0 ? Math.min(100, (Number(valor) || 0) / maximo * 100) : 0;
    return UI.el('div', { class: 'barra-celula' }, [
      UI.el('div', { class: 'barra-trilha' },
        UI.el('div', { class: 'barra-preenche', style: 'width:' + pct.toFixed(1) + '%' })),
      UI.el('span', { class: 'barra-valor' }, formatado !== undefined ? formatado : String(valor))
    ]);
  }

  return {
    barras: barras,
    agrupadas: agrupadas,
    barrasH: barrasH,
    rosca: rosca,
    empilhada: empilhada,
    legenda: legenda,
    barraCelula: barraCelula,
    vazio: vazio,
    CORES: CORES,
    escala: escala,
    encurtar: encurtar
  };
})();
