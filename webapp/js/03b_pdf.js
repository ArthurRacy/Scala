/**
 * ============================================================================
 * 03B_PDF — Gerador de PDF mínimo, sem biblioteca
 * ============================================================================
 * O projeto não usa dependência externa nem CDN; um termo de consentimento é
 * só texto, título e linhas de assinatura, e isso cabe num PDF 1.4 escrito à
 * mão com as fontes padrão Helvetica / Helvetica-Bold (não precisam ser
 * embutidas — todo leitor de PDF já as tem).
 *
 * Acentos: as fontes usam WinAnsiEncoding (cp1252). Cada caractere vira um
 * byte, escrito como escape octal (\ddd), e o arquivo inteiro fica em ASCII —
 * por isso o tamanho em caracteres é o tamanho em bytes, e a tabela xref
 * pode ser calculada com .length sem erro.
 *
 * Uso:
 *   var d = PDF.documento({ margem: 56 });
 *   d.texto('Título', { tam: 14, negrito: true, alinhar: 'centro' });
 *   d.texto('Parágrafo longo…', { tam: 10 });
 *   d.assinatura('Paciente');
 *   var blob = d.blob();
 *
 * Para documentos com estrutura (o boletim anestésico): secao(), pares()
 * (rótulo/valor em colunas), tabela() (com cabeçalho repetido a cada
 * página) e desenho() (bloco livre em vetor: linhas, marcas, textos —
 * o gráfico de sinais vitais sai assim, sem imagem).
 * ============================================================================
 */
'use strict';

var PDF = (function () {

  var A4 = { largura: 595.28, altura: 841.89 };

  /* Larguras (1/1000 em) da Helvetica e Helvetica-Bold, ASCII 32..126. */
  var LARG = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
    556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
    1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
    667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
    333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556,
    556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584];
  var LARG_N = [278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278,
    556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611,
    975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778,
    667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556,
    333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611,
    611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584];

  /* Caracteres fora do Latin-1 que existem no cp1252. */
  var CP1252 = { '€': 0x80, '‚': 0x82, '„': 0x84, '…': 0x85, '‘': 0x91, '’': 0x92,
    '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97 };
  var LARG_ESPECIAL = { '…': 1000, '‘': 222, '’': 222, '“': 333, '”': 333, '•': 350,
    '–': 556, '—': 1000, 'º': 365, 'ª': 370, '°': 400, '§': 556 };

  /**
   * Caracteres que o WinAnsi não tem, trocados por equivalentes legíveis
   * (SpO₂ -> SpO2, ≥ -> >=). Sem isto viravam "?" no PDF.
   */
  var TROCAS = { '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4', '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9',
    '≥': '>=', '≤': '<=', '→': '->', '−': '-', '✓': 'v', '\u00a0': ' ' };
  function semEspeciais(texto) {
    return String(texto).replace(/[\u2080-\u2089\u2265\u2264\u2192\u2212\u2713\u00a0]/g, function (c) { return TROCAS[c] || '?'; });
  }

  /** Largura de um caractere, em 1/1000 do tamanho da fonte. */
  function larguraChar(ch, negrito) {
    var tabela = negrito ? LARG_N : LARG;
    var c = ch.charCodeAt(0);
    if (c >= 32 && c <= 126) return tabela[c - 32];
    if (LARG_ESPECIAL[ch]) return LARG_ESPECIAL[ch];
    // Letra acentuada: mesma largura da letra base.
    var base = ch.normalize ? ch.normalize('NFD').charAt(0) : ch;
    var b = base.charCodeAt(0);
    if (b >= 32 && b <= 126) return tabela[b - 32];
    return 556;
  }

  function largura(texto, tam, negrito) {
    texto = semEspeciais(texto);
    var soma = 0;
    for (var i = 0; i < texto.length; i++) soma += larguraChar(texto.charAt(i), negrito);
    return soma * tam / 1000;
  }

  /** Texto -> literal de string PDF, em cp1252, só com ASCII no arquivo. */
  function literal(texto) {
    texto = semEspeciais(texto);
    var out = '';
    for (var i = 0; i < texto.length; i++) {
      var ch = texto.charAt(i);
      var c = ch.charCodeAt(0);
      if (CP1252[ch] !== undefined) c = CP1252[ch];
      else if (c > 255 || (c < 32 && c !== 9)) c = 63; // '?'
      if (c === 9) c = 32;

      if (c === 40 || c === 41 || c === 92) out += '\\' + ch;          // ( ) \
      else if (c < 128) out += String.fromCharCode(c);
      else out += '\\' + ('00' + c.toString(8)).slice(-3);
    }
    return '(' + out + ')';
  }

  function num(v) { return (Math.round(v * 100) / 100).toString(); }

  /** Cor: número (cinza 0..1) ou [r, g, b] -> operador PDF de traço ou de preenchimento. */
  function cor(c, preencher) {
    if (Array.isArray(c)) return num(c[0]) + ' ' + num(c[1]) + ' ' + num(c[2]) + (preencher ? ' rg' : ' RG');
    return num(c === undefined ? 0 : c) + (preencher ? ' g' : ' G');
  }

  /** Corta o texto com reticências para caber em `max` pontos. */
  function caber(texto, tam, negrito, max) {
    texto = String(texto === null || texto === undefined ? '' : texto);
    if (largura(texto, tam, negrito) <= max) return texto;
    while (texto.length > 1 && largura(texto + '…', tam, negrito) > max) texto = texto.slice(0, -1);
    return texto + '…';
  }

  /** Quebra um parágrafo em linhas que cabem em `max` pontos. */
  function quebrar(texto, tam, negrito, max) {
    var linhas = [];
    String(texto).split('\n').forEach(function (par) {
      var palavras = par.split(/\s+/).filter(function (p) { return p !== ''; });
      if (!palavras.length) { linhas.push(''); return; }
      var atual = '';
      palavras.forEach(function (p) {
        var tentativa = atual ? atual + ' ' + p : p;
        if (largura(tentativa, tam, negrito) <= max || !atual) atual = tentativa;
        else { linhas.push(atual); atual = p; }
      });
      linhas.push(atual);
    });
    return linhas;
  }

  /* ================================================================== */

  function documento(cfg) {
    cfg = cfg || {};
    var margem = cfg.margem || 56;
    var larguraUtil = A4.largura - 2 * margem;
    var topo = A4.altura - margem;
    var base = margem + 24;              // reserva para o rodapé
    var paginas = [];
    var ops = null;
    var y = 0;

    function novaPagina() {
      ops = [];
      paginas.push(ops);
      y = topo;
    }
    novaPagina();

    function garantir(altura) {
      if (y - altura < base) novaPagina();
    }

    function escrever(x, yy, texto, tam, negrito, cinza) {
      if (cinza) ops.push(cinza + ' g');
      ops.push('BT /' + (negrito ? 'F2' : 'F1') + ' ' + num(tam) + ' Tf ' +
        num(x) + ' ' + num(yy) + ' Td ' + literal(texto) + ' Tj ET');
      if (cinza) ops.push('0 g');
    }

    /** Traços da assinatura, escalados para a caixa (x, yBase, largura, altura). */
    function desenharTracos(tracos, x, yBase, largura, altura) {
      var linhas = ['q 0.05 0.16 0.35 RG 1.1 w 1 J 1 j'];
      tracos.forEach(function (t) {
        if (!t || !t.length) return;
        t.forEach(function (p, i) {
          var px = x + Math.min(1, Math.max(0, Number(p[0]) || 0)) * largura;
          var py = yBase + (1 - Math.min(1, Math.max(0, Number(p[1]) || 0))) * altura;
          linhas.push(num(px) + ' ' + num(py) + (i === 0 ? ' m' : ' l'));
        });
        if (t.length === 1) linhas.push(num(x + t[0][0] * largura + 0.6) + ' ' + num(yBase + (1 - t[0][1]) * altura) + ' l');
        linhas.push('S');
      });
      linhas.push('Q');
      ops.push(linhas.join('\n'));
    }

    var api = {
      /** Parágrafo com quebra automática de linha e de página. */
      texto: function (t, o) {
        o = o || {};
        var tam = o.tam || 10;
        var entre = o.entrelinha || tam * 1.42;
        var recuo = o.recuo || 0;
        var max = larguraUtil - recuo;
        quebrar(t, tam, o.negrito, max).forEach(function (linha) {
          garantir(entre);
          y -= entre;
          var x = margem + recuo;
          if (o.alinhar === 'centro') x = margem + (larguraUtil - largura(linha, tam, o.negrito)) / 2;
          if (o.alinhar === 'direita') x = margem + larguraUtil - largura(linha, tam, o.negrito);
          if (linha) escrever(x, y, linha, tam, o.negrito, o.cinza);
        });
        y -= (o.depois === undefined ? tam * 0.6 : o.depois);
        return api;
      },

      /** "Rótulo: valor" numa linha, com o rótulo em negrito. */
      campo: function (rotulo, valor, o) {
        o = o || {};
        var tam = o.tam || 10;
        var entre = tam * 1.5;
        var r = rotulo + ': ';
        var wr = largura(r, tam, true);
        var linhas = quebrar(valor || '—', tam, false, larguraUtil - wr);
        linhas.forEach(function (linha, i) {
          garantir(entre);
          y -= entre;
          if (i === 0) escrever(margem, y, r, tam, true);
          escrever(margem + wr, y, linha, tam, false);
        });
        return api;
      },

      espaco: function (pt) { y -= pt; if (y < base) novaPagina(); return api; },

      /** Traço horizontal na largura útil. */
      regua: function (o) {
        o = o || {};
        garantir(8);
        y -= 4;
        ops.push((o.cinza || '0.75') + ' G 0.6 w ' + num(margem) + ' ' + num(y) + ' m ' +
          num(margem + larguraUtil) + ' ' + num(y) + ' l S 0 G');
        y -= (o.depois === undefined ? 10 : o.depois);
        return api;
      },

      /**
       * Linha de assinatura com o rótulo embaixo. `tracos` (opcional) é a
       * assinatura feita na tela: lista de traços, cada um uma lista de
       * pontos [x, y] de 0 a 1 (y a partir do topo), desenhada em vetor
       * logo acima da linha — sem imagem embutida, o PDF segue pequeno.
       */
      assinatura: function (rotulo, detalhe, tracos) {
        garantir(tracos && tracos.length ? 74 : 64);
        y -= tracos && tracos.length ? 50 : 40;
        var w = Math.min(300, larguraUtil);
        var x = margem + (larguraUtil - w) / 2;
        if (tracos && tracos.length) desenharTracos(tracos, x + 20, y + 3, w - 40, 44);
        ops.push('0.6 w ' + num(x) + ' ' + num(y) + ' m ' + num(x + w) + ' ' + num(y) + ' l S');
        y -= 12;
        escrever(margem + (larguraUtil - largura(rotulo, 9, true)) / 2, y, rotulo, 9, true);
        if (detalhe) {
          y -= 11;
          escrever(margem + (larguraUtil - largura(detalhe, 8, false)) / 2, y, detalhe, 8, false, '0.35');
        }
        y -= 6;
        return api;
      },

      /** Várias assinaturas lado a lado, dividindo a largura útil. */
      assinaturasLado: function (lista) {
        garantir(64);
        y -= 40;
        var n = lista.length, vao = 24;
        var w = (larguraUtil - vao * (n - 1)) / n;
        lista.forEach(function (s, i) {
          var x = margem + i * (w + vao);
          ops.push('0.6 w ' + num(x) + ' ' + num(y) + ' m ' + num(x + w) + ' ' + num(y) + ' l S');
          escrever(x + (w - largura(s.rotulo, 9, true)) / 2, y - 12, s.rotulo, 9, true);
          if (s.detalhe) escrever(x + (w - largura(s.detalhe, 8, false)) / 2, y - 23, s.detalhe, 8, false, '0.35');
        });
        y -= 29;
        return api;
      },

      /** Garante `altura` pontos livres na página (senão, página nova). */
      garantir: function (altura) { garantir(altura); return api; },

      /** Título de seção: negrito, caixa alta, com um fio embaixo. */
      secao: function (titulo, o) {
        o = o || {};
        garantir(34);
        y -= 16;
        escrever(margem, y, String(titulo).toUpperCase(), 8.5, true, '0.2');
        if (o.direita) escrever(margem + larguraUtil - largura(o.direita, 8, false), y, o.direita, 8, false, '0.4');
        y -= 4;
        ops.push('0.7 G 0.5 w ' + num(margem) + ' ' + num(y) + ' m ' + num(margem + larguraUtil) + ' ' + num(y) + ' l S 0 G');
        y -= 4;
        return api;
      },

      /**
       * Pares rótulo/valor em `colunas` colunas (rótulo pequeno em cinza em
       * cima, valor embaixo, com quebra de linha). `lista`: [[rótulo, valor]];
       * valor vazio sai como "—".
       */
      pares: function (lista, colunas, o) {
        o = o || {};
        colunas = colunas || 3;
        var vao = 10, tam = o.tam || 9;
        var w = (larguraUtil - vao * (colunas - 1)) / colunas;
        for (var i = 0; i < lista.length; i += colunas) {
          var grupo = lista.slice(i, i + colunas);
          var quebras = grupo.map(function (par) {
            var v = par[1] === null || par[1] === undefined || par[1] === '' ? '—' : String(par[1]);
            return quebrar(v, tam, false, w);
          });
          var linhas = Math.max.apply(null, quebras.map(function (q) { return q.length; }));
          var alt = 10 + linhas * tam * 1.3 + 5;
          garantir(alt);
          var topoLinha = y;
          grupo.forEach(function (par, k) {
            var x = margem + k * (w + vao);
            escrever(x, topoLinha - 8, caber(par[0], 7, false, w), 7, false, '0.42');
            quebras[k].forEach(function (l, j) { escrever(x, topoLinha - 10 - (j + 1) * tam * 1.3 + 2, l, tam, false); });
          });
          y -= alt;
        }
        return api;
      },

      /**
       * Tabela. `colunas`: [{ rotulo, largura (fração da largura útil),
       * alinhar: 'direita'|'centro', quebrar: true }]; `linhas`: listas de
       * textos. Coluna sem `quebrar` corta com reticências. O cabeçalho se
       * repete quando a tabela passa de página.
       */
      tabela: function (colunas, linhas, o) {
        o = o || {};
        var tam = o.tam || 8.5, entre = tam * 1.3, pad = 3;
        var ws = colunas.map(function (c) { return c.largura * larguraUtil; });

        function medir(celulas, negrito) {
          var partes = celulas.map(function (v, k) {
            var c = colunas[k], max = ws[k] - 2 * pad;
            var t = v === null || v === undefined ? '' : String(v);
            return c.quebrar ? quebrar(t, tam, negrito, max) : [caber(t, tam, negrito, max)];
          });
          var n = Math.max.apply(null, partes.map(function (p) { return p.length; }));
          return { partes: partes, alt: n * entre + 2 * pad, negrito: negrito };
        }

        function desenhar(m, fundo) {
          if (fundo !== undefined) {
            ops.push(cor(fundo, true) + ' ' + num(margem) + ' ' + num(y - m.alt) + ' ' + num(larguraUtil) + ' ' +
              num(m.alt) + ' re f 0 g');
          }
          var x = margem;
          m.partes.forEach(function (ls, k) {
            var c = colunas[k];
            ls.forEach(function (l, j) {
              var lx = x + pad;
              if (c.alinhar === 'direita') lx = x + ws[k] - pad - largura(l, tam, m.negrito);
              if (c.alinhar === 'centro') lx = x + (ws[k] - largura(l, tam, m.negrito)) / 2;
              escrever(lx, y - pad - (j + 1) * entre + tam * 0.28, l, tam, m.negrito, m.negrito ? '0.2' : null);
            });
            x += ws[k];
          });
          y -= m.alt;
          ops.push('0.85 G 0.4 w ' + num(margem) + ' ' + num(y) + ' m ' + num(margem + larguraUtil) + ' ' + num(y) + ' l S 0 G');
        }

        var cab = medir(colunas.map(function (c) { return c.rotulo; }), true);
        var medidas = linhas.map(function (l) { return medir(l, false); });
        // Cabeçalho nunca fica sozinho no pé da página.
        garantir(cab.alt + (medidas.length ? medidas[0].alt : 0));
        desenhar(cab, 0.93);
        medidas.forEach(function (m) {
          if (y - m.alt < base) { novaPagina(); desenhar(cab, 0.93); }
          desenhar(m);
        });
        y -= o.depois === undefined ? 6 : o.depois;
        return api;
      },

      /**
       * Bloco livre de `altura` pontos: `desenhar(ctx)` recebe a caixa
       * ({ x, y (base), largura, altura }) e primitivas em coordenadas da
       * página: linha, retangulo, texto, circulo, polilinha, marca.
       */
      desenho: function (altura, desenhar) {
        garantir(altura);
        var caixa = { x: margem, y: y - altura, largura: larguraUtil, altura: altura };
        var ctx = {
          caixa: caixa,
          linha: function (x1, y1, x2, y2, e) {
            e = e || {};
            ops.push('q ' + cor(e.cor === undefined ? 0 : e.cor) + ' ' + num(e.espessura || 0.5) + ' w' +
              (e.tracejado ? ' [' + e.tracejado.join(' ') + '] 0 d' : '') + ' ' +
              num(x1) + ' ' + num(y1) + ' m ' + num(x2) + ' ' + num(y2) + ' l S Q');
          },
          polilinha: function (pontos, e) {
            e = e || {};
            if (pontos.length < 2) return;
            ops.push('q ' + cor(e.cor === undefined ? 0 : e.cor) + ' ' + num(e.espessura || 0.8) + ' w 1 j 1 J ' +
              pontos.map(function (p, i) { return num(p[0]) + ' ' + num(p[1]) + (i ? ' l' : ' m'); }).join(' ') + ' S Q');
          },
          retangulo: function (x, yy, w, h, e) {
            e = e || {};
            var s = 'q ';
            if (e.preencher !== undefined) s += cor(e.preencher, true) + ' ';
            if (e.contorno !== undefined) s += cor(e.contorno) + ' ' + num(e.espessura || 0.5) + ' w ';
            s += num(x) + ' ' + num(yy) + ' ' + num(w) + ' ' + num(h) + ' re ' +
              (e.preencher !== undefined && e.contorno !== undefined ? 'B' : e.preencher !== undefined ? 'f' : 'S') + ' Q';
            ops.push(s);
          },
          circulo: function (cx, cy, r, e) {
            e = e || {};
            var k = 0.5523 * r;
            ops.push('q ' + cor(e.cor === undefined ? 0 : e.cor, true) + ' ' +
              num(cx + r) + ' ' + num(cy) + ' m ' +
              num(cx + r) + ' ' + num(cy + k) + ' ' + num(cx + k) + ' ' + num(cy + r) + ' ' + num(cx) + ' ' + num(cy + r) + ' c ' +
              num(cx - k) + ' ' + num(cy + r) + ' ' + num(cx - r) + ' ' + num(cy + k) + ' ' + num(cx - r) + ' ' + num(cy) + ' c ' +
              num(cx - r) + ' ' + num(cy - k) + ' ' + num(cx - k) + ' ' + num(cy - r) + ' ' + num(cx) + ' ' + num(cy - r) + ' c ' +
              num(cx + k) + ' ' + num(cy - r) + ' ' + num(cx + r) + ' ' + num(cy - k) + ' ' + num(cx + r) + ' ' + num(cy) + ' c f Q');
          },
          /** Marca de PA no estilo das fichas de papel: "v" na sistólica, "^" na diastólica. */
          marca: function (cx, cy, tipo, e) {
            e = e || {};
            var s = e.tamanho || 3.2;
            var dy = tipo === 'v' ? s : -s;
            ops.push('q ' + cor(e.cor === undefined ? 0 : e.cor) + ' ' + num(e.espessura || 0.9) + ' w 1 j 1 J ' +
              num(cx - s) + ' ' + num(cy + dy) + ' m ' + num(cx) + ' ' + num(cy) + ' l ' + num(cx + s) + ' ' + num(cy + dy) + ' l S Q');
          },
          texto: function (x, yy, t, e) {
            e = e || {};
            var tam = e.tam || 7;
            var lx = x;
            if (e.alinhar === 'direita') lx = x - largura(t, tam, e.negrito);
            if (e.alinhar === 'centro') lx = x - largura(t, tam, e.negrito) / 2;
            if (Array.isArray(e.cor)) {
              ops.push('q ' + cor(e.cor, true) + ' BT /' + (e.negrito ? 'F2' : 'F1') + ' ' + num(tam) + ' Tf ' +
                num(lx) + ' ' + num(yy) + ' Td ' + literal(t) + ' Tj ET Q');
            } else {
              escrever(lx, yy, t, tam, e.negrito, e.cinza);
            }
          },
          largura: function (t, tam, negrito) { return largura(t, tam || 7, negrito); }
        };
        desenhar(ctx);
        y -= altura;
        return api;
      },

      /** Monta o arquivo. `rodape` recebe (pagina, total) e devolve o texto. */
      blob: function (rodape) {
        return new Blob([api.fonte(rodape)], { type: 'application/pdf' });
      },

      /** O conteúdo do PDF como string ASCII (útil para teste). */
      fonte: function (rodape) {
        var objetos = [];   // índice 0 = objeto 1
        function obj(corpo) { objetos.push(corpo); return objetos.length; }

        var catalogo = obj(null);   // preenchido no fim
        var raizPaginas = obj(null);
        var f1 = obj('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
        var f2 = obj('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');

        var filhos = [];
        paginas.forEach(function (conteudo, i) {
          var linhas = conteudo.slice();
          if (rodape) {
            // Rodapé de uma ou mais linhas (string ou lista), de cima para baixo.
            [].concat(rodape(i + 1, paginas.length) || []).forEach(function (t, k) {
              if (!t) return;
              linhas.push('0.45 g BT /F1 7.5 Tf ' + num(margem) + ' ' + num(margem - 8 - k * 9.5) + ' Td ' +
                literal(t) + ' Tj ET 0 g');
            });
          }
          var fluxo = linhas.join('\n');
          var idFluxo = obj('<< /Length ' + fluxo.length + ' >>\nstream\n' + fluxo + '\nendstream');
          filhos.push(obj('<< /Type /Page /Parent ' + raizPaginas + ' 0 R /MediaBox [0 0 ' +
            A4.largura + ' ' + A4.altura + '] /Resources << /Font << /F1 ' + f1 + ' 0 R /F2 ' + f2 +
            ' 0 R >> >> /Contents ' + idFluxo + ' 0 R >>'));
        });

        objetos[raizPaginas - 1] = '<< /Type /Pages /Kids [' +
          filhos.map(function (n) { return n + ' 0 R'; }).join(' ') + '] /Count ' + filhos.length + ' >>';
        objetos[catalogo - 1] = '<< /Type /Catalog /Pages ' + raizPaginas + ' 0 R >>';
        var info = obj('<< /Producer (Sistema de Anestesia) /Title ' + literal(cfg.titulo || 'Documento') + ' >>');

        var saida = '%PDF-1.4\n';
        var posicoes = [];
        objetos.forEach(function (corpo, i) {
          posicoes.push(saida.length);
          saida += (i + 1) + ' 0 obj\n' + corpo + '\nendobj\n';
        });
        var xref = saida.length;
        saida += 'xref\n0 ' + (objetos.length + 1) + '\n0000000000 65535 f \n';
        posicoes.forEach(function (p) { saida += ('0000000000' + p).slice(-10) + ' 00000 n \n'; });
        saida += 'trailer\n<< /Size ' + (objetos.length + 1) + ' /Root ' + catalogo + ' 0 R /Info ' +
          info + ' 0 R >>\nstartxref\n' + xref + '\n%%EOF\n';
        return saida;
      }
    };

    return api;
  }

  return { documento: documento, largura: largura, literal: literal, semEspeciais: semEspeciais };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = { PDF: PDF };
